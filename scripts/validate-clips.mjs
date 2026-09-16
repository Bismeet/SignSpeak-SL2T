#!/usr/bin/env node
/**
 * Clip integrity validation.
 *
 * The rule this script exists to enforce is FR-VIS-01/FR-VIS-03: SignSpeak shows a curated,
 * expert-verified ISL clip, or it shows the exact sentence "No verified ISL video for this
 * phrase". There is no third option — it never generates a sign, never substitutes an ASL
 * clip, and never concatenates word clips and calls the result ISL.
 *
 * So this checks the plumbing behind that promise:
 *   * every `clip.type: "file"` reference points at a file that actually exists;
 *   * every `clip.type: "youtube"` reference has a well-formed video id;
 *   * any clip present on a non-verified phrase is reported, because it must never be
 *     presented as a verified ISL sign;
 *   * every file in `public/clips/` is referenced by some phrase (an orphan clip is either
 *     a typo in the JSON or a leftover that will be shipped for no reason);
 *   * the inventory is printed, so a reviewer can see at a glance how much verified ISL
 *     content the build actually contains.
 *
 * Run: npm run validate:clips
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PHRASES_PATH = join(ROOT, 'data', 'phrases.json');
const PUBLIC_DIR = join(ROOT, 'public');
const CLIPS_DIR = join(PUBLIC_DIR, 'clips');

/** Formats a browser can play in an <video> element without extra work. */
const PLAYABLE_EXTENSIONS = new Set(['.mp4', '.webm', '.ogv', '.m4v']);

const errors = [];
const warnings = [];
/** Inventory lines. Collected first, printed last, so the summary ends the output. */
const notes = [];

function fail(message) {
  errors.push(message);
}

function caution(message) {
  warnings.push(message);
}

function info(message) {
  notes.push(message);
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  const out = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function main() {
  if (!existsSync(PHRASES_PATH)) {
    console.error(`[validate:clips] ${PHRASES_PATH} does not exist.`);
    process.exit(1);
  }

  let payload;
  try {
    payload = JSON.parse(readFileSync(PHRASES_PATH, 'utf8'));
  } catch (error) {
    console.error(`[validate:clips] data/phrases.json is not valid JSON: ${error.message}`);
    process.exit(1);
  }

  const phrases = Array.isArray(payload?.phrases) ? payload.phrases : [];
  const referenced = new Set();

  let fileClips = 0;
  let youtubeClips = 0;
  let noClip = 0;
  let verifiedWithClip = 0;
  let unverifiedWithClip = 0;

  for (const phrase of phrases) {
    if (typeof phrase !== 'object' || phrase === null) continue;
    const id = typeof phrase.id === 'string' ? phrase.id : '(no id)';
    const clip = phrase.clip;
    const status = phrase.validation?.status ?? 'unverified';

    if (typeof clip !== 'object' || clip === null || clip.type === 'none' || !clip.type) {
      noClip += 1;
      continue;
    }

    if (clip.type === 'file') {
      fileClips += 1;
      const src = typeof clip.src === 'string' ? clip.src.trim() : '';
      if (!src) {
        fail(`${id}: clip.type is "file" but clip.src is empty.`);
        continue;
      }

      // Documented convention: clip.src is a path relative to /clips, e.g. "pain-here.mp4".
      // An absolute "/clips/x.mp4" is also accepted, and a "/media/..." path is honoured
      // because a future CDN-backed layout may put clips elsewhere.
      let candidate;
      if (src.startsWith('/')) {
        candidate = join(PUBLIC_DIR, src.replace(/^\/+/, ''));
      } else {
        candidate = join(CLIPS_DIR, src);
      }

      if (!existsSync(candidate)) {
        fail(
          `${id}: clip file not found. Expected ${relative(ROOT, candidate)} ` +
            `(clip.src = ${JSON.stringify(src)}).`,
        );
        continue;
      }

      const stats = statSync(candidate);
      if (stats.size === 0) {
        fail(`${id}: clip file ${relative(ROOT, candidate)} is empty (0 bytes).`);
      }

      const extension = extname(candidate).toLowerCase();
      if (!PLAYABLE_EXTENSIONS.has(extension)) {
        caution(
          `${id}: ${relative(ROOT, candidate)} has extension "${extension}", which browsers ` +
            `may not play. Supported: ${[...PLAYABLE_EXTENSIONS].join(', ')}.`,
        );
      }

      referenced.add(resolve(candidate));

      if (status === 'expert_verified') {
        verifiedWithClip += 1;
      } else {
        unverifiedWithClip += 1;
        caution(
          `${id}: has a clip but validation.status is "${status}". It must be shown with an ` +
            'UNVERIFIED badge and must never be presented as a verified ISL sign.',
        );
      }

      if (
        typeof clip.startSeconds === 'number' &&
        typeof clip.endSeconds === 'number' &&
        clip.startSeconds >= clip.endSeconds
      ) {
        fail(`${id}: clip.startSeconds (${clip.startSeconds}) must be less than clip.endSeconds.`);
      }
      continue;
    }

    if (clip.type === 'youtube') {
      youtubeClips += 1;
      const src = typeof clip.src === 'string' ? clip.src.trim() : '';
      if (!/^[A-Za-z0-9_-]{11}$/.test(src)) {
        fail(
          `${id}: clip.src must be an 11-character YouTube video id when clip.type is "youtube" ` +
            `(found ${JSON.stringify(src)}).`,
        );
      }

      if (status === 'expert_verified') {
        verifiedWithClip += 1;
      } else {
        unverifiedWithClip += 1;
        caution(
          `${id}: embeds a YouTube video but is not expert_verified. The app loads it only on ` +
            'an explicit tap and shows an UNVERIFIED badge.',
        );
      }

      if (typeof phrase.licence !== 'string' || phrase.licence.trim().length === 0) {
        caution(`${id}: a YouTube embed needs a licence recorded before publication.`);
      }
      if (typeof phrase.attribution !== 'string' || phrase.attribution.trim().length === 0) {
        caution(`${id}: a YouTube embed needs attribution before publication.`);
      }
      continue;
    }

    fail(`${id}: unknown clip.type ${JSON.stringify(clip.type)}.`);
  }

  // --- orphan files -----------------------------------------------------------------
  // Only actual video files can be orphaned. A README or other note in this directory is
  // documentation, not a clip, and warning about it trains the reader to ignore warnings.
  const onDisk = walk(CLIPS_DIR).filter((file) =>
    PLAYABLE_EXTENSIONS.has(extname(file).toLowerCase()),
  );
  const orphans = onDisk.filter((file) => !referenced.has(resolve(file)));
  for (const orphan of orphans) {
    caution(
      `${relative(ROOT, orphan)} exists under public/clips but no phrase references it. ` +
        'Either add the phrase entry or remove the file so the build does not ship dead weight.',
    );
  }

  // --- inventory --------------------------------------------------------------------
  info(`Phrases: ${phrases.length}`);
  info(`Phrases with no clip: ${noClip} — these show "No verified ISL video for this phrase"`);
  info(`File clips: ${fileClips}`);
  info(`YouTube embeds: ${youtubeClips}`);
  info(`Clip files present under public/clips: ${onDisk.length}`);
  info(`Verified phrases with a clip: ${verifiedWithClip}`);
  info(`Unverified phrases with a clip: ${unverifiedWithClip}`);

  if (verifiedWithClip === 0 && (fileClips > 0 || youtubeClips > 0)) {
    caution(
      'No phrase is expert_verified. Every clip in this build will be hidden by default and ' +
        'shown with an UNVERIFIED badge when the reviewer opts in.',
    );
  }
  if (fileClips === 0 && youtubeClips === 0) {
    info(
      'No clips exist yet. This is the expected state until a qualified ISL signer records and ' +
        'signs off on them; the app shows its "no verified ISL video" fallback for every phrase.',
    );
  }

  for (const line of notes) {
    console.log(`[validate:clips] ${line}`);
  }

  if (warnings.length > 0) {
    console.log('');
    console.log(`[validate:clips] ${warnings.length} warning(s):`);
    for (const message of warnings) {
      console.log(`  WARN  ${message}`);
    }
  }

  if (errors.length > 0) {
    console.log('');
    console.error(`[validate:clips] ${errors.length} error(s):`);
    for (const message of errors) {
      console.error(`  ERROR ${message}`);
    }
    console.error('');
    console.error('[validate:clips] FAILED');
    process.exit(1);
  }

  console.log('');
  console.log(`[validate:clips] OK — ${warnings.length} warning(s), 0 errors.`);
}

main();
