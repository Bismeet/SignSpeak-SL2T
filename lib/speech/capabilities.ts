/**
 * Browser speech capability detection.
 *
 * Everything here is feature detection, never user-agent sniffing, so the app degrades
 * honestly on browsers we have not tested (NFR-04).
 */

import type { AsrCapabilities } from '@/lib/types';

/** Languages the app offers for speech recognition and synthesis (FR-ASR-03). */
export const SUPPORTED_SPEECH_LANGUAGES = [
  { code: 'en-IN', label: 'English (India)', nativeLabel: 'English (India)' },
  { code: 'hi-IN', label: 'Hindi', nativeLabel: 'हिन्दी' },
] as const;

export type SupportedSpeechLanguage = (typeof SUPPORTED_SPEECH_LANGUAGES)[number]['code'];

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

interface SpeechWindow {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

/** The `SpeechRecognition` constructor on this browser, if any. */
export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as unknown as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

/**
 * What speech recognition can do here, plus the reason when it cannot.
 *
 * Firefox does not ship `SpeechRecognition` by default, so it lands in `unsupported`
 * and the UI switches to typing automatically (T-PERM-06).
 */
export function detectAsrCapabilities(): AsrCapabilities {
  if (typeof window === 'undefined') {
    return {
      support: 'unknown',
      secureContext: false,
      hasMediaDevices: false,
      reason: 'Speech recognition cannot be checked outside the browser.',
    };
  }

  const secureContext = window.isSecureContext === true;
  const hasMediaDevices = typeof navigator.mediaDevices?.getUserMedia === 'function';

  if (!secureContext) {
    return {
      support: 'unsupported',
      secureContext,
      hasMediaDevices,
      reason: 'Speech recognition needs a secure connection. Open SignSpeak over HTTPS or on localhost.',
    };
  }

  if (!hasMediaDevices) {
    return {
      support: 'unsupported',
      secureContext,
      hasMediaDevices,
      reason: 'This browser does not expose microphone access, so speech recognition is unavailable.',
    };
  }

  if (!getSpeechRecognitionConstructor()) {
    return {
      support: 'unsupported',
      secureContext,
      hasMediaDevices,
      reason:
        'This browser does not support the Web Speech API for recognition. Firefox is the common case. Type instead — typing is always available.',
    };
  }

  return {
    support: 'supported',
    secureContext,
    hasMediaDevices,
    reason: '',
  };
}

/** True when the browser can synthesise speech. */
export function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Is the Web Speech API available at all? */
export function isWebSpeechApiAvailable(): boolean {
  return detectAsrCapabilities().support === 'supported' || isTtsSupported();
}
