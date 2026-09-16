#!/usr/bin/env node
/**
 * Self-hosts the third-party runtime assets the app needs.
 *
 * Why self-host rather than use a CDN:
 *   - `docs/privacy-and-safety.md` §7 requires MediaPipe WASM and model files to be served
 *     from our own origin or a pinned CDN. Serving them ourselves is the stronger option
 *     and makes the "no requests leave this origin" claim literally true;
 *   - the app then works offline after the first load (NFR-05), which matters on a ward
 *     with unreliable connectivity.
 *
 * What it does:
 *   1. copies the MediaPipe Tasks Vision WASM bundle from node_modules into
 *      public/mediapipe/wasm;
 *   2. copies the ONNX Runtime Web WASM bundle from node_modules into public/ort;
 *   3. downloads the MediaPipe hand and pose `.task` models into public/models (skipped
 *      when the files already exist).
 *
 * Run automatically by `npm run setup:assets`, which `postinstall` invokes. Safe to re-run.
 */

import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readdir, copyFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MEDIAPIPE_WASM_SOURCE = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const MEDIAPIPE_WASM_TARGET = join(root, 'public', 'mediapipe', 'wasm');

const ORT_WASM_SOURCE = join(root, 'node_modules', 'onnxruntime-web', 'dist');
const ORT_WASM_TARGET = join(root, 'public', 'ort');

const MODELS = [
  {
    name: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    note: 'MediaPipe Hand Landmarker (float16). 21 landmarks per hand.',
  },
  {
    name: 'pose_landmarker_lite.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    note: 'MediaPipe Pose Landmarker (lite). Shoulders and hips, used for sign location.',
  },
];

const MODEL_TARGET = join(root, 'public', 'models');

function log(message) {
  process.stdout.write(`[setup-assets] ${message}\n`);
}

async function copyDirectory(source, target, filter) {
  if (!existsSync(source)) {
    log(`SKIP  ${source} not found (is the dependency installed?)`);
    return 0;
  }
  await mkdir(target, { recursive: true });
  let copied = 0;
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.isDirectory()) continue;
    if (filter && !filter(entry.name)) continue;
    await copyFile(join(source, entry.name), join(target, entry.name));
    copied += 1;
  }
  return copied;
}

async function download(url, target) {
  if (existsSync(target)) {
    const info = await stat(target);
    log(`KEEP  ${target} (${(info.size / 1024 / 1024).toFixed(1)} MB already present)`);
    return true;
  }

  log(`GET   ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    log(`FAIL  ${url} returned HTTP ${response.status}`);
    return false;
  }
  await mkdir(dirname(target), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
  const info = await stat(target);
  log(`OK    ${target} (${(info.size / 1024 / 1024).toFixed(1)} MB)`);
  return true;
}

async function main() {
  log('Self-hosting runtime assets so no request leaves this origin at runtime.');

  const mediapipeCount = await copyDirectory(MEDIAPIPE_WASM_SOURCE, MEDIAPIPE_WASM_TARGET);
  log(`MediaPipe WASM files copied: ${mediapipeCount}`);

  const ortCount = await copyDirectory(
    ORT_WASM_SOURCE,
    ORT_WASM_TARGET,
    (name) => name.endsWith('.wasm') || name.endsWith('.mjs') || name.endsWith('.js'),
  );
  log(`ONNX Runtime Web WASM files copied: ${ortCount}`);

  let downloaded = 0;
  for (const model of MODELS) {
    try {
      const ok = await download(model.url, join(MODEL_TARGET, model.name));
      if (ok) downloaded += 1;
    } catch (error) {
      log(`FAIL  could not download ${model.name}: ${error.message}`);
    }
  }

  await mkdir(MODEL_TARGET, { recursive: true });
  await writeFile(
    join(MODEL_TARGET, 'README.md'),
    [
      '# Model files',
      '',
      'Fetched by `scripts/setup-assets.mjs`. These are MediaPipe Tasks Vision models, not',
      'SignSpeak models. MediaPipe locates hands and body joints; it does **not** recognise',
      'sign language.',
      '',
      '| File | Purpose |',
      '|---|---|',
      ...MODELS.map((model) => `| \`${model.name}\` | ${model.note} |`),
      '',
      'The sign classifier itself (`sign-clf-v1.onnx` and `model-card.json`) is **not** here,',
      'because no model can be trained until consented landmark data has been collected from',
      'ISL signers. See `ml/README.md`.',
      '',
    ].join('\n'),
    'utf8',
  );

  if (downloaded < MODELS.length) {
    log('');
    log('One or more MediaPipe model files are missing. The app will run, but the camera');
    log('panel will show a clear "model file is missing" state instead of hand tracking.');
    log('Re-run `npm run setup:assets` on a machine with network access.');
  }

  log('Done.');
}

main().catch((error) => {
  log(`Unexpected failure: ${error.stack ?? error.message}`);
  // Never fail the install because of an optional asset download.
  process.exit(0);
});
