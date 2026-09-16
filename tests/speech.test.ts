/**
 * Speech tests: capability detection, error copy, voice ranking and the recogniser wrapper.
 *
 * Two things here are load-bearing for the product's honesty:
 *
 *  - capability detection is by **feature detection**, never user-agent sniffing, so an
 *    untested browser degrades rather than lying;
 *  - `ASR_PRIVACY_NOTICE` must exist and must mention that the browser vendor may receive
 *    audio, because SignSpeak cannot prevent that and must not pretend otherwise
 *    (FR-ASR-05, docs/privacy-and-safety.md §3).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ASR_PRIVACY_NOTICE, SpeechRecognizer, describeAsrError } from '@/lib/speech/asr';
import {
  SUPPORTED_SPEECH_LANGUAGES,
  detectAsrCapabilities,
  getSpeechRecognitionConstructor,
  isTtsSupported,
  isWebSpeechApiAvailable,
} from '@/lib/speech/capabilities';
import { Speaker, loadVoices, rankVoicesForLanguage, resetVoiceCache } from '@/lib/speech/tts';
import type { AsrErrorCode } from '@/lib/types';

type FakeWindow = Window & {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
};

function setSecureContext(value: boolean): void {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value });
}

function setMediaDevices(present: boolean): void {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: present ? { getUserMedia: () => Promise.resolve({}) } : undefined,
  });
}

/** A minimal stand-in for `SpeechRecognition`, enough to drive the wrapper. */
class FakeRecognition {
  static instances: FakeRecognition[] = [];

  lang = '';
  continuous = true;
  interimResults = false;
  maxAlternatives = 1;
  started = false;

  onstart: (() => void) | null = null;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start(): void {
    this.started = true;
  }

  stop(): void {
    this.started = false;
    this.onend?.();
  }

  abort(): void {
    this.started = false;
  }
}

beforeEach(() => {
  FakeRecognition.instances = [];
  setSecureContext(true);
  setMediaDevices(true);
  delete (window as FakeWindow).SpeechRecognition;
  delete (window as FakeWindow).webkitSpeechRecognition;
  // `loadVoices` caches the first resolved list for the lifetime of the document. Tests
  // install a different stub each time, so the cache has to be cleared between them.
  resetVoiceCache();
});

describe('speech language options', () => {
  it('offers exactly the two documented languages (FR-ASR-03)', () => {
    expect(SUPPORTED_SPEECH_LANGUAGES.map((entry) => entry.code)).toEqual(['en-IN', 'hi-IN']);
  });

  it('labels Hindi in Devanagari as well as English', () => {
    const hindi = SUPPORTED_SPEECH_LANGUAGES.find((entry) => entry.code === 'hi-IN');
    expect(hindi?.nativeLabel).toBe('हिन्दी');
    expect(hindi?.label).toBe('Hindi');
  });
});

describe('capability detection is by feature detection', () => {
  it('reports unsupported in an insecure context', () => {
    setSecureContext(false);
    const capabilities = detectAsrCapabilities();
    expect(capabilities.support).toBe('unsupported');
    expect(capabilities.secureContext).toBe(false);
    expect(capabilities.reason).toMatch(/secure|https/i);
  });

  it('reports unsupported when the browser has no microphone API', () => {
    setMediaDevices(false);
    const capabilities = detectAsrCapabilities();
    expect(capabilities.support).toBe('unsupported');
    expect(capabilities.hasMediaDevices).toBe(false);
  });

  it('reports unsupported when SpeechRecognition is missing, and names Firefox', () => {
    const capabilities = detectAsrCapabilities();
    expect(capabilities.support).toBe('unsupported');
    expect(capabilities.reason).toMatch(/Firefox/);
    expect(capabilities.reason).toMatch(/type/i);
  });

  it('reports supported when SpeechRecognition is present', () => {
    (window as FakeWindow).SpeechRecognition = FakeRecognition;
    const capabilities = detectAsrCapabilities();
    expect(capabilities.support).toBe('supported');
    expect(capabilities.reason).toBe('');
  });

  it('accepts the webkit-prefixed constructor as well', () => {
    (window as FakeWindow).webkitSpeechRecognition = FakeRecognition;
    expect(detectAsrCapabilities().support).toBe('supported');
    expect(getSpeechRecognitionConstructor()).toBe(FakeRecognition);
  });

  it('prefers the unprefixed constructor when both exist', () => {
    class Other {}
    (window as FakeWindow).SpeechRecognition = FakeRecognition;
    (window as FakeWindow).webkitSpeechRecognition = Other;
    expect(getSpeechRecognitionConstructor()).toBe(FakeRecognition);
  });

  it('does not sniff the user agent', () => {
    // `resolve(__dirname, ...)` rather than `new URL(..., import.meta.url)`: the latter
    // produces a `file:` URL, which the test sandbox's filesystem shim cannot open.
    const source = readFileSync(
      resolve(__dirname, '..', 'lib', 'speech', 'capabilities.ts'),
      'utf8',
    );
    // Strip comments so the documentation above does not trip the assertion.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/userAgent|navigator\.vendor/);
  });
});

/** The shape of the utterance objects our stub records, enough to drive the handlers. */
interface RecordedUtterance {
  text: string;
  lang: string;
  rate: number;
  voice: SpeechSynthesisVoice | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

/**
 * jsdom has no `speechSynthesis`; install a controllable stub where one is needed.
 *
 * The default is a single `en-IN` voice, because that is what a real device looks like: a
 * browser exposing `speechSynthesis` almost always has at least one voice installed. Pass
 * `[]` to model the rarer device that has none.
 */
function installSpeechSynthesis(
  voices: SpeechSynthesisVoice[] = [
    {
      name: 'India English',
      lang: 'en-IN',
      localService: true,
      voiceURI: 'India English',
      default: true,
    } as SpeechSynthesisVoice,
  ],
): {
  spoken: RecordedUtterance[];
  cancelled: number;
} {
  const state = { spoken: [] as RecordedUtterance[], cancelled: 0 };
  const stub = {
    speaking: false,
    getVoices: () => voices,
    addEventListener: () => {},
    removeEventListener: () => {},
    speak: (utterance: RecordedUtterance) => {
      state.spoken.push(utterance);
    },
    cancel: () => {
      state.cancelled += 1;
    },
  };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: stub });
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
    configurable: true,
    writable: true,
    value: class implements RecordedUtterance {
      text: string;
      lang = '';
      rate = 1;
      voice: SpeechSynthesisVoice | null = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    },
  });
  return state;
}

function removeSpeechSynthesis(): void {
  delete (window as unknown as Record<string, unknown>).speechSynthesis;
}

describe('text-to-speech support', () => {
  it('reports unsupported when speechSynthesis is absent', () => {
    removeSpeechSynthesis();
    expect(isTtsSupported()).toBe(false);
  });

  it('reports supported when speechSynthesis is present', () => {
    installSpeechSynthesis();
    expect(isTtsSupported()).toBe(true);
  });

  it('reports the Web Speech API as available when either half works', () => {
    installSpeechSynthesis();
    removeSpeechSynthesis();
    (window as FakeWindow).SpeechRecognition = FakeRecognition;
    expect(isWebSpeechApiAvailable()).toBe(true);
  });
});

describe('ASR error copy', () => {
  const codes: AsrErrorCode[] = [
    'not-allowed',
    'service-not-allowed',
    'no-speech',
    'audio-capture',
    'network',
    'aborted',
    'language-not-supported',
    'unknown',
  ];

  it.each(codes)('has a message and a remedy for %s', (code) => {
    const error = describeAsrError(code);
    expect(error.code).toBe(code);
    expect(error.message.length).toBeGreaterThan(10);
    expect(error.remedy.length).toBeGreaterThan(10);
    expect(typeof error.retryable).toBe('boolean');
  });

  it('maps an unknown code to the generic error rather than throwing', () => {
    expect(describeAsrError('something-new').code).toBe('unknown');
  });

  it('offers typing as an alternative for the failures a user cannot fix', () => {
    for (const code of ['service-not-allowed', 'language-not-supported'] as AsrErrorCode[]) {
      expect(describeAsrError(code).remedy).toMatch(/type/i);
      expect(describeAsrError(code).retryable).toBe(false);
    }
  });

  it('offers a retry for the failures a user can fix', () => {
    for (const code of ['not-allowed', 'no-speech', 'audio-capture', 'network'] as AsrErrorCode[]) {
      expect(describeAsrError(code).retryable).toBe(true);
    }
  });
});

describe('the speech privacy notice', () => {
  it('exists', () => {
    expect(ASR_PRIVACY_NOTICE.length).toBeGreaterThan(40);
  });

  it('says the browser vendor may receive the audio', () => {
    expect(ASR_PRIVACY_NOTICE).toMatch(/send audio|browser/i);
    expect(ASR_PRIVACY_NOTICE).toMatch(/Chrome|Google/);
  });

  it('says SignSpeak itself does not record or store audio', () => {
    expect(ASR_PRIVACY_NOTICE).toMatch(/does not record or store/i);
  });
});

describe('SpeechRecognizer', () => {
  it('refuses to start when the browser has no support, with actionable copy', () => {
    const recognizer = new SpeechRecognizer({ lang: 'en-IN', callbacks: {} });
    const result = recognizer.start();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('service-not-allowed');
    expect(result.error.remedy).toMatch(/type/i);
  });

  it('is never continuous, because turn-based use is the documented choice', () => {
    (window as FakeWindow).SpeechRecognition = FakeRecognition;
    const recognizer = new SpeechRecognizer({ lang: 'en-IN', callbacks: {} });
    expect(recognizer.start().ok).toBe(true);
    const instance = FakeRecognition.instances.at(-1);
    expect(instance?.continuous).toBe(false);
    expect(instance?.interimResults).toBe(true);
    expect(instance?.maxAlternatives).toBe(1);
  });

  it('passes the requested language through', () => {
    (window as FakeWindow).SpeechRecognition = FakeRecognition;
    new SpeechRecognizer({ lang: 'hi-IN', callbacks: {} }).start();
    expect(FakeRecognition.instances.at(-1)?.lang).toBe('hi-IN');
  });

  it('reports interim and final transcripts separately', () => {
    (window as FakeWindow).SpeechRecognition = FakeRecognition;
    const onInterim = vi.fn();
    const onFinal = vi.fn();
    new SpeechRecognizer({ lang: 'en-IN', callbacks: { onInterim, onFinal } }).start();

    const instance = FakeRecognition.instances.at(-1);
    instance?.onresult?.({
      resultIndex: 0,
      results: [
        Object.assign([{ transcript: 'i need' }], { isFinal: false }),
        Object.assign([{ transcript: 'water' }], { isFinal: true }),
      ],
    });

    expect(onInterim).toHaveBeenCalledWith('i need');
    expect(onFinal).toHaveBeenCalledWith('water');
  });

  it('does not report an aborted stop as an error when we stopped it on purpose', () => {
    (window as FakeWindow).SpeechRecognition = FakeRecognition;
    const onError = vi.fn();
    const recognizer = new SpeechRecognizer({ lang: 'en-IN', callbacks: { onError } });
    recognizer.start();
    recognizer.stop();
    FakeRecognition.instances.at(-1)?.onerror?.({ error: 'aborted' });
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports a genuine aborted error', () => {
    (window as FakeWindow).SpeechRecognition = FakeRecognition;
    const onError = vi.fn();
    const recognizer = new SpeechRecognizer({ lang: 'en-IN', callbacks: { onError } });
    recognizer.start();
    FakeRecognition.instances.at(-1)?.onerror?.({ error: 'aborted' });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'aborted' }));
  });

  it('maps a not-allowed error to the permission copy', () => {
    (window as FakeWindow).SpeechRecognition = FakeRecognition;
    const onError = vi.fn();
    const recognizer = new SpeechRecognizer({ lang: 'en-IN', callbacks: { onError } });
    recognizer.start();
    FakeRecognition.instances.at(-1)?.onerror?.({ error: 'not-allowed' });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'not-allowed', retryable: true }));
  });

  it('is a no-op when started twice while already listening', () => {
    (window as FakeWindow).SpeechRecognition = FakeRecognition;
    const recognizer = new SpeechRecognizer({ lang: 'en-IN', callbacks: {} });
    recognizer.start();
    FakeRecognition.instances.at(-1)?.onstart?.();
    expect(recognizer.isListening).toBe(true);
    recognizer.start();
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it('clears the listening flag when recognition ends', () => {
    (window as FakeWindow).SpeechRecognition = FakeRecognition;
    const onEnd = vi.fn();
    const recognizer = new SpeechRecognizer({ lang: 'en-IN', callbacks: { onEnd } });
    recognizer.start();
    const instance = FakeRecognition.instances.at(-1);
    instance?.onstart?.();
    instance?.onend?.();
    expect(recognizer.isListening).toBe(false);
    expect(onEnd).toHaveBeenCalled();
  });

  it('reports a throw from start() as a retryable error instead of crashing', () => {
    class Throwing extends FakeRecognition {
      override start(): void {
        throw new Error('recognition already started');
      }
    }
    (window as FakeWindow).SpeechRecognition = Throwing;
    const result = new SpeechRecognizer({ lang: 'en-IN', callbacks: {} }).start();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.retryable).toBe(true);
    expect(result.error.remedy).toMatch(/type/i);
  });

  it('reports isSupported from capability detection', () => {
    expect(SpeechRecognizer.isSupported()).toBe(false);
    (window as FakeWindow).SpeechRecognition = FakeRecognition;
    expect(SpeechRecognizer.isSupported()).toBe(true);
  });
});

describe('voice ranking', () => {
  function voice(name: string, lang: string, localService = true): SpeechSynthesisVoice {
    return { name, lang, localService, voiceURI: name, default: false } as SpeechSynthesisVoice;
  }

  it('puts an exact locale match first', () => {
    const ranked = rankVoicesForLanguage(
      [voice('US English', 'en-US'), voice('India English', 'en-IN'), voice('Hindi', 'hi-IN')],
      'en-IN',
    );
    expect(ranked[0]?.name).toBe('India English');
    expect(ranked[0]?.exactMatch).toBe(true);
  });

  it('accepts a same-language fallback when the exact locale is missing', () => {
    const ranked = rankVoicesForLanguage([voice('US English', 'en-US'), voice('Hindi', 'hi-IN')], 'en-IN');
    expect(ranked[0]?.name).toBe('US English');
    expect(ranked[0]?.exactMatch).toBe(false);
  });

  it('prefers a local voice over a remote one at the same match level', () => {
    const ranked = rankVoicesForLanguage(
      [voice('Remote India', 'en-IN', false), voice('Local India', 'en-IN', true)],
      'en-IN',
    );
    expect(ranked[0]?.name).toBe('Local India');
  });

  it('normalises underscore language tags', () => {
    const ranked = rankVoicesForLanguage([voice('Legacy', 'en_IN')], 'en-IN');
    expect(ranked[0]?.exactMatch).toBe(true);
  });

  it('ranks an exact match above a same-language local voice', () => {
    // This is the ordering that matters: the user asked for en-IN, so en-IN wins even if a
    // local en-US voice exists and would work offline.
    const ranked = rankVoicesForLanguage(
      [voice('Local US', 'en-US', true), voice('Remote India', 'en-IN', false)],
      'en-IN',
    );
    expect(ranked[0]?.name).toBe('Remote India');
  });

  it('returns an empty list when there are no voices, without throwing', () => {
    expect(rankVoicesForLanguage([], 'en-IN')).toEqual([]);
  });

  it('sorts deterministically by name when scores tie', () => {
    const ranked = rankVoicesForLanguage(
      [voice('Zulu', 'en-IN'), voice('Alpha', 'en-IN')],
      'en-IN',
    );
    expect(ranked.map((entry) => entry.name)).toEqual(['Alpha', 'Zulu']);
  });

  it('keeps every voice in the output', () => {
    const voices = [voice('a', 'en-IN'), voice('b', 'hi-IN'), voice('c', 'fr-FR')];
    expect(rankVoicesForLanguage(voices, 'en-IN')).toHaveLength(3);
  });
});

describe('voice loading', () => {
  const INDIA = {
    name: 'India English',
    lang: 'en-IN',
    localService: true,
    voiceURI: 'India English',
    default: true,
  } as SpeechSynthesisVoice;

  it('returns the installed voices immediately when they are already available', async () => {
    installSpeechSynthesis([INDIA]);
    await expect(loadVoices()).resolves.toHaveLength(1);
  });

  it('returns an empty list rather than hanging when there are no voices at all', async () => {
    vi.useFakeTimers();
    try {
      installSpeechSynthesis([]);
      const pending = loadVoices(50);
      await vi.advanceTimersByTimeAsync(60);
      await expect(pending).resolves.toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for voices only once, so a voiceless device does not stall every Speak press', async () => {
    // Without the cache, every `speak()` on a device with no voices would appear dead for
    // the full timeout. The second call must not schedule a timer at all.
    vi.useFakeTimers();
    try {
      installSpeechSynthesis([]);
      const first = loadVoices(50);
      await vi.advanceTimersByTimeAsync(60);
      await first;

      const second = loadVoices(50);
      await expect(second).resolves.toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns an empty list when the browser has no speechSynthesis at all', async () => {
    removeSpeechSynthesis();
    await expect(loadVoices()).resolves.toEqual([]);
  });
});

describe('Speaker refuses to speak without an explicit request', () => {
  it('reports an error when there is nothing to speak', async () => {
    installSpeechSynthesis();
    const speaker = new Speaker();
    const result = await speaker.speak({ text: '   ', lang: 'en-IN', voiceUri: null, rate: 1 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/nothing to speak/i);
  });

  it('reports an error when there is nothing to repeat yet', async () => {
    installSpeechSynthesis();
    const speaker = new Speaker();
    const result = await speaker.repeat();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/nothing to repeat/i);
  });

  it('reports lastOptions as null before anything is spoken', () => {
    expect(new Speaker().lastOptions).toBeNull();
  });

  it('says so plainly when the browser cannot speak at all', async () => {
    removeSpeechSynthesis();
    const result = await new Speaker().speak({ text: 'hello', lang: 'en-IN', voiceUri: null, rate: 1 });
    expect(result.ok).toBe(false);
    // The text must stay readable on screen; the message says exactly that.
    expect(result.error).toMatch(/on screen/i);
  });

  it('speaks only when asked, and cancels anything already playing first', async () => {
    const state = installSpeechSynthesis([
      { name: 'India English', lang: 'en-IN', localService: true, voiceURI: 'India English' } as SpeechSynthesisVoice,
    ]);
    const speaker = new Speaker();
    const result = await speaker.speak({
      text: 'I need water.',
      lang: 'en-IN',
      voiceUri: null,
      rate: 0.95,
    });
    expect(result.ok).toBe(true);
    expect(state.spoken).toHaveLength(1);
    expect(state.spoken[0]?.text).toBe('I need water.');
    expect(state.cancelled).toBeGreaterThan(0);
  });

  it('clamps the rate into the range the API accepts', async () => {
    const state = installSpeechSynthesis();
    const speaker = new Speaker();
    await speaker.speak({ text: 'hello', lang: 'en-IN', voiceUri: null, rate: 99 });
    expect(state.spoken[0]?.rate).toBeLessThanOrEqual(10);
    await speaker.speak({ text: 'hello', lang: 'en-IN', voiceUri: null, rate: -5 });
    expect(state.spoken[1]?.rate).toBeGreaterThanOrEqual(0.1);
  });

  it('notices when the requested language has no installed voice', async () => {
    installSpeechSynthesis([
      { name: 'US English', lang: 'en-US', localService: true, voiceURI: 'US English' } as SpeechSynthesisVoice,
    ]);
    const result = await new Speaker().speak({ text: 'hello', lang: 'hi-IN', voiceUri: null, rate: 1 });
    expect(result.ok).toBe(true);
    expect(result.notice).toMatch(/no hi-IN voice/i);
    expect(result.notice).toMatch(/on screen/i);
  });

  it('selects the top-ranked voice for the requested language', async () => {
    const state = installSpeechSynthesis([
      { name: 'US English', lang: 'en-US', localService: true, voiceURI: 'us' } as SpeechSynthesisVoice,
      { name: 'India English', lang: 'en-IN', localService: true, voiceURI: 'in' } as SpeechSynthesisVoice,
    ]);
    await new Speaker().speak({ text: 'hello', lang: 'en-IN', voiceUri: null, rate: 1 });
    expect(state.spoken[0]?.voice?.name).toBe('India English');
  });

  it('honours an explicit voice choice', async () => {
    const state = installSpeechSynthesis([
      { name: 'US English', lang: 'en-US', localService: true, voiceURI: 'us' } as SpeechSynthesisVoice,
      { name: 'India English', lang: 'en-IN', localService: true, voiceURI: 'in' } as SpeechSynthesisVoice,
    ]);
    await new Speaker().speak({ text: 'hello', lang: 'en-IN', voiceUri: 'us', rate: 1 });
    expect(state.spoken[0]?.voice?.name).toBe('US English');
  });

  it('remembers the last utterance so Repeat can replay it (FR-SPK-03)', async () => {
    const state = installSpeechSynthesis();
    const speaker = new Speaker();
    await speaker.speak({ text: 'I need water.', lang: 'en-IN', voiceUri: null, rate: 1 });
    expect(speaker.lastOptions?.text).toBe('I need water.');

    await speaker.repeat();
    expect(state.spoken).toHaveLength(2);
    expect(state.spoken[1]?.text).toBe('I need water.');
  });

  it('treats an interrupted utterance as a normal end, not an error (Stop button)', async () => {
    const utterances = installSpeechSynthesis();
    const onError = vi.fn();
    const onEnd = vi.fn();
    const speaker = new Speaker({ onEnd, onError });

    await speaker.speak({ text: 'hello', lang: 'en-IN', voiceUri: null, rate: 1 });
    // `interrupted` is what Chrome reports when cancel() is called, which is exactly what
    // pressing Stop does. Showing an error for it would make the app look broken.
    utterances.spoken[0]?.onerror?.({ error: 'interrupted' });

    expect(onError).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledWith('hello');
  });

  it('reports a genuine speech failure, and says the text is still on screen', async () => {
    const utterances = installSpeechSynthesis();
    const onError = vi.fn();
    await new Speaker({ onError }).speak({ text: 'hello', lang: 'en-IN', voiceUri: null, rate: 1 });
    utterances.spoken[0]?.onerror?.({ error: 'synthesis-failed' });
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/on screen/i));
  });

  it('cancel is safe to call when nothing is playing', () => {
    installSpeechSynthesis();
    expect(() => new Speaker().cancel()).not.toThrow();
  });

  it('reports isSpeaking from the platform', () => {
    installSpeechSynthesis();
    expect(typeof new Speaker().isSpeaking).toBe('boolean');
  });
});
