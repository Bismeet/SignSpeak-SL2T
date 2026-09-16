/**
 * Optional inference-backend client tests.
 *
 * The backend is an optional extra, and the contract is documented in
 * `docs/technical-architecture.md` §8. What matters for safety is the *shape* of what it
 * accepts: a response that does not match the contract must be rejected, not coerced into
 * a prediction. A malformed response silently becoming "PAIN" is exactly the failure this
 * file exists to prevent.
 *
 * The client also sends feature vectors only — never frames. That is asserted from the
 * source, because it is a privacy promise rather than a behaviour.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InferenceBackendClient, backendResponseToProbabilities, parsePredictionPayload } from '@/lib/model/backend';
import { FEATURE_VECTOR_LENGTH, type ModelCard } from '@/lib/types';

const VOCABULARY = ['PAIN', 'WATER', 'TOILET', 'OTHER'];

function card(overrides: Partial<ModelCard> = {}): ModelCard {
  return {
    schemaVersion: 1,
    modelVersion: 'sign-clf-v1',
    trainedOn: '2026-01-01',
    algorithm: 'random_forest',
    featureVersion: 'ss-features-v1',
    inputDim: FEATURE_VECTOR_LENGTH,
    vocabulary: VOCABULARY,
    labels: {},
    negativeClass: 'OTHER',
    trainingSource: 'collected_consented_dataset',
    notForRealUse: false,
    dataset: {
      name: 'x',
      version: '1',
      signerCount: 8,
      sampleCount: 100,
      perClassCounts: {},
      manifestHash: '',
    },
    metrics: null,
    decision: {
      confidenceThreshold: 0.7,
      marginThreshold: 0.2,
      minHandScore: 0.5,
      smoothing: { windowSize: 5, requiredVotes: 3 },
    },
    limitations: [],
    ...overrides,
  };
}

/* ---------------------------------------------------------------------------------------
 * Response parsing
 * ---------------------------------------------------------------------------------------- */

describe('backendResponseToProbabilities', () => {
  it('accepts a full distribution aligned to the vocabulary', () => {
    const result = backendResponseToProbabilities({ probabilities: [0.7, 0.1, 0.1, 0.1] }, VOCABULARY);
    expect(result).toEqual([0.7, 0.1, 0.1, 0.1]);
  });

  it('rejects a distribution of the wrong length', () => {
    expect(backendResponseToProbabilities({ probabilities: [0.7, 0.3] }, VOCABULARY)).toBeNull();
  });

  it('rejects a distribution containing non-finite values', () => {
    expect(
      backendResponseToProbabilities({ probabilities: [0.7, Number.NaN, 0.1, 0.1] }, VOCABULARY),
    ).toBeNull();
  });

  it('zeroes non-numeric entries rather than passing them through', () => {
    const result = backendResponseToProbabilities({ probabilities: [0.7, 'high', 0.1, 0.1] }, VOCABULARY);
    expect(result).toEqual([0.7, 0, 0.1, 0.1]);
  });

  it('expands a top3 response into a full distribution', () => {
    const result = backendResponseToProbabilities(
      { top3: [{ label: 'WATER', probability: 0.8 }, { label: 'PAIN', probability: 0.15 }] },
      VOCABULARY,
    );
    expect(result).toEqual([0.15, 0.8, 0, 0]);
  });

  it('ignores top3 entries whose label is not in the vocabulary', () => {
    const result = backendResponseToProbabilities(
      { top3: [{ label: 'HAPPY', probability: 0.9 }, { label: 'PAIN', probability: 0.1 }] },
      VOCABULARY,
    );
    expect(result).toEqual([0.1, 0, 0, 0]);
  });

  it('returns null when a top3 response contains nothing usable', () => {
    expect(backendResponseToProbabilities({ top3: [{ label: 'HAPPY', probability: 0.9 }] }, VOCABULARY)).toBeNull();
  });

  it('accepts a single-label response', () => {
    const result = backendResponseToProbabilities({ label: 'TOILET', probability: 0.95 }, VOCABULARY);
    expect(result).toEqual([0, 0, 0.95, 0]);
  });

  it('rejects a single-label response with an unknown label', () => {
    expect(backendResponseToProbabilities({ label: 'HAPPY', probability: 0.9 }, VOCABULARY)).toBeNull();
  });

  it('rejects anything that is not an object', () => {
    for (const input of [null, 'nope', 42, []]) {
      expect(backendResponseToProbabilities(input, VOCABULARY)).toBeNull();
    }
  });

  it('prefers the full distribution when both shapes are present', () => {
    const result = backendResponseToProbabilities(
      { probabilities: [0.4, 0.3, 0.2, 0.1], top3: [{ label: 'PAIN', probability: 0.99 }] },
      VOCABULARY,
    );
    expect(result).toEqual([0.4, 0.3, 0.2, 0.1]);
  });
});

describe('parsePredictionPayload', () => {
  it('parses a complete prediction', () => {
    const result = parsePredictionPayload({
      label: 'PAIN',
      probability: 0.91,
      top3: [{ label: 'PAIN', probability: 0.91 }],
      accepted: true,
    });
    expect(result?.label).toBe('PAIN');
    expect(result?.accepted).toBe(true);
    expect(result?.top3).toHaveLength(1);
  });

  it('does not treat a missing accepted flag as acceptance', () => {
    expect(parsePredictionPayload({ label: 'PAIN', probability: 0.99 })?.accepted).toBe(false);
  });

  it('rejects a payload with no label', () => {
    expect(parsePredictionPayload({ probability: 0.9 })).toBeNull();
    expect(parsePredictionPayload(null)).toBeNull();
  });

  it('keeps a known rejection reason', () => {
    const result = parsePredictionPayload({ label: 'Not recognised', accepted: false, reason: 'low_margin' });
    expect(result?.reason).toBe('low_margin');
  });
});

/* ---------------------------------------------------------------------------------------
 * Client behaviour
 * ---------------------------------------------------------------------------------------- */

class FakeSocket {
  static instances: FakeSocket[] = [];

  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = FakeSocket.CONNECTING;
  sent: string[] = [];
  closed = false;

  private listeners = new Map<string, Array<(event: unknown) => void>>();

  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }

  addEventListener(name: string, handler: (event: unknown) => void): void {
    const list = this.listeners.get(name) ?? [];
    list.push(handler);
    this.listeners.set(name, list);
  }

  removeEventListener(name: string, handler: (event: unknown) => void): void {
    const list = this.listeners.get(name) ?? [];
    this.listeners.set(
      name,
      list.filter((entry) => entry !== handler),
    );
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = FakeSocket.CLOSED;
  }

  emit(name: string, event: unknown = {}): void {
    for (const handler of this.listeners.get(name) ?? []) handler(event);
  }

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.emit('open');
  }
}

function installFakeWebSocket(): void {
  FakeSocket.instances = [];
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = Object.assign(
    function WebSocketShim(this: unknown, url: string) {
      return new FakeSocket(url);
    },
    {
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3,
    },
  );
}

beforeEach(() => {
  installFakeWebSocket();
});

describe('InferenceBackendClient', () => {
  it('refuses to connect when no URL is configured', async () => {
    const client = new InferenceBackendClient('', card());
    const result = await client.connect();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/no backend URL/i);
  });

  it('connects and reports success', async () => {
    const client = new InferenceBackendClient('ws://localhost:8000/infer', card());
    const pending = client.connect();
    FakeSocket.instances[0]?.open();
    await expect(pending).resolves.toEqual({ ok: true });
    client.dispose();
  });

  it('reports a failed connection rather than throwing', async () => {
    const client = new InferenceBackendClient('ws://localhost:8000/infer', card());
    const pending = client.connect();
    FakeSocket.instances[0]?.emit('error');
    const result = await pending;
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('connection failed');
  });

  it('sends only the feature vector and the model version', async () => {
    const client = new InferenceBackendClient('ws://localhost:8000/infer', card());
    const connected = client.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    await connected;

    const features = new Float32Array(FEATURE_VECTOR_LENGTH);
    features[0] = 1;
    features[158] = 1;
    const pending = client.predict(features);

    expect(socket?.sent).toHaveLength(1);
    const payload = JSON.parse(socket?.sent[0] ?? '{}') as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['features', 'model_version']);
    expect(payload.model_version).toBe('sign-clf-v1');
    expect((payload.features as number[]).length).toBe(FEATURE_VECTOR_LENGTH);

    socket?.emit('message', { data: JSON.stringify({ probabilities: [0.8, 0.1, 0.05, 0.05] }) });
    await expect(pending).resolves.toEqual([0.8, 0.1, 0.05, 0.05]);
    client.dispose();
  });

  it('rejects a feature vector of the wrong length', async () => {
    const client = new InferenceBackendClient('ws://localhost:8000/infer', card());
    const connected = client.connect();
    FakeSocket.instances[0]?.open();
    await connected;

    await expect(client.predict(new Float32Array(10))).rejects.toThrow(/does not match the contract/);
    client.dispose();
  });

  it('refuses to predict before connecting', async () => {
    const client = new InferenceBackendClient('ws://localhost:8000/infer', card());
    await expect(client.predict(new Float32Array(FEATURE_VECTOR_LENGTH))).rejects.toThrow(/not connected/);
  });

  it('rejects a response that is not JSON', async () => {
    const client = new InferenceBackendClient('ws://localhost:8000/infer', card());
    const connected = client.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    await connected;

    const pending = client.predict(new Float32Array(FEATURE_VECTOR_LENGTH));
    socket?.emit('message', { data: 'not json at all' });
    await expect(pending).rejects.toThrow(/not JSON/);
    client.dispose();
  });

  it('rejects a response that does not match the contract', async () => {
    const client = new InferenceBackendClient('ws://localhost:8000/infer', card());
    const connected = client.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    await connected;

    const pending = client.predict(new Float32Array(FEATURE_VECTOR_LENGTH));
    socket?.emit('message', { data: JSON.stringify({ hello: 'world' }) });
    await expect(pending).rejects.toThrow(/expected contract/);
    client.dispose();
  });

  it('fails the in-flight request when the socket closes', async () => {
    const client = new InferenceBackendClient('ws://localhost:8000/infer', card());
    const connected = client.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    await connected;

    const pending = client.predict(new Float32Array(FEATURE_VECTOR_LENGTH));
    socket?.emit('close');
    await expect(pending).rejects.toThrow(/connection closed/);
    client.dispose();
  });

  it('drops a stale frame rather than queueing latency', async () => {
    const client = new InferenceBackendClient('ws://localhost:8000/infer', card());
    const connected = client.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    await connected;

    const first = client.predict(new Float32Array(FEATURE_VECTOR_LENGTH));
    const second = client.predict(new Float32Array(FEATURE_VECTOR_LENGTH));

    await expect(first).rejects.toThrow(/superseded/);
    socket?.emit('message', { data: JSON.stringify({ probabilities: [0.8, 0.1, 0.05, 0.05] }) });
    await expect(second).resolves.toEqual([0.8, 0.1, 0.05, 0.05]);
    client.dispose();
  });

  it('times out a request the server never answers', async () => {
    vi.useFakeTimers();
    try {
      const client = new InferenceBackendClient('ws://localhost:8000/infer', card());
      const connected = client.connect();
      FakeSocket.instances[0]?.open();
      await vi.advanceTimersByTimeAsync(0);
      await connected;

      const pending = client.predict(new Float32Array(FEATURE_VECTOR_LENGTH));
      const assertion = expect(pending).rejects.toThrow(/did not answer in time/);
      await vi.advanceTimersByTimeAsync(2000);
      await assertion;
      client.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes the socket on dispose', async () => {
    const client = new InferenceBackendClient('ws://localhost:8000/infer', card());
    const connected = client.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    await connected;

    client.dispose();
    expect(socket?.closed).toBe(true);
  });

  it('is safe to dispose twice', () => {
    const client = new InferenceBackendClient('ws://localhost:8000/infer', card());
    expect(() => {
      client.dispose();
      client.dispose();
    }).not.toThrow();
  });
});

describe('privacy promise', () => {
  it('sends no frames, images, audio or conversation text', () => {
    const source = readFileSync(resolve(__dirname, '..', 'lib', 'model', 'backend.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    // The only thing ever put on the wire is `features` and `model_version`.
    expect(code).not.toMatch(/canvas|ImageData|Blob|MediaRecorder|toDataURL/);
    expect(code).not.toMatch(/\btranscript\b|\bmessage\.text\b/);
  });
});
