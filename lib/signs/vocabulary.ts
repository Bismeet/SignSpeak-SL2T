/**
 * Recognition vocabulary (the sign-to-text input side).
 *
 * Separate from `data/phrases.json` (the output side). Every entry here is
 * `verification: 'unverified'` until an ISL signer confirms the canonical form against
 * the ISLRTC dictionary — see Q1 in `docs/open-questions-and-decisions.md` and risk R2.
 *
 * The vocabulary file is also the contract the browser checks a model against: a model
 * whose classes are not in this list is rejected rather than run, because it would emit
 * words the rest of the app cannot explain or display honestly.
 */

import rawVocabulary from '@/data/sign-vocabulary.json';
import type { SignCategory, SignVocabularyEntry, VerificationStatus } from '@/lib/types';

export const SIGN_CATEGORIES: readonly SignCategory[] = [
  'pain',
  'body',
  'needs',
  'help',
  'people',
  'answers',
  'symptoms',
];

const VERIFICATION_STATUSES: readonly VerificationStatus[] = [
  'unverified',
  'expert_verified',
  'rejected',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSign(raw: unknown, index: number): SignVocabularyEntry | null {
  if (!isRecord(raw)) return null;
  const gloss = typeof raw.gloss === 'string' ? raw.gloss.trim() : '';
  if (gloss.length === 0) return null;

  const category = typeof raw.category === 'string' ? raw.category : '';
  const verification = typeof raw.verification === 'string' ? raw.verification : 'unverified';
  const motion = typeof raw.motion === 'string' ? raw.motion : 'unverified';

  return {
    gloss,
    label: typeof raw.label === 'string' && raw.label ? raw.label : gloss,
    labelHi: typeof raw.labelHi === 'string' ? raw.labelHi : '',
    category: (SIGN_CATEGORIES as readonly string[]).includes(category)
      ? (category as SignCategory)
      : 'answers',
    tier: raw.tier === 'should' ? 'should' : 'must',
    motion: motion === 'static' || motion === 'dynamic' ? motion : 'unverified',
    verification: (VERIFICATION_STATUSES as readonly string[]).includes(verification)
      ? (verification as VerificationStatus)
      : 'unverified',
    verifiedBy: typeof raw.verifiedBy === 'string' ? raw.verifiedBy : '',
    verifiedOn: typeof raw.verifiedOn === 'string' ? raw.verifiedOn : '',
    reference: typeof raw.reference === 'string' ? raw.reference : '',
    notes: typeof raw.notes === 'string' ? raw.notes : `entry ${index}`,
  };
}

/** The full candidate vocabulary, including signs not yet feasible to recognise. */
export const SIGN_VOCABULARY: SignVocabularyEntry[] = (
  Array.isArray((rawVocabulary as { signs?: unknown }).signs)
    ? ((rawVocabulary as { signs: unknown[] }).signs as unknown[])
    : []
)
  .map(parseSign)
  .filter((entry): entry is SignVocabularyEntry => entry !== null);

/** Every gloss, in file order. A model's class list must be a subset of this. */
export const KNOWN_GLOSSES: readonly string[] = SIGN_VOCABULARY.map((entry) => entry.gloss);

/** Signs an ISL signer has confirmed. Currently zero. */
export const VERIFIED_SIGNS: SignVocabularyEntry[] = SIGN_VOCABULARY.filter(
  (entry) => entry.verification === 'expert_verified',
);

/** Must-tier signs that are static and therefore feasible for the MVP classifier. */
export const MVP_FEASIBLE_SIGNS: SignVocabularyEntry[] = SIGN_VOCABULARY.filter(
  (entry) => entry.tier === 'must' && entry.motion !== 'dynamic',
);

export function findSign(gloss: string): SignVocabularyEntry | undefined {
  const upper = gloss.trim().toUpperCase();
  return SIGN_VOCABULARY.find((entry) => entry.gloss === upper);
}

export function isKnownGloss(gloss: string): boolean {
  return findSign(gloss) !== undefined;
}

/** Display label for a gloss, falling back to a tidied version of the gloss itself. */
export function glossLabel(gloss: string): string {
  const entry = findSign(gloss);
  if (entry) return entry.label;
  return gloss
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Check a model's class list against this vocabulary.
 *
 * `negativeClass` is skipped, because it is not a sign and can never appear in
 * `data/sign-vocabulary.json`. A negative class is a legitimate and desirable part of a
 * model's class list — `lib/vision/decision.ts` uses it to reject a prediction outright —
 * so checking it here rejected every model that had a rejection gate, which is the opposite
 * of what this project wants. Pass the card's `negativeClass` so it is excluded.
 */
export function checkModelVocabulary(
  classes: string[],
  negativeClass?: string | null,
): {
  ok: boolean;
  unknown: string[];
  known: string[];
} {
  const unknown: string[] = [];
  const known: string[] = [];
  for (const gloss of classes) {
    if (negativeClass && gloss === negativeClass) continue;
    if (isKnownGloss(gloss)) known.push(gloss);
    else unknown.push(gloss);
  }
  return { ok: unknown.length === 0, unknown, known };
}

/** Summary for the Limitations screen, generated so it can never go stale. */
export function signVocabularySummary(): {
  total: number;
  must: number;
  should: number;
  verified: number;
  staticConfirmed: number;
  dynamicConfirmed: number;
  unknownMotion: number;
} {
  return {
    total: SIGN_VOCABULARY.length,
    must: SIGN_VOCABULARY.filter((entry) => entry.tier === 'must').length,
    should: SIGN_VOCABULARY.filter((entry) => entry.tier === 'should').length,
    verified: VERIFIED_SIGNS.length,
    staticConfirmed: SIGN_VOCABULARY.filter((entry) => entry.motion === 'static').length,
    dynamicConfirmed: SIGN_VOCABULARY.filter((entry) => entry.motion === 'dynamic').length,
    unknownMotion: SIGN_VOCABULARY.filter((entry) => entry.motion === 'unverified').length,
  };
}

export const SIGN_VOCABULARY_VERSION =
  typeof (rawVocabulary as { vocabularyVersion?: unknown }).vocabularyVersion === 'string'
    ? ((rawVocabulary as { vocabularyVersion: string }).vocabularyVersion as string)
    : 'unknown';
