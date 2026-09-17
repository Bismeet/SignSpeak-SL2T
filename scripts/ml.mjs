#!/usr/bin/env node
/**
 * Cross-platform launcher for the Python training pipeline.
 *
 * Why this exists rather than plain `python ml/scripts/train.py` in package.json:
 *   - the virtual environment's interpreter lives at `ml/.venv/Scripts/python.exe` on
 *     Windows and `ml/.venv/bin/python` on macOS and Linux, and npm scripts cannot express
 *     that portably;
 *   - it gives one clear error message when the environment has not been created, instead
 *     of a shell "command not found" or a stack trace from a missing numpy;
 *   - it never silently falls back to a system Python that lacks the dependencies, because
 *     "it ran but used the wrong interpreter" is a confusing failure.
 *
 * Usage:
 *   node scripts/ml.mjs scripts/train.py --config ml/configs/default.yaml
 *   node scripts/ml.mjs --list
 *
 * Every `npm run ml:*` script goes through here.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/**
 * Two environments, because one cannot satisfy both stages.
 *
 * MediaPipe requires numpy 2, while scikit-learn 1.4.2 and skl2onnx 1.17.0 are built against
 * the numpy 1.x ABI and fail to export on numpy 2. So feature extraction runs in
 * `ml/.venv-extract` and training runs in `ml/.venv`. They pass JSON files to each other and
 * never need to share an interpreter.
 */
const VENV_DIRS = { train: '.venv', extract: '.venv-extract' };

function venvPython(venvDir) {
  return process.platform === 'win32'
    ? join(ROOT, 'ml', venvDir, 'Scripts', 'python.exe')
    : join(ROOT, 'ml', venvDir, 'bin', 'python');
}

const SETUP_HINT = [
  '',
  'The Python environment for the ML pipeline has not been created yet.',
  '',
  'Create it with:',
  '',
  '  npm run ml:setup',
  '',
  'That installs the packages in ml/requirements.txt into ml/.venv. It is only needed to',
  'train a model — the web application itself never runs Python.',
  '',
  'Feature extraction additionally needs ml/.venv-extract (MediaPipe, which requires numpy 2):',
  '',
  '  npm run ml:setup:extract',
  '',
].join('\n');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);

// `--venv extract` selects the MediaPipe environment; anything else uses the training one.
let venvName = 'train';
const venvFlag = args.indexOf('--venv');
if (venvFlag !== -1) {
  venvName = args[venvFlag + 1] ?? 'train';
  args.splice(venvFlag, 2);
}
const VENV_PYTHON = venvPython(VENV_DIRS[venvName] ?? `.venv-${venvName}`);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  process.stdout.write(
    [
      'SignSpeak ML launcher',
      '',
      'Usage: node scripts/ml.mjs <script> [args...]',
      '',
      'Available scripts (relative to ml/):',
      '  scripts/build_fixtures.py      generate the TypeScript/Python parity fixtures',
      '  scripts/train.py               train, evaluate and export a classifier',
      '  scripts/evaluate.py            re-evaluate an existing model',
      '  scripts/import_corrections.py  convert an exported landmark log into samples',
      '',
      'Example:',
      '  node scripts/ml.mjs scripts/train.py --config ml/configs/smoke-test.yaml',
      '',
    ].join('\n'),
  );
  process.exit(0);
}

if (args[0] === '--list') {
  for (const name of [
    'download_data.py',
    'extract_features.py',
    'train_and_export.py',
    'scripts/build_fixtures.py',
    'scripts/train.py',
    'scripts/evaluate.py',
    'scripts/import_corrections.py',
  ]) {
    const path = join(ROOT, 'ml', name);
    process.stdout.write(`${existsSync(path) ? 'present' : 'MISSING'}  ${name}\n`);
  }
  process.exit(0);
}

if (!existsSync(VENV_PYTHON)) {
  fail(SETUP_HINT);
}

// Resolve the script path relative to ml/ when it is given as a bare relative path, and
// pass everything after it straight through.
const scriptArgument = args[0];
const scriptPath = scriptArgument.startsWith('-')
  ? scriptArgument
  : resolve(ROOT, 'ml', scriptArgument);

if (!scriptArgument.startsWith('-') && !existsSync(scriptPath)) {
  fail(`No such script: ml/${scriptArgument}\n\nRun \`node scripts/ml.mjs --list\` to see what exists.`);
}

const result = spawnSync(VENV_PYTHON, [scriptPath, ...args.slice(1)], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, PYTHONPATH: join(ROOT, 'ml') },
});

if (result.error) {
  fail(`Could not run the Python interpreter at ${VENV_PYTHON}: ${result.error.message}`);
}

process.exit(result.status ?? 1);
