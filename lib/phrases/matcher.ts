/**
 * Phrase matcher: text -> curated phrase -> (optionally) a verified ISL clip.
 *
 * FR-VIS-02 is explicit: matching is exact or near-exact against a curated list with a
 * small synonym table. There is **no** free-text generation of signs, no word-by-word
 * concatenation, and no synthesis of ISL. Anything unmatched returns `matched: false`
 * so the UI can show "No verified ISL video for this phrase" (FR-VIS-03).
 */

import type { Phrase } from '@/lib/types';

/** Contraction expansions so "don't" and "do not" behave identically. */
const CONTRACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bcan't\b/g, 'cannot'],
  [/\bcant\b/g, 'cannot'],
  [/\bwon't\b/g, 'will not'],
  [/\bwont\b/g, 'will not'],
  [/\bshan't\b/g, 'shall not'],
  [/\bn't\b/g, ' not'],
  [/\bdon't\b/g, 'do not'],
  [/\bdont\b/g, 'do not'],
  [/\bi'm\b/g, 'i am'],
  [/\bim\b/g, 'i am'],
  [/\bi've\b/g, 'i have'],
  [/\bi'll\b/g, 'i will'],
  [/\bi'd\b/g, 'i would'],
  [/\byou're\b/g, 'you are'],
  [/\byoure\b/g, 'you are'],
  [/\byou've\b/g, 'you have'],
  [/\byou'll\b/g, 'you will'],
  [/\bwe're\b/g, 'we are'],
  [/\bwe've\b/g, 'we have'],
  [/\bthey're\b/g, 'they are'],
  [/\bit's\b/g, 'it is'],
  [/\bits\b/g, 'it is'],
  [/\bthat's\b/g, 'that is'],
  [/\bwhat's\b/g, 'what is'],
  [/\bhere's\b/g, 'here is'],
  [/\bthere's\b/g, 'there is'],
  [/\blet's\b/g, 'let us'],
];

/** Apostrophe variants folded to a plain ASCII apostrophe before contraction handling. */
const APOSTROPHES = /[\u2018\u2019\u201B\u02BC\uFF07]/g;

/** Devanagari digits -> ASCII digits, so "०" and "0" match. */
const DEVANAGARI_DIGITS: Record<string, string> = {
  '\u0966': '0',
  '\u0967': '1',
  '\u0968': '2',
  '\u0969': '3',
  '\u096A': '4',
  '\u096B': '5',
  '\u096C': '6',
  '\u096D': '7',
  '\u096E': '8',
  '\u096F': '9',
};

export function containsDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

/**
 * Normalise text for matching.
 *
 * Order matters: NFKC first (folds compatibility forms), then apostrophes, then
 * contractions, then punctuation removal, then whitespace collapsing.
 *
 * **Devanagari is preserved, including combining marks.** The character class below keeps
 * `\p{L}` (letters), `\p{M}` (marks — this is the part that matters), `\p{N}` (digits) and
 * whitespace. `\p{M}` is not optional: Devanagari vowel signs (मात्रा) are category Mc and
 * the nukta is category Mn, so a class of only `\p{L}\p{N}\s` would silently delete them.
 * That would turn `मुझे पानी चाहिए` into `म झ प न च ह ए` — destroying the words and making
 * unrelated Hindi phrases collide into the same consonant skeleton.
 *
 * The danda `।` (U+0964) is category Po, so it is still stripped, which is what we want
 * because every phrase in `data/phrases.json` ends with one.
 *
 * NFKC does *not* merge `हाँ` and `हां`: the candrabindu U+0901 is preserved by
 * normalisation here, so the two remain distinct. Both spellings appear as aliases in
 * `data/phrases.json` precisely so either one matches.
 */
export function normaliseText(input: string): string {
  if (!input) return '';
  let text = input.normalize('NFKC').toLowerCase();
  text = text.replace(APOSTROPHES, "'");
  text = text.replace(/[०-९]/g, (digit) => DEVANAGARI_DIGITS[digit] ?? digit);
  for (const [pattern, replacement] of CONTRACTIONS) {
    text = text.replace(pattern, replacement);
  }
  // Keep letters (any script), combining marks, digits and whitespace; everything else
  // becomes a space.
  text = text.replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

function tokenise(normalised: string): string[] {
  return normalised.length === 0 ? [] : normalised.split(' ');
}

/** Sørensen-Dice coefficient over token sets; deterministic and explainable. */
function diceCoefficient(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;
  return (2 * shared) / (setA.size + setB.size);
}

export type MatchMethod = 'exact' | 'alias' | 'contains' | 'fuzzy' | 'none';

export interface PhraseMatch {
  matched: boolean;
  phrase: Phrase | null;
  method: MatchMethod;
  /** 0..1; 1 for exact and alias matches. */
  score: number;
  /** Best near-misses, for the "did you mean" list. */
  candidates: Array<{ phrase: Phrase; score: number }>;
  /** The normalised form of the input, useful for debugging and for the UI. */
  normalisedInput: string;
}

export interface MatchOptions {
  /** Include `draft`/`unverified` phrases in the candidate set. Default: false. */
  includeUnverified?: boolean;
  /** Minimum Dice score to accept a fuzzy match. */
  fuzzyThreshold?: number;
  /** Maximum number of near-miss candidates to return. */
  maxCandidates?: number;
}

interface IndexedPhrase {
  phrase: Phrase;
  forms: Array<{ text: string; kind: 'primary' | 'alias'; language: 'en' | 'hi' }>;
  primaryNormalised: string;
  tokenSets: string[][];
}

/** Pre-compute the search index once per phrase list. */
export function buildPhraseIndex(phrases: Phrase[]): IndexedPhrase[] {
  return phrases.map((phrase) => {
    const forms: IndexedPhrase['forms'] = [];
    const push = (text: string, kind: 'primary' | 'alias', language: 'en' | 'hi') => {
      const trimmed = text?.trim();
      if (trimmed) forms.push({ text: trimmed, kind, language });
    };

    push(phrase.textEn, 'primary', 'en');
    push(phrase.textHi, 'primary', 'hi');
    for (const alias of phrase.aliasesEn) push(alias, 'alias', 'en');
    for (const alias of phrase.aliasesHi) push(alias, 'alias', 'hi');

    const primaryNormalised = normaliseText(phrase.textEn);
    return {
      phrase,
      forms,
      primaryNormalised,
      tokenSets: forms.map((form) => tokenise(normaliseText(form.text))),
    };
  });
}

export interface PhraseMatcher {
  match(input: string, options?: MatchOptions): PhraseMatch;
  /** All phrases in the index, for the phrase board. */
  all(): Phrase[];
  /** Phrases that are expert-verified and therefore safe to show to a deaf user. */
  verified(): Phrase[];
}

export function createPhraseMatcher(phrases: Phrase[]): PhraseMatcher {
  const index = buildPhraseIndex(phrases);

  function eligible(options: MatchOptions): IndexedPhrase[] {
    if (options.includeUnverified) return index;
    return index.filter((entry) => entry.phrase.validation.status === 'expert_verified');
  }

  function match(input: string, options: MatchOptions = {}): PhraseMatch {
    const {
      includeUnverified = false,
      fuzzyThreshold = 0.7,
      maxCandidates = 3,
    } = options;

    const normalisedInput = normaliseText(input);
    if (normalisedInput.length === 0) {
      return {
        matched: false,
        phrase: null,
        method: 'none',
        score: 0,
        candidates: [],
        normalisedInput,
      };
    }

    const pool = eligible({ includeUnverified });
    const inputTokens = tokenise(normalisedInput);

    // 1. Exact match against the phrase text or one of its aliases.
    for (const entry of pool) {
      for (let i = 0; i < entry.forms.length; i += 1) {
        const form = entry.forms[i];
        if (!form) continue;
        if (normaliseText(form.text) === normalisedInput) {
          return {
            matched: true,
            phrase: entry.phrase,
            method: form.kind === 'primary' ? 'exact' : 'alias',
            score: 1,
            candidates: [],
            normalisedInput,
          };
        }
      }
    }

    // 2. Containment: the user said something that includes the whole phrase
    //    ("doctor, where does it hurt?"), or the phrase contains the whole input.
    let bestContainment: { entry: IndexedPhrase; score: number } | null = null;
    for (const entry of pool) {
      for (let i = 0; i < entry.forms.length; i += 1) {
        const form = entry.forms[i];
        if (!form) continue;
        const formNormalised = normaliseText(form.text);
        if (formNormalised.length < 3) continue;
        const isSubstring =
          normalisedInput.includes(` ${formNormalised} `) ||
          normalisedInput.startsWith(`${formNormalised} `) ||
          normalisedInput.endsWith(` ${formNormalised}`) ||
          normalisedInput === formNormalised ||
          formNormalised.includes(` ${normalisedInput} `) ||
          formNormalised.startsWith(`${normalisedInput} `) ||
          formNormalised.endsWith(` ${normalisedInput}`);

        if (!isSubstring) continue;

        const shorter = Math.min(normalisedInput.length, formNormalised.length);
        const longer = Math.max(normalisedInput.length, formNormalised.length);
        const score = longer === 0 ? 0 : shorter / longer;
        if (!bestContainment || score > bestContainment.score) {
          bestContainment = { entry, score };
        }
      }
    }
    if (bestContainment && bestContainment.score >= 0.6) {
      return {
        matched: true,
        phrase: bestContainment.entry.phrase,
        method: 'contains',
        score: Number(bestContainment.score.toFixed(4)),
        candidates: [],
        normalisedInput,
      };
    }

    // 3. Fuzzy: token overlap. Deliberately conservative — a wrong clip shown as
    //    "the ISL sign for X" is worse than showing text (risk R4).
    const scored = pool
      .map((entry) => {
        let best = 0;
        for (const tokens of entry.tokenSets) {
          const score = diceCoefficient(inputTokens, tokens);
          if (score > best) best = score;
        }
        return { phrase: entry.phrase, score: Number(best.toFixed(4)) };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best && best.score >= fuzzyThreshold) {
      return {
        matched: true,
        phrase: best.phrase,
        method: 'fuzzy',
        score: best.score,
        candidates: scored.slice(1, 1 + maxCandidates),
        normalisedInput,
      };
    }

    return {
      matched: false,
      phrase: null,
      method: 'none',
      score: best?.score ?? 0,
      candidates: scored.slice(0, maxCandidates),
      normalisedInput,
    };
  }

  return {
    match,
    all: () => index.map((entry) => entry.phrase),
    verified: () =>
      index
        .filter((entry) => entry.phrase.validation.status === 'expert_verified')
        .map((entry) => entry.phrase),
  };
}

/** Human-readable label for a match method, shown to the hearing user. */
export const MATCH_METHOD_LABEL: Record<MatchMethod, string> = {
  exact: 'Exact phrase match',
  alias: 'Matched a known wording',
  contains: 'Matched within your sentence',
  fuzzy: 'Closest phrase in the list',
  none: 'No matching phrase',
};

/** The exact wording required by FR-VIS-03 when nothing matches. */
export const NO_VERIFIED_CLIP_MESSAGE = 'No verified ISL video for this phrase';
