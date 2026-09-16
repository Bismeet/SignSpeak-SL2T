'use client';

/**
 * React binding for text-to-speech.
 *
 * One `Speaker` per app session so that pressing Speak anywhere stops playback started
 * anywhere else — two overlapping voices would be unusable on a ward.
 *
 * FR-SPK-02 is enforced by construction: this hook only speaks when `speak()` is called
 * from a user action. Nothing in the recognition pipeline calls it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadVoices, rankVoicesForLanguage, Speaker } from '@/lib/speech/tts';
import { useSettings } from '@/lib/state/settings';
import type { VoiceOption } from '@/lib/types';

export interface UseSpeakerResult {
  supported: boolean;
  speaking: boolean;
  /** The text currently being spoken, for the "Speaking…" indicator. */
  speakingText: string | null;
  /** Non-fatal notices, e.g. "no hi-IN voice installed". */
  notice: string | null;
  error: string | null;
  speak: (text: string, options?: { language?: string; markMessageId?: string }) => Promise<void>;
  repeat: () => Promise<void>;
  stop: () => void;
  voices: VoiceOption[];
  /** True when the selected TTS language has no matching installed voice. */
  missingVoiceForLanguage: boolean;
  dismissNotice: () => void;
}

export function useSpeaker(): UseSpeakerResult {
  const { settings } = useSettings();
  const [speaking, setSpeaking] = useState(false);
  const [speakingText, setSpeakingText] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<VoiceOption[]>([]);

  const speaker = useMemo(
    () =>
      new Speaker({
        onStart: (text) => {
          setSpeaking(true);
          setSpeakingText(text);
          setError(null);
        },
        onEnd: () => {
          setSpeaking(false);
          setSpeakingText(null);
        },
        onError: (message) => {
          setSpeaking(false);
          setSpeakingText(null);
          setError(message);
        },
      }),
    [],
  );

  const supported = Speaker.isSupported();

  // Voices arrive asynchronously and can change (e.g. a Bluetooth headset connecting).
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;

    const refresh = async () => {
      const available = await loadVoices();
      if (cancelled) return;
      setVoices(rankVoicesForLanguage(available, settings.ttsLanguage));
    };

    void refresh();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.addEventListener('voiceschanged', refresh);
    }
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.removeEventListener('voiceschanged', refresh);
      }
    };
  }, [supported, settings.ttsLanguage]);

  // Stop speech if the user navigates away or the tab is hidden, so audio never
  // continues in the background of a ward.
  useEffect(() => {
    if (!supported) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') speaker.cancel();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      speaker.cancel();
    };
  }, [speaker, supported]);

  const speak = useCallback<UseSpeakerResult['speak']>(
    async (text, options) => {
      const language = options?.language ?? settings.ttsLanguage;
      setNotice(null);
      const result = await speaker.speak({
        text,
        lang: language,
        voiceUri: settings.ttsVoiceUri,
        rate: settings.ttsRate,
      });
      if (result.notice) setNotice(result.notice);
      if (result.error) {
        setError(result.error);
        setSpeaking(false);
        setSpeakingText(null);
      }
    },
    [settings.ttsLanguage, settings.ttsRate, settings.ttsVoiceUri, speaker],
  );

  const repeat = useCallback(async () => {
    const result = await speaker.repeat();
    if (result.notice) setNotice(result.notice);
    if (result.error) setError(result.error);
  }, [speaker]);

  const stop = useCallback(() => {
    speaker.cancel();
    setSpeaking(false);
    setSpeakingText(null);
  }, [speaker]);

  const missingVoiceForLanguage = useMemo(() => {
    if (voices.length === 0) return false;
    return !voices.some((voice) => voice.exactMatch);
  }, [voices]);

  const lastSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    lastSpokenRef.current = speakingText;
  }, [speakingText]);

  return {
    supported,
    speaking,
    speakingText,
    notice,
    error,
    speak,
    repeat,
    stop,
    voices,
    missingVoiceForLanguage,
    dismissNotice: () => setNotice(null),
  };
}
