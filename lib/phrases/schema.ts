/**
 * Runtime schema validation for `data/phrases.json`.
 *
 * Validation runs in three places:
 *   1. `tests/phrases-schema.test.ts` — CI gate (T-PHR-06).
 *   2. `lib/phrases/data.ts` at module load — malformed entries are dropped rather than
 *      rendered, so a bad data edit can never produce a broken screen.
 *   3. The Limitations screen — the supported-phrase list is generated from the same
 *      validated data, so it can never drift from what the app actually offers.
 */

import type {
  ClipReference,
  Phrase,
  PhraseCategory,
  PhraseSpeaker,
  VerificationStatus,
} from '@/lib/types';

export const PHRASE_SCHEMA_VERSION = 1;

export const PHRASE_CATEGORIES: readonly PhraseCategory[] = [
  'pain',
  'symptoms',
  'needs',
  'help',
  'staff_questions',
  'staff_instructions',
  'answers',
];

export const PHRASE_SPEAKERS: readonly PhraseSpeaker[] = ['deaf_user', 'hearing_user', 'both'];

export const CLIP_TYPES: readonly ClipReference['type'][] = ['none', 'file', 'youtube'];

/** FR-HOSP-04: at most 8 emergency buttons. */
export const MAX_EMERGENCY_PHRASES = 8;

export interface PhrasesFile {
  schemaVersion: number;
  vocabularyVersion: string;
  notes: string[];
  phrases: Phrase[];
}

export interface ValidationIssue {
  /** JSON path, e.g. `phrases[3].clip.src`. */
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface PhrasesValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  /** Phrase objects that passed validation, with unknown fields preserved. */
  phrases: Phrase[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function readClip(value: unknown, path: string, issues: ValidationIssue[]): ClipReference {
  if (!isRecord(value)) {
    issues.push({ path, message: 'clip must be an object.', severity: 'error' });
    return { type: 'none', src: '' };
  }
  const type = value.type;
  if (typeof type !== 'string' || !CLIP_TYPES.includes(type as ClipReference['type'])) {
    issues.push({
      path: `${path}.type`,
      message: `clip.type must be one of ${CLIP_TYPES.join(', ')}.`,
      severity: 'error',
    });
    return { type: 'none', src: '' };
  }
  const src = typeof value.src === 'string' ? value.src : '';
  if (type !== 'none' && src.trim().length === 0) {
    issues.push({
      path: `${path}.src`,
      message: `clip.src is required when clip.type is "${type}".`,
      severity: 'error',
    });
  }
  const clip: ClipReference = { type: type as ClipReference['type'], src };
  if (typeof value.startSeconds === 'number') clip.startSeconds = value.startSeconds;
  if (typeof value.endSeconds === 'number') clip.endSeconds = value.endSeconds;
  return clip;
}

/**
 * Accepted spellings of "not verified yet".
 *
 * The documentation is not self-consistent here: `product-requirements.md` FR-HOSP-05 and
 * `technical-architecture.md` §"phrases.json" both specify the status value as `draft`,
 * while FR-HOSP-05 also calls the resulting badge "unverified", and
 * `testing-and-evaluation.md` T-PHR-02 says "`draft` phrases hidden unless setting on".
 *
 * Both are therefore accepted on input and normalised to `unverified`, which is the value
 * that pairs cleanly with `expert_verified` and `rejected`. Rejecting `draft` would mean a
 * contributor who followed the specification exactly gets 49 validation errors and an
 * empty phrase board, which is the worst possible outcome for a hand-edited data file.
 */
const STATUS_ALIASES: Record<string, VerificationStatus> = {
  draft: 'unverified',
  unverified: 'unverified',
  expert_verified: 'expert_verified',
  verified: 'expert_verified',
  rejected: 'rejected',
};

function readValidation(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): Phrase['validation'] {
  if (!isRecord(value)) {
    issues.push({ path, message: 'validation must be an object.', severity: 'error' });
    return { status: 'unverified', verifiedBy: '', verifiedOn: '' };
  }
  const raw = value.status;
  const status =
    typeof raw === 'string' ? STATUS_ALIASES[raw.trim().toLowerCase()] : undefined;
  if (!status) {
    issues.push({
      path: `${path}.status`,
      message: `validation.status must be one of ${Object.keys(STATUS_ALIASES).join(', ')}.`,
      severity: 'error',
    });
    return { status: 'unverified', verifiedBy: '', verifiedOn: '' };
  }
  const verifiedBy = typeof value.verifiedBy === 'string' ? value.verifiedBy : '';
  const verifiedOn = typeof value.verifiedOn === 'string' ? value.verifiedOn : '';

  if (status === 'expert_verified') {
    if (verifiedBy.trim().length === 0) {
      issues.push({
        path: `${path}.verifiedBy`,
        message: 'A named ISL verifier is required for expert_verified phrases (FR-VIS-04).',
        severity: 'error',
      });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(verifiedOn)) {
      issues.push({
        path: `${path}.verifiedOn`,
        message: 'expert_verified phrases need a YYYY-MM-DD verification date (FR-VIS-04).',
        severity: 'error',
      });
    }
  }
  return {
    status,
    verifiedBy,
    verifiedOn,
  };
}

/**
 * Validate the whole phrases file.
 *
 * Returns every issue rather than stopping at the first, so a data editor sees the full
 * list in one CI run.
 */
export function validatePhrasesFile(input: unknown): PhrasesValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [{ path: '$', message: 'The phrases file must be a JSON object.', severity: 'error' }],
      warnings: [],
      phrases: [],
    };
  }

  if (input.schemaVersion !== PHRASE_SCHEMA_VERSION) {
    issues.push({
      path: '$.schemaVersion',
      message: `Expected schemaVersion ${PHRASE_SCHEMA_VERSION}, found ${String(input.schemaVersion)}.`,
      severity: 'error',
    });
  }

  if (!Array.isArray(input.phrases)) {
    issues.push({ path: '$.phrases', message: 'phrases must be an array.', severity: 'error' });
    return { ok: false, errors: issues, warnings: [], phrases: [] };
  }

  const seenIds = new Map<string, number>();
  const phrases: Phrase[] = [];

  input.phrases.forEach((raw, index) => {
    const path = `phrases[${index}]`;
    if (!isRecord(raw)) {
      issues.push({ path, message: 'Each phrase must be an object.', severity: 'error' });
      return;
    }

    const id = typeof raw.id === 'string' ? raw.id : '';
    if (!/^[a-z0-9_]+$/.test(id)) {
      issues.push({
        path: `${path}.id`,
        message: 'id must be non-empty and contain only lowercase letters, digits and underscores.',
        severity: 'error',
      });
    } else if (seenIds.has(id)) {
      issues.push({
        path: `${path}.id`,
        message: `Duplicate id "${id}" (already used by phrases[${seenIds.get(id)}]).`,
        severity: 'error',
      });
    } else {
      seenIds.set(id, index);
    }

    const category = raw.category;
    if (typeof category !== 'string' || !PHRASE_CATEGORIES.includes(category as PhraseCategory)) {
      issues.push({
        path: `${path}.category`,
        message: `category must be one of ${PHRASE_CATEGORIES.join(', ')}.`,
        severity: 'error',
      });
    }

    const speaker = raw.speaker;
    if (typeof speaker !== 'string' || !PHRASE_SPEAKERS.includes(speaker as PhraseSpeaker)) {
      issues.push({
        path: `${path}.speaker`,
        message: `speaker must be one of ${PHRASE_SPEAKERS.join(', ')}.`,
        severity: 'error',
      });
    }

    const textEn = typeof raw.textEn === 'string' ? raw.textEn.trim() : '';
    if (textEn.length === 0) {
      issues.push({ path: `${path}.textEn`, message: 'textEn must not be empty.', severity: 'error' });
    }

    const textHi = typeof raw.textHi === 'string' ? raw.textHi.trim() : '';
    if (textHi.length === 0) {
      issues.push({
        path: `${path}.textHi`,
        message: 'textHi is missing; the phrase will only be available in English.',
        severity: 'warning',
      });
    }

    const clip = readClip(raw.clip, `${path}.clip`, issues);
    const validation = readValidation(raw.validation, `${path}.validation`, issues);

    // FR-VIS-01 / T-PHR-01: a phrase advertised as verified must have something to play.
    if (validation.status === 'expert_verified' && clip.type === 'none') {
      issues.push({
        path: `${path}.clip`,
        message:
          'expert_verified phrases must reference a clip, otherwise the app promises a video it cannot show (FR-VIS-01).',
        severity: 'error',
      });
    }

    // FR-VIS-01: only expert_verified clips are shown by default, so a draft clip is
    // allowed but must never be presented as verified.
    if (clip.type !== 'none' && validation.status !== 'expert_verified') {
      issues.push({
        path: `${path}.validation.status`,
        message:
          'This phrase has a clip but is not expert_verified. It will be hidden by default and shown with an UNVERIFIED badge.',
        severity: 'warning',
      });
    }

    const islGloss = typeof raw.islGloss === 'string' ? raw.islGloss.trim() : '';
    if (islGloss.length > 0 && validation.status !== 'expert_verified') {
      issues.push({
        path: `${path}.islGloss`,
        message:
          'An ISL gloss is only meaningful once an ISL signer has confirmed the form; leave it empty for draft phrases.',
        severity: 'warning',
      });
    }

    // Spread the raw entry first, then overwrite every known field with its normalised
    // value. That keeps unknown fields from a newer data file (they survive a round trip
    // and an older build does not silently drop them) while guaranteeing that every field
    // the app reads has been validated and coerced.
    const phrase: Phrase = {
      ...(raw as unknown as Phrase),
      id,
      category: (category as PhraseCategory) ?? 'answers',
      speaker: (speaker as PhraseSpeaker) ?? 'both',
      textEn,
      textHi,
      aliasesEn: asStringArray(raw.aliasesEn),
      aliasesHi: asStringArray(raw.aliasesHi),
      islGloss,
      clip,
      validation,
      licence: typeof raw.licence === 'string' ? raw.licence : '',
      attribution: typeof raw.attribution === 'string' ? raw.attribution : '',
      emergency: raw.emergency === true,
      order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : index,
      caption: typeof raw.caption === 'string' ? raw.caption : '',
    };

    phrases.push(phrase);
  });

  const emergencyCount = phrases.filter((phrase) => phrase.emergency).length;
  if (emergencyCount > MAX_EMERGENCY_PHRASES) {
    issues.push({
      path: '$.phrases',
      message: `${emergencyCount} phrases are flagged for Emergency mode but the maximum is ${MAX_EMERGENCY_PHRASES} (FR-HOSP-04).`,
      severity: 'error',
    });
  }
  if (emergencyCount === 0) {
    issues.push({
      path: '$.phrases',
      message: 'No phrase is flagged for Emergency mode; the emergency board would be empty.',
      severity: 'warning',
    });
  }

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');

  return { ok: errors.length === 0, errors, warnings, phrases };
}

/** Convenience for tests and scripts: validate and throw with a readable message. */
export function assertPhrasesFile(input: unknown): PhrasesFile {
  const result = validatePhrasesFile(input);
  if (!result.ok) {
    const detail = result.errors.map((issue) => `  - ${issue.path}: ${issue.message}`).join('\n');
    throw new Error(`phrases.json failed validation:\n${detail}`);
  }
  const file = input as Record<string, unknown>;
  return {
    schemaVersion: Number(file.schemaVersion),
    vocabularyVersion: typeof file.vocabularyVersion === 'string' ? file.vocabularyVersion : '',
    notes: asStringArray(file.notes),
    phrases: result.phrases,
  };
}
