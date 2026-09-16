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
import { isLandmarkerFailure, SignLandmarker, type LandmarkerFailure } from '@/lib/vision/landmarker';
import {
  describeCameraError,
  FpsMeter,
  startCamera,
  stopStream,
  watchTrackEnded,
  type CameraFailure,
} from '@/lib/vision/camera';
import { extractFeatureVector } from '@/lib/vision/features';
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

/* ------------------------------------------------------------------------------------
 * Hook
 * ---------------------------------------------------------------------------------- */

export function useSignRecognition(
  options: UseSignRecognitionOptions = {},
): UseSignRecognitionResult {
  const { settings } = useSettings();
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
  });
  const [cameraFailure, setCameraFailure] = useState<CameraFailure | null>(null);
  const [landmarkerFailure, setLandmarkerFailure] = useState<LandmarkerFailure | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [suggestPhraseBoard, setSuggestPhraseBoard] = useState(false);

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

  const decisionConfig: DecisionConfig = useMemo(
    () => (settings.confidenceMode === 'strict' ? STRICT_DECISION_CONFIG : DEFAULT_DECISION_CONFIG),
    [settings.confidenceMode],
  );
  const decisionConfigRef = useRef(decisionConfig);
  decisionConfigRef.current = decisionConfig;

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

  const drawOverlay = useCallback((frame: FrameLandmarks, video: HTMLVideoElement) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);

    // Mirror horizontally to match the CSS-mirrored preview, so the overlay lines up.
    context.save();
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.lineWidth = 3;
    context.strokeStyle = 'rgba(96, 226, 148, 0.95)';
    context.fillStyle = 'rgba(96, 226, 148, 0.95)';

    for (const hand of frame.hands) {
      for (const landmark of hand.landmarks) {
        context.beginPath();
        context.arc(landmark.x * canvas.width, landmark.y * canvas.height, 3.2, 0, Math.PI * 2);
        context.fill();
      }
    }

    if (frame.pose) {
      context.strokeStyle = 'rgba(147, 197, 253, 0.85)';
      for (const index of [11, 12]) {
        const landmark = frame.pose.landmarks[index];
        if (!landmark) continue;
        context.beginPath();
        context.arc(landmark.x * canvas.width, landmark.y * canvas.height, 5, 0, Math.PI * 2);
        context.stroke();
      }
    }
    context.restore();
  }, []);

  const processFrame = useCallback(
    async (frame: FrameLandmarks, video: HTMLVideoElement | null) => {
      const classifier = await ensureClassifier();
      if (!classifier) {
        setModelError('Sign recognition is not available on this device right now.');
        publish({
          current: null,
          rejectionHint: REJECTION_HINT.unsupported_model,
          tracking: frame.hands.length > 0 ? 'tracking' : 'no-hands',
          handCount: frame.hands.length,
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

      const result = decide({
        state: releasedState,
        probabilities,
        vocabulary: classifier.card.vocabulary,
        handCount: features.handCount,
        bestHandScore: features.bestHandScore,
        config: decisionConfigRef.current,
        negativeClass: classifier.card.negativeClass,
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

      if (result.emitted && result.prediction.accepted) {
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

      if (video && showOverlayRef.current) drawOverlay(frame, video);

      publish({
        current: result.prediction,
        rejectionHint:
          result.prediction.accepted || !result.prediction.reason
            ? null
            : REJECTION_HINT[result.prediction.reason],
        tracking: features.handCount > 0 ? 'tracking' : 'no-hands',
        handCount: features.handCount,
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
      void processFrame(frame, replay ? null : video)
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
    });
  }, []);

  const start = useCallback(async () => {
    if (runningRef.current) return;

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
    if (!mountedRef.current) {
      landmarker.close();
      return;
    }
    landmarkerRef.current = landmarker;

    // 2. Then the classifier. A missing model is not fatal: the camera preview and the
    //    phrase board still work, and the UI says exactly why recognition is off.
    const classifier = await ensureClassifier();
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
    const video = videoRef.current;
    if (video) {
      video.srcObject = result.stream;
      try {
        await video.play();
      } catch {
        // Autoplay can be rejected before a user gesture; the preview will start on play().
      }
    }

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
    clearLatestAccepted,
    consumeLastAcceptedFeatures,
    suggestPhraseBoard,
    dismissPhraseBoardSuggestion,
  };
}

export { describeCameraError };
