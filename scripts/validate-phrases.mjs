#!/usr/bin/env node
/**
 * Structural validation of `data/phrases.json`.
 *
 * WHY THIS EXISTS ALONGSIDE `lib/phrases/schema.ts`
 * -------------------------------------------------
 * This is a *deliberately independent second implementation* of the hard invariants, not a
 * duplicate of the runtime validator. The TypeScript validator runs at module load in the
 * browser, so it must be forgiving: it drops bad entries and keeps rendering. This script
 * runs in CI and must be unforgiving: it fails the build. Two independent implementations
 * of the same invariants also mean a mistake in one is caught by the other, which is the
 * entire point of having a CI gate at all.
 *
 * It is plain JavaScript on purpose, so it can run in a Node-only CI stage without a
 * TypeScript build step.
 *
 * Run: npm run validate:phrases
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
// Optional argument: validate a candidate file before overwriting the real one.
//   node scripts/validate-phrases.mjs /path/to/candidate.json
const PHRASES_PATH = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : join(ROOT, 'data', 'phrases.json');

const PHRASE_CATEGORIES = [
  'pain',
  'symptoms',
  'needs',
  'help',
  'staff_questions',
  'staff_instructions',
  'answers',
];
const PHRASE_SPEAKERS = ['deaf_user', 'hearing_user', 'both'];
const CLIP_TYPES = ['none', 'file', 'youtube'];
/**
 * Accepted spellings of each verification status, mapped to the canonical value.
 *
 * The documentation is not self-consistent: `product-requirements.md` FR-HOSP-05 and
 * `technical-architecture.md` both specify the status value as `draft`, while
 * `testing-and-evaluation.md` T-PHR-02 also says "`draft` phrases". `lib/phrases/schema.ts`
 * normalises both `draft` and `unverified` to `unverified`, so this validator must accept
 * the same set or a spec-compliant data file would pass in the app and fail in CI.
 */
const VALIDATION_STATUS_ALIASES = {
  draft: 'unverified',
  unverified: 'unverified',
  expert_verified: 'expert_verified',
  verified: 'expert_verified',
  rejected: 'rejected',
};
const MAX_EMERGENCY_PHRASES = 8;

const errors = [];
const warnings = [];
const info = [];

function fail(path, message) {
  errors.push({ path, message });
}

function caution(path, message) {
  warnings.push({ path, message });
}

function note(message) {
  info.push(message);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function main() {
  if (!existsSync(PHRASES_PATH)) {
    console.error(`[validate:phrases] ${PHRASES_PATH} does not exist.`);
    process.exit(1);
  }

  let payload;
  try {
    payload = JSON.parse(readFileSync(PHRASES_PATH, 'utf8'));
  } catch (error) {
    console.error(`[validate:phrases] data/phrases.json is not valid JSON: ${error.message}`);
    process.exit(1);
  }

  if (!isRecord(payload)) {
    console.error('[validate:phrases] data/phrases.json must contain a JSON object.');
    process.exit(1);
  }

  if (payload.schemaVersion !== 1) {
    fail('$.schemaVersion', `Expected schemaVersion 1, found ${JSON.stringify(payload.schemaVersion)}.`);
  }

  if (!Array.isArray(payload.phrases)) {
    fail('$.phrases', 'phrases must be an array.');
    report();
    return;
  }

  const seenIds = new Map();
  let emergencyCount = 0;
  let clipCount = 0;
  let verifiedCount = 0;
  let draftClipCount = 0;
  const categoryCounts = new Map();

  payload.phrases.forEach((phrase, index) => {
    const at = `phrases[${index}]`;

    if (!isRecord(phrase)) {
      fail(at, 'Each phrase must be an object.');
      return;
    }

    // --- id -------------------------------------------------------------------------
    const id = typeof phrase.id === 'string' ? phrase.id : '';
    if (!/^[a-z0-9_]+$/.test(id)) {
      fail(`${at}.id`, 'id must be non-empty and use only lowercase letters, digits and underscores.');
    } else if (seenIds.has(id)) {
      fail(`${at}.id`, `Duplicate id "${id}" (already used by phrases[${seenIds.get(id)}]).`);
    } else {
      seenIds.set(id, index);
    }

    // --- category and speaker --------------------------------------------------------
    if (!PHRASE_CATEGORIES.includes(phrase.category)) {
      fail(`${at}.category`, `category must be one of ${PHRASE_CATEGORIES.join(', ')}.`);
    } else {
      categoryCounts.set(phrase.category, (categoryCounts.get(phrase.category) ?? 0) + 1);
    }

    if (!PHRASE_SPEAKERS.includes(phrase.speaker)) {
      fail(`${at}.speaker`, `speaker must be one of ${PHRASE_SPEAKERS.join(', ')}.`);
    }

    // --- text ------------------------------------------------------------------------
    const textEn = typeof phrase.textEn === 'string' ? phrase.textEn.trim() : '';
    if (textEn.length === 0) {
      fail(`${at}.textEn`, 'textEn must not be empty.');
    }
    const textHi = typeof phrase.textHi === 'string' ? phrase.textHi.trim() : '';
    if (textHi.length === 0) {
      caution(`${at}.textHi`, 'textHi is empty; this phrase will only be available in English.');
    }

    // --- clip ------------------------------------------------------------------------
    const clip = phrase.clip;
    if (!isRecord(clip)) {
      fail(`${at}.clip`, 'clip must be an object.');
    } else {
      if (!CLIP_TYPES.includes(clip.type)) {
        fail(`${at}.clip.type`, `clip.type must be one of ${CLIP_TYPES.join(', ')}.`);
      }
      if (clip.type !== 'none') {
        clipCount += 1;
        const src = typeof clip.src === 'string' ? clip.src.trim() : '';
        if (src.length === 0) {
          fail(`${at}.clip.src`, `clip.src is required when clip.type is "${clip.type}".`);
        }
        if (
          typeof clip.startSeconds === 'number' &&
          typeof clip.endSeconds === 'number' &&
          clip.startSeconds >= clip.endSeconds
        ) {
          fail(`${at}.clip`, 'clip.startSeconds must be less than clip.endSeconds.');
        }
      }
      if (clip.type === 'none' && typeof clip.src === 'string' && clip.src.trim().length > 0) {
        caution(`${at}.clip.src`, 'clip.src is set but clip.type is "none"; the src will be ignored.');
      }
    }

    // --- validation ------------------------------------------------------------------
    const validation = phrase.validation;
    let status = null;
    if (!isRecord(validation)) {
      fail(`${at}.validation`, 'validation must be an object.');
    } else {
      status =
        typeof validation.status === 'string'
          ? (VALIDATION_STATUS_ALIASES[validation.status.trim().toLowerCase()] ?? null)
          : null;
      if (status === null) {
        fail(
          `${at}.validation.status`,
          `validation.status must be one of ${Object.keys(VALIDATION_STATUS_ALIASES).join(', ')}.`,
        );
      }

      if (status === 'expert_verified') {
        verifiedCount += 1;
        // FR-VIS-04: an unverifiable claim of verification is worse than no claim.
        if (typeof validation.verifiedBy !== 'string' || validation.verifiedBy.trim().length === 0) {
          fail(
            `${at}.validation.verifiedBy`,
            'A named ISL verifier is required for expert_verified phrases (FR-VIS-04).',
          );
        }
        if (
          typeof validation.verifiedOn !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(validation.verifiedOn)
        ) {
          fail(
            `${at}.validation.verifiedOn`,
            'expert_verified phrases need a YYYY-MM-DD verification date (FR-VIS-04).',
          );
        }
        // FR-VIS-01: verified means there is something to play.
        if (!isRecord(clip) || clip.type === 'none') {
          fail(
            `${at}.clip`,
            'expert_verified phrases must reference a clip (FR-VIS-01); otherwise the app promises a video it cannot show.',
          );
        }
      } else if (isRecord(clip) && clip.type !== 'none') {
        draftClipCount += 1;
        caution(
          `${at}.validation.status`,
          'This phrase has a clip but is not expert_verified. It will be hidden by default and shown with an UNVERIFIED badge.',
        );
      }
    }

    // --- isl gloss --------------------------------------------------------------------
    const islGloss = typeof phrase.islGloss === 'string' ? phrase.islGloss.trim() : '';
    if (islGloss.length > 0 && status !== 'expert_verified') {
      caution(
        `${at}.islGloss`,
        'An ISL gloss is only meaningful once an ISL signer has confirmed the form; leave it empty for draft phrases.',
      );
    }

    // --- emergency --------------------------------------------------------------------
    if (phrase.emergency === true) {
      emergencyCount += 1;
    }

    // --- ordering ---------------------------------------------------------------------
    if (typeof phrase.order !== 'number' || !Number.isFinite(phrase.order)) {
      caution(`${at}.order`, 'order is missing or not a number; the list order will be used instead.');
    }

    // --- provenance -------------------------------------------------------------------
    // Only warn about licence/attribution when there is actually a clip to license. A
    // text-only phrase has nothing to attribute, and warning about all 49 of them buries
    // the warnings that do matter.
    if (isRecord(clip) && clip.type !== 'none') {
      if (typeof phrase.licence !== 'string' || phrase.licence.trim().length === 0) {
        caution(
          `${at}.licence`,
          'licence is empty. Every clip needs a licence before it can be published.',
        );
      }
      if (typeof phrase.attribution !== 'string' || phrase.attribution.trim().length === 0) {
        caution(`${at}.attribution`, 'attribution is empty for a phrase that has a clip.');
      }
    }
  });

  // --- file-level rules --------------------------------------------------------------
  if (emergencyCount > MAX_EMERGENCY_PHRASES) {
    fail(
      '$.phrases',
      `${emergencyCount} phrases are flagged for Emergency mode but the maximum is ${MAX_EMERGENCY_PHRASES} (FR-HOSP-04).`,
    );
  }
  if (emergencyCount === 0) {
    caution('$.phrases', 'No phrase is flagged for Emergency mode; the emergency board would be empty.');
  }

  note(`Phrases: ${payload.phrases.length}`);
  note(`Emergency-flagged: ${emergencyCount} of a maximum ${MAX_EMERGENCY_PHRASES}`);
  note(`Expert-verified: ${verifiedCount}`);
  note(`Phrases with a clip: ${clipCount} (${draftClipCount} of them are not verified)`);
  for (const [category, count] of [...categoryCounts.entries()].sort()) {
    note(`  ${category}: ${count}`);
  }

  report();
}

function report() {
  for (const line of info) {
    console.log(`[validate:phrases] ${line}`);
  }

  if (warnings.length > 0) {
    console.log('');
    console.log(`[validate:phrases] ${warnings.length} warning(s):`);
    for (const { path, message } of warnings) {
      console.log(`  WARN  ${path}: ${message}`);
    }
  }

  if (errors.length > 0) {
    console.log('');
    console.error(`[validate:phrases] ${errors.length} error(s):`);
    for (const { path, message } of errors) {
      console.error(`  ERROR ${path}: ${message}`);
    }
    console.error('');
    console.error('[validate:phrases] FAILED');
    process.exit(1);
  }

  console.log('');
  console.log(
    `[validate:phrases] OK — ${warnings.length} warning(s), 0 errors. ` +
      'Warnings are expected while every phrase is still a draft; they must be zero before release.',
  );
}

main();
