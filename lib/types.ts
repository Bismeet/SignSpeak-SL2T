/**
 * Centralised type contracts for SignSpeak.
 *
 * These types are the single source of truth shared by the vision layer, the model
 * layer, the speech layer, the phrase layer and the UI. The Python pipeline in `ml/`
 * mirrors the JSON shapes defined here (see `ml/signdata/schema.py` and
 * `docs/technical-architecture.md` §8 "Data contracts").
 */

/* ------------------------------------------------------------------------------------
 * Landmarks
 * ---------------------------------------------------------------------------------- */

/** A single MediaPipe landmark. `x`/`y` are normalised to the image (0..1); `z` is a
 *  relative depth estimate and is deliberately treated as low-trust by the feature code. */
export interface Landmark {
  x: number;
  y: number;
  z: number;
  /** MediaPipe confidence for this point, when the task provides it (0..1). */
  visibility?: number;
}

/** Handedness label as returned by MediaPipe (already mapped to the *user's* handedness
 *  by the landmarker wrapper, not the mirrored camera image). */
export type Handedness = 'Left' | 'Right';

/** One detected hand: 21 landmarks plus handedness and its confidence. */
export interface HandLandmarks {
  handedness: Handedness;
  score: number;
  landmarks: Landmark[];
}

/** The subset of pose landmarks the feature code depends on (MediaPipe Pose indices). */
export interface PoseLandmarks {
  /** 11 = left shoulder, 12 = right shoulder, 0 = nose, 23/24 = hips. */
  landmarks: Landmark[];
}

/** Everything the feature extractor needs for a single frame. */
export interface FrameLandmarks {
  hands: HandLandmarks[];
  pose: PoseLandmarks | null;
  /** Monotonic timestamp in milliseconds, used for temporal smoothing only. */
  timestampMs: number;
}

/* ------------------------------------------------------------------------------------
 * Feature vector
 * ---------------------------------------------------------------------------------- */

/**
 * Version identifier for the feature normalisation. Bump this whenever the layout,
 * ordering, normalisation or units change; the model card records the version it was
 * trained with and the browser refuses to run a model whose version it does not match.
 *
 * Layout of `ss-features-v1` (total `FEATURE_VECTOR_LENGTH` = 159 floats):
 *
 *   [  0..125]  hands[0..1] * 21 landmarks * (x, y, z)   — wrist-origin, hand-size scaled
 *   [126..127]  hands[0..1] presence flag (1 = detected, 0 = absent)
 *   [128..131]  hands[0..1] centroid relative to shoulder midpoint, / shoulder width (x, y)
 *   [132..137]  hands[0..1] palm unit normal (x, y, z)
 *   [138..147]  hands[0..1] wrist->fingertip distances (thumb, index, middle, ring, pinky)
 *   [148..157]  hands[0..1] finger extension angles in radians (thumb, index, middle, ring, pinky)
 *   [158]       pose_present flag (1 = shoulders available, 0 = not)
 *
 * Slot order is fixed: index 0 is the LEFT hand, index 1 is the RIGHT hand. An absent
 * hand contributes zeros plus a 0 presence flag, so the vector length never varies.
 */
export const FEATURE_VECTOR_LENGTH = 159;

/** Current feature normalisation version. Must match `model-card.json`. */
export const FEATURE_VERSION = 'ss-features-v1';

/* ------------------------------------------------------------------------------------
 * Prediction
 * ---------------------------------------------------------------------------------- */

/** Why a prediction was not accepted. Mirrors `docs/technical-architecture.md` §8. */
export type RejectionReason =
  | 'low_confidence'
  | 'low_margin'
  | 'unstable'
  | 'no_hands'
  | 'unsupported_model'
  | 'below_min_hand_confidence'
  | 'insufficient_landmarks';

export interface ScoredLabel {
  /** Vocabulary gloss, e.g. `PAIN`. */
  label: string;
  probability: number;
}

/**
 * A single classifier output. `accepted === false` means the UI must show
 * "Not recognised" and must not emit a word (FR-STT-05).
 */
export interface Prediction {
  label: string;
  probability: number;
  top3: ScoredLabel[];
  accepted: boolean;
  reason?: RejectionReason;
}

/* ------------------------------------------------------------------------------------
 * Model metadata
 * ---------------------------------------------------------------------------------- */

/**
 * Where a model's training data came from. Used to keep the UI honest.
 *
 * - `collected_consented_dataset` — recorded for this project, with consent. The only source
 *   that can clear `notForRealUse`.
 * - `public_dataset` — real sign-language recordings from a published research corpus. The
 *   signs are real, but nobody on this project consented to the recording and no signer here
 *   has reviewed the result, so it is still not for real use.
 * - `synthetic_smoke_test` — procedurally generated landmarks. The model has never seen a
 *   real sign.
 * - `none` — absent, unrecognised, or unstated.
 *
 * `public_dataset` exists because the other three could not describe a model trained on real
 * research data: `synthetic_smoke_test` would be false, and `none` would discard the fact
 * that it *was* trained on real signs. Both would make the UI's explanation wrong.
 */
export type ModelTrainingSource =
  | 'collected_consented_dataset'
  | 'public_dataset'
  | 'synthetic_smoke_test'
  | 'none';

/**
 * `model-card.json` — written by `ml/scripts/train.py`, read by the browser at startup.
 * See `docs/ai-ml-and-dataset-plan.md` §8.
 */
export interface ModelCard {
  schemaVersion: 1;
  modelVersion: string;
  /** ISO date the model was trained. */
  trainedOn: string;
  /** Algorithm actually used, e.g. `random_forest`, `mlp`, `knn`, `svm_rbf`. */
  algorithm: string;
  featureVersion: string;
  inputDim: number;
  /** Ordered vocabulary. Index in this array is the class index in the ONNX output. */
  vocabulary: string[];
  /** Human-readable labels for each vocabulary entry, keyed by gloss. */
  labels: Record<string, string>;
  /** Optional negative/`OTHER` class gloss included for rejection. */
  negativeClass: string | null;
  trainingSource: ModelTrainingSource;
  /**
   * True when the model was trained on procedurally generated data purely to exercise
   * the pipeline. The UI shows a permanent "smoke test" banner and never presents these
   * predictions as real sign recognition.
   */
  notForRealUse: boolean;
  dataset: {
    name: string;
    version: string;
    signerCount: number;
    sampleCount: number;
    perClassCounts: Record<string, number>;
    manifestHash: string;
  };
  metrics: ModelMetrics | null;
  decision: {
    confidenceThreshold: number;
    marginThreshold: number;
    minHandScore: number;
    smoothing: { windowSize: number; requiredVotes: number };
  };
  limitations: string[];
  /** Set when the model came from a smoke-test run. */
  disclaimer?: string;
}

export interface ModelMetrics {
  /**
   * Held-out macro F1 — the headline acceptance metric.
   *
   * The field name says "signer" because that is what the metric is *supposed* to be. Read
   * `splitKind` before labelling it: when the split was not signer-independent this number is
   * optimistic, and calling it a held-out-signer score overstates it. Use `metricLabels()`.
   */
  heldOutSignerMacroF1: number | null;
  /** Leave-one-signer-out mean macro F1 across folds. */
  losoMeanMacroF1: number | null;
  perClassRecall: Record<string, number>;
  falseAcceptRate: number | null;
  falseRejectRate: number | null;
  seenSignerAccuracy: number | null;
  confusionMatrix: number[][];
  classOrder: string[];
  /** Per-frame classifier latency measured during evaluation, milliseconds. */
  inferenceLatencyMs: number | null;
  /**
   * How the model was actually evaluated: `held-out-signer`, `held-out-group`, `random-sample`
   * or `none`. Written by the training pipeline; absent on cards produced before it was
   * recorded.
   */
  splitKind?: string | null;
  /** Human-readable explanation of the split, including anything it failed to cover. */
  splitNote?: string | null;
  /** True when the split was not signer-independent, so every number above is optimistic. */
  optimistic?: boolean;
  /** Macro F1 over the sign classes only, excluding the negative class. */
  macroF1PositiveClasses?: number | null;
  /** Majority-vote accuracy over whole recordings rather than frames. */
  windowAccuracy?: number | null;
}

/* ------------------------------------------------------------------------------------
 * Sign vocabulary (recognition input side)
 * ---------------------------------------------------------------------------------- */

/** Whether an ISL signer has confirmed the sign's form.
 *  Everything defaults to `unverified` — see `docs/ai-ml-and-dataset-plan.md` §1.2. */
export type VerificationStatus = 'unverified' | 'expert_verified' | 'rejected';

export type SignCategory =
  | 'pain'
  | 'body'
  | 'needs'
  | 'help'
  | 'people'
  | 'answers'
  | 'symptoms';

export interface SignVocabularyEntry {
  /** Uppercase gloss used as the class label, e.g. `PAIN`. */
  gloss: string;
  /** English label shown in the UI. */
  label: string;
  /** Hindi label, empty when not yet translated. */
  labelHi: string;
  category: SignCategory;
  /** MVP tier from `docs/mvp-scope.md`. */
  tier: 'must' | 'should';
  /** Static/dynamic status. `unverified` means no ISL signer has confirmed it. */
  motion: 'static' | 'dynamic' | 'unverified';
  verification: VerificationStatus;
  /** ISL signer who confirmed the form, empty when unverified. */
  verifiedBy: string;
  /** ISO date of verification, empty when unverified. */
  verifiedOn: string;
  /** Reference to the canonical form (ISLRTC entry or clip URL) if known. */
  reference: string;
  /** Free-text note, e.g. why a sign was deferred. */
  notes: string;
}

/* ------------------------------------------------------------------------------------
 * Phrases (output side)
 * ---------------------------------------------------------------------------------- */

export type PhraseCategory =
  | 'pain'
  | 'symptoms'
  | 'needs'
  | 'help'
  | 'staff_questions'
  | 'staff_instructions'
  | 'answers';

/** Which party the phrase is normally spoken by. */
export type PhraseSpeaker = 'deaf_user' | 'hearing_user' | 'both';

export interface ClipReference {
  /** `none` means no clip exists yet; the UI must show the "no verified ISL video" state. */
  type: 'none' | 'file' | 'youtube';
  /** Relative path under /clips, or a YouTube video id. Empty when `type === 'none'`. */
  src: string;
  /** Optional start/end offsets in seconds for embedded clips. */
  startSeconds?: number;
  endSeconds?: number;
}

export interface ClipValidation {
  status: VerificationStatus;
  /** Named ISL verifier. Empty until a real expert has signed off. */
  verifiedBy: string;
  /** ISO date of verification. */
  verifiedOn: string;
}

export interface Phrase {
  id: string;
  category: PhraseCategory;
  /** Which side of the conversation says this phrase. */
  speaker: PhraseSpeaker;
  textEn: string;
  textHi: string;
  /** Extra English surface forms the matcher accepts (normalised at load time). */
  aliasesEn: string[];
  /** Extra Hindi surface forms. */
  aliasesHi: string[];
  /** ISL gloss sequence, only filled once an expert supplies it. */
  islGloss: string;
  clip: ClipReference;
  validation: ClipValidation;
  /** SPDX-style licence string, e.g. `CC-BY-4.0`, or `own-recording`. */
  licence: string;
  /** Attribution line shown under the clip. */
  attribution: string;
  /** Emergency-mode shortcut. At most 8 phrases may set this (FR-HOSP-04). */
  emergency: boolean;
  /** Ordering hint within a category. */
  order: number;
  /** Caption shown with the clip; falls back to `textEn` when empty. */
  caption: string;
}

/* ------------------------------------------------------------------------------------
 * Conversation
 * ---------------------------------------------------------------------------------- */

export type ConversationParty = 'deaf_user' | 'hearing_user' | 'system';

export type MessageSource =
  | 'sign_recognition'
  | 'typed'
  | 'speech_recognition'
  | 'phrase_board'
  | 'emergency'
  | 'system';

export type ConfidenceBand = 'high' | 'medium' | 'low';

export interface MessageAlternative {
  label: string;
  probability: number;
}

export interface ConversationMessage {
  id: string;
  party: ConversationParty;
  source: MessageSource;
  text: string;
  createdAt: number;
  /** Present only for `sign_recognition` messages. */
  recognition?: {
    originalLabel: string;
    probability: number;
    band: ConfidenceBand;
    alternatives: MessageAlternative[];
    /** True once the user has confirmed or corrected the prediction. */
    reviewed: boolean;
    /** True when the user picked a different label or typed a replacement. */
    corrected: boolean;
    /** True when the user explicitly rejected the prediction. */
    rejected: boolean;
  };
  /** Set when a party flags the message as misunderstood (FR-CONV-03). */
  misunderstood?: boolean;
  /** For hearing-user messages: did the deaf user get a verified ISL clip or text only? */
  delivery?: {
    mode: 'isl_clip' | 'text_only' | 'pending';
    phraseId?: string;
    clipStatus?: VerificationStatus;
  };
  /** How the message reached the other party via speech synthesis. */
  spoken?: boolean;
}

/* ------------------------------------------------------------------------------------
 * Speech
 * ---------------------------------------------------------------------------------- */

export type SpeechSupport = 'supported' | 'unsupported' | 'unknown';

export interface AsrCapabilities {
  support: SpeechSupport;
  /** True when the page is a secure context (HTTPS or localhost). */
  secureContext: boolean;
  /** True when `navigator.mediaDevices.getUserMedia` exists. */
  hasMediaDevices: boolean;
  reason: string;
}

export type AsrErrorCode =
  | 'not-allowed'
  | 'service-not-allowed'
  | 'no-speech'
  | 'audio-capture'
  | 'network'
  | 'aborted'
  | 'language-not-supported'
  | 'unknown';

export interface AsrError {
  code: AsrErrorCode;
  /** Plain-language explanation shown to the user. */
  message: string;
  /** Plain-language next step. */
  remedy: string;
  /** True when retrying is likely to help. */
  retryable: boolean;
}

export interface VoiceOption {
  name: string;
  lang: string;
  /** True when the voice's language matches the requested locale exactly. */
  exactMatch: boolean;
  localService: boolean;
}

/* ------------------------------------------------------------------------------------
 * Settings
 * ---------------------------------------------------------------------------------- */

export type ThemeChoice = 'day' | 'dark' | 'contrast';
export type TextScale = 'normal' | 'large' | 'xlarge';
export type ConfidenceMode = 'normal' | 'strict';

export interface AppSettings {
  theme: ThemeChoice;
  textScale: TextScale;
  reduceMotion: boolean;
  /** FR-SPK-02: off by default so no audio plays without an explicit user action. */
  autoSpeakRecognised: boolean;
  /** FR-SPK-03 */
  ttsVoiceUri: string | null;
  ttsRate: number;
  /** FR-ASR-03 */
  asrLanguage: string;
  ttsLanguage: string;
  /** Recognition strictness (docs/ui-ux-specification.md §3.7). */
  confidenceMode: ConfidenceMode;
  /**
   * Adds the diagnostic layer over the always-on hand skeleton: a dot on every tracked
   * joint and a marker on each shoulder (FR-… camera overlay switch).
   */
  showLandmarkOverlay: boolean;
  /** FR-HOSP-05: draft/unverified phrases hidden unless this is on. */
  showUnverifiedPhrases: boolean;
  /** NFR-01: opt-in only, landmarks never images. */
  logLandmarksLocally: boolean;
  /** Minutes of inactivity before the conversation is cleared; 0 disables. */
  autoClearMinutes: number;
  /** Demo aid from docs/hackathon-demo-plan.md §3: replay recorded landmarks. */
  demoReplayLandmarks: boolean;
  /** Enables the optional landmark-only inference backend when configured. */
  useInferenceBackend: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'day',
  textScale: 'normal',
  reduceMotion: false,
  autoSpeakRecognised: false,
  ttsVoiceUri: null,
  ttsRate: 0.95,
  asrLanguage: 'en-IN',
  ttsLanguage: 'en-IN',
  confidenceMode: 'normal',
  showLandmarkOverlay: false,
  showUnverifiedPhrases: false,
  logLandmarksLocally: false,
  autoClearMinutes: 10,
  demoReplayLandmarks: false,
  useInferenceBackend: false,
};

/* ------------------------------------------------------------------------------------
 * Runtime status
 * ---------------------------------------------------------------------------------- */

export type CameraStatus =
  | 'idle'
  | 'requesting'
  | 'streaming'
  | 'paused'
  | 'denied'
  | 'not-found'
  | 'in-use'
  | 'insecure-context'
  | 'unsupported'
  | 'error';

export type TrackingStatus = 'no-hands' | 'tracking' | 'searching' | 'inactive';

/** Availability of the sign-recognition model, surfaced honestly in the UI. */
export type ModelAvailability =
  | { state: 'loading' }
  | { state: 'ready'; card: ModelCard; runtime: 'onnxruntime-web' | 'backend' }
  | { state: 'missing'; reason: string; remedy: string }
  | { state: 'incompatible'; reason: string; remedy: string }
  | { state: 'error'; reason: string; remedy: string };

export interface CollectedSample {
  /** Client-generated id, unique per sample. */
  id: string;
  /** Pseudonymous signer id chosen by the operator; never a real name. */
  signerId: string;
  /** `fluent` for ISL users, `learner` for hearing team members (excluded from test sets). */
  signerType: 'fluent' | 'learner';
  label: string;
  /** Session tag, groups samples recorded together. */
  session: string;
  capturedAt: string;
  /** Metadata used for robustness slices. */
  conditions: {
    lighting: 'bright' | 'dim' | 'mixed';
    background: 'plain' | 'cluttered';
    distance: 'near' | 'medium' | 'far';
    pose: 'sitting' | 'standing' | 'lying';
    handedness: 'left' | 'right' | 'both';
  };
  toolVersion: string;
  /** Number of frames captured in the window. */
  frameCount: number;
  /** `[T][159]` feature matrix. Landmarks only — never pixels. */
  features: number[][];
}
