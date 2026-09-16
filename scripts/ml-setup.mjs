#!/usr/bin/env node
/**
 * Creates the Python environment for the ML pipeline and installs its dependencies.
 *
 * Only needed to *train* a model. The web application itself never runs Python; it loads
 * the exported ONNX file with onnxruntime-web in the browser.
 *
 * Usage:
 *   npm run ml:setup
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
const VENV_DIR = join(ROOT, 'ml', '.venv');
const VENV_PYTHON =
  process.platform === 'win32'
    ? join(VENV_DIR, 'Scripts', 'python.exe')
    : join(VENV_DIR, 'bin', 'python');

/** Interpreters to try, in order. 3.12 first: it has wheels for every pinned package. */
const CANDIDATES = ['py -3.12', 'python3.12', 'python3', 'python'];

function log(message) {
  process.stdout.write(`[ml:setup] ${message}\n`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', shell: false, ...options });
  return result;
}

function probe(spec) {
  const [command, ...args] = spec.split(' ');
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
    log(`Environment already exists at ml/.venv (${VENV_PYTHON})`);
    log('Re-installing dependencies to make sure they match ml/requirements.txt ...');
  }

  const { interpreter, found } = findInterpreter();
  if (!interpreter) {
    process.stderr.write(
      [
        '',
        '[ml:setup] Could not find a Python interpreter.',
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
        `[ml:setup] Python ${interpreter.version} is not supported by the pinned dependencies.`,
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
    log('Creating the virtual environment at ml/.venv ...');
    const [command, ...args] = interpreter.spec.split(' ');
    const created = run(command, [...args, '-m', 'venv', VENV_DIR]);
    if (created.status !== 0) {
      process.stderr.write('[ml:setup] Could not create the virtual environment.\n');
      process.exit(created.status ?? 1);
    }
  }

  log('Upgrading pip ...');
  run(VENV_PYTHON, ['-m', 'pip', 'install', '--upgrade', 'pip', '--quiet']);

  log('Installing ml/requirements.txt (this takes a few minutes the first time) ...');
  const installed = run(VENV_PYTHON, ['-m', 'pip', 'install', '-r', join('ml', 'requirements.txt')]);
  if (installed.status !== 0) {
    process.stderr.write('[ml:setup] Dependency installation failed. See the output above.\n');
    process.exit(installed.status ?? 1);
  }

  log('');
  log('Ready. Next steps:');
  log('  npm run ml:fixtures   regenerate the TypeScript/Python parity fixtures');
  log('  npm run ml:smoke      train a smoke-test model to prove the pipeline works');
  log('  npm run ml:train      train a real model from ml/data (needs collected data)');
  log('');
}

main();
