/**
 * Runtime configuration, read from `NEXT_PUBLIC_*` environment variables.
 *
 * Everything has a safe default so the app runs with no `.env` file at all.
 * See `.env.example` for documentation of every variable.
 */

function readString(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  const trimmed = value?.trim().toLowerCase();
  if (trimmed === '1' || trimmed === 'true' || trimmed === 'yes') return true;
  if (trimmed === '0' || trimmed === 'false' || trimmed === 'no') return false;
  return fallback;
}

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const APP_NAME = 'SignSpeak';
export const APP_TAGLINE =
  'A two-way Indian Sign Language communication aid for hospital and emergency settings.';

/** Bumped whenever the feature contract or phrase schema changes. */
export const APP_VERSION = '0.1.0';

export const config = {
  /** Path to the exported classifier. */
  modelUrl: readString(process.env.NEXT_PUBLIC_MODEL_URL, '/models/sign-clf-v1.onnx'),
  /** Path to the model card written by `ml/scripts/train.py`. */
  modelCardUrl: readString(process.env.NEXT_PUBLIC_MODEL_CARD_URL, '/models/model-card.json'),
  /** Path to the exported alphabet classifier. */
  alphabetModelUrl: readString(
    process.env.NEXT_PUBLIC_ALPHABET_MODEL_URL,
    '/models/alphabet-clf-v1.onnx',
  ),
  /** Path to the alphabet model card. */
  alphabetModelCardUrl: readString(
    process.env.NEXT_PUBLIC_ALPHABET_MODEL_CARD_URL,
    '/models/alphabet-model-card.json',
  ),
  /** Self-hosted MediaPipe WASM directory. */
  mediapipeWasmPath: readString(process.env.NEXT_PUBLIC_MEDIAPIPE_WASM_PATH, '/mediapipe/wasm'),
  /** Self-hosted MediaPipe `.task` model files. */
  handModelUrl: readString(
    process.env.NEXT_PUBLIC_HAND_MODEL_URL,
    '/models/hand_landmarker.task',
  ),
  poseModelUrl: readString(
    process.env.NEXT_PUBLIC_POSE_MODEL_URL,
    '/models/pose_landmarker_lite.task',
  ),
  /** Self-hosted ONNX Runtime Web WASM directory. */
  ortWasmPath: readString(process.env.NEXT_PUBLIC_ORT_WASM_PATH, '/ort/'),
  /**
   * Optional landmark-only inference backend (FastAPI, `docs/technical-architecture.md` §8).
   * Empty means "browser inference only", which is the default and the privacy-preferred path.
   */
  inferenceBackendUrl: readString(process.env.NEXT_PUBLIC_INFERENCE_BACKEND_URL, ''),
  /**
   * Emergency number shown in the safety banner. Defaults to India's integrated
   * emergency number; Q7 in `docs/open-questions-and-decisions.md` asks the team to
   * verify this before any public deployment.
   */
  emergencyNumber: readString(process.env.NEXT_PUBLIC_EMERGENCY_NUMBER, '112'),
  /** Opt-in: show draft/unverified phrases on first load. Users can still toggle it. */
  showUnverifiedByDefault: readBoolean(
    process.env.NEXT_PUBLIC_SHOW_UNVERIFIED_PHRASES,
    false,
  ),
  /** Lower the capture resolution on low-end devices (risk R7). */
  captureWidth: readNumber(process.env.NEXT_PUBLIC_CAPTURE_WIDTH, 640),
  captureHeight: readNumber(process.env.NEXT_PUBLIC_CAPTURE_HEIGHT, 480),
  /** Warn the user when measured FPS drops below this (docs/technical-architecture.md §6). */
  lowFpsThreshold: readNumber(process.env.NEXT_PUBLIC_LOW_FPS_THRESHOLD, 8),
} as const;

/** True when an optional landmark inference backend is configured. */
export function hasInferenceBackend(): boolean {
  return config.inferenceBackendUrl.length > 0;
}
