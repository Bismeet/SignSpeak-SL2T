'use client';

/**
 * The sign-recognition loop.
 *
 * Pipeline (docs/technical-architecture.md §4):
 *
 *   camera frame -> MediaPipe landmarks -> feature vector -> classifier
 *     -> threshold / margin / temporal smoothing -> accepted chip or "Not recognised"
 *
 * Design notes:
 *   - The loop runs on `requestAnimationFrame` and is throttled to a target frame rate so
 *     a 120 Hz screen does not burn battery for no extra accuracy.
 *   - UI state is pushed at a low rate (see `PUBLISH_INTERVAL_MS`) so React re-renders
 *     never become the bottleneck (NFR-02: the classifier itself must stay under 30 ms).
 *   - Only one inference runs at a time; a frame arriving mid-inference is skipped rather
 *     than queued, because a stale prediction is worse than a dropped frame.
 *   - Frames are never stored or transmitted (NFR-01). The optional backend, when enabled,
 *     receives the numeric feature vector only.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { config } from '@/lib/config';
import { useDeviceStatus } from '@/lib/state/device-status';
import { isLandmarkerFailure, SignLandmarker, type LandmarkerFailure } from '@/lib/vision/landmarker';
import {
  describeCameraError,
  FpsMeter,
  startCamera,
  stopStream,
  watchTrackEnded,
  type CameraFailure,
} from '@/lib/vision/camera';
import { computeLandmarkCompleteness, extractFeatureVector } from '@/lib/vision/features';
import {
  confidenceBand,
  createDecisionState,
  decide,
  DEFAULT_DECISION_CONFIG,
  REJECTION_HINT,
  releaseLatchIfReleased,
  shouldSuggestPhraseBoard,
  STRICT_DECISION_CONFIG,
  type DecisionConfig,
  type DecisionState,
} from '@/lib/vision/decision';
import { useModel } from '@/lib/state/model-provider';
import { useSettings } from '@/lib/state/settings';
import { drawHandOverlay, SIMULATED_OCCLUDED_INDICES } from '@/lib/vision/hand-skeleton';
import type {
  CameraStatus,
  ConfidenceBand,
  FrameLandmarks,
  MessageAlternative,
  Prediction,
  TrackingStatus,
} from '@/lib/types';

/** How often the loop publishes state to React, in milliseconds. */
const PUBLISH_INTERVAL_MS = 110;

/** Target analysis rate. MediaPipe is comfortable well above this on a laptop. */
const TARGET_ANALYSIS_FPS = 30;

export interface AcceptedSign {
  label: string;
  probability: number;
  band: ConfidenceBand;
  alternatives: MessageAlternative[];
}

export interface RecognitionSnapshot {
  camera: CameraStatus;
  tracking: TrackingStatus;
  fps: number;
  lowFps: boolean;
  handCount: number;
  /** The latest per-frame decision, including rejections. */
  current: Prediction | null;
  /** Plain-language hint for the current rejection reason. */
  rejectionHint: string | null;
  /** The most recent accepted sign, awaiting user review. */
  latestAccepted: AcceptedSign | null;
  /** Completeness ratio of tracked landmarks (1.0 = clean, ~0.52 = occluded). */
  landmarkCompleteness: number;
  /** True when occlusion is detected or simulated. */
  isOccluded: boolean;
}

export interface UseSignRecognitionOptions {
  /** Called once per newly accepted, stable sign (never on repeat frames). */
  onAccepted?: (sign: AcceptedSign) => void;
}

export interface UseSignRecognitionResult extends RecognitionSnapshot {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  /** Camera-specific failure, with copy ready for `PermissionState`. */
  cameraFailure: CameraFailure | null;
  landmarkerFailure: LandmarkerFailure | null;
  /** True when the model could not be loaded, so recognition is off but the camera works. */
  modelUnavailable: boolean;
  modelError: string | null;
  /** True while MediaPipe + model are being prepared. */
  preparing: boolean;
  /** True when replaying recorded landmarks instead of using the camera. */
  replaying: boolean;
  /** Developer demo occlusion simulation active. */
  simulateOcclusion: boolean;
  setSimulateOcclusion: (value: boolean) => void;
  /** Clears the "latest accepted" chip after the user confirms or rejects it. */
  clearLatestAccepted: () => void;
  /**
   * Returns (and clears) the feature vector that produced the most recent accepted sign.
   * Used only by the opt-in local correction log, and only when the user has enabled it.
   */
  consumeLastAcceptedFeatures: () => Float32Array | null;
  /** True when the phrase board should be suggested (two consecutive rejections). */
  suggestPhraseBoard: boolean;
  dismissPhraseBoardSuggestion: () => void;
  /** Line-weight multiplier for the hand overlay; called from the overlay controls. */
  setStrokeWeight: (value: number) => void;
}

/* ------------------------------------------------------------------------------------
 * Replay source (docs/hackathon-demo-plan.md §3, Fallback A)
 * ---------------------------------------------------------------------------------- */

interface ReplayFixture {
  label: string;
  source: string;
  notForRealUse?: boolean;
  frames: Array<Omit<FrameLandmarks, 'timestampMs'>>;
}

/**
 * Simulates keypoint occlusion by marking distal joints (tips and DIPs)
 * with visibility: 0, reflecting real-world hand self-occlusion or obstruction.
 */
export function applyOcclusionSimulation(frame: FrameLandmarks): FrameLandmarks {
  return {
    ...frame,
    hands: frame.hands.map((hand) => ({
      ...hand,
      landmarks: hand.landmarks.map((lm, idx) => {
        if (SIMULATED_OCCLUDED_INDICES.has(idx)) {
          return {
            ...lm,
            visibility: 0,
          };
        }
        return lm;
      }),
    })),
  };
}

/* ------------------------------------------------------------------------------------
 * Hook
 * ---------------------------------------------------------------------------------- */

export function useSignRecognition(
  options: UseSignRecognitionOptions = {},
): UseSignRecognitionResult {
  const { settings } = useSettings();
  // The header pills must tell the truth about what is active
  // (docs/ui-ux-specification.md §4). The camera state lives in this hook, so it has to be
  // published to the shared device-status context — otherwise the header is stuck showing
  // "Camera off" while the camera is streaming, which is precisely the thing a user has to
  // be able to trust. The microphone half does the same thing in `lib/speech/use-asr.ts`.
  const { setCamera } = useDeviceStatus();
  const { availability, ensureClassifier } = useModel();
  const onAcceptedRef = useRef(options.onAccepted);
  onAcceptedRef.current = options.onAccepted;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [snapshot, setSnapshot] = useState<RecognitionSnapshot>({
    camera: 'idle',
    tracking: 'inactive',
    fps: 0,
    lowFps: false,
    handCount: 0,
    current: null,
    rejectionHint: null,
    latestAccepted: null,
    landmarkCompleteness: 1,
    isOccluded: false,
  });
  const [cameraFailure, setCameraFailure] = useState<CameraFailure | null>(null);
  const [landmarkerFailure, setLandmarkerFailure] = useState<LandmarkerFailure | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [suggestPhraseBoard, setSuggestPhraseBoard] = useState(false);
  const [simulateOcclusion, setSimulateOcclusion] = useState(false);
  const simulateOcclusionRef = useRef(false);
  simulateOcclusionRef.current = simulateOcclusion;

  // Refs used by the animation loop; keeping them out of state avoids stale closures.
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<SignLandmarker | null>(null);
  const decisionRef = useRef<DecisionState>(createDecisionState());
  const fpsRef = useRef(new FpsMeter(30));
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const inferringRef = useRef(false);
  const lastAnalysisRef = useRef(0);
  const lastPublishRef = useRef(0);
  const consecutiveRejectionsRef = useRef(0);
  const phraseBoardPromptedRef = useRef(false);
  const replayRef = useRef<{ frames: ReplayFixture['frames']; index: number } | null>(null);
  const lastAcceptedFeaturesRef = useRef<Float32Array | null>(null);
  const mountedRef = useRef(true);
  const startSessionRef = useRef(0);

  const decisionConfig: DecisionConfig = useMemo(
    () => (settings.confidenceMode === 'strict' ? STRICT_DECISION_CONFIG : DEFAULT_DECISION_CONFIG),
    [settings.confidenceMode],
  );
  const decisionConfigRef = useRef(decisionConfig);
  decisionConfigRef.current = decisionConfig;

  const strokeWeightRef = useRef(1);
  /** Line-weight multiplier for the hand overlay; called from the overlay controls. */
  const setStrokeWeight = useCallback((value: number) => {
    strokeWeightRef.current = Number.isFinite(value) ? Math.min(2.5, Math.max(0, value)) : 1;
  }, []);

  // Settings > "Show hand landmarks": adds the diagnostic joint dots and shoulder markers
  // on top of the always-on skeleton. Read through a ref so toggling the setting never
  // restarts the camera or the analysis loop.
  const showOverlayRef = useRef(settings.showLandmarkOverlay);
  showOverlayRef.current = settings.showLandmarkOverlay;

  const modelReady = availability.state === 'ready';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /* ----------------------------------------------------------------------------------
   * Frame processing
   * -------------------------------------------------------------------------------- */

  const publish = useCallback((patch: Partial<RecognitionSnapshot>) => {
    if (!mountedRef.current) return;
    setSnapshot((previous) => ({ ...previous, ...patch }));
  }, []);

  // Mirror this hook's camera state into the shared context so the header pill matches what
  // is actually happening, and clear it on unmount so the header cannot keep claiming a
  // camera is on after the user has navigated away from this screen.
  useEffect(() => {
    setCamera(snapshot.camera);
  }, [setCamera, snapshot.camera]);

  useEffect(() => () => setCamera('idle'), [setCamera]);

  /**
   * Attach the live stream to whichever `<video>` is currently mounted.
   *
   * This has to be an effect keyed on the camera status, not an assignment inside `start()`.
   * The panel only renders its preview once `camera` is 'streaming', so at the moment the
   * stream arrives from `getUserMedia` the element does not exist yet. Assigning there would
   * attach the stream to nothing: the preview stays blank, the tracking loop reads zero
   * frames, and recognition can never produce a result. Re-running here means the element is
   * guaranteed to exist by the time the status flips.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const stream = streamRef.current;
    if (!stream || video.srcObject === stream) return;
    video.srcObject = stream;
    void video.play().catch(() => {
      // Autoplay can be rejected before a user gesture; the preview starts on play().
    });
  }, [snapshot.camera]);

  const drawOverlay = useCallback((frame: FrameLandmarks, video: HTMLVideoElement | null) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    // Sync the canvas bitmap to the stream's intrinsic size (`videoWidth/Height`), not the
    // CSS box, so normalised (0..1) landmarks map 1:1 with zero offset. Replay mode has no
    // video element, so fall back to the element's own pixel box.
    const width =
      video && video.videoWidth > 0
        ? video.videoWidth
        : Math.round(canvas.clientWidth) || canvas.width || 640;
    const height =
      video && video.videoHeight > 0
        ? video.videoHeight
        : Math.round(canvas.clientHeight) || canvas.height || 480;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    if (canvas.width === 0 || canvas.height === 0) return;

    // Hand skeleton, driven by the SAME `frame` object that feeds the
    // ss-features-v1 / sign-clf-v1.onnx inference path below. `drawHandOverlay`
    // mirrors x internally to match the CSS-mirrored `<video>` preview, so the canvas
    // element itself must NOT be flipped in CSS as well.
    drawHandOverlay(context, frame, canvas.width, canvas.height, {
      strokeWeight: strokeWeightRef.current,
      // Settings > "Show hand landmarks": joint dots and shoulder markers on top of the
      // always-on skeleton.
      diagnostic: showOverlayRef.current,
      occlusionSimulation: simulateOcclusionRef.current,
      // Feed opacity is applied by the panel to the `<video>` element itself, not baked
      // into this bitmap. The overlay is deliberately static: it takes no frame clock, so
      // it can never animate on its own (docs/ui-ux-specification.md §1).
      videoOpacity: 1,
    });
  }, []);

  const processFrame = useCallback(
    async (frame: FrameLandmarks, video: HTMLVideoElement | null) => {
      // Render the overlay from this exact frame FIRST, so the visualiser never depends on
      // inference succeeding. The same `frame` then flows unchanged into the ss-features-v1
      // feature extraction + sign-clf-v1.onnx classifier below. `video` is null during a
      // landmark replay, which is fine — the overlay then uses the canvas' own pixel box.
      drawOverlay(frame, video);
      const classifier = await ensureClassifier();

      if (!classifier) {
        setModelError('Sign recognition is not available on this device right now.');
        publish({
          current: null,
          rejectionHint: REJECTION_HINT.unsupported_model,
          tracking: frame.hands.length > 0 ? 'tracking' : 'no-hands',
          handCount: frame.hands.length,
          landmarkCompleteness: frame.hands.length > 0 ? 1 : 0,
          isOccluded: false,
        });
        return;
      }

      const features = extractFeatureVector(frame);
      let probabilities: number[];
      try {
        probabilities = await classifier.predict(features.vector);
      } catch (error) {
        // A single failed inference must not stop the loop.
        console.warn('[SignSpeak] Inference failed for this frame.', error);
        return;
      }
      if (!mountedRef.current) return;

      const previousState = decisionRef.current;
      const releasedState = releaseLatchIfReleased(previousState, features.handCount);

      const completeness = computeLandmarkCompleteness(frame.hands);
      const isOccluded =
        frame.hands.length > 0 &&
        (completeness < 0.85 || simulateOcclusionRef.current);

      const result = decide({
        state: releasedState,
        probabilities,
        vocabulary: classifier.card.vocabulary,
        handCount: features.handCount,
        bestHandScore: features.bestHandScore,
        config: decisionConfigRef.current,
        negativeClass: classifier.card.negativeClass,
        landmarkCompleteness: completeness,
        isIncompleteLandmarks: isOccluded,
      });

      decisionRef.current = result.state;
      consecutiveRejectionsRef.current = result.state.consecutiveRejections;

      if (
        shouldSuggestPhraseBoard(previousState, result.state) &&
        !phraseBoardPromptedRef.current
      ) {
        phraseBoardPromptedRef.current = true;
        decisionRef.current = {
          ...result.state,
          phraseBoardPrompts: result.state.phraseBoardPrompts + 1,
        };
        setSuggestPhraseBoard(true);
      }

      // In demo mode (model not trained for real use), prevent emitting fabricated ISL
      // predictions into the patient conversation. Keep feature extraction live.
      const isDemoModel = Boolean(classifier.card.notForRealUse);

      if (!isDemoModel && result.emitted && result.prediction.accepted) {
        const alternatives: MessageAlternative[] = result.prediction.top3
          .slice(0, 3)
          .map((entry) => ({ label: entry.label, probability: entry.probability }));

        const accepted: AcceptedSign = {
          label: result.prediction.label,
          probability: result.prediction.probability,
          band: confidenceBand(result.prediction.probability),
          alternatives,
        };
        // Keep the exact vector that produced this prediction so an opt-in correction can
        // be logged as a labelled training sample. Copied, because ORT reuses buffers.
        lastAcceptedFeaturesRef.current = Float32Array.from(features.vector);
        publish({ latestAccepted: accepted });
        onAcceptedRef.current?.(accepted);
      }

      publish({
        current: isDemoModel ? { ...result.prediction, accepted: false } : result.prediction,
        rejectionHint:
          features.handCount === 0
            ? REJECTION_HINT.no_hands
            : result.prediction.reason === 'insufficient_landmarks'
              ? REJECTION_HINT.insufficient_landmarks
              : isDemoModel
                ? 'Recognition model not trained (Demo mode). Hand landmarks and 159D features are live.'
                : result.prediction.accepted || !result.prediction.reason
                  ? null
                  : REJECTION_HINT[result.prediction.reason],
        tracking: features.handCount > 0 ? 'tracking' : 'no-hands',
        handCount: features.handCount,
        landmarkCompleteness: frame.hands.length > 0 ? completeness : 0,
        isOccluded,
      });
    },
    [drawOverlay, ensureClassifier, publish],
  );

  /* ----------------------------------------------------------------------------------
   * Animation loop
   * -------------------------------------------------------------------------------- */

  const loop = useCallback(
    (timestamp: number) => {
      if (!runningRef.current) return;
      rafRef.current = requestAnimationFrame(loop);

      const minInterval = 1000 / TARGET_ANALYSIS_FPS;
      if (timestamp - lastAnalysisRef.current < minInterval) return;
      lastAnalysisRef.current = timestamp;

      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (!landmarker) return;

      let frame: FrameLandmarks | null = null;

      const replay = replayRef.current;
      if (replay) {
        // Replay mode: recorded landmarks, but the real model and the real decision logic.
        const raw = replay.frames[replay.index % replay.frames.length];
        replay.index += 1;
        if (raw) {
          frame = {
            hands: raw.hands ?? [],
            pose: raw.pose ?? null,
            timestampMs: timestamp,
          };
        }
      } else {
        if (!video || video.readyState < 2 || video.videoWidth === 0) return;
        try {
          frame = landmarker.detect(video, timestamp);
        } catch (error) {
          console.warn('[SignSpeak] Landmark detection failed for this frame.', error);
          return;
        }
      }

      if (!frame) return;

      const fps = fpsRef.current.tick(timestamp);
      const shouldPublish = timestamp - lastPublishRef.current >= PUBLISH_INTERVAL_MS;
      if (shouldPublish) {
        lastPublishRef.current = timestamp;
        publish({
          fps: Math.round(fps),
          lowFps: fps > 0 && fps < config.lowFpsThreshold,
        });
      }

      if (inferringRef.current) return;
      inferringRef.current = true;
      const inputFrame =
        simulateOcclusionRef.current && frame.hands.length > 0
          ? applyOcclusionSimulation(frame)
          : frame;
      void processFrame(inputFrame, replay ? null : video)
        .catch((error: unknown) => {
          console.warn('[SignSpeak] Frame processing failed.', error);
        })
        .finally(() => {
          inferringRef.current = false;
        });
    },
    [processFrame, publish],
  );

  /* ----------------------------------------------------------------------------------
   * Lifecycle
   * -------------------------------------------------------------------------------- */

  const stop = useCallback(() => {
    startSessionRef.current++;
    setPreparing(false);
    runningRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    landmarkerRef.current?.close();
    landmarkerRef.current = null;

    replayRef.current = null;
    decisionRef.current = createDecisionState();
    fpsRef.current.reset();
    consecutiveRejectionsRef.current = 0;
    phraseBoardPromptedRef.current = false;

    setReplaying(false);
    setSuggestPhraseBoard(false);
    setSnapshot({
      camera: 'idle',
      tracking: 'inactive',
      fps: 0,
      lowFps: false,
      handCount: 0,
      current: null,
      rejectionHint: null,
      latestAccepted: null,
      landmarkCompleteness: 1,
      isOccluded: false,
    });
  }, []);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    const sessionId = ++startSessionRef.current;

    setCameraFailure(null);
    setLandmarkerFailure(null);
    setModelError(null);
    setPreparing(true);
    phraseBoardPromptedRef.current = false;
    setSuggestPhraseBoard(false);
    decisionRef.current = createDecisionState();

    // 1. Landmarks first: it is the dependency that most often fails (blocked WASM).
    let landmarker: SignLandmarker;
    try {
      landmarker = await SignLandmarker.create({
        assets: {
          wasmBasePath: config.mediapipeWasmPath,
          handModelPath: config.handModelUrl,
          poseModelPath: config.poseModelUrl,
        },
      });
    } catch (error) {
      if (sessionId !== startSessionRef.current) return;
      setPreparing(false);
      if (isLandmarkerFailure(error)) {
        setLandmarkerFailure(error);
      } else {
        setLandmarkerFailure({
          reason: 'init-error',
          title: 'Hand tracking could not start',
          cause: error instanceof Error ? error.message : 'An unexpected error occurred.',
          fix: 'Press Try again, or use the phrase board and typing.',
          retryable: true,
        });
      }
      return;
    }
    if (!mountedRef.current || sessionId !== startSessionRef.current) {
      landmarker.close();
      return;
    }
    landmarkerRef.current = landmarker;

    // 2. Then the classifier. A missing model is not fatal: the camera preview and the
    //    phrase board still work, and the UI says exactly why recognition is off.
    const classifier = await ensureClassifier();
    if (!mountedRef.current || sessionId !== startSessionRef.current) {
      landmarker.close();
      landmarkerRef.current = null;
      return;
    }
    if (!classifier) {
      setModelError(
        availability.state === 'ready'
          ? 'The recognition model could not be loaded.'
          : 'No sign-recognition model is installed.',
      );
    }

    if (settings.demoReplayLandmarks) {
      // Demo fallback A: run recorded landmarks through the real pipeline.
      try {
        const response = await fetch('/fixtures/replay-manifest.json', { cache: 'no-cache' });
        if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
        const manifest = (await response.json()) as { fixtures: Array<{ file: string }> };
        const frames: ReplayFixture['frames'] = [];
        for (const entry of manifest.fixtures.slice(0, 4)) {
          const fixtureResponse = await fetch(`/fixtures/${entry.file}`, { cache: 'no-cache' });
          if (!fixtureResponse.ok) continue;
          const fixture = (await fixtureResponse.json()) as ReplayFixture;
          // Interleave the fixtures so the demo shows distinct signs in sequence.
          frames.push(...fixture.frames.slice(0, 60));
        }
        if (sessionId !== startSessionRef.current) {
          landmarker.close();
          landmarkerRef.current = null;
          return;
        }
        if (frames.length > 0) {
          replayRef.current = { frames, index: 0 };
          setReplaying(true);
          runningRef.current = true;
          setPreparing(false);
          publish({ camera: 'streaming', tracking: 'searching' });
          rafRef.current = requestAnimationFrame(loop);
          return;
        }
      } catch (error) {
        console.warn('[SignSpeak] Replay fixtures unavailable; falling back to the camera.', error);
      }
      setReplaying(false);
      replayRef.current = null;
    }

    // 3. Camera.
    setSnapshot((previous) => ({ ...previous, camera: 'requesting', tracking: 'searching' }));
    const result = await startCamera({
      width: config.captureWidth,
      height: config.captureHeight,
    });

    if (sessionId !== startSessionRef.current) {
      if (result.ok) stopStream(result.stream);
      landmarker.close();
      landmarkerRef.current = null;
      return;
    }

    setPreparing(false);

    if (!result.ok) {
      landmarker.close();
      landmarkerRef.current = null;
      setCameraFailure(result.failure);
      publish({ camera: result.failure.status, tracking: 'inactive' });
      return;
    }
    if (!mountedRef.current) {
      stopStream(result.stream);
      landmarker.close();
      landmarkerRef.current = null;
      return;
    }

    streamRef.current = result.stream;
    // The stream is attached to the <video> by the effect below, not here. `CameraPanel`
    // renders its preview only once `camera` is 'streaming' or 'paused', and at this point
    // it is still 'requesting' — so `videoRef.current` is null and an assignment here would
    // silently do nothing, leaving the preview blank and the tracking loop with no frames.

    // Detect the camera being revoked outside the app (T-PERM-08).
    watchTrackEnded(result.track, () => {
      if (!mountedRef.current) return;
      runningRef.current = false;
      stopStream(streamRef.current);
      streamRef.current = null;
      setCameraFailure({
        status: 'in-use',
        title: 'Camera stopped',
        cause: 'The camera was turned off or taken over by another app.',
        fix: 'Press Try again to restart the camera, or use the phrase board and typing.',
        retryable: true,
      });
      publish({ camera: 'in-use', tracking: 'inactive' });
    });

    runningRef.current = true;
    publish({ camera: 'streaming', tracking: 'searching' });
    rafRef.current = requestAnimationFrame(loop);
  }, [availability.state, ensureClassifier, loop, publish, settings.demoReplayLandmarks]);

  const pause = useCallback(() => {
    if (!runningRef.current) return;
    runningRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (videoRef.current) videoRef.current.pause();
    publish({ camera: 'paused', tracking: 'inactive' });
  }, [publish]);

  const resume = useCallback(() => {
    if (runningRef.current) return;
    const video = videoRef.current;
    if (!replayRef.current && !streamRef.current) return;
    if (video && !replayRef.current) void video.play().catch(() => undefined);
    runningRef.current = true;
    fpsRef.current.reset();
    publish({ camera: 'streaming', tracking: 'searching' });
    rafRef.current = requestAnimationFrame(loop);
  }, [loop, publish]);

  const clearLatestAccepted = useCallback(() => {
    setSnapshot((previous) => ({ ...previous, latestAccepted: null }));
  }, []);

  const consumeLastAcceptedFeatures = useCallback((): Float32Array | null => {
    const features = lastAcceptedFeaturesRef.current;
    lastAcceptedFeaturesRef.current = null;
    return features;
  }, []);

  const dismissPhraseBoardSuggestion = useCallback(() => {
    setSuggestPhraseBoard(false);
  }, []);

  // Release the camera and WASM heap when the component unmounts.
  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      stopStream(streamRef.current);
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  return {
    ...snapshot,
    videoRef,
    overlayCanvasRef,
    start,
    pause,
    resume,
    stop,
    cameraFailure,
    landmarkerFailure,
    modelUnavailable: !modelReady,
    modelError,
    preparing,
    replaying,
    simulateOcclusion,
    setSimulateOcclusion,
    clearLatestAccepted,
    consumeLastAcceptedFeatures,
    suggestPhraseBoard,
    dismissPhraseBoardSuggestion,
    setStrokeWeight,
  };
}

export { describeCameraError };
