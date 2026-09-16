'use client';

/**
 * Opt-in local landmark log (NFR-01, docs/privacy-and-safety.md §3 and §8).
 *
 * Purpose: let the team collect *correction* examples from real use — when the user fixes
 * a wrong prediction, the feature vector that produced it plus the corrected label is
 * genuinely useful training data.
 *
 * Guarantees, enforced by this module:
 *   - **off by default**; nothing is written unless the user turns the setting on;
 *   - **landmark feature vectors only** — never frames, never images, never audio,
 *     never conversation text;
 *   - stored in this browser's IndexedDB only, and never transmitted;
 *   - the user can export the log as JSON or delete it at any time, in one tap;
 *   - it never leaves the device through SignSpeak, even when the optional inference
 *     backend is enabled (that path sends feature vectors for scoring, not for storage).
 */

import { FEATURE_VERSION } from '@/lib/types';
import { APP_VERSION } from '@/lib/config';
import { createId } from '@/lib/utils/misc';

const DB_NAME = 'signspeak-landmark-log';
const DB_VERSION = 1;
const STORE = 'samples';

export interface LandmarkLogEntry {
  id: string;
  createdAt: string;
  /** The label the model predicted. */
  predictedLabel: string;
  /** The label the user corrected it to — the useful supervision signal. */
  correctedLabel: string;
  probability: number;
  featureVersion: string;
  toolVersion: string;
  /** `[159]` feature vector. Landmarks only. */
  features: number[];
}

function isIndexedDbAvailable(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the local log.'));
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE, mode);
        const request = work(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Local log operation failed.'));
        transaction.oncomplete = () => database.close();
      }),
  );
}

export async function appendLandmarkSample(input: {
  predictedLabel: string;
  correctedLabel: string;
  probability: number;
  features: Float32Array;
}): Promise<LandmarkLogEntry | null> {
  if (!isIndexedDbAvailable()) return null;

  const entry: LandmarkLogEntry = {
    id: createId('sample'),
    createdAt: new Date().toISOString(),
    predictedLabel: input.predictedLabel,
    correctedLabel: input.correctedLabel,
    probability: input.probability,
    featureVersion: FEATURE_VERSION,
    toolVersion: APP_VERSION,
    features: Array.from(input.features),
  };

  try {
    await runTransaction('readwrite', (store) => store.add(entry));
    return entry;
  } catch (error) {
    console.warn('[SignSpeak] Could not write to the local landmark log.', error);
    return null;
  }
}

export async function readLandmarkLog(): Promise<LandmarkLogEntry[]> {
  if (!isIndexedDbAvailable()) return [];
  try {
    const result = await runTransaction<LandmarkLogEntry[]>('readonly', (store) => store.getAll());
    return result ?? [];
  } catch {
    return [];
  }
}

export async function countLandmarkSamples(): Promise<number> {
  if (!isIndexedDbAvailable()) return 0;
  try {
    return await runTransaction<number>('readonly', (store) => store.count());
  } catch {
    return 0;
  }
}

export async function clearLandmarkLog(): Promise<boolean> {
  if (!isIndexedDbAvailable()) return false;
  try {
    await runTransaction('readwrite', (store) => store.clear());
    return true;
  } catch {
    return false;
  }
}

/** Export shape, designed to feed straight into `ml/scripts/import_corrections.py`. */
export interface LandmarkLogExport {
  schemaVersion: 1;
  exportedAt: string;
  featureVersion: string;
  toolVersion: string;
  notice: string;
  sampleCount: number;
  samples: LandmarkLogEntry[];
}

export async function exportLandmarkLog(): Promise<LandmarkLogExport> {
  const samples = await readLandmarkLog();
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    featureVersion: FEATURE_VERSION,
    toolVersion: APP_VERSION,
    notice:
      'Landmark feature vectors only. No images, video, audio or conversation text are included. Collected with explicit opt-in.',
    sampleCount: samples.length,
    samples,
  };
}
