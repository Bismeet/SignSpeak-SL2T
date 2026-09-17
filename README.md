# SignSpeak

An AI-assisted, two-way **Indian Sign Language (ISL)** communication aid, focused on hospital
and emergency communication for deaf and hard-of-hearing people in India.

> **Status:** MVP implemented and working end to end. **No trained recognition model ships**,
> because no ISL training data has been collected yet. The app runs without one and says so
> plainly. See [What works today](#what-works-today).

SignSpeak is a **communication aid**. It is not a medical device, it does not diagnose or
advise, and it does not replace a qualified ISL interpreter or emergency services.

---

## Quick start

Requires **Node.js 20.9 or newer**.

```bash
npm install          # installs dependencies and self-hosts MediaPipe + ONNX Runtime assets
npm run dev          # http://localhost:3000
```

`npm install` runs `scripts/setup-assets.mjs`, which copies the MediaPipe and ONNX Runtime
WASM runtimes into `public/` and downloads two MediaPipe model files (~13 MB). Those assets
are deliberately **self-hosted rather than loaded from a CDN**, so the app does not contact a
third party just to recognise a sign. They are gitignored; re-run `npm run setup:assets` if
they are missing.

```bash
npm run verify       # typecheck + lint + data validation + tests + production build
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Static export into `out/` |
| `npm start` | Serve the production build (server mode only) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest, 392 unit tests |
| `npm run test:e2e` | Playwright, 39 browser tests against the built export |
| `npm run validate` | Phrase and clip data integrity |
| `npm run verify` | Everything above, in order |
| `npm run serve:static` | Serve `out/` locally (used by the browser tests) |
| `npm run ml:setup` | Create the Python training environment |
| `npm run ml:smoke` | Prove the training pipeline works, with no data |
| `npm run ml:train` | Train on collected data in `ml/data` |
| `npm run ml:eval` | Re-evaluate an exported model |
| `npm run ml:algorithms` | List candidate algorithms and which are exportable |
| `npm run ml:fixtures` | Regenerate the TS/Python parity fixtures |

## Environment variables

Every variable is optional; the defaults are the values the app is designed to run with.
See [`.env.example`](.env.example) for the annotated list.

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_MODEL_URL` | `/models/sign-clf-v1.onnx` | Recognition model |
| `NEXT_PUBLIC_MODEL_CARD_URL` | `/models/model-card.json` | Model card the app validates before loading |
| `NEXT_PUBLIC_ORT_WASM_PATH` | `/ort/` | Self-hosted ONNX Runtime WASM |
| `NEXT_PUBLIC_MEDIAPIPE_WASM_PATH` | `/mediapipe/wasm` | Self-hosted MediaPipe WASM |
| `NEXT_PUBLIC_HAND_MODEL_URL` | `/models/hand_landmarker.task` | Hand landmarks |
| `NEXT_PUBLIC_POSE_MODEL_URL` | `/models/pose_landmarker_lite.task` | Pose landmarks |
| `NEXT_PUBLIC_INFERENCE_BACKEND_URL` | *(empty — off)* | Optional WebSocket classifier backend |
| `NEXT_PUBLIC_EMERGENCY_NUMBER` | `112` | Shown on the Emergency screen |
| `NEXT_PUBLIC_EMERGENCY_NUMBER_LABEL` | `India emergency services` | Label for the above |
| `NEXT_PUBLIC_CAPTURE_WIDTH` / `_HEIGHT` | `640` / `480` | Camera capture size |
| `NEXT_PUBLIC_LOW_FPS_THRESHOLD` | `8` | Below this, tracking is reported as degraded |
| `NEXT_PUBLIC_SHOW_UNVERIFIED_PHRASES` | `false` | Reveal draft phrases (reviewer mode) |

> **Decision needed:** the emergency number is **112** per the docs, but this has not been
> verified against a current official source (question Q7 in
> `docs/open-questions-and-decisions.md`). Confirm before deploying.

There are no secrets. Nothing is sent anywhere, and there is no account, no database and no
analytics.

---

## What works today

Everything below is implemented and exercised by tests. Items marked **⚠ needs assets or
data** are complete on the software side and waiting on something only a human can provide.

| Feature | State |
| --- | --- |
| Accessible home screen and navigation | Working |
| Camera/mic never start without an explicit tap | Working, asserted by test |
| Two-way conversation, separate Deaf/Hearing areas | Working |
| In-session history, edit, correct, reject, delete | Working |
| Speech-to-text (`en-IN`, `hi-IN`), editable transcript | Working (Chrome/Edge) |
| Text-to-speech with play/stop/repeat/voice choice | Working |
| Text-to-visual ISL, phrase matching with aliases | Working |
| Hospital phrases, 49 phrases in 7 categories | Working |
| Emergency mode, 8 phrases, one tap from home | Working |
| Landmark capture + feature extraction + tracking status | Working |
| Classifier inference, confidence, rejection, corrections | Working |
| Recognition model (trained weights) | **⚠ needs collected ISL data** |
| Verified ISL video clips | **⚠ needs an ISL signer to record and verify** |
| Python training pipeline, ONNX export, evaluation | Working (verified end to end) |
| Landmark collection tool for data gathering | Working |
| Demo replay fixtures (fallback A) | Working |

### The honest summary

- **Sign → text works as a pipeline, not as a recogniser.** Camera → MediaPipe landmarks →
  159-float feature vector → classifier → confidence gate → editable text all function and
  are tested. What is missing is a **model trained on real ISL data**, because that data does
  not exist yet. Until then the app reports "Not recognised" and offers the phrase board,
  typing and Emergency mode instead of guessing.
- **Text → ISL video works as a lookup, not a generator.** It matches a phrase and plays a
  clip a signer has verified. There are **zero verified clips**, so every phrase currently
  shows "No verified ISL video for this phrase". This is the correct behaviour, not a bug —
  see [`public/clips/README.md`](public/clips/README.md).
- **Nothing is fabricated.** No placeholder model, no invented accuracy, no sample clip, no
  fake prediction. Where a dependency is missing, the app degrades and says why.

---

## Architecture

Next.js App Router, React, TypeScript (strict, `noUncheckedIndexedAccess`), Tailwind. Static
export. No database, no accounts, no analytics, no server.

```
app/            routes: /, /talk, /phrases, /emergency, /settings, /help, /privacy, /limitations, /collect
components/     UI, camera, conversation, speech, phrases, emergency, collection
lib/
  types.ts      every shared contract, including the 159-float feature vector
  config.ts     environment configuration with safe defaults
  vision/       camera, MediaPipe landmarker, feature extraction, decision gate, recognition hook
  model/        model card validation (fails closed), ONNX loader, optional WS backend
  speech/       capability detection, ASR wrapper, TTS wrapper
  phrases/      data loading, schema validation, normalisation and matching
  signs/        vocabulary gating
  state/        settings, device status, model provider, conversation reducer, landmark log
data/           phrases.json, sign-vocabulary.json
ml/             Python training pipeline (see ml/README.md)
scripts/        asset setup, data validators, cross-platform Python launcher
tests/          388 tests
```

### Two contracts hold the project together

**`ss-features-v1`** — 159 floats per frame, fixed layout, defined twice (TypeScript and
Python) and verified against 19 awkward shared fixtures to within 1e-6. Rotation is
deliberately *not* normalised, because palm orientation is one of the five phonological
parameters of ISL.

**The model card** — `lib/model/card.ts` fails closed. A card is rejected if the vocabulary
is empty, if `inputDim` is not 159, or if `featureVersion` is wrong. `notForRealUse` is only
`false` on explicit, typed evidence. A mismatched or smoke-test model cannot produce
confident nonsense.

### Privacy by construction

- Camera frames are processed **in the browser** and never uploaded, stored or recorded.
- The conversation lives in a React reducer, **in memory only**. No `localStorage`, no
  `indexedDB`, no `fetch` for conversation content — asserted by a source-scanning test.
- The only persisted values are settings, plus an **opt-in** landmark correction log.
- Training data is **landmarks only**, never pixels, so it cannot be used to identify anyone.
- Speech recognition is the one exception, and the app says so before you use it: the
  browser's own service may send audio to its vendor. SignSpeak cannot prevent that and does
  not pretend otherwise.

---

## Accessibility

Built to WCAG 2.2 AA, with WAI-ARIA Authoring Practices and GIGW in mind.

- Large type, high contrast, large touch targets, visible focus rings.
- Three themes: day, dark, and a high-contrast theme, driven by CSS custom properties.
- Icons always paired with text labels — never colour alone.
- Full keyboard operation and screen-reader support; live regions announce recognition results.
- `prefers-reduced-motion` respected.
- Every failure state is actionable: camera errors each carry a cause, a fix, and a named
  working alternative. There are no dead ends — the 404 page lists every destination.

---

## Training a real model

```bash
npm run ml:setup     # Python 3.9-3.12; creates ml/.venv
npm run ml:smoke     # proves the pipeline works, with generated landmarks
npm run ml:train     # the real run; needs data in ml/data
```

Full instructions in [`ml/README.md`](ml/README.md) and
[`ml/data/README.md`](ml/data/README.md).

**What a real model requires, and none of it can be automated away:**

1. An ISL signer to confirm the canonical form of each gloss in
   `data/sign-vocabulary.json`. Every entry is currently `verification: "unverified"`, and
   `motion: "unverified"` means we do not yet know which signs are static — which determines
   whether a frame-based classifier is sufficient at all.
2. Landmark recordings from **at least 6 signers** per sign.
3. At least **20 repetitions per sign** and **300 negative (`OTHER`) frames**.

The pipeline enforces this rather than trusting the operator: a model is only marked usable
when it was trained on real consented data *and* the dataset meets every documented minimum.
Otherwise it is written with `notForRealUse: true`, refused at the staging step, and shown in
the app behind a permanent banner.

---

## Testing

```bash
npm test          # 392 unit tests across 12 files
npm run test:e2e  # 39 browser tests against the production export
npm run verify    # typecheck + lint + validate + unit tests + build + browser tests
```

**Unit tests** cover feature extraction and parity with Python, the accept/reject decision
gate, phrase matching and normalisation (including Devanagari combining marks), conversation
state, model-card fail-closed behaviour, the inference backend contract, camera error mapping,
device status wiring, and speech capability detection and error copy.

**Browser tests** (`e2e/`) run against the built export in `out/`, served by
`scripts/serve-static.mjs`, using Chrome's synthetic media device so the camera path can be
driven without hardware. They cover the typing and text-to-visual flows, the camera path
(stream reaching the element, frames decoding, the loop running, pause and stop), that starting
the camera never requests audio, privacy as behaviour rather than copy (a reload loses the
conversation; no message text reaches storage or the network), and structure on every route
(one `h1`, `lang`, a skip link, no unlabelled buttons or images without `alt`).

Run them with Playwright's own browser (`npx playwright install chromium`) or point at an
existing Chrome with `PLAYWRIGHT_CHROME_PATH=/path/to/chrome`.

**Why the browser tests exist.** Two shipping-blocking defects — a camera preview that never
received the stream, and a header pill stuck on "Camera off" — passed every unit test and were
only caught by driving the real app in a browser. A third was then caught by the browser suite
on its first run: phrase matching was tied to the reviewer setting, so with nothing verified
*no phrase matched* and the app told users that phrases in its own list were not in the list.
All three now have regression tests.

**Still not covered:** permission-denied flows driven with a fake stream, sign recognition
driven from the recorded landmark fixtures, an axe scan, and a screen-reader pass — all named
in `docs/testing-and-evaluation.md` §4 and §6. And a real hand on a real camera, which needs a
trained model and recorded signs.

**The recognition acceptance targets in `docs/testing-and-evaluation.md` §2.2 are NOT met and
are NOT claimed to be met**, because they require real data. `npm run ml:train` prints
MET/NOT MET for each target and leaves the judgement to the reader.

---

## Deployment

The default build is a **fully static site**:

```bash
npm run build     # writes out/
```

Deploy the contents of `out/` to any static host — GitLab Pages, Netlify, Cloudflare Pages,
S3, nginx. There is no server, no runtime environment and no secrets.

`public/_headers` carries the response headers for hosts that read that convention. It
deliberately omits COOP/COEP: those would enable multi-threaded WASM but break third-party
embeds, and ONNX Runtime is configured single-threaded so the app works on hosts that cannot
set headers at all.

**Serve over HTTPS.** `getUserMedia` and the Web Speech API require a secure context; the app
detects an insecure context and explains the problem instead of failing silently.

**Note on bundle size.** The export is ~196 MB, almost entirely self-hosted WASM runtime
variants (ONNX Runtime ships WebGPU, JSPI, asyncify, WebGL and Node builds; MediaPipe ships
SIMD and non-SIMD builds). The runtime selects a variant conditionally at load time, so
trimming them without browser verification would risk breaking the core feature on some
devices. See D-19 in [`docs/implementation-decisions.md`](docs/implementation-decisions.md)
for the evidence gathered and the intended follow-up.

## Documentation

Planning and specification documents are in [`docs/`](docs/README.md). Implementation
decisions, including every place this build diverged from or clarified the docs, are in
[`docs/implementation-decisions.md`](docs/implementation-decisions.md).
