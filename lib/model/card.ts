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
    trainingSource === 'collected_consented_dataset' ||
    trainingSource === 'public_dataset' ||
    trainingSource === 'synthetic_smoke_test'
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

/**
 * The explanation shown wherever a model is flagged `notForRealUse`.
 *
 * Kept in one place because three screens render it — the Home status row, the Limitations
 * screen and Settings — and they must not disagree.
 *
 * The *reason* a model is not for real use differs, and stating the wrong one is itself a
 * false claim about the model. A smoke test has never seen a sign language sign; a model
 * trained on a public research corpus has seen real ISL, but that data was not collected
 * under this project's consent process and no signer here has reviewed it. The earlier copy
 * said "procedurally generated" unconditionally, which would have been untrue of the latter.
 */
export function notForRealUseCopy(card: Pick<ModelCard, 'trainingSource' | 'vocabulary'>): {
  title: string;
  detail: string;
} {
  const signs = card.vocabulary.filter((gloss) => gloss !== 'OTHER').join(', ');

  if (card.trainingSource === 'public_dataset') {
    return {
      title: 'Trained on public research data — not a clinical recogniser',
      detail:
        `This model was trained on real Indian Sign Language recordings from a published ` +
        `research dataset${signs ? `, covering ${signs}` : ''}. That data was not collected ` +
        `under this project's consent process, no qualified ISL signer has reviewed the ` +
        `vocabulary or the predictions, and the evaluation is not signer-independent. Treat ` +
        `its output as a demonstration, never as sign recognition you can rely on.`,
    };
  }

  return {
    title: 'These predictions are not real sign recognition',
    detail:
      'This model was trained on procedurally generated data to verify that the pipeline ' +
      'works end to end. It has never seen a real ISL sign, so it must not be presented as ' +
      'a working recogniser.',
  };
}

/**
 * Labels for the headline metrics, derived from how the model was actually evaluated.
 *
 * The card schema calls the headline number `heldOutSignerMacroF1`, and the UI used to print
 * "Held-out-signer macro F1" and "Signers" unconditionally. Both overstate a model whose
 * split was not signer-independent: `splitKind` records what the split really was, and the
 * card carries `optimistic: true` to say the number should not be trusted as a generalisation
 * estimate. A model evaluated on held-out recording *groups* is not evidence about unseen
 * people, and the screen must not say it is.
 */
export function metricLabels(card: Pick<ModelCard, 'metrics'>): {
  macroF1: string;
  count: string;
  countNote: string;
  caveat: string | null;
} {
  const splitKind = card.metrics?.splitKind ?? null;
  const optimistic = card.metrics?.optimistic ?? false;

  if (splitKind === 'held-out-signer') {
    return {
      macroF1: 'Held-out-signer macro F1',
      count: 'Signers',
      countNote: '',
      caveat: null,
    };
  }

  if (splitKind === 'held-out-group') {
    return {
      macroF1: 'Held-out-group macro F1',
      count: 'Recording groups',
      countNote: 'Groups, not verified signers — the same person may appear in both halves.',
      caveat:
        'This was not a signer-independent evaluation, so the figure is optimistic and says ' +
        'nothing reliable about how the model behaves for someone it has not seen.',
    };
  }

  if (splitKind === 'random-sample') {
    return {
      macroF1: 'Random-split macro F1',
      count: 'Recording groups',
      countNote: '',
      caveat:
        'Frames from the same recording appear in both halves of this split, so the figure ' +
        'is close to meaningless. It is reported for completeness only.',
    };
  }

  return {
    macroF1: optimistic ? 'Held-out macro F1 (optimistic)' : 'Held-out macro F1',
    count: 'Recording groups',
    countNote: '',
    caveat: optimistic
      ? 'The split used for this figure was not signer-independent, so treat it as optimistic.'
      : null,
  };
}
