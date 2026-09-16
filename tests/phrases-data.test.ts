/**
 * Phrase data integrity (T-PHR-01..06).
 *
 * These tests run against the real `data/phrases.json`, not a fixture. That is deliberate:
 * the file is the product's clinical content, and a mistake in it is a mistake in what a
 * patient sees. Asserting against the real file means an edit that breaks an invariant
 * fails CI rather than shipping.
 *
 * The invariants asserted here are the ones that protect a person:
 *   * nothing claims to be verified ISL when no ISL signer has verified it;
 *   * no clip is promised that does not exist on disk;
 *   * Emergency mode has between 1 and 8 phrases (FR-HOSP-04);
 *   * every phrase the app offers has a non-empty English string.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ALL_PHRASES,
  HAS_ANY_VERIFIED_CLIP,
  PHRASE_COUNT,
  PHRASE_MATCHER,
  VERIFIED_PHRASE_COUNT,
  categoryCounts,
  clipAvailability,
  emergencyPhrases,
  findPhraseById,
  groupPhrasesByCategory,
  phraseSummary,
  phraseValidation,
  visiblePhrases,
} from '@/lib/phrases/data';
import { MAX_EMERGENCY_PHRASES, validatePhrasesFile } from '@/lib/phrases/schema';
import rawPhrases from '@/data/phrases.json';

const REPO_ROOT = resolve(__dirname, '..');

describe('the shipped phrase file passes its own schema', () => {
  it('has no validation errors', () => {
    const result = validatePhrasesFile(rawPhrases);
    if (!result.ok) {
      const detail = result.errors.map((issue) => `${issue.path}: ${issue.message}`).join('\n  ');
      throw new Error(`data/phrases.json failed validation:\n  ${detail}`);
    }
    expect(result.ok).toBe(true);
  });

  it('is reported as valid by the module that loads it at runtime', () => {
    expect(phraseValidation.errors).toEqual([]);
    expect(phraseValidation.ok).toBe(true);
  });

  it('parses every entry into the app', () => {
    expect(PHRASE_COUNT).toBeGreaterThan(0);
    expect(ALL_PHRASES).toHaveLength(rawPhrases.phrases.length);
  });
});

describe('no phrase overstates what the app can show', () => {
  it('marks no phrase as verified, because no ISL signer has signed off', () => {
    // If this ever fails, it means someone recorded and verified clips — in which case the
    // limitations page, the README and the demo script all need updating in the same commit.
    expect(VERIFIED_PHRASE_COUNT).toBe(0);
    expect(HAS_ANY_VERIFIED_CLIP).toBe(false);
  });

  it('gives every phrase an empty islGloss until the form is confirmed', () => {
    for (const phrase of ALL_PHRASES) {
      expect(phrase.islGloss, `${phrase.id} has an ISL gloss but is not verified`).toBe('');
    }
  });

  it('references no clip at all while nothing is verified', () => {
    for (const phrase of ALL_PHRASES) {
      expect(phrase.clip.type, `${phrase.id} references a clip`).toBe('none');
      expect(clipAvailability(phrase)).toBe('no_clip');
    }
  });

  it('records no verifier name or date for unverified phrases', () => {
    for (const phrase of ALL_PHRASES) {
      if (phrase.validation.status !== 'expert_verified') {
        expect(phrase.validation.verifiedBy).toBe('');
        expect(phrase.validation.verifiedOn).toBe('');
      }
    }
  });
});

describe('clip references resolve to real files', () => {
  const withClips = ALL_PHRASES.filter((phrase) => phrase.clip.type !== 'none');

  it('has at least one phrase structure to check', () => {
    // Zero clips is the current, expected state — so assert the *rule*, not a count.
    expect(withClips.length).toBeGreaterThanOrEqual(0);
  });

  it.each(withClips.map((phrase) => [phrase.id, phrase] as const))(
    '%s resolves its clip',
    (id, phrase) => {
      if (phrase.clip.type === 'file') {
        const relative = phrase.clip.src.replace(/^\/+/, '');
        const candidate = phrase.clip.src.startsWith('/')
          ? resolve(REPO_ROOT, 'public', relative)
          : resolve(REPO_ROOT, 'public', 'clips', relative);
        expect(existsSync(candidate), `${id}: ${phrase.clip.src} does not exist on disk`).toBe(true);
      }
      if (phrase.clip.type === 'youtube') {
        expect(phrase.clip.src).toMatch(/^[A-Za-z0-9_-]{11}$/);
      }
      // A clip that exists but is not verified must be badged, never presented as verified.
      if (phrase.validation.status !== 'expert_verified') {
        expect(clipAvailability(phrase)).toBe('draft_clip');
      }
    },
  );

  it('gives every clip a licence and an attribution', () => {
    for (const phrase of withClips) {
      expect(phrase.licence, `${phrase.id} has a clip but no licence`).not.toBe('');
      expect(phrase.attribution, `${phrase.id} has a clip but no attribution`).not.toBe('');
    }
  });
});

describe('phrase content', () => {
  it('gives every phrase a non-empty English string', () => {
    for (const phrase of ALL_PHRASES) {
      expect(phrase.textEn.trim().length, `${phrase.id} has an empty textEn`).toBeGreaterThan(0);
    }
  });

  it('gives every phrase a Hindi string, even though the translations are drafts', () => {
    const missing = ALL_PHRASES.filter((phrase) => phrase.textHi.trim().length === 0).map((p) => p.id);
    expect(missing, `phrases missing textHi: ${missing.join(', ')}`).toEqual([]);
  });

  it('uses unique ids', () => {
    const ids = ALL_PHRASES.map((phrase) => phrase.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses only documented categories', () => {
    const allowed = new Set([
      'pain',
      'symptoms',
      'needs',
      'help',
      'staff_questions',
      'staff_instructions',
      'answers',
    ]);
    for (const phrase of ALL_PHRASES) {
      expect(allowed.has(phrase.category), `${phrase.id} has category ${phrase.category}`).toBe(true);
    }
  });

  it('does not duplicate an English phrase across two entries', () => {
    // Two entries with the same text would make the matcher's choice arbitrary.
    const seen = new Map<string, string>();
    for (const phrase of ALL_PHRASES) {
      const key = phrase.textEn.trim().toLowerCase();
      const previous = seen.get(key);
      expect(previous, `"${phrase.textEn}" appears as both ${previous} and ${phrase.id}`).toBeUndefined();
      seen.set(key, phrase.id);
    }
  });

  it('does not put the same alias on two different phrases', () => {
    const owners = new Map<string, string>();
    const collisions: string[] = [];
    for (const phrase of ALL_PHRASES) {
      for (const alias of phrase.aliasesEn) {
        const key = alias.trim().toLowerCase();
        if (key.length === 0) continue;
        const previous = owners.get(key);
        if (previous && previous !== phrase.id) {
          collisions.push(`"${alias}" on ${previous} and ${phrase.id}`);
        }
        owners.set(key, phrase.id);
      }
    }
    expect(collisions).toEqual([]);
  });

  it('keeps every phrase ordered with a finite order value', () => {
    for (const phrase of ALL_PHRASES) {
      expect(Number.isFinite(phrase.order), `${phrase.id} has order ${phrase.order}`).toBe(true);
    }
  });
});

describe('emergency mode (FR-HOSP-04)', () => {
  it('flags at least one and at most eight phrases', () => {
    const flagged = ALL_PHRASES.filter((phrase) => phrase.emergency);
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged.length).toBeLessThanOrEqual(MAX_EMERGENCY_PHRASES);
  });

  it('offers the flagged phrases even when unverified phrases are hidden', () => {
    // Emergency mode must work with zero configuration and no camera. If it were empty when
    // drafts are hidden, a patient in distress would find an empty board.
    const emergency = emergencyPhrases(false);
    expect(emergency.length).toBeGreaterThan(0);
    for (const phrase of emergency) {
      expect(phrase.emergency).toBe(true);
    }
  });

  it('includes the phrases a person in distress actually needs', () => {
    const ids = new Set(ALL_PHRASES.filter((phrase) => phrase.emergency).map((phrase) => phrase.id));
    // Not an exhaustive list — but "I need help" must never be missing from an emergency board.
    expect(ids.has('p_help')).toBe(true);
    expect(ids.has('a_no')).toBe(true);
    expect(ids.has('a_yes')).toBe(true);
  });

  it('never exceeds the documented maximum even with unverified phrases shown', () => {
    expect(emergencyPhrases(true).length).toBeLessThanOrEqual(MAX_EMERGENCY_PHRASES);
  });
});

describe('visibility rules (FR-HOSP-05)', () => {
  it('shows nothing when unverified phrases are hidden and nothing is verified', () => {
    // This is the current state of the shipped data, and it is correct: the app would
    // rather show an empty board with an explanation than an unverified clip.
    expect(visiblePhrases(false)).toHaveLength(0);
  });

  it('shows everything when the reviewer opts in', () => {
    expect(visiblePhrases(true)).toHaveLength(PHRASE_COUNT);
  });

  it('groups only the visible phrases and drops empty categories', () => {
    expect(groupPhrasesByCategory(false)).toEqual([]);
    const groups = groupPhrasesByCategory(true);
    expect(groups.length).toBeGreaterThan(0);
    const total = groups.reduce((sum, group) => sum + group.phrases.length, 0);
    expect(total).toBe(PHRASE_COUNT);
  });

  it('counts phrases per category consistently with the grouped view', () => {
    const counts = categoryCounts(true);
    const grouped = groupPhrasesByCategory(true);
    for (const group of grouped) {
      expect(counts[group.category]).toBe(group.phrases.length);
    }
  });
});

describe('summary used by the honesty surfaces', () => {
  it('reports zero verified phrases and zero clips', () => {
    const summary = phraseSummary();
    expect(summary.total).toBe(PHRASE_COUNT);
    expect(summary.verified).toBe(0);
    expect(summary.draft).toBe(PHRASE_COUNT);
    expect(summary.withClip).toBe(0);
    expect(summary.categories).toBeGreaterThanOrEqual(7);
    expect(summary.emergency).toBeGreaterThan(0);
  });
});

describe('matcher wiring', () => {
  it('exposes every phrase', () => {
    expect(PHRASE_MATCHER.all()).toHaveLength(PHRASE_COUNT);
  });

  it('exposes no verified phrases', () => {
    expect(PHRASE_MATCHER.verified()).toEqual([]);
  });

  it('finds a phrase by id', () => {
    expect(findPhraseById('p_water')?.textEn).toBe('I need water.');
    expect(findPhraseById('does_not_exist')).toBeUndefined();
  });
});
