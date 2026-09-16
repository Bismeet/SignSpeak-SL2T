/**
 * Text-to-speech wrapper around `SpeechSynthesis`.
 *
 * FR-SPK-02 is enforced here: nothing is spoken unless the caller explicitly asks. The
 * component layer owns the "user pressed Speak" decision, and this module never speaks
 * on its own.
 *
 * Voice availability varies by operating system, so a missing `hi-IN` voice falls back
 * to an `en-IN`/`en` voice and reports that it did (FR-SPK-04, risk R19).
 */

import { isTtsSupported } from '@/lib/speech/capabilities';
import type { VoiceOption } from '@/lib/types';

/**
 * How long to wait for `voiceschanged` before giving up on a first load.
 *
 * Only the *first* call ever waits (see `cachedVoices`); a device that genuinely has no
 * voices installed pays this once, not on every Speak press.
 */
export const VOICE_LOAD_TIMEOUT_MS = 2000;

/**
 * The document's voice list, resolved once.
 *
 * Voices are a document-level resource and `getVoices()` returns an empty array until the
 * browser has finished loading them. Caching the *first resolved* result — including an
 * empty one — means a device with no voices installed is only ever waited on once. Without
 * this, every Speak press on such a device would appear dead for the full timeout.
 */
let cachedVoices: SpeechSynthesisVoice[] | null = null;

/** Forget the cached voice list so the next call re-reads it. Used by tests. */
export function resetVoiceCache(): void {
  cachedVoices = null;
}

/** Voices load asynchronously in Chrome; resolve once they are available. */
export function loadVoices(timeoutMs = VOICE_LOAD_TIMEOUT_MS): Promise<SpeechSynthesisVoice[]> {
  if (!isTtsSupported()) return Promise.resolve([]);
  // Already resolved once. Either we have voices, or this device has none — do not make
  // the user wait again just to rediscover that.
  if (cachedVoices !== null) return Promise.resolve(cachedVoices);

  const synth = window.speechSynthesis;
  const immediate = synth.getVoices();
  if (immediate.length > 0) {
    cachedVoices = immediate;
    return Promise.resolve(immediate);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synth.removeEventListener('voiceschanged', finish);
      cachedVoices = synth.getVoices();
      resolve(cachedVoices);
    };
    synth.addEventListener('voiceschanged', finish);
    setTimeout(finish, timeoutMs);
  });
}

function languageMatches(voiceLang: string, requested: string): boolean {
  const normalise = (value: string) => value.toLowerCase().replace('_', '-');
  const a = normalise(voiceLang);
  const b = normalise(requested);
  if (a === b) return true;
  // en-IN should also accept en-GB / en-US as a fallback, but exact match ranks first.
  const baseA = a.split('-')[0];
  const baseB = b.split('-')[0];
  return baseA === baseB;
}

/**
 * Rank the available voices for a requested language.
 *
 * Order: exact locale match (local service first, then remote), then same-base-language
 * match, then everything else. Local voices are preferred because they work offline and
 * do not send text to a vendor service.
 */
export function rankVoicesForLanguage(voices: SpeechSynthesisVoice[], lang: string): VoiceOption[] {
  const requested = lang.toLowerCase();
  const options: VoiceOption[] = voices.map((voice) => ({
    name: voice.name,
    lang: voice.lang,
    exactMatch: voice.lang.toLowerCase().replace('_', '-') === requested,
    localService: voice.localService,
  }));

  const score = (option: VoiceOption): number => {
    let value = 0;
    if (option.exactMatch) value += 100;
    else if (languageMatches(option.lang, lang)) value += 40;
    if (option.localService) value += 10;
    return value;
  };

  return options.sort((a, b) => {
    const diff = score(b) - score(a);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
}

export interface SpeakOptions {
  text: string;
  /** BCP-47 language tag, e.g. `en-IN`. */
  lang: string;
  /** `SpeechSynthesisVoice.voiceURI`, or null to use the best available voice. */
  voiceUri: string | null;
  /** 0.1 - 10; 1 is normal. */
  rate: number;
}

export interface SpeakResult {
  ok: boolean;
  /** Set when the requested language had no voice and a fallback was used. */
  notice?: string;
  error?: string;
}

export interface SpeakerCallbacks {
  onStart?: (text: string) => void;
  onEnd?: (text: string) => void;
  onError?: (message: string) => void;
}

/**
 * Wrapper around a single `SpeechSynthesisUtterance` at a time.
 * `stop()` cancels immediately, which satisfies T-SPCH-05 (halt within 300 ms).
 */
export class Speaker {
  private current: SpeechSynthesisUtterance | null = null;
  private lastSpoken: SpeakOptions | null = null;

  constructor(private readonly callbacks: SpeakerCallbacks = {}) {}

  static isSupported(): boolean {
    return isTtsSupported();
  }

  get isSpeaking(): boolean {
    if (!isTtsSupported()) return false;
    return window.speechSynthesis.speaking;
  }

  /** The options used for the most recent utterance, so Repeat can reuse them. */
  get lastOptions(): SpeakOptions | null {
    return this.lastSpoken;
  }

  async speak(options: SpeakOptions): Promise<SpeakResult> {
    if (!isTtsSupported()) {
      return {
        ok: false,
        error: 'This browser cannot speak text aloud. The text stays on screen in large type.',
      };
    }

    const text = options.text.trim();
    if (text.length === 0) return { ok: false, error: 'There is nothing to speak.' };

    // Cancel anything already playing so a new utterance never queues behind an old one.
    this.cancel();

    const voices = await loadVoices();
    const ranked = rankVoicesForLanguage(voices, options.lang);
    const requestedExact = ranked.find((voice) => voice.exactMatch);

    // Prefer, in order: the user's explicit choice, then the top-ranked voice for the
    // requested language. `ranked` carries only names, so match back on `name` — matching
    // on `voiceURI` here would silently fail whenever the two differ (which is common).
    const chosen = options.voiceUri
      ? (voices.find((voice) => voice.voiceURI === options.voiceUri) ?? null)
      : null;
    const bestRanked = ranked[0] ? (voices.find((voice) => voice.name === ranked[0]?.name) ?? null) : null;
    const voice = chosen ?? bestRanked;

    let notice: string | undefined;
    if (voices.length === 0) {
      notice =
        'No speech voices are installed on this device, so the browser default will be used. The text is also shown on screen.';
    } else if (!requestedExact) {
      notice = `No ${options.lang} voice is installed on this device, so a different voice will read the text. The text is also shown on screen.`;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.lang;
    utterance.rate = Math.min(10, Math.max(0.1, options.rate));
    // When no voice object is available the utterance keeps the platform default, which is
    // the honest behaviour: the `notice` above already told the user a fallback happened.
    if (voice) utterance.voice = voice;

    utterance.onstart = () => this.callbacks.onStart?.(text);
    utterance.onend = () => {
      this.current = null;
      this.callbacks.onEnd?.(text);
    };
    utterance.onerror = (event) => {
      this.current = null;
      // `interrupted` and `canceled` are the expected result of pressing Stop.
      if (event.error === 'interrupted' || event.error === 'canceled') {
        this.callbacks.onEnd?.(text);
        return;
      }
      this.callbacks.onError?.(`Speech failed: ${event.error}. The text is still shown on screen.`);
    };

    try {
      this.current = utterance;
      this.lastSpoken = options;
      window.speechSynthesis.speak(utterance);
      return notice ? { ok: true, notice } : { ok: true };
    } catch (error) {
      this.current = null;
      return {
        ok: false,
        error: `Speech could not start: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /** Replay the most recent utterance (FR-SPK-03 "repeat"). */
  async repeat(): Promise<SpeakResult> {
    if (!this.lastSpoken) {
      return { ok: false, error: 'There is nothing to repeat yet.' };
    }
    return this.speak(this.lastSpoken);
  }

  /** Stop immediately. */
  cancel(): void {
    if (!isTtsSupported()) return;
    this.current = null;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* nothing playing */
    }
  }
}
