/**
 * Speech-to-text wrapper around the Web Speech API.
 *
 * Privacy note surfaced in the UI (FR-ASR-05): in Chrome and Edge, `SpeechRecognition`
 * sends audio to the browser vendor's speech service. SignSpeak never records or stores
 * audio, but it cannot prevent that transmission, and it says so plainly.
 *
 * Every error code from `docs/technical-research.md` §4.1 is mapped to a plain-language
 * explanation with a next step and a retry affordance.
 */

import { detectAsrCapabilities, getSpeechRecognitionConstructor } from '@/lib/speech/capabilities';
import type { AsrError, AsrErrorCode } from '@/lib/types';

const ERROR_COPY: Record<AsrErrorCode, Omit<AsrError, 'code'>> = {
  'not-allowed': {
    message: 'Microphone permission was declined, so speech recognition cannot start.',
    remedy: 'Allow microphone access in the address bar and try again, or type the message instead.',
    retryable: true,
  },
  'service-not-allowed': {
    message: 'The browser blocked its speech service for this page.',
    remedy: 'Type the message instead. Speech recognition is unavailable until the browser allows it.',
    retryable: false,
  },
  'no-speech': {
    message: 'No speech was detected.',
    remedy: 'Press the microphone again and speak clearly towards the device.',
    retryable: true,
  },
  'audio-capture': {
    message: 'No microphone was found or the microphone is in use.',
    remedy: 'Connect a microphone, close any app using it, and try again. You can type instead.',
    retryable: true,
  },
  network: {
    message: 'The browser’s speech service could not be reached.',
    remedy: 'Check the connection and try again. Typing works without a network.',
    retryable: true,
  },
  aborted: {
    message: 'Listening stopped before anything was recognised.',
    remedy: 'Press the microphone to start again.',
    retryable: true,
  },
  'language-not-supported': {
    message: 'This browser does not support the selected language for speech recognition.',
    remedy: 'Switch to English (India), or type the message instead.',
    retryable: false,
  },
  unknown: {
    message: 'Speech recognition stopped unexpectedly.',
    remedy: 'Press the microphone to try again, or type the message instead.',
    retryable: true,
  },
};

export function describeAsrError(code: string): AsrError {
  const known = (Object.keys(ERROR_COPY) as AsrErrorCode[]).includes(code as AsrErrorCode)
    ? (code as AsrErrorCode)
    : 'unknown';
  return { code: known, ...ERROR_COPY[known] };
}

export interface RecognizerCallbacks {
  onStart?: () => void;
  /** Partial text; render in a muted style (docs/ui-ux-specification.md §3.4). */
  onInterim?: (text: string) => void;
  /** Final text; editable by the user before sending. */
  onFinal?: (text: string) => void;
  onError?: (error: AsrError) => void;
  onEnd?: () => void;
}

export interface RecognizerOptions {
  lang: string;
  callbacks: RecognizerCallbacks;
}

/**
 * A single-use-per-utterance recogniser.
 *
 * `continuous` is deliberately false: a ward conversation is turn-based, and continuous
 * mode stops unpredictably on Android Chrome (docs/technical-research.md §4.1). The UI
 * restarts listening on the next user action instead.
 */
export class SpeechRecognizer {
  private recognition: SpeechRecognition | null = null;
  private listening = false;
  private stopping = false;

  constructor(private readonly options: RecognizerOptions) {}

  get isListening(): boolean {
    return this.listening;
  }

  static isSupported(): boolean {
    return detectAsrCapabilities().support === 'supported';
  }

  start(): { ok: true } | { ok: false; error: AsrError } {
    const Constructor = getSpeechRecognitionConstructor();
    if (!Constructor) {
      return {
        ok: false,
        error: describeAsrError('service-not-allowed'),
      };
    }

    if (this.listening) return { ok: true };

    try {
      const recognition = new Constructor();
      recognition.lang = this.options.lang;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        this.listening = true;
        this.stopping = false;
        this.options.callbacks.onStart?.();
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (!result) continue;
          const alternative = result[0];
          const transcript = alternative?.transcript ?? '';
          if (result.isFinal) final += transcript;
          else interim += transcript;
        }
        if (interim.trim().length > 0) this.options.callbacks.onInterim?.(interim.trim());
        if (final.trim().length > 0) this.options.callbacks.onFinal?.(final.trim());
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        this.listening = false;
        // `aborted` fires when we stop on purpose; it is not worth showing to the user.
        if (event.error === 'aborted' && this.stopping) return;
        this.options.callbacks.onError?.(describeAsrError(event.error));
      };

      recognition.onend = () => {
        this.listening = false;
        this.recognition = null;
        this.options.callbacks.onEnd?.();
      };

      this.recognition = recognition;
      recognition.start();
      return { ok: true };
    } catch (error) {
      this.listening = false;
      this.recognition = null;
      const message = error instanceof Error ? error.message : String(error);
      // Calling start() twice, or starting without a secure context, throws.
      return {
        ok: false,
        error: {
          code: 'unknown',
          message: 'Speech recognition could not start.',
          remedy: `${message} Try again, or type the message instead.`,
          retryable: true,
        },
      };
    }
  }

  /** Stop and let the browser deliver the final result. */
  stop(): void {
    this.stopping = true;
    try {
      this.recognition?.stop();
    } catch {
      /* already stopped */
    }
    this.listening = false;
  }

  /** Stop and discard anything pending. */
  abort(): void {
    this.stopping = true;
    try {
      this.recognition?.abort();
    } catch {
      /* already stopped */
    }
    this.listening = false;
  }
}

/** Wording shown next to the microphone whenever speech recognition is used. */
export const ASR_PRIVACY_NOTICE =
  'Your browser may send audio to its own speech service (for example, Google for Chrome) to turn it into text. SignSpeak does not record or store your audio.';
