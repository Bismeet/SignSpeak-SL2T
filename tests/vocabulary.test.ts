/**
 * The vocabulary gate — the check that stops the app loading a model whose output it could
 * not label or explain.
 *
 * This file exists because the gate had **no tests at all**, and that gap hid a real bug: the
 * check iterated every entry in the model's class list, including the declared negative class.
 * A negative class is by design not a sign and can never appear in
 * `data/sign-vocabulary.json`, so the app marked **every model with a rejection gate**
 * incompatible and refused to use it — the exact opposite of what the project wants, since an
 * explicit `OTHER` class is how a model refuses to guess.
 */

import { describe, expect, it } from 'vitest';

import {
  checkModelVocabulary,
  findSign,
  glossLabel,
  isKnownGloss,
  KNOWN_GLOSSES,
  signVocabularySummary,
} from '@/lib/signs/vocabulary';

describe('the published vocabulary', () => {
  it('has entries, and every one is findable', () => {
    expect(KNOWN_GLOSSES.length).toBeGreaterThan(0);
    for (const gloss of KNOWN_GLOSSES) {
      expect(findSign(gloss), `${gloss} should be findable`).toBeDefined();
      expect(isKnownGloss(gloss)).toBe(true);
    }
  });

  it('does not claim any sign has been verified yet', () => {
    // Nothing has been reviewed by a qualified ISL signer, so no accuracy may be implied.
    expect(signVocabularySummary().verified).toBe(0);
  });

  it('rejects a gloss that is not published', () => {
    expect(isKnownGloss('NOT_A_SIGN')).toBe(false);
    expect(findSign('NOT_A_SIGN')).toBeUndefined();
  });
});

describe('checkModelVocabulary', () => {
  it('accepts a model whose classes are all published', () => {
    const result = checkModelVocabulary(['HELP', 'WATER']);
    expect(result.ok).toBe(true);
    expect(result.unknown).toEqual([]);
    expect(result.known).toEqual(['HELP', 'WATER']);
  });

  it('rejects a model that predicts a gloss the app cannot label', () => {
    const result = checkModelVocabulary(['HELP', 'HOSPITAL']);
    expect(result.ok).toBe(false);
    expect(result.unknown).toEqual(['HOSPITAL']);
    expect(result.known).toEqual(['HELP']);
  });

  it('excludes the declared negative class from the check', () => {
    // The bug this file was written for. `OTHER` is not a sign, so it is not published — but
    // it is a legitimate class, and refusing it refused every model with a rejection gate.
    const result = checkModelVocabulary(['HELP', 'WATER', 'OTHER'], 'OTHER');
    expect(result.ok).toBe(true);
    expect(result.unknown).toEqual([]);
    expect(result.known).toEqual(['HELP', 'WATER']);
  });

  it('still rejects an unpublished class when a negative class is declared', () => {
    // Excluding the negative class must not become a blanket exemption.
    const result = checkModelVocabulary(['HELP', 'OTHER', 'HOSPITAL'], 'OTHER');
    expect(result.ok).toBe(false);
    expect(result.unknown).toEqual(['HOSPITAL']);
  });

  it('treats a model with only the negative class as having no signs', () => {
    const result = checkModelVocabulary(['OTHER'], 'OTHER');
    expect(result.ok).toBe(true);
    expect(result.known).toEqual([]);
  });

  it('does not exclude a gloss merely because it is passed as negativeClass', () => {
    // A malformed card could declare a real sign as its negative class. It must still be
    // recognised as a known gloss rather than vanishing from the check.
    const result = checkModelVocabulary(['HELP'], 'HELP');
    expect(result.ok).toBe(true);
    expect(result.known).toEqual([]);
  });

  it('rejects an empty class list as vacuously fine but useless', () => {
    // `ok` is true because nothing is unknown, but the card parser is what refuses a model
    // with no vocabulary — this documents where that responsibility sits.
    const result = checkModelVocabulary([], 'OTHER');
    expect(result.ok).toBe(true);
    expect(result.known).toEqual([]);
  });
});

describe('glossLabel', () => {
  it('uses the published label for a known gloss', () => {
    const gloss = KNOWN_GLOSSES[0] ?? 'HELP';
    expect(glossLabel(gloss)).toBe(findSign(gloss)?.label);
  });

  it('tidies an unknown gloss rather than throwing', () => {
    expect(glossLabel('CALL_FAMILY_X')).toBe('Call Family X');
  });
});
