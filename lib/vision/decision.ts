/**
 * Decision logic: turn raw class probabilities into an accepted word or an explicit
 * "Not recognised".
 *
 * Implements strategies 1-3 from `docs/technical-research.md` §3.4:
 *   1. probability threshold + top-1/top-2 margin
 *   2. explicit negative/`OTHER` class handling
 *   3. temporal consistency (k consistent frames out of a rolling window)
 *
 * The logic is a pure reducer so it can be unit-tested without a camera
 * (T-SIGN-04: "no flicker; at most one chip per stable sign").
 */

import type { Prediction, RejectionReason, ScoredLabel } from '@/lib/types';

export interface DecisionConfig {
  /** Minimum top-1 probability to consider a sign at all. */
  confidenceThreshold: number;
  /** Minimum gap between top-1 and top-2 probabilities. */
  marginThreshold: number;
  /** Minimum MediaPipe handedness score; below this the landmarks are untrustworthy. */
  minHandScore: number;
  /** Rolling window length in frames. */
  windowSize: number;
  /** How many of the last `windowSize` frames must agree before a sign is emitted. */
  requiredVotes: number;
}

/** Defaults for the "Normal" confidence mode. "Strict" tightens both thresholds. */
export const DEFAULT_DECISION_CONFIG: DecisionConfig = {
  confidenceThreshold: 0.7,
  marginThreshold: 0.2,
  minHandScore: 0.5,
  windowSize: 5,
  requiredVotes: 3,
};

/** "Strict" mode: fewer wrong words, more "Not recognised". */
export const STRICT_DECISION_CONFIG: DecisionConfig = {
  confidenceThreshold: 0.85,
  marginThreshold: 0.35,
  minHandScore: 0.6,
  windowSize: 7,
  requiredVotes: 5,
};

export interface DecisionState {
  /** Most recent `windowSize` frame verdicts; `null` means "this frame did not qualify". */
  window: Array<string | null>;
  /** Label already emitted and not yet released, to stop duplicate chips. */
  latchedLabel: string | null;
  /** Consecutive frames without an accepted sign; drives the phrase-board suggestion. */
  consecutiveRejections: number;
  /** How many times the phrase-board prompt has been triggered this session. */
  phraseBoardPrompts: number;
}

export function createDecisionState(): DecisionState {
  return { window: [], latchedLabel: null, consecutiveRejections: 0, phraseBoardPrompts: 0 };
}

export function resetDecisionState(): DecisionState {
  return createDecisionState();
}

export interface DecisionInput {
  state: DecisionState;
  /** Raw class probabilities aligned to `vocabulary`. Empty when no model output. */
  probabilities: number[];
  vocabulary: string[];
  /** How many hands the landmarker saw this frame. */
  handCount: number;
  /** Best MediaPipe handedness score this frame. */
  bestHandScore: number;
  config: DecisionConfig;
  /** Gloss used for the explicit negative class, if the model has one. */
  negativeClass?: string | null;
}

export interface DecisionResult {
  state: DecisionState;
  prediction: Prediction;
  /**
   * True only when a *new* stable sign is accepted. False when the same sign is still
   * being held (latched), or when the frame was rejected.
   */
  emitted: boolean;
  /** True when the caller should offer the phrase board. */
  suggestPhraseBoard: boolean;
}

const NOT_RECOGNISED_LABEL = 'Not recognised';

function rejection(reason: RejectionReason, top3: ScoredLabel[] = []): Prediction {
  return {
    label: NOT_RECOGNISED_LABEL,
    probability: 0,
    top3,
    accepted: false,
    reason,
  };
}

function rank(probabilities: number[], vocabulary: string[]): ScoredLabel[] {
  const pairs: ScoredLabel[] = [];
  const limit = Math.min(probabilities.length, vocabulary.length);
  for (let i = 0; i < limit; i += 1) {
    const probability = probabilities[i];
    const label = vocabulary[i];
    if (typeof probability !== 'number' || typeof label !== 'string') continue;
    if (!Number.isFinite(probability)) continue;
    pairs.push({ label, probability });
  }
  pairs.sort((a, b) => b.probability - a.probability);
  return pairs;
}

function pushVerdict(state: DecisionState, label: string | null, windowSize: number): DecisionState {
  const window = [...state.window, label].slice(-windowSize);
  return { ...state, window };
}

function countVotes(window: Array<string | null>, label: string): number {
  let votes = 0;
  for (const entry of window) if (entry === label) votes += 1;
  return votes;
}

/**
 * Reduce one frame of probabilities into a decision.
 *
 * Order of checks matters: cheap, unambiguous rejections come first so that the
 * "reason" shown to the user is the most actionable one.
 */
export function decide(input: DecisionInput): DecisionResult {
  const { state, probabilities, vocabulary, handCount, bestHandScore, config, negativeClass } = input;

  const ranked = rank(probabilities, vocabulary);
  const top3 = ranked.slice(0, 3);

  // 1. No hands at all -> nothing to classify.
  if (handCount === 0) {
    return {
      state: {
        ...pushVerdict(state, null, config.windowSize),
        consecutiveRejections: state.consecutiveRejections + 1,
      },
      prediction: rejection('no_hands', top3),
      emitted: false,
      suggestPhraseBoard: false,
    };
  }

  // 2. Landmarks detected but MediaPipe is not confident they are really hands.
  if (bestHandScore > 0 && bestHandScore < config.minHandScore) {
    return {
      state: {
        ...pushVerdict(state, null, config.windowSize),
        consecutiveRejections: state.consecutiveRejections + 1,
      },
      prediction: rejection('below_min_hand_confidence', top3),
      emitted: false,
      suggestPhraseBoard: false,
    };
  }

  // 3. No model output available.
  if (ranked.length === 0) {
    return {
      state: {
        ...pushVerdict(state, null, config.windowSize),
        consecutiveRejections: state.consecutiveRejections + 1,
      },
      prediction: rejection('unsupported_model', top3),
      emitted: false,
      suggestPhraseBoard: false,
    };
  }

  const best = ranked[0] as ScoredLabel;

  // 4. The model explicitly said "this is not one of the supported signs".
  if (negativeClass && best.label === negativeClass) {
    return {
      state: {
        ...pushVerdict(state, null, config.windowSize),
        consecutiveRejections: state.consecutiveRejections + 1,
      },
      prediction: rejection('low_confidence', top3),
      emitted: false,
      suggestPhraseBoard: false,
    };
  }

  // 5. Confidence threshold.
  if (best.probability < config.confidenceThreshold) {
    return {
      state: {
        ...pushVerdict(state, null, config.windowSize),
        consecutiveRejections: state.consecutiveRejections + 1,
      },
      prediction: rejection('low_confidence', top3),
      emitted: false,
      suggestPhraseBoard: false,
    };
  }

  // 6. Margin over the runner-up: two near-equal classes mean the model is unsure.
  //
  //    Reachability note, so nobody deletes this as dead code: for a model whose outputs
  //    are a normalised distribution summing to 1, this check cannot fire once step 5 has
  //    passed. If the top class clears `confidenceThreshold`, then every other class sums
  //    to at most `1 - confidenceThreshold`, so the margin is at least
  //    `2 * confidenceThreshold - 1` (0.4 for the default 0.7, 0.7 for strict mode's 0.85).
  //
  //    It is kept because it is a real guard against a model or backend that returns
  //    *unnormalised* scores — independent sigmoid outputs, raw logits from a thin server
  //    implementation, or a distribution over a vocabulary larger than the one the card
  //    declares. In that case two classes really can both score 0.9 and the top-1 result is
  //    meaningless. `lib/model/loader.ts` normalises softmax outputs, but the optional
  //    WebSocket backend returns whatever the server sends, so the check is load-bearing
  //    there. `tests/decision.test.ts` exercises it with unnormalised scores and asserts
  //    the subsumption property for normalised ones.
  const runnerUp = ranked[1]?.probability ?? 0;
  if (best.probability - runnerUp < config.marginThreshold) {
    return {
      state: {
        ...pushVerdict(state, null, config.windowSize),
        consecutiveRejections: state.consecutiveRejections + 1,
      },
      prediction: rejection('low_margin', top3),
      emitted: false,
      suggestPhraseBoard: false,
    };
  }

  // 7. Temporal consistency.
  const nextWindow = pushVerdict(state, best.label, config.windowSize).window;
  const votes = countVotes(nextWindow, best.label);

  if (votes < config.requiredVotes) {
    return {
      state: {
        ...state,
        window: nextWindow,
        consecutiveRejections: state.consecutiveRejections + 1,
      },
      prediction: rejection('unstable', top3),
      emitted: false,
      suggestPhraseBoard: false,
    };
  }

  // Accepted. Emit only when the sign was not already emitted, and latch until the
  // window no longer contains the label (i.e. the user released the sign).
  const alreadyLatched = state.latchedLabel === best.label;
  const nextState: DecisionState = {
    ...state,
    window: nextWindow,
    latchedLabel: best.label,
    consecutiveRejections: 0,
  };

  return {
    state: nextState,
    prediction: {
      label: best.label,
      probability: best.probability,
      top3,
      accepted: true,
    },
    emitted: !alreadyLatched,
    suggestPhraseBoard: false,
  };
}

/**
 * Release the latch when the sign is dropped, so the same sign can be emitted again.
 * Call this once per frame with the raw hand count before `decide` if you want a sign
 * to be re-emittable as soon as the user lowers their hands.
 */
export function releaseLatchIfReleased(state: DecisionState, handCount: number): DecisionState {
  if (handCount > 0) return state;
  return { ...state, latchedLabel: null };
}

/**
 * Two consecutive "Not recognised" frames-sequences trigger the phrase-board prompt
 * (UC3 in `docs/user-personas-and-use-cases.md`).
 */
export const PHRASE_BOARD_SUGGESTION_THRESHOLD = 2;

export function shouldSuggestPhraseBoard(
  previous: DecisionState,
  next: DecisionState,
): boolean {
  return (
    !next.latchedLabel &&
    next.consecutiveRejections >= PHRASE_BOARD_SUGGESTION_THRESHOLD &&
    previous.phraseBoardPrompts === 0
  );
}

/** Map a probability to the confidence band shown next to a chip. */
export function confidenceBand(probability: number): 'high' | 'medium' | 'low' {
  if (probability >= 0.85) return 'high';
  if (probability >= 0.6) return 'medium';
  return 'low';
}

export const CONFIDENCE_BAND_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

/** Plain-language explanation of why a frame was rejected, shown under the preview. */
export const REJECTION_HINT: Record<RejectionReason, string> = {
  no_hands: 'No hands detected. Bring your hands into the frame.',
  below_min_hand_confidence: 'Tracking is unclear. Improve the lighting or move closer.',
  low_confidence: 'Not recognised. Hold the sign steady, or choose it from the phrase board.',
  low_margin: 'Two signs look similar here. Hold the sign still and face the camera.',
  unstable: 'Almost there. Hold the sign for a moment longer.',
  unsupported_model: 'Sign recognition is not available. Use the phrase board or typing.',
};
