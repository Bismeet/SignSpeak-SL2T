/**
 * Phrase matcher tests (FR-VIS-02, FR-VIS-03, T-PHR-01..06).
 *
 * The behaviour that matters: the matcher only ever returns a phrase from the curated list.
 * It never generates a sign, never splits a phrase into words, and returns `matched: false`
 * — which the UI turns into "No verified ISL video for this phrase" — rather than guessing.
 *
 * A second thing worth noticing: the *default* is `includeUnverified: false`. With the data
 * that currently ships (every phrase is `draft`), the default returns no match for anything.
 * That is the correct behaviour while no ISL signer has verified a clip, and it is asserted
 * explicitly below so nobody "fixes" it by loosening the default.
 */

import { describe, expect, it } from 'vitest';

import {
  MATCH_METHOD_LABEL,
  NO_VERIFIED_CLIP_MESSAGE,
  buildPhraseIndex,
  containsDevanagari,
  createPhraseMatcher,
  normaliseText,
} from '@/lib/phrases/matcher';
import type { Phrase } from '@/lib/types';

function phrase(overrides: Partial<Phrase> & Pick<Phrase, 'id' | 'textEn'>): Phrase {
  return {
    category: 'pain',
    speaker: 'deaf_user',
    textHi: '',
    aliasesEn: [],
    aliasesHi: [],
    islGloss: '',
    clip: { type: 'none', src: '' },
    validation: { status: 'unverified', verifiedBy: '', verifiedOn: '' },
    licence: '',
    attribution: '',
    emergency: false,
    order: 0,
    caption: '',
    ...overrides,
  } as Phrase;
}

/** A verified phrase, which is what the default matcher pool consists of. */
function verified(overrides: Partial<Phrase> & Pick<Phrase, 'id' | 'textEn'>): Phrase {
  return phrase({
    validation: { status: 'expert_verified', verifiedBy: 'Test Signer', verifiedOn: '2026-01-01' },
    clip: { type: 'file', src: `${overrides.id}.mp4` },
    licence: 'own-recording',
    attribution: 'Recorded for SignSpeak',
    ...overrides,
  });
}

const VERIFIED = [
  verified({ id: 'p_pain_here', textEn: 'I have pain here.', textHi: 'मुझे यहाँ दर्द है।', aliasesEn: ['it hurts here', 'pain here'] }),
  verified({ id: 'p_water', textEn: 'I need water.', textHi: 'मुझे पानी चाहिए।', aliasesEn: ['i am thirsty', 'water please'] }),
  verified({ id: 'p_help', textEn: 'I need help.', textHi: 'मुझे मदद चाहिए।', aliasesEn: ['help me', 'help'], emergency: true }),
  verified({ id: 'a_yes', textEn: 'Yes.', textHi: 'हाँ।', aliasesEn: ['yes', 'yeah'], emergency: true }),
];

describe('normaliseText', () => {
  it('lowercases and strips punctuation', () => {
    expect(normaliseText('Where does it hurt?')).toBe('where does it hurt');
    expect(normaliseText('I have pain here.')).toBe('i have pain here');
  });

  it('collapses whitespace', () => {
    expect(normaliseText('  I   need    water  ')).toBe('i need water');
  });

  it('expands contractions so both spellings behave identically', () => {
    expect(normaliseText("I don't understand")).toBe(normaliseText('I do not understand'));
    expect(normaliseText("I can't breathe")).toBe(normaliseText('I cannot breathe'));
    expect(normaliseText("I'm deaf")).toBe(normaliseText('I am deaf'));
    expect(normaliseText("what's wrong")).toBe(normaliseText('what is wrong'));
  });

  it('folds curly apostrophes to a straight one before expanding contractions', () => {
    expect(normaliseText('I don\u2019t understand')).toBe('i do not understand');
    expect(normaliseText('I don\u2018t understand')).toBe('i do not understand');
  });

  it('folds Devanagari digits to ASCII so both scripts match', () => {
    expect(normaliseText('० १ २ ३ ४ ५ ६ ७ ८ ९')).toBe('0 1 2 3 4 5 6 7 8 9');
  });

  it('preserves Devanagari letters and combining marks', () => {
    // हाँ and हां must stay distinct: the combining marks carry meaning.
    const withChandrabindu = normaliseText('हाँ');
    const withoutChandrabindu = normaliseText('हां');
    expect(withChandrabindu).not.toBe(withoutChandrabindu);
    expect(containsDevanagari(withChandrabindu)).toBe(true);
  });

  it('handles an empty string without throwing', () => {
    expect(normaliseText('')).toBe('');
    expect(normaliseText('   ')).toBe('');
  });

  it('normalises compatibility forms via NFKC', () => {
    // Fullwidth Latin "ｗａｔｅｒ" folds to "water".
    expect(normaliseText('\uFF57\uFF41\uFF54\uFF45\uFF52')).toBe('water');
  });
});

describe('matching against verified phrases', () => {
  const matcher = createPhraseMatcher(VERIFIED);

  it('matches an exact phrase', () => {
    const result = matcher.match('I need water.');
    expect(result.matched).toBe(true);
    expect(result.phrase?.id).toBe('p_water');
    expect(result.method).toBe('exact');
    expect(result.score).toBe(1);
  });

  it('matches ignoring case and punctuation', () => {
    expect(matcher.match('i need water').phrase?.id).toBe('p_water');
    expect(matcher.match('I NEED WATER!').phrase?.id).toBe('p_water');
  });

  it('matches an alias', () => {
    const result = matcher.match('I am thirsty');
    expect(result.matched).toBe(true);
    expect(result.phrase?.id).toBe('p_water');
    expect(result.method).toBe('alias');
  });

  it('matches a Hindi phrase', () => {
    const result = matcher.match('मुझे पानी चाहिए।');
    expect(result.matched).toBe(true);
    expect(result.phrase?.id).toBe('p_water');
  });

  it('matches a Hindi alias', () => {
    expect(matcher.match('मुझे मदद चाहिए।').phrase?.id).toBe('p_help');
  });

  it('matches a phrase contained in a longer sentence', () => {
    const result = matcher.match('I have pain here, doctor');
    expect(result.matched).toBe(true);
    expect(result.phrase?.id).toBe('p_pain_here');
    expect(result.method).toBe('contains');
  });

  it('matches a short input that is contained in a phrase', () => {
    const result = matcher.match('pain here');
    expect(result.matched).toBe(true);
    expect(result.phrase?.id).toBe('p_pain_here');
  });

  it('accepts a near miss above the fuzzy threshold', () => {
    const result = matcher.match('I need some water');
    expect(result.matched).toBe(true);
    expect(result.phrase?.id).toBe('p_water');
    expect(result.method).toBe('fuzzy');
    expect(result.score).toBeGreaterThanOrEqual(0.7);
  });

  it('reports the normalised input so the UI can explain the match', () => {
    expect(matcher.match("I DON'T know").normalisedInput).toBe('i do not know');
  });
});

describe('refusing to guess', () => {
  const matcher = createPhraseMatcher(VERIFIED);

  it('does not match unrelated text', () => {
    const result = matcher.match('The weather in Mumbai is humid today');
    expect(result.matched).toBe(false);
    expect(result.phrase).toBeNull();
    expect(result.method).toBe('none');
  });

  it('does not match an empty or whitespace-only input', () => {
    expect(matcher.match('').matched).toBe(false);
    expect(matcher.match('   ').matched).toBe(false);
  });

  it('returns near misses as candidates but does not match them', () => {
    const result = matcher.match('watermelon festival');
    expect(result.matched).toBe(false);
    expect(result.candidates.length).toBeGreaterThanOrEqual(0);
    for (const candidate of result.candidates) {
      expect(candidate.score).toBeLessThan(0.7);
    }
  });

  it('never invents a phrase id that is not in the list', () => {
    const inputs = [
      'something entirely different',
      'the quick brown fox',
      'xyzzy',
      'pain in my left elbow',
      'please call an ambulance immediately',
    ];
    const knownIds = new Set(VERIFIED.map((entry) => entry.id));
    for (const input of inputs) {
      const result = matcher.match(input);
      if (result.matched) {
        expect(knownIds.has(result.phrase?.id ?? '')).toBe(true);
      }
    }
  });

  it('exposes the exact wording required when nothing matches', () => {
    expect(NO_VERIFIED_CLIP_MESSAGE).toBe('No verified ISL video for this phrase');
  });

  it('has a human-readable label for every match method', () => {
    expect(MATCH_METHOD_LABEL.exact).toBeTruthy();
    expect(MATCH_METHOD_LABEL.alias).toBeTruthy();
    expect(MATCH_METHOD_LABEL.contains).toBeTruthy();
    expect(MATCH_METHOD_LABEL.fuzzy).toBeTruthy();
    expect(MATCH_METHOD_LABEL.none).toBeTruthy();
  });
});

describe('unverified phrases are excluded by default', () => {
  const mixed = [
    verified({ id: 'p_water', textEn: 'I need water.' }),
    phrase({ id: 'p_draft', textEn: 'I need a blanket.' }),
  ];
  const matcher = createPhraseMatcher(mixed);

  it('will not match a draft phrase by default', () => {
    const result = matcher.match('I need a blanket.');
    expect(result.matched).toBe(false);
  });

  it('matches the draft phrase only when unverified phrases are explicitly included', () => {
    const result = matcher.match('I need a blanket.', { includeUnverified: true });
    expect(result.matched).toBe(true);
    expect(result.phrase?.id).toBe('p_draft');
  });

  it('lists only verified phrases from verified()', () => {
    expect(matcher.verified().map((entry) => entry.id)).toEqual(['p_water']);
  });

  it('lists everything from all()', () => {
    expect(matcher.all().map((entry) => entry.id)).toEqual(['p_water', 'p_draft']);
  });
});

describe('the data file that actually ships', () => {
  // This uses the real data/phrases.json through the real data module.
  it('matches nothing by default, because no phrase is verified yet', async () => {
    const { PHRASE_MATCHER, phraseSummary } = await import('@/lib/phrases/data');

    expect(phraseSummary().verified).toBe(0);

    // Several realistic inputs, all of which are in the curated list as drafts.
    const inputs = ['I need water.', 'मुझे पानी चाहिए।', 'I need help.', 'Yes.'];
    for (const input of inputs) {
      const result = PHRASE_MATCHER.match(input);
      expect(
        result.matched,
        `"${input}" matched a draft phrase without includeUnverified. Draft phrases must be ` +
          'hidden by default (FR-VIS-01) — a draft clip must never be presented as verified ISL.',
      ).toBe(false);
    }
  });

  it('does match those phrases once unverified phrases are opted into', async () => {
    const { PHRASE_MATCHER } = await import('@/lib/phrases/data');
    const result = PHRASE_MATCHER.match('I need water.', { includeUnverified: true });
    expect(result.matched).toBe(true);
    expect(result.phrase?.id).toBe('p_water');
  });
});

describe('buildPhraseIndex', () => {
  it('indexes the primary text plus every alias in both languages', () => {
    const index = buildPhraseIndex([
      phrase({
        id: 'x',
        textEn: 'I need water.',
        textHi: 'मुझे पानी चाहिए।',
        aliasesEn: ['i am thirsty'],
        aliasesHi: ['पानी दीजिए'],
      }),
    ]);
    const entry = index[0];
    expect(entry).toBeDefined();
    expect(entry?.forms).toHaveLength(4);
    expect(entry?.forms.map((form) => form.kind)).toEqual(['primary', 'primary', 'alias', 'alias']);
    expect(entry?.primaryNormalised).toBe('i need water');
    expect(entry?.tokenSets).toHaveLength(4);
  });

  it('skips empty alias strings', () => {
    const index = buildPhraseIndex([phrase({ id: 'x', textEn: 'Yes.', aliasesEn: ['', '  '] })]);
    expect(index[0]?.forms).toHaveLength(1);
  });
});
