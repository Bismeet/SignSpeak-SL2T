/**
 * Model card validation tests.
 *
 * The whole point of `parseModelCard` is that it **fails closed**. A model whose feature
 * layout does not match this build must not load, because a silently mismatched feature
 * vector produces confident, plausible, wrong predictions — the single worst failure mode
 * this application can have.
 *
 * The second thing asserted here is the honesty default: `notForRealUse` is only `false`
 * when the card explicitly says so *and* declares a consented collected dataset. Anything
 * missing, mistyped or unrecognised is treated as not-for-real-use.
 */

import { describe, expect, it } from 'vitest';

import { modelUnavailableCopy, parseModelCard } from '@/lib/model/card';
import { FEATURE_VECTOR_LENGTH, FEATURE_VERSION } from '@/lib/types';

function card(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    modelVersion: 'sign-clf-v1',
    trainedOn: '2026-01-01',
    algorithm: 'random_forest',
    featureVersion: FEATURE_VERSION,
    inputDim: FEATURE_VECTOR_LENGTH,
    vocabulary: ['PAIN', 'WATER', 'OTHER'],
    labels: { PAIN: 'Pain', WATER: 'Water' },
    negativeClass: 'OTHER',
    trainingSource: 'collected_consented_dataset',
    notForRealUse: false,
    dataset: {
      name: 'signspeak-collected',
      version: 'ss-features-v1',
      signerCount: 8,
      sampleCount: 2400,
      perClassCounts: { PAIN: 300, WATER: 300, OTHER: 400 },
      manifestHash: 'abc123',
    },
    metrics: {
      heldOutSignerMacroF1: 0.83,
      losoMeanMacroF1: 0.79,
      perClassRecall: { PAIN: 0.81, WATER: 0.77, OTHER: 0.92 },
      falseAcceptRate: 0.06,
      falseRejectRate: 0.14,
      seenSignerAccuracy: 0.88,
      confusionMatrix: [
        [81, 12, 7],
        [10, 77, 13],
        [5, 3, 92],
      ],
      classOrder: ['PAIN', 'WATER', 'OTHER'],
      inferenceLatencyMs: 1.4,
    },
    decision: {
      confidenceThreshold: 0.7,
      marginThreshold: 0.2,
      minHandScore: 0.5,
      smoothing: { windowSize: 5, requiredVotes: 3 },
    },
    limitations: ['Not a medical device.'],
    ...overrides,
  };
}

describe('accepting a well-formed card', () => {
  it('parses a complete card', () => {
    const result = parseModelCard(card());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.modelVersion).toBe('sign-clf-v1');
    expect(result.card.vocabulary).toEqual(['PAIN', 'WATER', 'OTHER']);
    expect(result.card.featureVersion).toBe(FEATURE_VERSION);
    expect(result.card.decision.confidenceThreshold).toBe(0.7);
    expect(result.card.decision.smoothing.requiredVotes).toBe(3);
    expect(result.card.limitations).toEqual(['Not a medical device.']);
  });

  it('fills in a missing label with the gloss rather than leaving a blank button', () => {
    const result = parseModelCard(card({ labels: { PAIN: 'Pain' } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.labels.PAIN).toBe('Pain');
    expect(result.card.labels.WATER).toBe('WATER');
    expect(result.card.labels.OTHER).toBe('OTHER');
  });

  it('survives missing optional sections without throwing', () => {
    const result = parseModelCard({
      vocabulary: ['PAIN', 'WATER'],
      featureVersion: FEATURE_VERSION,
      inputDim: FEATURE_VECTOR_LENGTH,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.algorithm).toBe('unknown');
    expect(result.card.dataset.signerCount).toBe(0);
    expect(result.card.metrics).toBeNull();
    // Defaults must be the conservative ones, not zero.
    expect(result.card.decision.confidenceThreshold).toBe(0.7);
    expect(result.card.decision.smoothing.windowSize).toBe(5);
  });
});

describe('failing closed', () => {
  it('rejects a non-object', () => {
    for (const input of [null, undefined, 42, 'nope', []]) {
      const result = parseModelCard(input);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.kind).toBe('invalid');
    }
  });

  it('rejects an empty vocabulary, because no prediction could be labelled', () => {
    const result = parseModelCard(card({ vocabulary: [] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('no vocabulary');
  });

  it('rejects a mismatched feature vector length', () => {
    const result = parseModelCard(card({ inputDim: 128 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('128');
    expect(result.reason).toContain(String(FEATURE_VECTOR_LENGTH));
  });

  it('rejects a mismatched feature version', () => {
    const result = parseModelCard(card({ featureVersion: 'ss-features-v0' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('ss-features-v0');
    expect(result.reason).toContain(FEATURE_VERSION);
  });

  it('rejects a card with no feature version at all', () => {
    expect(parseModelCard(card({ featureVersion: undefined })).ok).toBe(false);
  });

  it('drops non-string vocabulary entries instead of using them as labels', () => {
    const result = parseModelCard(card({ vocabulary: ['PAIN', 42, null, 'WATER'] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.vocabulary).toEqual(['PAIN', 'WATER']);
  });

  it('rejects a vocabulary that is entirely non-strings', () => {
    expect(parseModelCard(card({ vocabulary: [1, 2, 3] })).ok).toBe(false);
  });
});

describe('notForRealUse is only false on explicit, verifiable evidence', () => {
  const cases: Array<[string, Record<string, unknown>, boolean]> = [
    ['real collected model', { notForRealUse: false, trainingSource: 'collected_consented_dataset' }, false],
    ['smoke-test model', { notForRealUse: true, trainingSource: 'synthetic_smoke_test' }, true],
    [
      'claims real but trained on synthetic data',
      { notForRealUse: false, trainingSource: 'synthetic_smoke_test' },
      true,
    ],
    ['flag missing entirely', { notForRealUse: undefined, trainingSource: 'collected_consented_dataset' }, true],
    ['flag is a truthy non-boolean', { notForRealUse: 'no', trainingSource: 'collected_consented_dataset' }, true],
    ['flag is null', { notForRealUse: null, trainingSource: 'collected_consented_dataset' }, true],
    ['unrecognised training source', { notForRealUse: false, trainingSource: 'mystery' }, true],
    ['no training source at all', { notForRealUse: false, trainingSource: undefined }, true],
  ];

  it.each(cases)('%s -> notForRealUse is %s', (_name, overrides, expected) => {
    const result = parseModelCard(card(overrides));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.notForRealUse).toBe(expected);
  });

  it('normalises an unrecognised training source to "none"', () => {
    const result = parseModelCard(card({ trainingSource: 'mystery' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.trainingSource).toBe('none');
  });
});

describe('decision config hardening', () => {
  it('never lets required votes exceed the window size', () => {
    const result = parseModelCard(
      card({ decision: { smoothing: { windowSize: 3, requiredVotes: 99 } } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.decision.smoothing.requiredVotes).toBe(3);
    expect(result.card.decision.smoothing.windowSize).toBe(3);
  });

  it('coerces a zero or negative window to at least 1', () => {
    const result = parseModelCard(card({ decision: { smoothing: { windowSize: 0, requiredVotes: 0 } } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.decision.smoothing.windowSize).toBeGreaterThanOrEqual(1);
    expect(result.card.decision.smoothing.requiredVotes).toBeGreaterThanOrEqual(1);
  });

  it('ignores non-finite thresholds and falls back to the defaults', () => {
    const result = parseModelCard(card({ decision: { confidenceThreshold: 'high' } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.decision.confidenceThreshold).toBe(0.7);
  });

  it('keeps extra metric keys written by the training pipeline', () => {
    const result = parseModelCard(card({ metrics: { ...(card().metrics as object), macroF1AllClasses: 0.86 } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.card.metrics as Record<string, unknown> | null)?.macroF1AllClasses).toBe(0.86);
  });
});

describe('unavailable copy', () => {
  it('explains a missing model and names the working alternatives', () => {
    const copy = modelUnavailableCopy('missing', 'No model card was found.');
    expect(copy.title).toBeTruthy();
    expect(copy.remedy).toMatch(/phrase board/i);
    expect(copy.remedy).toMatch(/typing/i);
    expect(copy.remedy).toMatch(/emergency/i);
  });

  it('explains an incompatible model without blaming the user', () => {
    const copy = modelUnavailableCopy('invalid', 'Feature version mismatch.');
    expect(copy.explanation).toBe('Feature version mismatch.');
    expect(copy.remedy).toMatch(/phrase board|typing/i);
  });

  it('offers a retry for a load error', () => {
    const copy = modelUnavailableCopy('error', 'Network failed.');
    expect(copy.remedy).toMatch(/reload/i);
  });

  it('never claims recognition works when the model is missing', () => {
    for (const kind of ['missing', 'invalid', 'error'] as const) {
      const copy = modelUnavailableCopy(kind, 'reason');
      expect(copy.explanation.toLowerCase()).not.toMatch(/recognition (is|will be) available/);
    }
  });
});
