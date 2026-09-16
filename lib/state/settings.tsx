'use client';

/**
 * Settings store.
 *
 * Persisted to `localStorage` under one key. Only non-personal preferences are stored —
 * never conversation content, never landmarks, never anything derived from the camera or
 * microphone (NFR-01, `docs/privacy-and-safety.md` §3).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_SETTINGS, type AppSettings, type TextScale, type ThemeChoice } from '@/lib/types';
import { config } from '@/lib/config';

export const SETTINGS_STORAGE_KEY = 'signspeak.settings.v1';

/** Multiplier applied to the 18px root font size. */
export const TEXT_SCALE_FACTOR: Record<TextScale, number> = {
  normal: 1,
  large: 1.15,
  xlarge: 1.32,
};

export const TEXT_SCALE_LABEL: Record<TextScale, string> = {
  normal: 'Normal',
  large: 'Large',
  xlarge: 'Extra large',
};

export const THEME_LABEL: Record<ThemeChoice, string> = {
  day: 'Light',
  dark: 'Dark',
  contrast: 'High contrast',
};

function sanitise(input: unknown): AppSettings {
  if (typeof input !== 'object' || input === null) return DEFAULT_SETTINGS;
  const raw = input as Partial<Record<keyof AppSettings, unknown>>;

  const theme: ThemeChoice =
    raw.theme === 'dark' || raw.theme === 'contrast' || raw.theme === 'day'
      ? raw.theme
      : DEFAULT_SETTINGS.theme;
  const textScale: TextScale =
    raw.textScale === 'large' || raw.textScale === 'xlarge' || raw.textScale === 'normal'
      ? raw.textScale
      : DEFAULT_SETTINGS.textScale;

  const number = (value: unknown, fallback: number, min: number, max: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  };

  return {
    theme,
    textScale,
    reduceMotion: raw.reduceMotion === true,
    autoSpeakRecognised: raw.autoSpeakRecognised === true,
    ttsVoiceUri: typeof raw.ttsVoiceUri === 'string' && raw.ttsVoiceUri ? raw.ttsVoiceUri : null,
    ttsRate: number(raw.ttsRate, DEFAULT_SETTINGS.ttsRate, 0.5, 1.6),
    asrLanguage: typeof raw.asrLanguage === 'string' && raw.asrLanguage ? raw.asrLanguage : DEFAULT_SETTINGS.asrLanguage,
    ttsLanguage: typeof raw.ttsLanguage === 'string' && raw.ttsLanguage ? raw.ttsLanguage : DEFAULT_SETTINGS.ttsLanguage,
    confidenceMode: raw.confidenceMode === 'strict' ? 'strict' : 'normal',
    showLandmarkOverlay: raw.showLandmarkOverlay === true,
    showUnverifiedPhrases:
      raw.showUnverifiedPhrases === true ||
      (raw.showUnverifiedPhrases === undefined && config.showUnverifiedByDefault),
    logLandmarksLocally: raw.logLandmarksLocally === true,
    autoClearMinutes: number(raw.autoClearMinutes, DEFAULT_SETTINGS.autoClearMinutes, 0, 120),
    demoReplayLandmarks: raw.demoReplayLandmarks === true,
    useInferenceBackend: raw.useInferenceBackend === true,
  };
}

/** Read persisted settings, or sensible defaults on first run. */
export function readStoredSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) {
      // First run: honour the OS colour-scheme preference rather than forcing light mode.
      const prefersDark =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      const prefersReducedMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      return {
        ...DEFAULT_SETTINGS,
        theme: prefersDark ? 'dark' : 'day',
        reduceMotion: prefersReducedMotion,
      };
    }
    return sanitise(JSON.parse(stored));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface SettingsContextValue {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  patch: (changes: Partial<AppSettings>) => void;
  reset: () => void;
  /** True once the stored values have been read, to avoid a hydration flash. */
  hydrated: boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  // Start from defaults so server and first client render match, then hydrate in an effect.
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSettings(readStoredSettings());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage can be full or blocked (private mode). Preferences simply do not persist.
    }
  }, [settings, hydrated]);

  // Apply theme, text scale and motion preferences to the document.
  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    if (settings.theme === 'day') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    root.style.setProperty('--ss-text-scale', String(TEXT_SCALE_FACTOR[settings.textScale]));
    root.setAttribute('data-reduce-motion', settings.reduceMotion ? 'true' : 'false');
    root.setAttribute('lang', 'en');
  }, [settings.theme, settings.textScale, settings.reduceMotion, hydrated]);

  const update = useCallback<SettingsContextValue['update']>((key, value) => {
    setSettings((previous) => ({ ...previous, [key]: value }));
  }, []);

  const patch = useCallback<SettingsContextValue['patch']>((changes) => {
    setSettings((previous) => ({ ...previous, ...changes }));
  }, []);

  const reset = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS, theme: 'day' });
    try {
      window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
    } catch {
      /* nothing to clear */
    }
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, update, patch, reset, hydrated }),
    [settings, update, patch, reset, hydrated],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used inside <SettingsProvider>.');
  }
  return context;
}
