/**
 * Decision-layer tests — the rejection logic (T-SIGN-03, T-SIGN-04).
 *
 * The behaviour that matters most in this whole application is what happens when the model
 * is *not* sure. A false accept ("it said PAIN when the patient signed nothing like pain")
 * is far worse than a false reject, so these tests assert the conservative path explicitly.
 *
 * The decision layer is a pure reducer, which is exactly why it is testable without a
 * camera. Everything here runs in milliseconds.
 */

import { describe, expect, it } from 'vitest';

import {
  CONFIDENCE_BAND_LABEL,
  DEFAULT_DECISION_CONFIG,
  PHRASE_BOARD_SUGGESTION_THRESHOLD,
  REJECTION_HINT,
  STRICT_DECISION_CONFIG,
  confidenceBand,
  createDecisionState,
  decide,
  releaseLatchIfReleased,
  shouldSuggestPhraseBoard,
  type DecisionConfig,
  type DecisionState,
} from '@/lib/vision/decision';
import type { RejectionReason } from '@/lib/types';

const VOCABULARY = ['PAIN', 'WATER', 'TOILET', 'OTHER'];

/** Feed a sequence of frames through the reducer, returning every result. */
function run(
  frames: Array<{
    probabilities: number[];
    handCount?: number;
    bestHandScore?: number;
  }>,
  options: { config?: DecisionConfig; negativeClass?: string | null; state?: DecisionState } = {},
) {
  const config = options.config ?? DEFAULT_DECISION_CONFIG;
  const negativeClass = options.negativeClass === undefined ? 'OTHER' : options.negativeClass;
  let state = options.state ?? createDecisionState();
  const results = frames.map((frame) => {
    const result = decide({
      state,
      probabilities: frame.probabilities,
      vocabulary: VOCABULARY,
      handCount: frame.handCount ?? 2,
      bestHandScore: frame.bestHandScore ?? 0.95,
      config,
      negativeClass,
    });
    state = result.state;
    return result;
  });
  return { results, state };
}

/** `[PAIN, WATER, TOILET, OTHER]` with PAIN at `top`. */
function painHeavy(top: number): number[] {
  const rest = (1 - top) / 3;
  return [top, rest, rest, rest];
}

describe('no-hands and low-trust tracking', () => {
  it('rejects with no_hands and never emits when no hand is detected', () => {
    const { results } = run([{ probabilities: painHeavy(0.99), handCount: 0 }]);
    const first = results[0];
    expect(first?.prediction.accepted).toBe(false);
    expect(first?.prediction.reason).toBe('no_hands');
    expect(first?.prediction.label).toBe('Not recognised');
    expect(first?.emitted).toBe(false);
  });

  it('rejects when MediaPipe is not confident the shape is a hand', () => {
    const { results } = run([{ probabilities: painHeavy(0.99), bestHandScore: 0.2 }]);
    expect(results[0]?.prediction.reason).toBe('below_min_hand_confidence');
  });

  it('accepts a low hand score only when the score is exactly zero (unknown, not bad)', () => {
    // 0 means "the landmarker did not report a score", which must not be treated as a
    // confident zero. The check is `bestHandScore > 0 && < minHandScore` on purpose.
    const { results } = run([
      { probabilities: painHeavy(0.95), bestHandScore: 0 },
      { probabilities: painHeavy(0.95), bestHandScore: 0 },
      { probabilities: painHeavy(0.95), bestHandScore: 0 },
    ]);
    expect(results[2]?.prediction.accepted).toBe(true);
  });
});

describe('no model output', () => {
  it('rejects with unsupported_model when there are no probabilities', () => {
    const { results } = run([{ probabilities: [] }]);
    expect(results[0]?.prediction.reason).toBe('unsupported_model');
  });

  it('rejects with unsupported_model when the vocabulary is empty', () => {
    const result = decide({
      state: createDecisionState(),
      probabilities: [0.9, 0.1],
      vocabulary: [],
      handCount: 2,
      bestHandScore: 0.9,
      config: DEFAULT_DECISION_CONFIG,
    });
    expect(result.prediction.reason).toBe('unsupported_model');
  });

  it('ignores non-finite probabilities rather than letting NaN win the argmax', () => {
    const result = decide({
      state: createDecisionState(),
      probabilities: [Number.NaN, 0.1, 0.05, 0.05],
      vocabulary: VOCABULARY,
      handCount: 2,
      bestHandScore: 0.9,
      config: DEFAULT_DECISION_CONFIG,
    });
    expect(result.prediction.accepted).toBe(false);
    // The NaN entry is dropped, so the best remaining label is WATER at 0.1 — which is
    // below the confidence threshold and must be rejected.
    expect(result.prediction.reason).toBe('low_confidence');
  });
});

describe('confidence threshold', () => {
  it('rejects below the threshold', () => {
    const { results } = run([{ probabilities: painHeavy(0.69) }]);
    expect(results[0]?.prediction.reason).toBe('low_confidence');
  });

  it('accepts above the threshold once the votes are in', () => {
    const frames = Array.from({ length: DEFAULT_DECISION_CONFIG.requiredVotes }, () => ({
      probabilities: painHeavy(0.71),
    }));
    const { results } = run(frames);
    expect(results.at(-1)?.prediction.accepted).toBe(true);
    expect(results.at(-1)?.prediction.label).toBe('PAIN');
  });

  it('reports the top three alternatives for the correction UI', () => {
    const { results } = run([{ probabilities: [0.5, 0.3, 0.15, 0.05] }]);
    expect(results[0]?.prediction.top3.map((entry) => entry.label)).toEqual([
      'PAIN',
      'WATER',
      'TOILET',
    ]);
    expect(results[0]?.prediction.top3[0]?.probability).toBeCloseTo(0.5, 6);
  });
});

describe('margin over the runner-up', () => {
  /**
   * For a *normalised* distribution the margin rule can never fire, and that is worth
   * asserting rather than assuming: if the top class clears the confidence threshold then
   * every other class sums to at most `1 - threshold`, so the gap is at least
   * `2 * threshold - 1` (0.4 at the default 0.7). The margin check is a guard against
   * *unnormalised* scores — independent sigmoid outputs, raw logits from a thin backend, or
   * a distribution over more classes than the card declares — and it is tested that way.
   */
  it('cannot fire for a normalised distribution once the confidence threshold has passed', () => {
    // 0.75 clears the 0.7 threshold, so the runner-up can be at most 0.25 and the gap is at
    // least 0.5 — comfortably over the 0.2 margin.
    const { results } = run([{ probabilities: [0.75, 0.25, 0, 0] }]);
    expect(results[0]?.prediction.reason).not.toBe('low_margin');
    expect(results[0]?.prediction.reason).toBe('unstable');
  });

  it('rejects when two unnormalised scores are nearly tied above the threshold', () => {
    // A backend returning independent sigmoid scores: both classes are confident and the
    // top-1 result is meaningless. This is the case the margin rule exists for.
    const { results } = run([{ probabilities: [0.91, 0.88, 0.02, 0.01] }]);
    expect(results[0]?.prediction.reason).toBe('low_margin');
  });

  it('accepts when the gap clears the margin, even for unnormalised scores', () => {
    const frames = Array.from({ length: DEFAULT_DECISION_CONFIG.requiredVotes }, () => ({
      probabilities: [0.95, 0.1, 0.05, 0.02],
    }));
    const { results } = run(frames);
    expect(results.at(-1)?.prediction.accepted).toBe(true);
    expect(results.at(-1)?.prediction.label).toBe('PAIN');
  });

  it('uses a wider margin in strict mode', () => {
    const probabilities = [0.95, 0.65, 0.02, 0.02];
    const normal = run([{ probabilities }], { config: DEFAULT_DECISION_CONFIG });
    const strict = run([{ probabilities }], { config: STRICT_DECISION_CONFIG });
    // 0.30 gap: over the 0.2 normal margin, under the 0.35 strict margin.
    expect(normal.results[0]?.prediction.reason).not.toBe('low_margin');
    expect(strict.results[0]?.prediction.reason).toBe('low_margin');
  });
});

describe('negative class', () => {
  it('rejects when the model says the input is not one of the supported signs', () => {
    const { results } = run([{ probabilities: [0.1, 0.05, 0.05, 0.8] }]);
    expect(results[0]?.prediction.accepted).toBe(false);
    expect(results[0]?.prediction.reason).toBe('low_confidence');
  });

  it('does not treat the negative class as negative when the model has none', () => {
    const frames = Array.from({ length: DEFAULT_DECISION_CONFIG.requiredVotes }, () => ({
      probabilities: [0.1, 0.05, 0.05, 0.8],
    }));
    const { results } = run(frames, { negativeClass: null });
    expect(results.at(-1)?.prediction.accepted).toBe(true);
    expect(results.at(-1)?.prediction.label).toBe('OTHER');
  });
});

describe('temporal consistency', () => {
  it('does not emit on a single confident frame', () => {
    const { results } = run([{ probabilities: painHeavy(0.95) }]);
    expect(results[0]?.prediction.accepted).toBe(false);
    expect(results[0]?.prediction.reason).toBe('unstable');
  });

  it('emits exactly once when the required votes accumulate', () => {
    const frames = Array.from({ length: DEFAULT_DECISION_CONFIG.requiredVotes }, () => ({
      probabilities: painHeavy(0.95),
    }));
    const { results } = run(frames);
    const emissions = results.filter((result) => result.emitted);
    expect(emissions).toHaveLength(1);
    expect(emissions[0]).toBe(results.at(-1));
  });

  it('does not re-emit while the same sign is held (T-SIGN-04: no flicker)', () => {
    const frames = Array.from({ length: 20 }, () => ({ probabilities: painHeavy(0.95) }));
    const { results } = run(frames);
    expect(results.filter((result) => result.emitted)).toHaveLength(1);
  });

  it('ignores a single dissenting frame in the middle of a hold', () => {
    const frames = [
      { probabilities: painHeavy(0.95) },
      { probabilities: painHeavy(0.95) },
      { probabilities: [0.2, 0.7, 0.05, 0.05] },
      { probabilities: painHeavy(0.95) },
      { probabilities: painHeavy(0.95) },
      { probabilities: painHeavy(0.95) },
    ];
    const { results } = run(frames);
    expect(results.at(-1)?.prediction.label).toBe('PAIN');
    expect(results.at(-1)?.prediction.accepted).toBe(true);
  });

  it('emits the new sign when the user switches signs', () => {
    const pain = Array.from({ length: 5 }, () => ({ probabilities: painHeavy(0.95) }));
    const water = Array.from({ length: 5 }, () => ({ probabilities: [0.02, 0.95, 0.02, 0.01] }));
    const { results } = run([...pain, ...water]);
    const labels = results.filter((result) => result.emitted).map((result) => result.prediction.label);
    expect(labels).toEqual(['PAIN', 'WATER']);
  });

  it('requires more votes in strict mode', () => {
    const frames = Array.from({ length: STRICT_DECISION_CONFIG.requiredVotes - 1 }, () => ({
      probabilities: painHeavy(0.95),
    }));
    const { results } = run(frames, { config: STRICT_DECISION_CONFIG });
    expect(results.every((result) => !result.emitted)).toBe(true);
  });
});

describe('latch release', () => {
  it('releases the latch when the hands leave the frame, so the sign can repeat', () => {
    const frames = Array.from({ length: 5 }, () => ({ probabilities: painHeavy(0.95) }));
    const first = run(frames);
    expect(first.results.filter((result) => result.emitted)).toHaveLength(1);

    const released = releaseLatchIfReleased(first.state, 0);
    expect(released.latchedLabel).toBeNull();

    const second = run(frames, { state: released });
    expect(second.results.filter((result) => result.emitted)).toHaveLength(1);
  });

  it('keeps the latch while a hand is still visible', () => {
    const frames = Array.from({ length: 5 }, () => ({ probabilities: painHeavy(0.95) }));
    const { state } = run(frames);
    expect(state.latchedLabel).toBe('PAIN');
    expect(releaseLatchIfReleased(state, 2).latchedLabel).toBe('PAIN');
  });
});

describe('phrase-board suggestion', () => {
  it('suggests the phrase board after repeated rejections', () => {
    const frames = Array.from({ length: PHRASE_BOARD_SUGGESTION_THRESHOLD }, () => ({
      probabilities: painHeavy(0.3),
    }));
    const { results } = run(frames);
    const previous = results.at(-2)?.state ?? createDecisionState();
    const next = results.at(-1)?.state ?? createDecisionState();
    expect(next.consecutiveRejections).toBeGreaterThanOrEqual(PHRASE_BOARD_SUGGESTION_THRESHOLD);
    expect(shouldSuggestPhraseBoard(previous, next)).toBe(true);
  });

  it('does not suggest the phrase board after an accepted sign', () => {
    const frames = Array.from({ length: DEFAULT_DECISION_CONFIG.requiredVotes }, () => ({
      probabilities: painHeavy(0.95),
    }));
    const { results } = run(frames);
    const next = results.at(-1)?.state ?? createDecisionState();
    expect(next.consecutiveRejections).toBe(0);
    expect(shouldSuggestPhraseBoard(createDecisionState(), next)).toBe(false);
  });

  it('only prompts once per session', () => {
    const previous = { ...createDecisionState(), phraseBoardPrompts: 1, consecutiveRejections: 5 };
    const next = { ...createDecisionState(), consecutiveRejections: 5 };
    expect(shouldSuggestPhraseBoard(previous, next)).toBe(false);
  });
});

describe('confidence bands and hints', () => {
  it('maps probabilities to the documented bands', () => {
    expect(confidenceBand(0.99)).toBe('high');
    expect(confidenceBand(0.85)).toBe('high');
    expect(confidenceBand(0.84)).toBe('medium');
    expect(confidenceBand(0.6)).toBe('medium');
    expect(confidenceBand(0.59)).toBe('low');
    expect(confidenceBand(0)).toBe('low');
  });

  it('has a plain-language hint for every rejection reason', () => {
    const reasons: RejectionReason[] = [
      'low_confidence',
      'low_margin',
      'unstable',
      'no_hands',
      'unsupported_model',
      'below_min_hand_confidence',
    ];
    for (const reason of reasons) {
      expect(REJECTION_HINT[reason]).toBeTruthy();
      expect(REJECTION_HINT[reason].length).toBeGreaterThan(20);
    }
    expect(Object.keys(CONFIDENCE_BAND_LABEL)).toEqual(['high', 'medium', 'low']);
  });

  it('tells the user what to do next for every rejection reason', () => {
    // Every hint must contain an actionable verb, not just describe the failure.
    for (const hint of Object.values(REJECTION_HINT)) {
      expect(hint).toMatch(/bring|improve|hold|face|use|choose|move/i);
    }
  });
});

describe('config sanity', () => {
  it('strict mode is stricter than normal mode on every threshold', () => {
    expect(STRICT_DECISION_CONFIG.confidenceThreshold).toBeGreaterThan(
      DEFAULT_DECISION_CONFIG.confidenceThreshold,
    );
    expect(STRICT_DECISION_CONFIG.marginThreshold).toBeGreaterThan(
      DEFAULT_DECISION_CONFIG.marginThreshold,
    );
    expect(STRICT_DECISION_CONFIG.minHandScore).toBeGreaterThanOrEqual(
      DEFAULT_DECISION_CONFIG.minHandScore,
    );
    expect(STRICT_DECISION_CONFIG.requiredVotes).toBeGreaterThanOrEqual(
      DEFAULT_DECISION_CONFIG.requiredVotes,
    );
  });

  it('required votes never exceed the window size', () => {
    expect(DEFAULT_DECISION_CONFIG.requiredVotes).toBeLessThanOrEqual(DEFAULT_DECISION_CONFIG.windowSize);
    expect(STRICT_DECISION_CONFIG.requiredVotes).toBeLessThanOrEqual(STRICT_DECISION_CONFIG.windowSize);
  });

  it('the rolling window never grows past the configured size', () => {
    const frames = Array.from({ length: 30 }, () => ({ probabilities: painHeavy(0.95) }));
    const { state } = run(frames);
    expect(state.window.length).toBeLessThanOrEqual(DEFAULT_DECISION_CONFIG.windowSize);
  });
});
