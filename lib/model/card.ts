/**
 * Model card loading and validation.
 *
 * The browser refuses to run a model whose card is missing, malformed, or declares a
 * feature version it does not understand. Failing closed is the honest behaviour: a
 * silently mismatched feature layout would produce confident nonsense.
 */

import { FEATURE_VECTOR_LENGTH, FEATURE_VERSION, type ModelCard } from '@/lib/types';

export type ModelCardLoadResult =
  | { ok: true; card: ModelCard }
  | { ok: false; kind: 'missing' | 'invalid'; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Validate and normalise a parsed `model-card.json`. */
export function parseModelCard(input: unknown): ModelCardLoadResult {
  if (!isRecord(input)) {
    return { ok: false, kind: 'invalid', reason: 'model-card.json is not a JSON object.' };
  }

  const vocabulary = Array.isArray(input.vocabulary)
    ? input.vocabulary.filter((entry): entry is string => typeof entry === 'string')
    : [];

  if (vocabulary.length === 0) {
    return {
      ok: false,
      kind: 'invalid',
      reason: 'model-card.json lists no vocabulary, so no prediction could be labelled.',
    };
  }

  const inputDim = asNumber(input.inputDim, FEATURE_VECTOR_LENGTH);
  const featureVersion = asString(input.featureVersion);

  if (inputDim !== FEATURE_VECTOR_LENGTH) {
    return {
      ok: false,
      kind: 'invalid',
      reason: `Model expects ${inputDim} features but this build produces ${FEATURE_VECTOR_LENGTH}.`,
    };
  }

  if (featureVersion !== FEATURE_VERSION) {
    return {
      ok: false,
      kind: 'invalid',
      reason: `Model was trained with feature version "${featureVersion}" but this build uses "${FEATURE_VERSION}".`,
    };
  }

  const dataset = isRecord(input.dataset) ? input.dataset : {};
  const decision = isRecord(input.decision) ? input.decision : {};
  const smoothing = isRecord(decision.smoothing) ? decision.smoothing : {};
  const metrics = isRecord(input.metrics) ? (input.metrics as unknown as ModelCard['metrics']) : null;

  const labels: Record<string, string> = {};
  if (isRecord(input.labels)) {
    for (const [key, value] of Object.entries(input.labels)) {
      if (typeof value === 'string') labels[key] = value;
    }
  }
  for (const gloss of vocabulary) {
    if (!labels[gloss]) labels[gloss] = gloss;
  }

  const trainingSource = asString(input.trainingSource, 'none');
  const normalisedTrainingSource: ModelCard['trainingSource'] =
    trainingSource === 'collected_consented_dataset' || trainingSource === 'synthetic_smoke_test'
      ? trainingSource
      : 'none';

  const card: ModelCard = {
    schemaVersion: 1,
    modelVersion: asString(input.modelVersion, 'unknown'),
    trainedOn: asString(input.trainedOn, ''),
    algorithm: asString(input.algorithm, 'unknown'),
    featureVersion,
    inputDim,
    vocabulary,
    labels,
    negativeClass: typeof input.negativeClass === 'string' ? input.negativeClass : null,
    trainingSource: normalisedTrainingSource,
    // Fail safe: only an explicit `false` counts as "real". Anything missing, of an
    // unexpected type, or from an unrecognised source is treated as not-for-real-use.
    notForRealUse:
      input.notForRealUse === false && normalisedTrainingSource === 'collected_consented_dataset'
        ? false
        : true,
    dataset: {
      name: asString(dataset.name, 'unknown'),
      version: asString(dataset.version, 'unknown'),
      signerCount: asNumber(dataset.signerCount, 0),
      sampleCount: asNumber(dataset.sampleCount, 0),
      perClassCounts: isRecord(dataset.perClassCounts)
        ? (dataset.perClassCounts as Record<string, number>)
        : {},
      manifestHash: asString(dataset.manifestHash, ''),
    },
    metrics,
    decision: {
      confidenceThreshold: asNumber(decision.confidenceThreshold, 0.7),
      marginThreshold: asNumber(decision.marginThreshold, 0.2),
      minHandScore: asNumber(decision.minHandScore, 0.5),
      smoothing: {
        windowSize: Math.max(1, asNumber(smoothing.windowSize, 5)),
        requiredVotes: Math.max(1, asNumber(smoothing.requiredVotes, 3)),
      },
    },
    limitations: Array.isArray(input.limitations)
      ? input.limitations.filter((entry): entry is string => typeof entry === 'string')
      : [],
    ...(typeof input.disclaimer === 'string' ? { disclaimer: input.disclaimer } : {}),
  };

  if (card.decision.smoothing.requiredVotes > card.decision.smoothing.windowSize) {
    card.decision.smoothing.requiredVotes = card.decision.smoothing.windowSize;
  }

  return { ok: true, card };
}

/** Fetch and validate the model card from the given URL. */
export async function loadModelCard(url: string, signal?: AbortSignal): Promise<ModelCardLoadResult> {
  let response: Response;
  try {
    response = await fetch(url, { signal, cache: 'no-cache' });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    return {
      ok: false,
      kind: 'missing',
      reason: `Could not reach ${url}.`,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: 'missing',
      reason:
        response.status === 404
          ? `${url} was not found on this server.`
          : `${url} returned HTTP ${response.status}.`,
    };
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return { ok: false, kind: 'invalid', reason: `${url} is not valid JSON.` };
  }

  return parseModelCard(parsed);
}

/**
 * The human-readable "why sign recognition is unavailable" copy, derived from the
 * failure kind so every message tells the user what to do next.
 */
export function modelUnavailableCopy(kind: 'missing' | 'invalid' | 'error', reason: string): {
  title: string;
  explanation: string;
  remedy: string;
} {
  if (kind === 'invalid') {
    return {
      title: 'Sign recognition is switched off',
      explanation: reason,
      remedy:
        'The model and this build of the app disagree about the feature format. Everything else — the phrase board, typing, speech and Emergency mode — works normally.',
    };
  }
  if (kind === 'error') {
    return {
      title: 'Sign recognition could not start',
      explanation: reason,
      remedy:
        'Reload the page to try again. The phrase board, typing, speech and Emergency mode work without the camera.',
    };
  }
  return {
    title: 'No sign-recognition model is installed',
    explanation: reason,
    remedy:
      'No trained model ships with this build, because a model can only be trained on consented landmark data collected from ISL signers. Everything else works: the phrase board, typing, speech and Emergency mode. To enable recognition, follow "Training a recognition model" in README.md.',
  };
}
