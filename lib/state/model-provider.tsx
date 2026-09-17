'use client';

/**
 * Model provider.
 *
 * Loads the model card eagerly (a few kilobytes) so every screen can state honestly
 * whether sign recognition is available, and defers the actual ONNX session until the
 * user first opens the camera — a multi-megabyte download nobody should pay for if they
 * only want the phrase board.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { config } from '@/lib/config';
import { loadModelCard, modelUnavailableCopy, notForRealUseCopy } from '@/lib/model/card';
import { loadClassifier, type SignClassifier } from '@/lib/model/loader';
import { checkModelVocabulary } from '@/lib/signs/vocabulary';
import { useSettings } from '@/lib/state/settings';
import type { ModelAvailability, ModelCard } from '@/lib/types';

interface ModelContextValue {
  availability: ModelAvailability;
  /** Loads (once) and returns the classifier, or null when unavailable. */
  ensureClassifier: () => Promise<SignClassifier | null>;
  /** Non-blocking message, e.g. "the inference server was unreachable, using on-device". */
  notice: string | null;
  dismissNotice: () => void;
  /** True while the ONNX session is being created. */
  loadingClassifier: boolean;
  classifierError: string | null;
}

const ModelContext = createContext<ModelContextValue | null>(null);

export function ModelProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [availability, setAvailability] = useState<ModelAvailability>({ state: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingClassifier, setLoadingClassifier] = useState(false);
  const [classifierError, setClassifierError] = useState<string | null>(null);
  const classifierRef = useRef<SignClassifier | null>(null);
  const loadingPromiseRef = useRef<Promise<SignClassifier | null> | null>(null);
  const cardRef = useRef<ModelCard | null>(null);
  const useBackendRef = useRef(settings.useInferenceBackend);

  useBackendRef.current = settings.useInferenceBackend;

  // Load and validate the model card once.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      const result = await loadModelCard(config.modelCardUrl, controller.signal);
      if (cancelled) return;

      if (!result.ok) {
        const copy = modelUnavailableCopy(result.kind, result.reason);
        setAvailability(
          result.kind === 'invalid'
            ? { state: 'incompatible', reason: copy.explanation, remedy: copy.remedy }
            : { state: 'missing', reason: copy.explanation, remedy: copy.remedy },
        );
        return;
      }

      // The model's classes must all be known glosses, otherwise the app could emit a
      // word it cannot explain or display (see lib/signs/vocabulary.ts). The declared
      // negative class is excluded: it is not a sign, and its presence is what lets the
      // model refuse an input instead of guessing.
      const vocabularyCheck = checkModelVocabulary(
        result.card.vocabulary,
        result.card.negativeClass,
      );
      if (!vocabularyCheck.ok) {
        setAvailability({
          state: 'incompatible',
          reason: `The model predicts ${vocabularyCheck.unknown.join(', ')}, which are not in the published SignSpeak vocabulary.`,
          remedy:
            'Retrain the model against data/sign-vocabulary.json, or update the vocabulary after ISL expert review. The phrase board, typing and Emergency mode are unaffected.',
        });
        return;
      }

      cardRef.current = result.card;
      setAvailability({ state: 'ready', card: result.card, runtime: 'onnxruntime-web' });
    })().catch((error: unknown) => {
      if (cancelled) return;
      const reason = error instanceof Error ? error.message : String(error);
      setAvailability({
        state: 'error',
        reason,
        remedy: 'Reload the page to try again. Everything except sign recognition still works.',
      });
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const ensureClassifier = useCallback(async (): Promise<SignClassifier | null> => {
    if (classifierRef.current) return classifierRef.current;
    if (loadingPromiseRef.current) return loadingPromiseRef.current;

    const card = cardRef.current;
    if (!card) return null;

    setLoadingClassifier(true);
    setClassifierError(null);

    const promise = (async () => {
      const result = await loadClassifier({
        card,
        preferBackend: useBackendRef.current,
        onNotice: setNotice,
      });

      if (!result.ok) {
        setClassifierError(result.reason);
        setAvailability({
          state: 'error',
          reason: `The classifier could not start: ${result.reason}`,
          remedy:
            'Sign recognition is unavailable, but the phrase board, typing, speech and Emergency mode all work. Reload the page to try again.',
        });
        return null;
      }

      classifierRef.current = result.classifier;
      setAvailability({
        state: 'ready',
        card: result.classifier.card,
        runtime: result.classifier.runtime,
      });
      return result.classifier;
    })();

    loadingPromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      setLoadingClassifier(false);
      loadingPromiseRef.current = null;
    }
  }, []);

  // Dispose the session when the page unloads so the WASM heap is released.
  useEffect(() => {
    return () => {
      classifierRef.current?.dispose();
      classifierRef.current = null;
    };
  }, []);

  const value = useMemo<ModelContextValue>(
    () => ({
      availability,
      ensureClassifier,
      notice,
      dismissNotice: () => setNotice(null),
      loadingClassifier,
      classifierError,
    }),
    [availability, ensureClassifier, notice, loadingClassifier, classifierError],
  );

  return <ModelContext.Provider value={value}>{children}</ModelContext.Provider>;
}

export function useModel(): ModelContextValue {
  const context = useContext(ModelContext);
  if (!context) throw new Error('useModel must be used inside <ModelProvider>.');
  return context;
}

/** One-line summary of recognition availability, for the Home screen status row. */
export function availabilitySummary(availability: ModelAvailability): {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  detail: string;
} {
  switch (availability.state) {
    case 'loading':
      return { label: 'Checking sign recognition…', tone: 'neutral', detail: '' };
    case 'ready': {
      // The reason a model is not for real use differs (synthetic smoke test vs. real but
      // publicly-sourced data), so the explanation comes from one shared helper rather than
      // being hardcoded here.
      if (availability.card.notForRealUse) {
        const copy = notForRealUseCopy(availability.card);
        return { label: copy.title, tone: 'warning', detail: copy.detail };
      }
      return {
        label: `Sign recognition ready · ${availability.card.vocabulary.length} signs`,
        tone: 'success',
        detail: `Model ${availability.card.modelVersion} running ${availability.runtime === 'backend' ? 'on the configured server' : 'on this device'}.`,
      };
    }
    case 'missing':
      return {
        label: 'Sign recognition not installed',
        tone: 'warning',
        detail: 'No trained model is bundled. The phrase board, typing and speech all work.',
      };
    case 'incompatible':
      return { label: 'Sign recognition unavailable', tone: 'danger', detail: availability.reason };
    case 'error':
      return { label: 'Sign recognition failed to start', tone: 'danger', detail: availability.reason };
    default:
      return { label: 'Sign recognition status unknown', tone: 'neutral', detail: '' };
  }
}
