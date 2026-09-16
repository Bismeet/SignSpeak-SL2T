/**
 * Schema validation unit tests (T-PHR-06).
 *
 * These use synthetic inputs, not the real file. The real file is asserted separately in
 * `phrases-data.test.ts`; here the goal is to prove the validator actually rejects the
 * things it claims to reject. A validator that only ever sees good data is untested.
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_EMERGENCY_PHRASES,
  PHRASE_CATEGORIES,
  assertPhrasesFile,
  validatePhrasesFile,
} from '@/lib/phrases/schema';

function phrase(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'p_test',
    category: 'pain',
    speaker: 'deaf_user',
    textEn: 'I have pain here.',
    textHi: 'मुझे यहाँ दर्द है।',
    aliasesEn: ['it hurts here'],
    aliasesHi: [],
    islGloss: '',
    clip: { type: 'none', src: '' },
    validation: { status: 'unverified', verifiedBy: '', verifiedOn: '' },
    licence: '',
    attribution: '',
    emergency: false,
    order: 1,
    caption: '',
    ...overrides,
  };
}

function file(phrases: unknown[]): Record<string, unknown> {
  return { schemaVersion: 1, vocabularyVersion: 'ss-phrases-v1', notes: [], phrases };
}

function errorPaths(input: unknown): string[] {
  return validatePhrasesFile(input).errors.map((issue) => issue.path);
}

describe('accepting valid input', () => {
  it('accepts a minimal valid file', () => {
    const result = validatePhrasesFile(file([phrase(), phrase({ id: 'p_other', emergency: true })]));
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.phrases).toHaveLength(2);
  });

  it('preserves unknown extra fields on a phrase', () => {
    const result = validatePhrasesFile(file([phrase({ futureField: 'kept' })]));
    const entry = result.phrases[0] as unknown as Record<string, unknown>;
    expect(entry.futureField).toBe('kept');
  });

  it('defaults a missing order to the array index', () => {
    const result = validatePhrasesFile(file([phrase({ order: undefined }), phrase({ id: 'b', order: undefined })]));
    expect(result.phrases[0]?.order).toBe(0);
    expect(result.phrases[1]?.order).toBe(1);
  });

  it('treats emergency as strictly boolean', () => {
    const result = validatePhrasesFile(file([phrase({ emergency: 'yes' })]));
    expect(result.phrases[0]?.emergency).toBe(false);
  });
});

describe('rejecting a malformed file', () => {
  it('rejects a non-object', () => {
    for (const input of [null, 42, 'nope', []]) {
      expect(validatePhrasesFile(input).ok).toBe(false);
    }
  });

  it('rejects a wrong schema version', () => {
    expect(errorPaths({ schemaVersion: 2, phrases: [] })).toContain('$.schemaVersion');
  });

  it('rejects a missing phrases array', () => {
    expect(errorPaths({ schemaVersion: 1 })).toContain('$.phrases');
  });

  it('rejects a non-object phrase', () => {
    expect(errorPaths(file(['nope']))).toContain('phrases[0]');
  });
});

describe('id rules', () => {
  it('rejects an uppercase or hyphenated id', () => {
    expect(errorPaths(file([phrase({ id: 'P-Test' })]))).toContain('phrases[0].id');
    expect(errorPaths(file([phrase({ id: 'p-test' })]))).toContain('phrases[0].id');
    expect(errorPaths(file([phrase({ id: '' })]))).toContain('phrases[0].id');
  });

  it('rejects a duplicate id and names the earlier one', () => {
    const result = validatePhrasesFile(file([phrase({ id: 'dup' }), phrase({ id: 'dup' })]));
    const issue = result.errors.find((entry) => entry.path === 'phrases[1].id');
    expect(issue?.message).toContain('Duplicate');
    expect(issue?.message).toContain('phrases[0]');
  });

  it('accepts digits and underscores', () => {
    expect(errorPaths(file([phrase({ id: 'p_pain_2' })]))).not.toContain('phrases[0].id');
  });
});

describe('category and speaker rules', () => {
  it('rejects an unknown category', () => {
    expect(errorPaths(file([phrase({ category: 'feelings' })]))).toContain('phrases[0].category');
  });

  it('accepts every documented category', () => {
    for (const category of PHRASE_CATEGORIES) {
      expect(errorPaths(file([phrase({ category })]))).not.toContain('phrases[0].category');
    }
  });

  it('rejects an unknown speaker', () => {
    expect(errorPaths(file([phrase({ speaker: 'nurse' })]))).toContain('phrases[0].speaker');
  });
});

describe('text rules', () => {
  it('rejects an empty textEn', () => {
    expect(errorPaths(file([phrase({ textEn: '   ' })]))).toContain('phrases[0].textEn');
  });

  it('warns, but does not fail, on a missing textHi', () => {
    const result = validatePhrasesFile(file([phrase({ textHi: '' })]));
    expect(result.ok).toBe(true);
    expect(result.warnings.map((issue) => issue.path)).toContain('phrases[0].textHi');
  });

  it('drops non-string aliases instead of using them', () => {
    const result = validatePhrasesFile(file([phrase({ aliasesEn: ['ok', 42, null] })]));
    expect(result.phrases[0]?.aliasesEn).toEqual(['ok']);
  });
});

describe('clip rules', () => {
  it('rejects a clip that is not an object', () => {
    expect(errorPaths(file([phrase({ clip: 'nope' })]))).toContain('phrases[0].clip');
  });

  it('rejects an unknown clip type', () => {
    expect(errorPaths(file([phrase({ clip: { type: 'gif', src: 'x.gif' } })]))).toContain(
      'phrases[0].clip.type',
    );
  });

  it('rejects a file clip with no src', () => {
    expect(errorPaths(file([phrase({ clip: { type: 'file', src: '' } })]))).toContain(
      'phrases[0].clip.src',
    );
  });

  it('rejects an expert_verified phrase with no clip (FR-VIS-01)', () => {
    // This is the invariant that stops the app promising a video it cannot show.
    const result = validatePhrasesFile(
      file([
        phrase({
          validation: { status: 'expert_verified', verifiedBy: 'A Signer', verifiedOn: '2026-01-01' },
          clip: { type: 'none', src: '' },
        }),
      ]),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.map((issue) => issue.path)).toContain('phrases[0].clip');
  });

  it('warns when a clip exists but the phrase is not verified', () => {
    const result = validatePhrasesFile(
      file([phrase({ clip: { type: 'file', src: 'pain-here.mp4' } })]),
    );
    expect(result.ok).toBe(true);
    expect(result.warnings.map((issue) => issue.path)).toContain('phrases[0].validation.status');
  });

  it('keeps optional clip offsets', () => {
    const result = validatePhrasesFile(
      file([phrase({ clip: { type: 'youtube', src: 'abcdefghijk', startSeconds: 4, endSeconds: 12 } })]),
    );
    expect(result.phrases[0]?.clip.startSeconds).toBe(4);
    expect(result.phrases[0]?.clip.endSeconds).toBe(12);
  });

  it('ignores non-numeric offsets', () => {
    const result = validatePhrasesFile(
      file([phrase({ clip: { type: 'file', src: 'x.mp4', startSeconds: 'soon' } })]),
    );
    expect(result.phrases[0]?.clip.startSeconds).toBeUndefined();
  });
});

describe('verification rules (FR-VIS-04)', () => {
  it('rejects an unknown validation status', () => {
    expect(errorPaths(file([phrase({ validation: { status: 'maybe' } })]))).toContain(
      'phrases[0].validation.status',
    );
  });

  it('accepts the "draft" spelling the documentation specifies, normalising it', () => {
    // product-requirements.md FR-HOSP-05 and technical-architecture.md both document the
    // status value as `draft`. A contributor following the spec must not get 49 errors and
    // an empty phrase board.
    const result = validatePhrasesFile(file([phrase({ validation: { status: 'draft' } })]));
    expect(result.errors).toEqual([]);
    expect(result.phrases[0]?.validation.status).toBe('unverified');
  });

  it('accepts "draft" case-insensitively and with surrounding whitespace', () => {
    const result = validatePhrasesFile(
      file([phrase({ validation: { status: '  Draft ' } })]),
    );
    expect(result.errors).toEqual([]);
    expect(result.phrases[0]?.validation.status).toBe('unverified');
  });

  it('normalises "verified" to expert_verified', () => {
    const result = validatePhrasesFile(
      file([
        phrase({
          validation: { status: 'verified', verifiedBy: 'A Signer', verifiedOn: '2026-01-01' },
          clip: { type: 'file', src: 'x.mp4' },
        }),
      ]),
    );
    expect(result.errors).toEqual([]);
    expect(result.phrases[0]?.validation.status).toBe('expert_verified');
  });

  it('keeps a draft phrase visible to the app rather than dropping it', () => {
    const result = validatePhrasesFile(file([phrase({ validation: { status: 'draft' } })]));
    expect(result.phrases).toHaveLength(1);
  });

  it('rejects expert_verified with no named verifier', () => {
    const result = validatePhrasesFile(
      file([
        phrase({
          validation: { status: 'expert_verified', verifiedBy: '  ', verifiedOn: '2026-01-01' },
          clip: { type: 'file', src: 'x.mp4' },
        }),
      ]),
    );
    expect(result.errors.map((issue) => issue.path)).toContain('phrases[0].validation.verifiedBy');
  });

  it('rejects expert_verified with a malformed date', () => {
    const result = validatePhrasesFile(
      file([
        phrase({
          validation: { status: 'expert_verified', verifiedBy: 'A Signer', verifiedOn: '1 Jan 2026' },
          clip: { type: 'file', src: 'x.mp4' },
        }),
      ]),
    );
    expect(result.errors.map((issue) => issue.path)).toContain('phrases[0].validation.verifiedOn');
  });

  it('accepts a fully specified verified phrase', () => {
    const result = validatePhrasesFile(
      file([
        phrase({
          validation: { status: 'expert_verified', verifiedBy: 'A Signer', verifiedOn: '2026-01-01' },
          clip: { type: 'file', src: 'pain-here.mp4' },
          licence: 'own-recording',
          attribution: 'Recorded for SignSpeak',
        }),
      ]),
    );
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('warns when an unverified phrase carries an ISL gloss', () => {
    const result = validatePhrasesFile(file([phrase({ islGloss: 'PAIN HERE' })]));
    expect(result.warnings.map((issue) => issue.path)).toContain('phrases[0].islGloss');
  });

  it('accepts an ISL gloss on a verified phrase', () => {
    const result = validatePhrasesFile(
      file([
        phrase({
          islGloss: 'PAIN HERE',
          validation: { status: 'expert_verified', verifiedBy: 'A Signer', verifiedOn: '2026-01-01' },
          clip: { type: 'file', src: 'x.mp4' },
        }),
      ]),
    );
    expect(result.errors).toEqual([]);
  });
});

describe('emergency rules (FR-HOSP-04)', () => {
  it('rejects more than the documented maximum', () => {
    const phrases = Array.from({ length: MAX_EMERGENCY_PHRASES + 1 }, (_, index) =>
      phrase({ id: `p_${index}`, emergency: true }),
    );
    const result = validatePhrasesFile(file(phrases));
    expect(result.ok).toBe(false);
    expect(result.errors.some((issue) => issue.path === '$.phrases')).toBe(true);
  });

  it('accepts exactly the documented maximum', () => {
    const phrases = Array.from({ length: MAX_EMERGENCY_PHRASES }, (_, index) =>
      phrase({ id: `p_${index}`, emergency: true }),
    );
    expect(validatePhrasesFile(file(phrases)).ok).toBe(true);
  });

  it('warns when nothing is flagged for Emergency mode', () => {
    const result = validatePhrasesFile(file([phrase()]));
    expect(result.ok).toBe(true);
    expect(result.warnings.some((issue) => issue.message.includes('Emergency mode'))).toBe(true);
  });
});

describe('error reporting', () => {
  it('returns every error rather than stopping at the first', () => {
    const result = validatePhrasesFile(
      file([
        phrase({ id: 'BAD-ID', category: 'nope', speaker: 'nope' }),
        phrase({ id: 'also-bad', textEn: '' }),
      ]),
    );
    expect(result.errors.length).toBeGreaterThanOrEqual(5);
  });

  it('separates errors from warnings', () => {
    const result = validatePhrasesFile(file([phrase({ textHi: '', islGloss: 'X' })]));
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    expect(result.ok).toBe(true);
  });

  it('assertPhrasesFile throws with a readable message', () => {
    expect(() => assertPhrasesFile(file([phrase({ id: 'BAD' })]))).toThrow(/phrases\.json failed validation/);
  });

  it('assertPhrasesFile returns a typed file on success', () => {
    const result = assertPhrasesFile(file([phrase({ emergency: true })]));
    expect(result.schemaVersion).toBe(1);
    expect(result.phrases).toHaveLength(1);
    expect(result.phrases[0]?.textEn).toBe('I have pain here.');
  });
});
