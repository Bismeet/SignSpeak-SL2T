# SignSpeak ML pipeline

This directory trains and exports the sign-recognition classifier that the web app loads in
the browser. It is **optional**: the app runs without it, and shows "Not recognised" plus
the phrase board, typing and Emergency mode as alternatives.

Nothing here is a placeholder, and nothing here is claimed to work better than it does.
As of this build there is **no real model**, because there is no real data yet. See
[Honesty](#honesty-this-is-the-important-part).

---

## Setup

The pipeline needs Python 3.9–3.12. Python 3.13 is refused on purpose: scikit-learn 1.4.2,
onnxruntime 1.18.1 and numpy 1.26.4 publish no 3.13 wheels, and numpy 2.x is excluded
because scikit-learn 1.4.x was built against the numpy 1.x ABI. This only affects training —
the web app never runs Python.

```bash
npm run ml:setup
```

That finds a supported interpreter, creates `ml/.venv` and installs `ml/requirements.txt`.
It is the only supported way to set up the environment, because it also pins
`protobuf==4.25.3` — see [Troubleshooting](#troubleshooting).

---

## Running the pipeline

```bash
# Prove the pipeline works end to end without any real data.
# Generates procedural landmarks, trains, evaluates, exports and verifies.
npm run ml:smoke

# The real run. Requires collected data in ml/data — see ml/data/README.md.
npm run ml:train

# Re-evaluate an exported model without retraining.
npm run ml:eval

# Show the candidate algorithms and which of them can be exported.
npm run ml:algorithms

# Regenerate the TypeScript/Python parity fixtures and the demo replay fixtures.
npm run ml:fixtures
```

`npm run ml:train` performs six stages:

1. **Dataset** — load samples, normalise labels, gate on the vocabulary, assess quality
   against the documented minimums.
2. **Split** — hold out whole signers (never frames), choosing the signers that keep the
   most training classes alive.
3. **Candidate comparison** — train every exportable algorithm and rank by held-out-signer
   macro F1 over the positive classes.
4. **Leave-one-signer-out cross-validation** — mean macro F1 across every signer.
5. **Export** — convert to ONNX, then **verify the graph against scikit-learn** before
   writing it. A mismatch aborts the export.
6. **Results** — per-class table, confusion matrix, MET/NOT MET against the documented
   acceptance targets, and a model card.

Outputs land in `ml/artifacts/<model_version>/`:

| File | What it is |
| --- | --- |
| `sign-clf-v1.onnx` | The exported classifier |
| `model-card.json` | Machine-readable honesty record, read by the browser |
| `run-report.json` | Full run: config, dataset summary, every metric, provenance |
| `evaluation.txt` | The human-readable report printed by stage 6 |

---

## The two contracts

Everything else in this directory exists to serve two interfaces.

### 1. The feature vector — `ss-features-v1`

159 floats per frame, fixed layout. Defined once in `ml/signdata/constants.py` and once in
`lib/vision/features.ts`, and they must agree exactly.

| Slice | Contents |
| --- | --- |
| `0:126` | 2 hands × 21 landmarks × (x, y, z) |
| `126:128` | per-hand presence flag and detection score |
| `128:132` | per-hand centroid, normalised by shoulder width |
| `132:138` | per-hand palm normal (x, y, z) |
| `138:148` | per-hand five fingertip distances from the wrist |
| `148:158` | per-hand five extension angles |
| `158` | pose-present flag |

Normalisation is wrist-origin and hand-size (middle-MCP) scaled. Rotation is deliberately
**not** normalised: palm orientation is one of the five phonological parameters of ISL, so
removing it would delete a real distinction between signs.

Two implementations of one contract is risk R14 in `docs/risk-register.md`, so the agreement
is tested rather than assumed. `ml/scripts/build_fixtures.py` writes 19 deliberately awkward
cases (NaN coordinates, degenerate hands, duplicate handedness, missing shoulders,
unmirrored camera) to `tests/fixtures/features-parity.json`, and
`tests/features-parity.test.ts` runs both implementations over all of them and fails if any
value differs by more than 1e-6.

**If you change the layout, change it in both files, regenerate the fixtures, and bump
`FEATURE_VERSION` in both places.** A silent change here invalidates every model ever
trained, and the browser will happily run a stale model against a new layout unless the
version check in `lib/model/card.ts` stops it.

### 2. The model card — what the browser trusts

`lib/model/card.ts` parses the card and **fails closed**. A card is rejected outright if the
vocabulary is empty, if `inputDim` is not 159, or if `featureVersion` is not
`ss-features-v1`. `notForRealUse` is only `false` when the card says so explicitly *and*
`trainingSource` is `collected_consented_dataset`.

That is the mechanism that stops a smoke-test model from being mistaken for a real one. The
app cannot be tricked into confidence by a well-formed-looking file.

---

## Algorithms

| Key | Exportable | Notes |
| --- | --- | --- |
| `knn` | yes | k=7, distance-weighted, standardised features. Cheap sanity check. |
| `random_forest` | yes | 400 trees, balanced subsample. Handles mixed scales, exports as a tree ensemble. |
| `logistic_regression` | yes | Multinomial, standardised. If this matches the forest, the task is easier than expected. |
| `mlp` | yes | (256, 128), Adam, early stopping. Usually strongest on landmark features. |
| `svm_rbf` | **no** | Offline comparison only. Its calibrated probabilities are not faithfully reproduced in ONNX, so `train.py` will never ship it. |

`svm_rbf` is kept because a non-exportable model can still tell you whether the feature set
is informative. If it wins by a wide margin, that is a finding about the features, not a
reason to ship it. `train.py` substitutes an exportable model and records
`substitutedForNonExportable` in the run report so the swap is visible.

---

## Honesty (this is the important part)

The pipeline is built so that a misleading artefact is hard to produce by accident.

- **A model is only `notForRealUse: false`** when it was trained on real consented data
  *and* the dataset meets every documented minimum. Any blocker, or any synthetic data,
  forces `true`.
- **Blockers do not stop training.** They mark the output. You still get a model, metrics
  and a card — all labelled as not for real use, which is more useful than an error.
- **A `notForRealUse` model is refused at the staging step.** `train.py` will not copy it
  into `public/models` unless you pass `--stage-for-browser` explicitly, so a smoke-test
  model cannot end up in a build by default.
- **The export is verified, not assumed.** `verify_onnx_agreement` reloads the written graph
  and compares it against `predict_proba` on real rows. A disagreement raises instead of
  shipping.
- **Limitations are generated, not written.** `default_limitations()` derives the list from
  what the model actually is, so the card cannot claim a negative class it does not have.
- **Acceptance targets are reported, never asserted.** Stage 6 prints MET / NOT MET against
  `docs/testing-and-evaluation.md` §2.2 and leaves the judgement to you.
- **Metrics match the user experience.** False accept and false reject rates are computed
  *through* the browser's real accept/reject gate (`lib/vision/decision.ts`), not on raw
  argmax. Window accuracy by majority vote is reported alongside frame accuracy, because a
  user sees a sign, not a frame.
- **Synthetic data is labelled everywhere.** `synthetic.py` exists to smoke-test the
  pipeline; every artefact derived from it carries `notForRealUse: true` and a notice.

### What the smoke test actually measures

The smoke test scores ~1.00 macro F1. **That number is meaningless** and the model card says
so. The generator draws each class from a distinct procedural hand shape, so the classes are
separable by construction — it tests the plumbing (feature extraction, splitting, training,
export, verification, card writing), not recognition.

### What a real run still needs

1. An ISL signer to confirm the canonical form of each gloss in
   `data/sign-vocabulary.json`. Every entry is currently `verification: "unverified"` and
   `motion: "unverified"` — we do not yet know which signs are static, and that determines
   whether a frame-based classifier is sufficient at all (risk R2).
2. Recordings from at least **6 signers** per sign, so a held-out-signer split means
   something.
3. At least **20 repetitions per sign** and at least **300 negative (`OTHER`) frames**.

Without an explicit negative class the model is forced to choose a supported sign for every
input, and rejection rests entirely on the confidence and margin thresholds. That is
weaker, and the card says so in plain language.

---

## Troubleshooting

**`Could not convert this estimator to ONNX: … Expected an int, got a boolean`**

The known skl2onnx/protobuf incompatibility. protobuf 5+ validates repeated int64 fields
strictly and rejects the boolean values that skl2onnx 1.17.0 emits for tree ensembles, so
every random forest or gradient-boosted export fails. Fix:

```bash
npm run ml:setup
```

which pins `protobuf==4.25.3`. Do not "upgrade" it.

**`Could not convert this estimator to ONNX: … Unable to create node` with a huge dump of
attribute values**

Same root cause. The message is trimmed to the underlying cause and names this fix.

**`ml/.venv` is missing**

`npm run ml:setup`. The launcher never falls back to a system Python, because the wrong
numpy ABI produces confusing failures much later.

**Parity test fails after changing `lib/vision/features.ts`**

Regenerate the fixtures (`npm run ml:fixtures`) and, if the layout genuinely changed, bump
`FEATURE_VERSION` in `ml/signdata/constants.py` and `lib/types.ts`. Do not widen the
tolerance to make the test pass — a real disagreement between the two implementations means
the model is being trained on different numbers than the browser computes.
