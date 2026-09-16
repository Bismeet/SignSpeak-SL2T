'use client';

/**
 * React binding for speech recognition.
 *
 * Owns the `SpeechRecognizer` lifecycle, maps errors to user-facing copy, and reports the
 * listening state to the header microphone pill.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { detectAsrCapabilities } from '@/lib/speech/capabilities';
import { describeAsrError, SpeechRecognizer } from '@/lib/speech/asr';
import { useDeviceStatus } from '@/lib/state/device-status';
import type { AsrCapabilities, AsrError } from '@/lib/types';

export interface UseAsrResult {
  capabilities: AsrCapabilities;
  listening: boolean;
  /** Partial text, rendered muted. */
  interim: string;
  /** Final text, editable by the user. */
  transcript: string;
  setTranscript: (value: string) => void;
  error: AsrError | null;
  start: () => void;
  stop: () => void;
  /** Clears transcript and error. */
  reset: () => void;
  language: string;
  setLanguage: (language: string) => void;
  /**
   * True when the current draft came from the microphone and the user has not typed over
   * it. Used only to label the message honestly in the conversation feed.
   */
  lastInputWasSpeech: boolean;
}

export interface UseAsrOptions {
  language: string;
  onLanguageChange: (language: string) => void;
  /** Called with the final transcript so the caller can update its own draft state. */
  onFinal?: (text: string) => void;
}

export function useAsr({ language, onLanguageChange, onFinal }: UseAsrOptions): UseAsrResult {
  const capabilities = useMemo(() => detectAsrCapabilities(), []);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [transcript, setTranscriptState] = useState('');
  const [error, setError] = useState<AsrError | null>(null);
  const [lastInputWasSpeech, setLastInputWasSpeech] = useState(false);
  const { setMic } = useDeviceStatus();
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  /** Typing over a transcript means the message is no longer purely speech-derived. */
  const setTranscript = useCallback((value: string) => {
    setTranscriptState(value);
    setLastInputWasSpeech(false);
  }, []);

  const recognizer = useMemo(
    () =>
      new SpeechRecognizer({
        lang: language,
        callbacks: {
          onStart: () => {
            setListening(true);
            setError(null);
          },
          onInterim: (text) => setInterim(text),
          onFinal: (text) => {
            setInterim('');
            setTranscriptState((previous) => (previous ? `${previous} ${text}` : text));
            setLastInputWasSpeech(true);
            onFinalRef.current?.(text);
          },
          onError: (asrError) => {
            setError(asrError);
            setListening(false);
          },
          onEnd: () => {
            setListening(false);
            setInterim('');
          },
        },
      }),
    // Recreate when the language changes so the recogniser uses the new locale.
    [language],
  );

  useEffect(() => {
    setMic(listening ? 'listening' : error ? (error.code === 'not-allowed' ? 'denied' : 'error') : 'idle');
  }, [listening, error, setMic]);

  useEffect(() => {
    if (capabilities.support === 'unsupported') setMic('unsupported');
  }, [capabilities.support, setMic]);

  useEffect(() => {
    return () => recognizer.abort();
  }, [recognizer]);

  const start = useCallback(() => {
    setError(null);
    const result = recognizer.start();
    if (!result.ok) {
      setError(result.error);
      setListening(false);
    }
  }, [recognizer]);

  const stop = useCallback(() => {
    recognizer.stop();
    setListening(false);
  }, [recognizer]);

  const reset = useCallback(() => {
    setTranscriptState('');
    setInterim('');
    setError(null);
    setLastInputWasSpeech(false);
  }, []);

  return {
    capabilities,
    listening,
    interim,
    transcript,
    setTranscript,
    error,
    start,
    stop,
    reset,
    language,
    setLanguage: onLanguageChange,
    lastInputWasSpeech,
  };
}

export { describeAsrError };
