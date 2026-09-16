/**
 * Phrase data access.
 *
 * `data/phrases.json` is compiled into the bundle at build time rather than fetched at
 * runtime. That guarantees the phrase board and Emergency mode work with no network at
 * all (NFR-05) and keeps the app free of a data-fetch failure mode on the ward.
 *
 * Editing phrases therefore requires a rebuild — see README.md > "Editing the phrase
 * list". Entries that fail validation are reported by `npm run validate:phrases` and by
 * the CI job, never silently at runtime.
 */

import rawPhrases from '@/data/phrases.json';
import { createPhraseMatcher, type PhraseMatcher } from '@/lib/phrases/matcher';
import {
  MAX_EMERGENCY_PHRASES,
  validatePhrasesFile,
  type ValidationIssue,
} from '@/lib/phrases/schema';
import type { Phrase, PhraseCategory } from '@/lib/types';

const result = validatePhrasesFile(rawPhrases);

/** Validation report for the loaded phrase file. Consumed by tests and the Help screen. */
export const phraseValidation: {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
} = { ok: result.ok, errors: result.errors, warnings: result.warnings };

if (result.errors.length > 0 && process.env.NODE_ENV !== 'production') {
  console.error(
    '[SignSpeak] phrases.json has validation errors. Run `npm run validate:phrases` for details.',
    result.errors,
  );
}

/** Every parsed phrase, including drafts. Never render this directly — see `visiblePhrases`. */
export const ALL_PHRASES: Phrase[] = [...result.phrases].sort(
  (a, b) => a.category.localeCompare(b.category) || a.order - b.order,
);

export const PHRASE_MATCHER: PhraseMatcher = createPhraseMatcher(ALL_PHRASES);

/** Total number of phrases in the file. */
export const PHRASE_COUNT = ALL_PHRASES.length;

/** Phrases an ISL signer has verified. Currently zero — see the limitations page. */
export const VERIFIED_PHRASE_COUNT = ALL_PHRASES.filter(
  (phrase) => phrase.validation.status === 'expert_verified',
).length;

/** True when no ISL clip has been verified yet. Drives the global honesty banner. */
export const HAS_ANY_VERIFIED_CLIP = ALL_PHRASES.some(
  (phrase) => phrase.validation.status === 'expert_verified' && phrase.clip.type !== 'none',
);

/**
 * Phrases the user is allowed to see.
 * FR-HOSP-05: drafts are hidden unless the user opts in, and are always badged.
 */
export function visiblePhrases(showUnverified: boolean): Phrase[] {
  return showUnverified
    ? ALL_PHRASES
    : ALL_PHRASES.filter((phrase) => phrase.validation.status === 'expert_verified');
}

export interface PhraseCategoryGroup {
  category: PhraseCategory;
  label: string;
  description: string;
  phrases: Phrase[];
}

/** Display metadata for each category, in the order the UI should show them. */
export const PHRASE_CATEGORY_META: ReadonlyArray<{
  category: PhraseCategory;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    category: 'pain',
    label: 'Pain',
    description: 'Where it hurts and how much',
    icon: 'pain',
  },
  {
    category: 'symptoms',
    label: 'Symptoms',
    description: 'How you feel',
    icon: 'symptoms',
  },
  {
    category: 'needs',
    label: 'Basic needs',
    description: 'Water, toilet, medicine, food',
    icon: 'needs',
  },
  {
    category: 'help',
    label: 'Help requests',
    description: 'Getting an interpreter or family',
    icon: 'help',
  },
  {
    category: 'staff_questions',
    label: 'Questions staff ask',
    description: 'For the hearing person to ask',
    icon: 'question',
  },
  {
    category: 'staff_instructions',
    label: 'Instructions from staff',
    description: 'Things the hearing person needs to say',
    icon: 'instruction',
  },
  {
    category: 'answers',
    label: 'Yes, no and answers',
    description: 'Quick replies',
    icon: 'answer',
  },
];

/** Group the visible phrases by category, dropping empty groups. */
export function groupPhrasesByCategory(showUnverified: boolean): PhraseCategoryGroup[] {
  const phrases = visiblePhrases(showUnverified);
  return PHRASE_CATEGORY_META.map((meta) => ({
    category: meta.category,
    label: meta.label,
    description: meta.description,
    phrases: phrases.filter((phrase) => phrase.category === meta.category),
  })).filter((group) => group.phrases.length > 0);
}

/** Count of visible phrases per category, for the category grid. */
export function categoryCounts(showUnverified: boolean): Record<PhraseCategory, number> {
  const counts = {
    pain: 0,
    symptoms: 0,
    needs: 0,
    help: 0,
    staff_questions: 0,
    staff_instructions: 0,
    answers: 0,
  } satisfies Record<PhraseCategory, number>;
  for (const phrase of visiblePhrases(showUnverified)) counts[phrase.category] += 1;
  return counts;
}

/**
 * The Emergency board (FR-HOSP-04): at most 8 phrases, in the documented order.
 *
 * **Flagged phrases are always eligible, regardless of verification status.** This is
 * deliberate and it is the difference between an emergency board that works and one that is
 * empty. The verification gate in `visiblePhrases` exists to stop an *unverified ISL clip*
 * being presented as verified ISL; it was never meant to gate text. The phrases flagged for
 * Emergency mode are text-first fallbacks that must work with no camera, no model, no
 * microphone and no network — so gating them on an ISL clip that does not exist yet would
 * leave a patient in distress staring at an empty screen.
 *
 * Each card still carries its own verification badge, so nothing is overstated.
 */
export function emergencyPhrases(showUnverified: boolean): Phrase[] {
  const flagged = ALL_PHRASES.filter((phrase) => phrase.emergency);
  if (flagged.length > 0) {
    return [...flagged]
      .sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order)
      .slice(0, MAX_EMERGENCY_PHRASES);
  }

  // Nothing is explicitly flagged (a data edit removed the flags). Degrade to the visible
  // list, and if even that is empty — the current state, since no clip is verified — fall
  // back to the first phrases in the file rather than showing nothing at all.
  const visible = visiblePhrases(showUnverified);
  return (visible.length > 0 ? visible : ALL_PHRASES).slice(0, MAX_EMERGENCY_PHRASES);
}

export function findPhraseById(id: string): Phrase | undefined {
  return ALL_PHRASES.find((phrase) => phrase.id === id);
}

/** What the app can actually show for a phrase. Drives the badge and the player. */
export type ClipAvailability = 'verified_clip' | 'draft_clip' | 'no_clip';

export function clipAvailability(phrase: Phrase): ClipAvailability {
  if (phrase.clip.type === 'none') return 'no_clip';
  return phrase.validation.status === 'expert_verified' ? 'verified_clip' : 'draft_clip';
}

/** Human-readable summary used by the Help and Limitations screens. */
export function phraseSummary(): {
  total: number;
  verified: number;
  draft: number;
  withClip: number;
  categories: number;
  emergency: number;
} {
  return {
    total: ALL_PHRASES.length,
    verified: VERIFIED_PHRASE_COUNT,
    draft: ALL_PHRASES.length - VERIFIED_PHRASE_COUNT,
    withClip: ALL_PHRASES.filter((phrase) => phrase.clip.type !== 'none').length,
    categories: new Set(ALL_PHRASES.map((phrase) => phrase.category)).size,
    emergency: ALL_PHRASES.filter((phrase) => phrase.emergency).length,
  };
}
