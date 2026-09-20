#!/usr/bin/env node
/**
 * Creates a Python environment for the ML pipeline and installs its dependencies.
 *
 * Only needed to *train* a model. The web application itself never runs Python; it loads
 * the exported ONNX file with onnxruntime-web in the browser.
 *
 * Usage:
 *   npm run ml:setup           # ml/.venv         — training (numpy 1.x, scikit-learn, skl2onnx)
 *   npm run ml:setup:extract   # ml/.venv-extract — feature extraction (MediaPipe)
 *
 * Two environments, because one cannot satisfy both. MediaPipe requires numpy 2, while
 * scikit-learn 1.4.2 and skl2onnx 1.17.0 are built against the numpy 1.x ABI — installing
 * MediaPipe into the training environment silently upgrades numpy and breaks every ONNX
 * export. They exchange JSON files and never need to share an interpreter.
 *
 * It picks the newest Python it can find that the pinned dependencies actually support.
 * scikit-learn 1.4.x and onnxruntime 1.18 do not publish wheels for Python 3.13, so a
 * 3.13-only machine is told exactly that instead of being left with a failed build.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const MODES = {
  train: { venvDir: '.venv', requirements: 'requirements.txt', label: 'training' },
  extract: { venvDir: '.venv-extract', requirements: 'requirements-extract.txt', label: 'extraction' },
};

const modeName = process.argv.includes('--extract') ? 'extract' : 'train';
const MODE = MODES[modeName];
const VENV_DIR = join(ROOT, 'ml', MODE.venvDir);
const VENV_PYTHON =
  process.platform === 'win32'
    ? join(VENV_DIR, 'Scripts', 'python.exe')
    : join(VENV_DIR, 'bin', 'python');
const REQUIREMENTS = join('ml', MODE.requirements);

/** Interpreters to try, in order. 3.12 first: it has wheels for every pinned package. */
const CANDIDATES = [
  process.env.PYTHON,
  'py -3.12',
  'python3.12',
  'python3.11',
  'python3',
  'python',
  process.env.USERPROFILE ? join(process.env.USERPROFILE, '.local', 'bin', 'python3.11.exe') : null,
  process.env.USERPROFILE ? join(process.env.USERPROFILE, '.local', 'bin', 'python3.exe') : null,
  process.env.APPDATA ? join(process.env.APPDATA, 'uv', 'python', 'cpython-3.11.16-windows-x86_64-none', 'python.exe') : null,
  process.env.APPDATA ? join(process.env.APPDATA, 'uv', 'python', 'cpython-3.11-windows-x86_64-none', 'python.exe') : null,
].filter(Boolean);

function log(message) {
  process.stdout.write(`[ml:setup] ${message}\n`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: false, ...options });
  return result;
}

function probe(spec) {
  if (!spec) return null;
  const isDirectPath = existsSync(spec);
  const command = isDirectPath ? spec : spec.split(' ')[0];
  const args = isDirectPath ? [] : spec.split(' ').slice(1);
  const result = spawnSync(command, [...args, '--version'], { encoding: 'utf8', shell: false });
  if (result.status !== 0 || !result.stdout) return null;
  const match = /Python (\d+)\.(\d+)\.(\d+)/.exec(result.stdout.trim());
  if (!match) return null;
  return {
    spec,
    version: `${match[1]}.${match[2]}.${match[3]}`,
    major: Number(match[1]),
    minor: Number(match[2]),
  };
}

function findInterpreter() {
  const found = [];
  for (const candidate of CANDIDATES) {
    const probed = probe(candidate);
    if (probed) found.push(probed);
  }
  if (found.length === 0) return { interpreter: null, found };

  // Prefer 3.12, then 3.11, then anything in the supported 3.9-3.12 range.
  const preferred = found.find((entry) => entry.major === 3 && entry.minor === 12);
  if (preferred) return { interpreter: preferred, found };
  const supported = found.find((entry) => entry.major === 3 && entry.minor >= 9 && entry.minor <= 12);
  return { interpreter: supported ?? found[0], found };
}

function main() {
  if (existsSync(VENV_PYTHON)) {
    log(`Environment already exists at ml/${MODE.venvDir} (${VENV_PYTHON})`);
    log(`Re-installing dependencies to make sure they match ml/${MODE.requirements} ...`);
  }

  const { interpreter, found } = findInterpreter();
  if (!interpreter) {
    process.stderr.write(
      [
        '',
        `[ml:setup:${modeName}] Could not find a Python interpreter.`,
        '',
        'Install Python 3.12 from https://www.python.org/downloads/ and run this again.',
        'On Windows, make sure "Add python.exe to PATH" is ticked during installation.',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  log(`Found interpreters: ${found.map((entry) => entry.version).join(', ')}`);
  log(`Using Python ${interpreter.version} (${interpreter.spec})`);

  if (!(interpreter.major === 3 && interpreter.minor >= 9 && interpreter.minor <= 12)) {
    process.stderr.write(
      [
        '',
        `[ml:setup:${modeName}] Python ${interpreter.version} is not supported by the pinned dependencies.`,
        '',
        'scikit-learn 1.4.2, scipy 1.13.1, onnxruntime 1.18.1 and numpy 1.26.4 publish no',
        'wheels for Python 3.13+. Install Python 3.12 and run `npm run ml:setup` again.',
        '',
        'This only affects training a model. The web application needs no Python at all.',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }

  if (!existsSync(VENV_DIR)) {
    log(`Creating the virtual environment at ml/${MODE.venvDir} ...`);
    const isDirectPath = existsSync(interpreter.spec);
    const command = isDirectPath ? interpreter.spec : interpreter.spec.split(' ')[0];
    const args = isDirectPath ? [] : interpreter.spec.split(' ').slice(1);
    const created = run(command, [...args, '-m', 'venv', VENV_DIR]);
    if (created.status !== 0) {
      process.stderr.write('[ml:setup] Could not create the virtual environment.\n');
      process.exit(created.status ?? 1);
    }
  }

  log('Upgrading pip ...');
  run(VENV_PYTHON, ['-m', 'pip', 'install', '--upgrade', 'pip', '--quiet']);

  log(`Installing ml/${MODE.requirements} (this takes a few minutes the first time) ...`);
  const installed = run(VENV_PYTHON, ['-m', 'pip', 'install', '-r', REQUIREMENTS]);
  if (installed.status !== 0) {
    process.stderr.write('[ml:setup] Dependency installation failed. See the output above.\n');
    process.exit(installed.status ?? 1);
  }

  log('');
  log('Ready.');
  log('');
  if (modeName === 'extract') {
    log('This environment extracts features from video clips:');
    log('  npm run ml:download    fetch the isolated-ISL subset');
    log('  npm run ml:extract     run MediaPipe over the clips');
  } else {
    log('This environment trains and exports the model:');
    log('  npm run ml:fixtures    regenerate the TypeScript/Python parity fixtures');
    log('  npm run ml:smoke       train a smoke-test model to prove the pipeline works');
    log('  npm run ml:train:v1    train and export sign-clf-v1 from downloaded clips');
    log('  npm run ml:pipeline    download + extract + train, end to end');
  }
  log('');
}

main();
