/**
 * Optional landmark-only inference backend client.
 *
 * Implements the WebSocket contract from `docs/technical-architecture.md` §8:
 *
 *   -> { "features": number[159], "model_version": "sign-clf-v1" }
 *   <- { "label": string, "probability": number, "top3": [{label, probability}], ... }
 *
 * The backend is entirely optional. When it is not configured or not reachable the app
 * uses on-device ONNX inference, so a backend outage is never a functional dead end.
 *
 * Nothing here sends frames, images, audio or conversation text — only the numeric
 * feature vector. The backend is documented as logging no payloads and keeping no state.
 */

import { FEATURE_VECTOR_LENGTH, type ModelCard, type Prediction, type ScoredLabel } from '@/lib/types';

interface PendingRequest {
  resolve: (probabilities: number[]) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT_MS = 1500;
const CONNECT_TIMEOUT_MS = 2500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normaliseScored(value: unknown): ScoredLabel | null {
  if (!isRecord(value)) return null;
  const label = value.label;
  const probability = value.probability;
  if (typeof label !== 'string' || typeof probability !== 'number') return null;
  if (!Number.isFinite(probability)) return null;
  return { label, probability };
}

/**
 * Convert a backend response into the flat probability array the decision layer expects.
 * The backend may answer either with the full distribution or with a top-3 list; both
 * are supported so a thin server implementation is enough.
 */
export function backendResponseToProbabilities(
  payload: unknown,
  vocabulary: string[],
): number[] | null {
  if (!isRecord(payload)) return null;

  const distribution = payload.probabilities;
  if (Array.isArray(distribution) && distribution.length === vocabulary.length) {
    const values = distribution.map((value) => (typeof value === 'number' ? value : 0));
    if (values.every((value) => Number.isFinite(value))) return values;
  }

  const top3 = payload.top3;
  if (Array.isArray(top3) && top3.length > 0) {
    const probabilities = vocabulary.map(() => 0);
    let assigned = false;
    for (const entry of top3) {
      const scored = normaliseScored(entry);
      if (!scored) continue;
      const index = vocabulary.indexOf(scored.label);
      if (index === -1) continue;
      probabilities[index] = scored.probability;
      assigned = true;
    }
    if (assigned) return probabilities;
  }

  const single = normaliseScored(payload);
  if (single) {
    const index = vocabulary.indexOf(single.label);
    if (index === -1) return null;
    const probabilities = vocabulary.map(() => 0);
    probabilities[index] = single.probability;
    return probabilities;
  }

  return null;
}

export class InferenceBackendClient {
  private socket: WebSocket | null = null;
  private pending: PendingRequest | null = null;
  private closed = false;

  constructor(
    private readonly url: string,
    private readonly card: ModelCard,
  ) {}

  /** Open the socket. Resolves with a reason string when it cannot be used. */
  async connect(): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (typeof WebSocket === 'undefined') {
      return { ok: false, reason: 'WebSocket is not available in this browser' };
    }
    if (!this.url) return { ok: false, reason: 'no backend URL is configured' };

    try {
      const socket = new WebSocket(this.url);
      this.socket = socket;

      const opened = await new Promise<{ ok: true } | { ok: false; reason: string }>((resolve) => {
        const timer = setTimeout(
          () => resolve({ ok: false, reason: 'connection timed out' }),
          CONNECT_TIMEOUT_MS,
        );
        socket.addEventListener(
          'open',
          () => {
            clearTimeout(timer);
            resolve({ ok: true });
          },
          { once: true },
        );
        socket.addEventListener(
          'error',
          () => {
            clearTimeout(timer);
            resolve({ ok: false, reason: 'connection failed' });
          },
          { once: true },
        );
      });

      if (!opened.ok) {
        this.dispose();
        return opened;
      }

      socket.addEventListener('message', (event) => this.handleMessage(event.data));
      socket.addEventListener('close', () => this.failPending('connection closed'));
      socket.addEventListener('error', () => this.failPending('connection error'));

      return { ok: true };
    } catch (error) {
      this.dispose();
      return { ok: false, reason: error instanceof Error ? error.message : 'unknown error' };
    }
  }

  private handleMessage(data: unknown): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    clearTimeout(pending.timeout);

    let parsed: unknown;
    try {
      parsed = typeof data === 'string' ? JSON.parse(data) : null;
    } catch {
      pending.reject(new Error('The inference server sent a response that was not JSON.'));
      return;
    }

    const probabilities = backendResponseToProbabilities(parsed, this.card.vocabulary);
    if (!probabilities) {
      pending.reject(new Error('The inference server response did not match the expected contract.'));
      return;
    }
    pending.resolve(probabilities);
  }

  private failPending(reason: string): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    clearTimeout(pending.timeout);
    pending.reject(new Error(reason));
  }

  /** Send one feature vector. Only one request is ever in flight. */
  async predict(features: Float32Array): Promise<number[]> {
    if (this.closed || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('The inference server is not connected.');
    }
    if (features.length !== FEATURE_VECTOR_LENGTH) {
      throw new Error(`Feature vector length ${features.length} does not match the contract.`);
    }
    if (this.pending) {
      // Dropping a stale frame is better than queueing latency we cannot afford.
      this.failPending('superseded by a newer frame');
    }

    return new Promise<number[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending = null;
        reject(new Error('The inference server did not answer in time.'));
      }, REQUEST_TIMEOUT_MS);

      this.pending = { resolve, reject, timeout };
      this.socket?.send(
        JSON.stringify({
          features: Array.from(features),
          model_version: this.card.modelVersion,
        }),
      );
    });
  }

  dispose(): void {
    this.closed = true;
    this.failPending('client disposed');
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    try {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    } catch {
      /* already closed */
    }
  }
}

/** Convert a backend `Prediction` payload into our `Prediction` type (used by tests). */
export function parsePredictionPayload(payload: unknown): Prediction | null {
  if (!isRecord(payload)) return null;
  const label = payload.label;
  if (typeof label !== 'string') return null;
  const probability = typeof payload.probability === 'number' ? payload.probability : 0;
  const top3Raw = Array.isArray(payload.top3) ? payload.top3 : [];
  const top3 = top3Raw.map(normaliseScored).filter((entry): entry is ScoredLabel => entry !== null);
  return {
    label,
    probability,
    top3,
    accepted: payload.accepted === true,
    ...(typeof payload.reason === 'string'
      ? { reason: payload.reason as Prediction['reason'] }
      : {}),
  };
}
