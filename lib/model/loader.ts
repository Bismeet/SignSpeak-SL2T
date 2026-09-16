/**
 * Classifier runtime.
 *
 * Two interchangeable runtimes behind one interface:
 *   - `onnxruntime-web` runs the exported model fully on-device (default, privacy-first).
 *   - an optional FastAPI backend receives **landmark feature arrays only** over a
 *     WebSocket and returns probabilities (`docs/technical-architecture.md` §8).
 *
 * Raw video frames are never sent anywhere, under either runtime (NFR-01).
 */

import { config, hasInferenceBackend } from '@/lib/config';
import { FEATURE_VECTOR_LENGTH, type ModelCard } from '@/lib/types';
import { InferenceBackendClient } from '@/lib/model/backend';

export interface SignClassifier {
  runtime: 'onnxruntime-web' | 'backend';
  card: ModelCard;
  /** Returns class probabilities aligned to `card.vocabulary`. */
  predict(features: Float32Array): Promise<number[]>;
  dispose(): void;
}

export type ClassifierLoadResult =
  | { ok: true; classifier: SignClassifier }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Softmax, used only when the ONNX graph emits raw scores rather than probabilities. */
function softmax(logits: number[]): number[] {
  if (logits.length === 0) return [];
  let max = -Infinity;
  for (const value of logits) if (value > max) max = value;
  const exps = logits.map((value) => Math.exp(value - max));
  const total = exps.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) {
    return logits.map(() => 1 / logits.length);
  }
  return exps.map((value) => value / total);
}

function looksLikeProbabilities(values: number[]): boolean {
  if (values.length === 0) return false;
  let sum = 0;
  for (const value of values) {
    if (!Number.isFinite(value) || value < 0 || value > 1) return false;
    sum += value;
  }
  return Math.abs(sum - 1) <= 0.02;
}

/** Flatten whatever shape ONNX returned into a plain number array. */
function flattenOutput(output: unknown): number[] {
  if (!output) return [];
  const data = (output as { data?: unknown }).data;
  if (!data) return [];
  if (ArrayBuffer.isView(data) || Array.isArray(data)) {
    return Array.from(data as ArrayLike<number>, (value) => Number(value));
  }
  return [];
}

/* ------------------------------------------------------------------------------------
 * ONNX Runtime Web
 * ---------------------------------------------------------------------------------- */

async function createOnnxClassifier(card: ModelCard, modelUrl: string): Promise<SignClassifier> {
  const ort = await import('onnxruntime-web');

  // Self-hosted WASM, single-threaded: avoids the cross-origin-isolation headers that
  // multi-threaded ORT requires and that static hosts such as GitLab Pages do not send.
  ort.env.wasm.wasmPaths = config.ortWasmPath;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  ort.env.logLevel = 'error';

  const session = await ort.InferenceSession.create(modelUrl, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });

  const inputName = session.inputNames[0];
  if (!inputName) throw new Error('The exported model exposes no inputs.');

  const outputName = session.outputNames[0];
  if (!outputName) throw new Error('The exported model exposes no outputs.');

  let disposed = false;

  return {
    runtime: 'onnxruntime-web',
    card,
    async predict(features: Float32Array): Promise<number[]> {
      if (disposed) throw new Error('Classifier has been disposed.');
      if (features.length !== FEATURE_VECTOR_LENGTH) {
        throw new Error(
          `Feature vector length ${features.length} does not match the contract (${FEATURE_VECTOR_LENGTH}).`,
        );
      }
      // Copy: ORT takes ownership of the buffer for the duration of the run.
      const input = new ort.Tensor('float32', Float32Array.from(features), [1, FEATURE_VECTOR_LENGTH]);
      const results = await session.run({ [inputName]: input });
      const raw = flattenOutput(results[outputName]);
      if (raw.length === 0) throw new Error('The model returned no scores.');

      if (raw.length === card.vocabulary.length && looksLikeProbabilities(raw)) return raw;
      if (raw.length === card.vocabulary.length) return softmax(raw);
      // Some exports emit [1, C, 1] or similar; take the first C values.
      const truncated = raw.slice(0, card.vocabulary.length);
      return looksLikeProbabilities(truncated) ? truncated : softmax(truncated);
    },
    dispose() {
      disposed = true;
      try {
        void session.release();
      } catch {
        /* already released */
      }
    },
  };
}

/* ------------------------------------------------------------------------------------
 * Public entry point
 * ---------------------------------------------------------------------------------- */

export interface LoadClassifierOptions {
  card: ModelCard;
  /** Overrides `config.modelUrl`. */
  modelUrl?: string;
  /** Force the optional backend even when the setting is off (used by tests). */
  preferBackend?: boolean;
  onNotice?: (notice: string) => void;
}

/**
 * Load the classifier.
 *
 * If a backend is configured *and* requested, it is tried first; on any failure we fall
 * back to on-device inference and tell the caller why (docs/technical-architecture.md §6,
 * "Backend unreachable -> auto-switch to browser inference with notice").
 */
export async function loadClassifier(
  options: LoadClassifierOptions,
): Promise<ClassifierLoadResult> {
  const { card, modelUrl = config.modelUrl, preferBackend = false, onNotice } = options;

  if (preferBackend && hasInferenceBackend()) {
    const client = new InferenceBackendClient(config.inferenceBackendUrl, card);
    const connected = await client.connect();
    if (connected.ok) {
      return {
        ok: true,
        classifier: {
          runtime: 'backend',
          card,
          predict: (features) => client.predict(features),
          dispose: () => client.dispose(),
        },
      };
    }
    onNotice?.(
      `The optional inference server is unreachable (${connected.reason}). Using on-device recognition instead.`,
    );
    client.dispose();
  } else if (preferBackend && !hasInferenceBackend()) {
    onNotice?.(
      'No inference server is configured, so recognition is running on this device. Landmark data is not sent anywhere.',
    );
  }

  try {
    const classifier = await createOnnxClassifier(card, modelUrl);
    return { ok: true, classifier };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, reason };
  }
}

export { isRecord };
