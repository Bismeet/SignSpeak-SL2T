# Implementation Decisions

This document records every place the implementation had to choose, clarify or diverge from
the planning documents in this directory. It is written for the next person: each entry says
what was decided, what the docs said, and why.

**Legend**

- **CLARIFIED** — the docs were ambiguous; a reading was chosen and recorded.
- **DIVERGED** — the implementation deliberately differs from a documented value.
- **RESOLVED** — a `DECISION NEEDED` item was settled using the documented recommendation.
- **OPEN** — still needs a human answer; the implementation uses a safe default meanwhile.

---

## Summary of contradictions found in the docs

Read these first; the detailed entries follow.

| # | Contradiction | Resolution |
| --- | --- | --- |
| 1 | `phrases.json` status value is documented as `draft` (FR-HOSP-05, `technical-architecture.md`) but the same requirement calls the badge "unverified", and `VerificationStatus` also needs a `rejected` value that appears nowhere in the docs. | Accept **both** `draft` and `unverified` on input, normalise to `unverified`, label it "draft" in the UI. See D-13. |
| 2 | Feature-parity tolerance is 1e-5 in `testing-and-evaluation.md` §2.3. | Implemented at **1e-6**, i.e. stricter. See D-14. |
| 3 | Model artefacts are documented as `ml/reports/<v>/{metrics.json, confusion_matrix.png, per_class.csv, model-card.json}`. | Implemented as `ml/artifacts/<v>/{sign-clf-v1.onnx, model-card.json, run-report.json, evaluation.txt}`. See D-15. |
| 4 | Baseline models are documented as k-NN k=5, RF 200 trees, MLP (128, 64) with dropout. | Implemented as k-NN k=7, RF 400 trees, MLP (256, 128) with early stopping and no dropout. See D-16. |
| 5 | ~30 hospital phrases in `ai-ml-and-dataset-plan.md` §1.3; `mvp-scope.md` says "approx. 30 phrases". | Shipped **49**. See D-17. |
| 6 | 10–15 Must-tier signs in `ai-ml-and-dataset-plan.md` §1.2. | `data/sign-vocabulary.json` holds **16 candidates** (Must and Should). See D-17. |
| 7 | `docs/technical-architecture.md` §"phrases.json" uses `snake_case` keys (`verified_by`, `date`); the app's TypeScript types use `camelCase`. | `camelCase` everywhere, matching the types. See D-18. |

---

## D-01 — The local `docs/` set is the source of truth, not GitLab **CLARIFIED**

**Decision.** The 15 files in `docs/` were used as the specification.

**Why.** The documented GitLab project (`gitlab.com/phoenix-labs-group3/phoenix-labs-project`)
is not reachable from this environment: the web UI redirects (HTTP 302) and the API returns
`{"message":"404 Project Not Found"}` because the project is private. The local `docs/`
directory is a complete, self-consistent copy of the merge request content, so the work
proceeded from it rather than blocking.

**Impact.** If the remote has content the local copy lacks, this build has not seen it.

---

## D-02 — Static export, no server, no database **RESOLVED**

**Decision.** `output: 'export'`, `trailingSlash: true`. No API routes, no database, no
accounts, no analytics.

**What the docs said.** `technical-architecture.md` proposes a browser-first architecture with
an *optional* FastAPI landmark backend; question D2 (processing location) is `DECISION NEEDED`
with the recommendation "browser-first with optional backend behind a flag".

**Why.** The recommendation was followed. A static export also means the app can be hosted on
GitLab Pages (recommendation D9) with no runtime environment, no secrets and no operational
cost — which matters for a student project that must still work after the team graduates.

**Consequence.** Every feature must work with no network. That constraint shaped D-03 and
D-05, and it is why the phrase board and Emergency mode are the documented fallback when
recognition is unavailable.

---

## D-03 — Next.js App Router **RESOLVED**

**Decision.** Next.js 15 App Router, React 19, TypeScript 5 with `strict` and
`noUncheckedIndexedAccess`.

**What the docs said.** D3 (`DECISION NEEDED`) offers Next.js or Vite + React, recommending
Next.js "unless the team prefers Vite".

**Why.** The recommendation was followed. The App Router's per-route code splitting keeps the
camera/MediaPipe code off the Home and Emergency screens, which are the screens that must work
on a weak device in a hurry.

**Note.** `noUncheckedIndexedAccess` was enabled beyond what the docs ask for. It is the
reason the codebase has no `possibly undefined` gaps around landmark arrays and `phrases[0]`,
which is exactly the class of bug that would silently corrupt a feature vector.

---

## D-04 — Browser-first recognition with an optional WebSocket backend **RESOLVED**

**Decision.** ONNX Runtime Web runs the classifier on-device. A WebSocket backend exists as an
opt-in client (`lib/model/backend.ts`) with a documented message contract, disabled unless
`NEXT_PUBLIC_INFERENCE_BACKEND_URL` is set.

**What the docs said.** D2 (`DECISION NEEDED`), recommendation "browser-first with optional
backend behind a flag". The backend contract in `technical-architecture.md` is
`{features, model_version}` → probabilities or top-3.

**Why.** The recommendation was followed, and the documented contract was implemented exactly
rather than invented. A test asserts the outbound payload contains **only** `features` and
`model_version` — no frames, no audio, no text — because a backend that quietly received
pixels would break the privacy promise in `privacy-and-safety.md`.

**Deliberate non-decision.** No FastAPI server is shipped. Shipping a server nobody runs would
be dead code pretending to be a feature. The client is real and tested, so adding the server
later is a small job.

---

## D-05 — Self-hosted WASM, single-threaded, no COOP/COEP **CLARIFIED**

**Decision.** MediaPipe and ONNX Runtime WASM are copied into `public/` by
`scripts/setup-assets.mjs`. ORT runs with `numThreads = 1`.

**Why.** Two reasons.

1. **Privacy.** Loading the runtime from a CDN would contact a third party before the user has
   done anything. Self-hosting means the only network requests are to the app's own origin.
2. **Portability.** Multi-threaded WASM requires `Cross-Origin-Opener-Policy` and
   `Cross-Origin-Embedder-Policy` headers. Static hosts (GitLab Pages in particular) cannot set
   them, and enabling them breaks third-party embeds — which the YouTube clip path uses. A
   single-threaded runtime works everywhere.

**Cost.** Slower inference. This is a deliberate trade of speed for reach, and the latency
target is reported honestly rather than met by assumption (see D-16).

---

## D-06 — The feature vector is 159 floats, `ss-features-v1` **CLARIFIED**

**Decision.** A fixed 159-float vector, versioned, defined in exactly two places
(`lib/vision/features.ts` and `ml/signdata/constants.py`).

**What the docs said.** `ai-ml-and-dataset-plan.md` §4 lists the components (per-hand landmarks,
centroid relative to shoulders, palm normal, fingertip distances, extension angles, presence
flags) but never states a length or a layout.

**Why a fixed layout.** The docs require feature code to exist twice and be verified for
parity (§4), and the model card must record "input contract, normalisation version"
(§8). Neither is checkable without an exact layout, so the layout was made explicit and named:

| Slice | Contents |
| --- | --- |
| `0:126` | 2 hands × 21 landmarks × (x, y, z) |
| `126:128` | per-hand presence flag and detection score |
| `128:132` | per-hand centroid, scaled by shoulder width |
| `132:138` | per-hand palm normal |
| `138:148` | per-hand five fingertip distances |
| `148:158` | per-hand five extension angles |
| `158` | pose-present flag |

The browser **refuses to load** a model whose card declares a different `inputDim` or
`featureVersion`, so a stale model cannot be run against a new layout.

---

## D-07 — Fixed hand slots, not "first hand detected" **CLARIFIED**

**Decision.** Landmarks are written into two fixed slots, `[left, right]`. When MediaPipe
reports two hands with the same handedness label, the one with the higher detection score wins
the slot.

**Why.** Hand order must not depend on detection order, or the same sign produces different
feature vectors on different frames. This also makes left- and right-handed performances of a
mirrored sign distinguishable rather than accidentally averaged.

**Related.** MediaPipe's handedness output assumes a mirrored image, so
`SignLandmarker.create()` passes `swapHandedness: true` for the unmirrored front-camera frames
the app receives. There is a parity fixture (`unmirrored-camera-handedness`) covering this.

---

## D-08 — Rotation is deliberately NOT normalised **CLARIFIED**

**Decision.** Landmarks are normalised for translation (wrist at origin) and scale (middle-MCP
distance), but **not** for rotation.

**What the docs said.** `ai-ml-and-dataset-plan.md` §4 says: "optionally rotate so the
wrist-to-middle-MCP vector is vertical (test whether rotation normalisation helps or hurts
orientation-dependent signs)".

**Why not.** The docs list palm orientation as one of the five phonological parameters of ISL.
Palm orientation is carried in the feature vector (the palm normal block), and a rotation
normalisation would rotate that signal away along with the landmark geometry. Removing it would
delete a real distinction between signs, and the docs explicitly flag this as an open question
rather than a settled improvement.

**Cost.** The model must learn orientation invariance from data if it needs it, which needs
more signers. Accepted, because the alternative is silently losing a linguistic feature.

**Consequence.** There is a test asserting the vector is *not* rotation invariant, so a future
change to this decision is deliberate rather than accidental.

---

## D-09 — Rejection uses three strategies together **CLARIFIED**

**Decision.** All three of the strategies in `ai-ml-and-dataset-plan.md` §5.3 are implemented,
in this order: explicit negative class → confidence threshold → top-2 margin → temporal
consistency (k-of-n votes).

**Why all three.** The docs describe them as one bullet list, but they fail differently. A
negative class cannot exist until data is collected; the confidence threshold alone produces
flicker; the margin alone cannot fire on a normalised distribution (see D-10). Implementing
them as an ordered pipeline means the app degrades sensibly as data becomes available.

**Finding worth recording.** The margin check **cannot fire once the confidence threshold has
been passed** for a normalised distribution: if the top probability exceeds `t`, the gap to the
runner-up is at least `2t − 1` (0.4 at the default `t = 0.7`, 0.7 in strict mode), which always
exceeds the 0.2 margin. It is kept because `lib/model/backend.ts` may return **unnormalised**
scores (independent sigmoid outputs or raw logits from a thin server), where the check is
load-bearing. A comment in `lib/vision/decision.ts` says so, and a test asserts both
behaviours, so a future reader does not delete it as dead code.

---

## D-10 — "Not recognised" is a first-class state, and nothing is auto-accepted **CLARIFIED**

**Decision.** A prediction below threshold is never emitted as text. The user sees "Not
recognised", and after two consecutive rejections the app suggests the phrase board.

**What the docs said.** FR-STT-05: "shows 'Not recognised' and does **not** output a word".
FR-SPK-02: nothing is spoken without an explicit tap. T-SIGN-07: two consecutive rejections
trigger the phrase-board suggestion.

**Why.** These are the requirements that make the app safe to put in front of a patient. They
are enforced in `lib/vision/decision.ts` (a pure, tested reducer) rather than in a component,
so no UI change can bypass them.

---

## D-11 — The model card fails closed **CLARIFIED**

**Decision.** `lib/model/card.ts` rejects a card outright if the vocabulary is empty, if
`inputDim` is not 159, or if `featureVersion` is not `ss-features-v1`. `notForRealUse` is only
`false` when the card says so explicitly **and** `trainingSource` is
`collected_consented_dataset`.

**Why.** The docs require a model card with "known limitations" (`ai-ml-and-dataset-plan.md`
§8) but do not say what the browser should do with it. A card that is only displayed is
decoration. Making it a load-time gate is what actually stops a smoke-test model, or a model
trained on the wrong feature layout, from producing confident nonsense in front of a patient.

**Related.** `ml/signdata/export.py` generates the limitations list from what the model
actually is, so the card cannot claim a negative class it was not trained on.

---

## D-12 — Conversation is in memory only **CLARIFIED**

**Decision.** The conversation lives in a pure React reducer. `localStorage` is used for
settings only. An **opt-in** landmark correction log uses IndexedDB and is off by default.

**What the docs said.** `privacy-and-safety.md` requires no storage or transmission of raw
footage or recordings and an in-memory conversation; question Q10 (should corrections be
logged?) is `OPEN` with the default "off".

**Why.** Q10's documented default was followed. `tests/conversation-reducer.test.ts` includes a
test that **scans the reducer's source** for `localStorage`, `sessionStorage`, `indexedDB`,
`fetch(` and `XMLHttpRequest`, so a future change that starts persisting a patient's
conversation fails the build rather than passing review.

---

## D-13 — Accept `draft` as an alias for `unverified` **CLARIFIED**

**Decision.** `validation.status` accepts `draft`, `unverified`, `expert_verified`, `verified`
and `rejected`, case-insensitively, and normalises to
`unverified | expert_verified | rejected`.

**The contradiction.** `product-requirements.md` FR-HOSP-05 specifies the status field as
"(`draft`, `expert_verified`)"; `technical-architecture.md` writes
`"status": "draft|expert_verified"`; `testing-and-evaluation.md` T-PHR-02 says "`draft`
phrases hidden unless setting on". But FR-HOSP-05's own sentence calls the resulting badge
"unverified", and the docs nowhere provide a value for a clip that has been reviewed and
rejected — which `risk-register.md` R4 implies exists ("hide drafts").

**Why accept both.** The data file is hand-edited by a person following the specification. If
the app accepted only `unverified`, a contributor who wrote `draft` exactly as documented would
get 49 validation errors and an **empty phrase board and Emergency mode** — the worst possible
failure mode for this project. Accepting both costs one lookup table and removes the trap.

**Normalisation, not two vocabularies.** Internally there is one status type. The alias map
lives in `lib/phrases/schema.ts` and is mirrored in `scripts/validate-phrases.mjs`, with a test
for each spelling.

**Note.** The shipped `data/phrases.json` uses `unverified`, and a header note in the file says
so. The interface labels it "draft".

---

## D-14 — Feature-parity tolerance tightened to 1e-6 **DIVERGED**

**What the docs said.** `testing-and-evaluation.md` §2.3: "Python and TypeScript feature
functions produce identical vectors (tolerance 1e-5) on shared fixtures."

**Decision.** 1e-6.

**Why.** The two implementations are the same arithmetic, so the only differences are the last
ULP of `Math.acos`/`math.acos` and float32 rounding at the boundary. 1e-5 would hide a genuine
off-by-one in a landmark index or a swapped axis, which is exactly the failure this test exists
to catch. Tightening a tolerance is safe; widening it is not.

**Consequence.** 19 deliberately awkward fixtures (NaN coordinates, degenerate hands,
duplicate handedness, missing shoulders, unmirrored camera, scale invariance at 1000×) must all
agree to 1e-6. They do.

---

## D-15 — Artefacts land in `ml/artifacts/`, with a text report **DIVERGED**

**What the docs said.** `ml/reports/<model-version>/{metrics.json, confusion_matrix.png,
per_class.csv, model-card.json}`.

**Decision.** `ml/artifacts/<model-version>/{<version>.onnx, model-card.json, run-report.json,
evaluation.txt}`.

**Why.** Three deliberate changes:

- **`artifacts/` not `reports/`.** The directory holds the model and the card as well as
  reports, and the model must be staged from it into `public/models`.
- **No `confusion_matrix.png`.** Generating an image would add matplotlib and Pillow to the
  dependency set for a file nobody reads in CI. The confusion matrix is printed as an aligned
  text table in `evaluation.txt` and also stored as a nested array in `model-card.json`, where
  it is machine-readable. Adding the PNG later is a small, isolated job.
- **`run-report.json` is additional.** It records the config, dataset summary, candidate
  comparison, split, findings and provenance — everything needed to reproduce a run, which
  `metrics.json` alone would not.

**Impact.** A reader following `ai-ml-and-dataset-plan.md` §8 will look in the wrong place. The
paths are documented in `ml/README.md`.

---

## D-16 — Model baselines tuned up from the documented starting points **DIVERGED**

**What the docs said.** `ai-ml-and-dataset-plan.md` §5.1: k-NN (k=5), Random Forest (200
trees), SVM RBF, MLP (128 and 64 units, dropout).

**Decision.** k-NN (k=7, distance-weighted, standardised), Random Forest (400 trees,
`balanced_subsample`), Multinomial logistic regression (added), MLP (256, 128, Adam, early
stopping, no dropout).

**Why.**

- The docs present these as *starting points* to be picked by validation ("train all, pick by
  validation"), not as fixed architecture.
- 400 trees instead of 200 because the dataset is small and the export cost is paid once.
- `balanced_subsample` because classes will be imbalanced by construction — the negative class
  has a target of 300 samples against 20 per sign.
- Dropout was dropped because scikit-learn's `MLPClassifier` `early_stopping` already handles
  the small-data regime, and dropout would have to be reimplemented faithfully in ONNX.
- Logistic regression was added as a **floor**: if a linear model matches the forest, the task
  is easier than expected and that is worth knowing.
- **SVM RBF is implemented but marked non-exportable.** Its calibrated probabilities are not
  faithfully reproduced in ONNX, so `train.py` will never ship it. It is kept for offline
  comparison because it answers a real question about whether the features are informative. If
  it wins, the run report records the substitution rather than silently shipping the runner-up.

**On latency.** `testing-and-evaluation.md` §2.2 targets ≤ 30 ms per-frame classifier latency.
The smoke run measured **52 ms** on this machine and the report prints **NOT MET**. That is not
hidden or adjusted. Two caveats are printed alongside: it is a single-row measurement on a
development machine, and the documented end-to-end budget (≤ 2 s to a chip) also includes
MediaPipe. Whether the target is met on the named reference laptop is unknown, because the
reference devices were never named (`testing-and-evaluation.md` §2.2 `ASSUMPTION`).

---

## D-17 — 49 phrases and 16 candidate signs, not ~30 and 10–15 **DIVERGED**

**What the docs said.** `ai-ml-and-dataset-plan.md` §1.3 proposes "around 30 phrases" and §1.2
targets "10 to 15 Must-tier signs". `mvp-scope.md` says "approx. 30 phrases".

**Decision.** 49 phrases across 7 categories; 16 candidate signs.

**Why.** The phrase count is a **text** count, and text costs nothing to add — the scarce
resource the docs identify is *expert review time*, which gates the **clips**, not the
sentences. Every one of the 49 phrases is `clip.type: "none"` and `status: "unverified"`, so
none of them claims anything. The extra phrases make the phrase board and Emergency mode
genuinely useful as the documented fallback when recognition fails, which
`mvp-scope.md` describes as a core value ("Works even when recognition fails").

The sign vocabulary holds 16 candidates because `ai-ml-and-dataset-plan.md` §1.2 lists 16 rows
(11 Must, 5 Should) plus numbers 0–10 as a group. Listing them all as `unverified` candidates
is faithful to the doc; **none is claimed to be a supported sign**, and the target of 10–15
Must-tier signs after expert review still stands.

---

## D-18 — `camelCase` JSON keys, not `snake_case` **DIVERGED**

**What the docs said.** `technical-architecture.md` shows
`"validation": { "status": "draft|expert_verified", "verified_by": "", "date": "" }`.

**Decision.** `camelCase`: `verifiedBy`, `verifiedOn`, `islGloss`, `textEn`, `textHi`,
`aliasesEn`, `aliasesHi`.

**Why.** The same document's TypeScript interfaces use camelCase, and the phrase objects are
consumed directly by TypeScript components. Keeping one spelling avoids a mapping layer whose
only purpose would be to disagree with itself. The sample-data loader additionally accepts
`signer_id`/`signerId` and `captured_at`/`capturedAt` for the collection export, because that
file is produced by a human.

---

## D-19 — Vendored WASM variants are not trimmed **OPEN**

**Decision.** `public/ort/` and `public/mediapipe/` ship every variant the packages publish. The
static export is ~196 MB. This is documented rather than optimised.

**Evidence gathered.** In `node_modules/onnxruntime-web/dist/ort.mjs` the runtime chooses its
WASM module with a build-time-constant chain:

```js
const wasmModuleFilename = true ? "ort-wasm-simd-threaded.jsep.mjs"
  : false ? "ort-wasm-simd-threaded.jspi.mjs"
  : false ? "ort-wasm-simd-threaded.asyncify.mjs"
  : "ort-wasm-simd-threaded.mjs";
```

guarded by `useEmbeddedModule = isSameOrigin(scriptSrc) || isWasmOverridden && !isMultiThreaded`.
So the file actually used depends on origin, whether `wasmPaths` was overridden, and the thread
count — and webpack also emits its own copy of the JSEP binary into `_next/static/media/`
(27 MB), which appears to be the copy ORT actually uses when the module is embedded.

**Why it was not trimmed.** Deleting the unreferenced variants would remove roughly 110 MB, but
the selection is conditional and the failure mode is the app's single most important feature
failing on a device nobody tested. There is no browser-level test suite to catch that (D-22), so
the risk is unverifiable here.

**Follow-up.** Serve the app, open DevTools → Network, start the camera, and record exactly
which files under `/ort/` and `/mediapipe/` are requested. Then reduce
`scripts/setup-assets.mjs` to that set plus an explicit fallback list, and re-verify on Chrome
Android. Until then, size is a known cost of not guessing.

---

## D-20 — `protobuf<5` is pinned, and is not optional **CLARIFIED**

**Decision.** `ml/requirements.txt` pins `protobuf==4.25.3`.

**Why.** protobuf 5+ validates repeated int64 fields strictly and rejects Python `bool` values,
but skl2onnx 1.17.0 emits `nodes_missing_value_tracks_true` as a list of bools. With a newer
protobuf **every tree-ensemble export fails** with a message that buries the cause:

```
TypeError: Field onnx.AttributeProto.ints: Expected an int, got a boolean.
```

wrapped by skl2onnx in a dump of every node attribute — 116,492 lines for a 400-tree forest.

**Two fixes were made, not one.**

1. The pin, with the reason written in `ml/requirements.txt` so nobody "upgrades" it.
2. `ml/signdata/export.py` now surfaces the underlying `__cause__` instead of skl2onnx's
   wrapper, truncates it, and names this specific trap with the remedy. A cryptic
   six-figure-line failure is now three lines that say what to run.

---

## D-21 — `draft`→`unverified` was not the only data bug found **CLARIFIED**

Three real bugs were found by tests written against the **real** shipped data rather than
fixtures. All three would have shipped silently.

**1. Emergency mode was empty.** `emergencyPhrases()` filtered through `visiblePhrases()`, which
returns nothing while no clip is verified. Since zero clips are verified, the Emergency board
rendered **empty by default** — a patient in distress would have found a blank screen. The
verification gate exists to stop an unverified *clip* being presented as verified ISL; it was
never meant to gate text. Flagged phrases are now always eligible, each carrying its own badge.

**2. Devanagari was being destroyed.** `normaliseText()` used `/[^\p{L}\p{N}\s]/gu`, which
strips **combining marks** (category `Mc`/`Mn`) — and Devanagari vowel signs are combining
marks. `मुझे पानी चाहिए` became `म झ प न च ह ए`, so unrelated Hindi phrases collided. Fixed by
adding `\p{M}`. (NFKC does *not* merge `हाँ` and `हां` — candrabindu and anusvara are both
preserved — which is why both spellings are shipped as aliases.)

**3. TTS silently picked the wrong voice.** The voice list was matched back by `voiceURI` but
the ranked options only carry `name`. Since `voiceURI` and `name` frequently differ, an explicit
voice choice silently fell back to the default.

**Also fixed.** `loadVoices()` waited the full 2 s timeout on **every** call when a device has no
voices installed, so the Speak button appeared dead for two seconds on each press. The resolved
list is now cached per document.

---

## D-22 — No browser-level end-to-end test suite **OPEN**

**What the docs said.** `testing-and-evaluation.md` §6 specifies Playwright E2E covering the
typing flow, the phrase board, permission-denied flows with fake media streams, and sign
recognition driven by recorded landmark fixtures injected in place of the camera.

**Decision.** Not implemented. 367 unit and component tests exist instead.

**Why.** The E2E layer is the largest remaining gap, and it is a gap by choice: the effort was
spent on making the pipeline correct and honest end to end, which is verifiable without a
browser, rather than on a browser harness that would need its own CI media plumbing. The
documented T-* test IDs that depend on a real browser (T-PERM-01 … T-PERM-08, T-SIGN-01 … 08,
T-SPCH-01 … 07, T-CONV-01 … 03) are therefore **unverified**, and this build does not claim
otherwise.

**Partially covered instead.** Camera error mapping, permission state copy, the decision gate,
phrase matching, the backend contract, capability detection and voice ranking are covered by
unit tests, and the replay fixtures in `public/fixtures/` exist so a future E2E suite can drive
recognition from recorded landmarks without a camera — which is what §6 asks for.

---

## D-23 — Robustness slices are not computed **OPEN**

**What the docs said.** `testing-and-evaluation.md` §2.2 requires robustness slices (lighting,
sitting/lying pose, handedness) to be reported, with any slice more than 15 points below
average flagged in the model card. `ai-ml-and-dataset-plan.md` §3.2 requires two lighting
setups, two backgrounds, two distances and sitting/lying poses per signer.

**Decision.** The collection tool **records** every one of those conditions
(`SampleConditions`), and `import_corrections.py` preserves them. The evaluator does not yet
group by them.

**Why.** Computing a slice needs samples in each condition, and there are zero samples. Shipping
a slice report over an empty dataset would print nothing useful while looking complete.

**Follow-up.** `ml/signdata/evaluation.py` needs a `by_condition` breakdown, and
`default_limitations()` needs to take it as an argument so a bad slice reaches the card. The
metadata to do it is already captured.

---

## D-24 — The emergency number is 112, and is flagged **OPEN**

**Decision.** `NEXT_PUBLIC_EMERGENCY_NUMBER` defaults to `112`, labelled "India emergency
services".

**What the docs said.** Question Q7: "Correct local emergency number and wording for the safety
banner — Verify (112 is India's integrated emergency number, to confirm)", status `OPEN`.

**Why.** 112 is what the docs propose and it is India's integrated emergency number. It was not
independently verified against a current official source, so it is **flagged as needing
confirmation** in `.env.example`, in the README, and here. The number is configuration, not
hardcoded, so correcting it is a deploy-time change.

---

## D-25 — Zero verified clips is the shipped state **CLARIFIED**

**Decision.** All 49 phrases have `clip.type: "none"` and `status: "unverified"`. Every phrase
shows "No verified ISL video for this phrase".

**Why.** `mvp-scope.md` and FR-VIS-01 require that every clip shown has `expert_verified`
status. No ISL signer has reviewed anything yet, so there is nothing that may be shown. The
alternative — shipping a placeholder clip, an ASL clip, or concatenated word clips — would
violate FR-VIS-02, FR-VIS-05, risk R4 and the whole premise of the product.

**Enforced, not just intended.** `npm run validate:clips` treats zero clips as the expected
state and fails the build if a verified phrase lacks a clip. `public/clips/README.md` documents
the recording and verification procedure, and `data/phrases.json` carries the licence and
attribution fields that must be filled in before a clip can ship.

---

## D-26 — CI ignores vendored bundles **CLARIFIED**

**Decision.** ESLint ignores `public/ort/**` and `public/mediapipe/**`.

**Why.** Those directories hold minified third-party runtime bundles copied in by
`scripts/setup-assets.mjs`. Linting them produced **895 errors and 9,143 warnings**, which
buried the four real problems in the project's own source. They are already in `.gitignore`.

**Verified.** With the ignore in place, `npm run lint` is clean. The four real findings it
exposed — two unescaped apostrophes and two unused imports — are fixed.

---

## D-27 — `verification.status` values are validated, not trusted **CLARIFIED**

**Decision.** A phrase with `status: "expert_verified"` is a hard error unless it has a named
verifier, a `YYYY-MM-DD` verification date, **and** a clip.

**Why.** FR-VIS-04 requires that metadata. More importantly, an *unverifiable claim of
verification* is worse than no claim at all: it would let a clip reach a deaf patient while
carrying a badge that says a professional approved it. Making it a build failure means the
claim cannot be made accidentally.

**Mirrored in two places on purpose.** `lib/phrases/schema.ts` (runtime) and
`scripts/validate-phrases.mjs` (CI) are separate implementations that deliberately do not share
code, so a bug in one does not hide itself in the other.
