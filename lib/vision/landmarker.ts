/**
 * MediaPipe Tasks Vision wrapper.
 *
 * MediaPipe locates hands and body joints. It does **not** recognise sign language —
 * that is done by the classifier in `lib/model` (`docs/technical-research.md` §3.1).
 *
 * Assets are self-hosted under `/mediapipe/wasm` and `/models` so that no request
 * leaves the user's origin (see `docs/privacy-and-safety.md` §7 and `scripts/setup-assets.mjs`).
 */

import type { FrameLandmarks, HandLandmarks, Handedness, Landmark, PoseLandmarks } from '@/lib/types';

export interface LandmarkerAssets {
  /** Directory containing `vision_wasm_internal.js` / `.wasm`. */
  wasmBasePath: string;
  /** Path to `hand_landmarker.task`. */
  handModelPath: string;
  /** Path to `pose_landmarker_lite.task`; optional but recommended for sign location. */
  poseModelPath: string;
}

export const DEFAULT_LANDMARKER_ASSETS: LandmarkerAssets = {
  wasmBasePath: '/mediapipe/wasm',
  handModelPath: '/models/hand_landmarker.task',
  poseModelPath: '/models/pose_landmarker_lite.task',
};

export type LandmarkerFailureReason =
  | 'wasm-unavailable'
  | 'hand-model-missing'
  | 'pose-model-missing'
  | 'init-timeout'
  | 'init-error'
  | 'browser-unsupported';

export interface LandmarkerFailure {
  reason: LandmarkerFailureReason;
  title: string;
  cause: string;
  fix: string;
  retryable: boolean;
  technical?: string;
}

export interface LandmarkerInitOptions {
  assets?: Partial<LandmarkerAssets>;
  /** Maximum number of hands to track. Two is enough for ISL's two-handed signs. */
  numHands?: number;
  /** Milliseconds to wait for the WASM runtime before giving up. */
  timeoutMs?: number;
  /**
   * MediaPipe reports handedness assuming the input image is mirrored (selfie camera).
   * We feed raw, unmirrored frames from the front camera, so the label must be swapped
   * to describe the *user's* actual hand. Keep this consistent between the data
   * collection tool and the live app or the left/right feature slots will disagree.
   */
  swapHandedness?: boolean;
}

const DEFAULT_TIMEOUT_MS = 20_000;

interface RawCategory {
  categoryName?: string;
  score?: number;
}

interface RawNormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

interface RawHandResult {
  landmarks?: RawNormalizedLandmark[][];
  handedness?: RawCategory[][];
}

interface RawPoseResult {
  landmarks?: RawNormalizedLandmark[][];
}

interface HandLandmarkerLike {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): RawHandResult;
  close(): void;
}

interface PoseLandmarkerLike {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): RawPoseResult;
  close(): void;
}

function toLandmark(raw: RawNormalizedLandmark): Landmark {
  return {
    x: raw.x,
    y: raw.y,
    z: raw.z,
    ...(typeof raw.visibility === 'number' ? { visibility: raw.visibility } : {}),
  };
}

/**
 * Stateful MediaPipe session. Create once per camera session and `close()` it when the
 * camera stops, otherwise the WASM heap leaks across sessions.
 */
export class SignLandmarker {
  private readonly handLandmarker: HandLandmarkerLike;
  private readonly poseLandmarker: PoseLandmarkerLike | null;
  private readonly swapHandedness: boolean;

  private constructor(
    handLandmarker: HandLandmarkerLike,
    poseLandmarker: PoseLandmarkerLike | null,
    swapHandedness: boolean,
  ) {
    this.handLandmarker = handLandmarker;
    this.poseLandmarker = poseLandmarker;
    this.swapHandedness = swapHandedness;
  }

  static async create(options: LandmarkerInitOptions = {}): Promise<SignLandmarker> {
    const assets = { ...DEFAULT_LANDMARKER_ASSETS, ...options.assets };
    const numHands = options.numHands ?? 2;
    const swapHandedness = options.swapHandedness ?? true;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (typeof window === 'undefined') {
      throw makeFailure('browser-unsupported');
    }

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(makeFailure('init-timeout')), timeoutMs);
    });

    const init = (async () => {
      const vision = await import('@mediapipe/tasks-vision');
      const { FilesetResolver, HandLandmarker, PoseLandmarker } = vision;

      const fileset = await FilesetResolver.forVisionTasks(assets.wasmBasePath);

      const handLandmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: assets.handModelPath,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      // Pose is a nice-to-have: signs that live at the head or chest need shoulder
      // reference points, but handshape-only signs still work without it.
      let poseLandmarker: PoseLandmarkerLike | null = null;
      try {
        poseLandmarker = await PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: assets.poseModelPath, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      } catch (error) {
        console.warn('[SignSpeak] Pose landmarker unavailable; location features will be zero.', error);
        poseLandmarker = null;
      }

      return new SignLandmarker(handLandmarker, poseLandmarker, swapHandedness);
    })();

    try {
      return await Promise.race([init, timeout]);
    } catch (error) {
      if (isFailure(error)) throw error;
      const technical = error instanceof Error ? error.message : String(error);
      // A missing .task file surfaces as a fetch/abort error with the URL in the message.
      if (/hand_landmarker/i.test(technical)) throw makeFailure('hand-model-missing', technical);
      if (/pose_landmarker/i.test(technical)) throw makeFailure('pose-model-missing', technical);
      if (/wasm|WebAssembly|importScripts|fetch/i.test(technical)) {
        throw makeFailure('wasm-unavailable', technical);
      }
      throw makeFailure('init-error', technical);
    }
  }

  /** True when pose landmarks are available (sign-location features are usable). */
  get hasPose(): boolean {
    return this.poseLandmarker !== null;
  }

  /**
   * Run detection on the current video frame.
   *
   * `timestampMs` must be monotonically increasing; MediaPipe's VIDEO mode throws if it
   * is not, so callers pass `performance.now()` and we de-duplicate repeated values.
   */
  private lastTimestamp = -1;

  detect(video: HTMLVideoElement, timestampMs: number): FrameLandmarks {
    const safeTimestamp = timestampMs <= this.lastTimestamp ? this.lastTimestamp + 1 : timestampMs;
    this.lastTimestamp = safeTimestamp;

    const hands: HandLandmarks[] = [];
    try {
      const handResult = this.handLandmarker.detectForVideo(video, safeTimestamp);
      const rawHands = handResult.landmarks ?? [];
      const rawHandedness = handResult.handedness ?? [];

      for (let i = 0; i < rawHands.length; i += 1) {
        const points = rawHands[i];
        if (!points || points.length === 0) continue;
        const category = rawHandedness[i]?.[0];
        const reported = (category?.categoryName ?? 'Right') as Handedness;
        const handedness: Handedness =
          this.swapHandedness && reported === 'Left'
            ? 'Right'
            : this.swapHandedness && reported === 'Right'
              ? 'Left'
              : reported;
        hands.push({
          handedness,
          score: typeof category?.score === 'number' ? category.score : 0.5,
          landmarks: points.map(toLandmark),
        });
      }
    } catch (error) {
      // A single bad frame must not kill the loop; the caller sees an empty frame and
      // the tracking indicator drops to "no hands".
      console.warn('[SignSpeak] Hand detection failed for this frame.', error);
    }

    let pose: PoseLandmarks | null = null;
    if (this.poseLandmarker) {
      try {
        const poseResult = this.poseLandmarker.detectForVideo(video, safeTimestamp);
        const points = poseResult.landmarks?.[0];
        if (points && points.length > 0) pose = { landmarks: points.map(toLandmark) };
      } catch (error) {
        console.warn('[SignSpeak] Pose detection failed for this frame.', error);
      }
    }

    return { hands, pose, timestampMs: safeTimestamp };
  }

  close(): void {
    try {
      this.handLandmarker.close();
    } catch {
      /* already closed */
    }
    try {
      this.poseLandmarker?.close();
    } catch {
      /* already closed */
    }
  }
}

function makeFailure(reason: LandmarkerFailureReason, technical?: string): LandmarkerFailure & Error {
  const base = FAILURE_COPY[reason];
  const error = new Error(base.title) as LandmarkerFailure & Error;
  error.name = 'LandmarkerFailure';
  Object.assign(error, { reason, ...base, technical });
  return error;
}

function isFailure(value: unknown): value is LandmarkerFailure {
  return (
    typeof value === 'object' &&
    value !== null &&
    'reason' in value &&
    typeof (value as { reason?: unknown }).reason === 'string' &&
    'fix' in value
  );
}

export function isLandmarkerFailure(value: unknown): value is LandmarkerFailure {
  return isFailure(value);
}

const FAILURE_COPY: Record<
  LandmarkerFailureReason,
  Omit<LandmarkerFailure, 'reason' | 'technical'>
> = {
  'wasm-unavailable': {
    title: 'Hand tracking could not start',
    cause: 'The on-device vision runtime did not load. This is usually a blocked script or a slow connection on first use.',
    fix: 'Check your connection and press Try again. The phrase board and typing work without the camera.',
    retryable: true,
  },
  'hand-model-missing': {
    title: 'Hand-tracking model file is missing',
    cause: 'The file /models/hand_landmarker.task was not found on this server.',
    fix: 'Run `npm run setup:assets` (or `node scripts/setup-assets.mjs`) to download the model files, then reload. Meanwhile, the phrase board and typing work.',
    retryable: true,
  },
  'pose-model-missing': {
    title: 'Pose model file is missing',
    cause: 'The file /models/pose_landmarker_lite.task was not found on this server.',
    fix: 'Run `npm run setup:assets` to download the model files, then reload.',
    retryable: true,
  },
  'init-timeout': {
    title: 'Hand tracking took too long to start',
    cause: 'The vision runtime did not finish loading within 20 seconds.',
    fix: 'Press Try again on a faster connection. The phrase board and typing work without the camera.',
    retryable: true,
  },
  'init-error': {
    title: 'Hand tracking could not start',
    cause: 'The on-device vision runtime reported an unexpected error.',
    fix: 'Press Try again, or reload the page. The phrase board and typing work without the camera.',
    retryable: true,
  },
  'browser-unsupported': {
    title: 'Hand tracking is not available here',
    cause: 'This environment cannot run the on-device vision runtime.',
    fix: 'Open SignSpeak in a modern browser such as Chrome, Edge or Safari.',
    retryable: false,
  },
};
