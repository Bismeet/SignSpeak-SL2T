# AI/ML and Dataset Plan

Nothing in this document is a result. All numbers are targets or assumptions.

## 1. Vocabulary selection

### 1.1 Selection criteria

1. Directly useful in hospital/emergency communication.
2. Preferably distinguishable by **handshape and location** (static) so the MVP classifier can handle it; movement-based signs go to the Should-have tier.
3. Not easily confused with another sign in the set (checked by an ISL signer).
4. Performable with a patient sitting or lying down, ideally one-handed where ISL allows.
5. Present in the ISLRTC dictionary so the canonical form can be referenced.

### 1.2 Candidate recognition vocabulary (`PROPOSAL`, all forms `UNVERIFIED` until confirmed by an ISL signer against the ISLRTC dictionary)

| Gloss | Category | Expected static/dynamic | MVP tier | Notes |
|---|---|---|---|---|
| PAIN / HURT | Pain | unverified | Must | Core sign; may be dynamic |
| HEAD | Body | likely static (point) | Must | Pointing signs need pose landmarks |
| STOMACH | Body | likely static (point) | Must | |
| CHEST | Body | likely static (point) | Must | |
| WATER | Needs | unverified | Must | |
| TOILET / BATHROOM | Needs | unverified | Must | |
| MEDICINE | Needs | unverified | Must | |
| HELP | Help | unverified | Must | |
| DOCTOR | People | unverified | Must | |
| YES | Answers | unverified | Must | |
| NO | Answers | unverified | Must | |
| UNDERSTAND / DON'T UNDERSTAND | Answers | unverified | Should | Negation may be non-manual |
| FEVER | Symptoms | unverified | Should | |
| VOMIT | Symptoms | likely dynamic | Should | |
| BREATHE (difficulty) | Symptoms | likely dynamic | Should | |
| CALL FAMILY / PHONE | Help | unverified | Should | |
| Numbers 0 to 10 | Pain scale | likely static | Should | If one-handed in ISL, good candidates; verify |

Target: **10 to 15 Must-tier signs** after expert review removes confusable or infeasible ones. Anything the expert says is dynamic moves to the Should tier unless the temporal approach is adopted early.

### 1.3 Hospital phrase list for verified clips (output side)

Around 30 phrases, grouped. Each needs expert-verified ISL clip and Hindi translation. `PROPOSAL`:

- **Staff questions:** Where does it hurt? How much pain, 0 to 10? Since when? Are you allergic to any medicine? Do you take any medicines? Are you pregnant? Do you have fever? Can you breathe normally? Please wait here. The doctor is coming. I will give you an injection. Do you understand? Who should we call?
- **Staff instructions:** Sit down. Lie down. Please show me. Open your mouth. Take a deep breath. Do not eat or drink now. Sign here (consent).
- **Patient statements (also on phrase board):** I am deaf. I use Indian Sign Language. I need an interpreter. I have pain here. It hurts a lot. I feel dizzy. I cannot breathe well. I need water. I need the toilet. I need my medicine. Please call my family. I do not understand. Please write it down. Yes. No. Thank you.

All of these require ISL expert validation of both the signing and the appropriateness of phrasing in a medical setting.

## 2. Data sources

- **Primary:** team-collected dataset (Section 3).
- **Secondary (pipeline development and possible pretraining):** INCLUDE, subject to licence verification. Any overlap between INCLUDE classes and our vocabulary is a bonus, not a plan.
- **Never:** ASL datasets labelled as ISL.

## 3. Data collection plan (fallback that is actually the primary plan)

### 3.1 What is recorded

`PROPOSAL` Record **landmark sequences, not video, by default**. A browser-based collection tool (an early version of the app's camera module) captures MediaPipe landmarks per frame and saves them as JSON/NumPy with labels. Optionally, and only with explicit separate consent, record raw video for later re-extraction if MediaPipe is upgraded. Raw video, if any, is stored offline on team-controlled encrypted storage, never in the repository.

### 3.2 Quantity targets

| Item | Target | Rationale |
|---|---|---|
| Signers | >= 6 (at least 2 fluent ISL users, mix of hand sizes, skin tones, genders, ages) | Enables held-out-signer evaluation with at least 1 to 2 signers held out |
| Repetitions per sign per signer | >= 20 for static, >= 30 for dynamic | Classical ML on landmarks works with low hundreds per class |
| Total per static class | >= 120 samples (frames or short clips) | |
| Negative / idle class | >= 300 samples of resting hands, random gestures, non-vocabulary signs | For rejection |
| Conditions per signer | 2 lighting setups, 2 backgrounds, 2 camera distances, sitting and lying poses | Robustness |

If fewer signers are available, the evaluation must state the number honestly and the demo must mention it.

### 3.3 Recording protocol

1. Show the canonical ISLRTC clip to the signer; expert confirms the form.
2. Signer performs the sign on a visual cue; tool records a 2 second window (static) or the full motion with start/stop (dynamic).
3. Tool shows landmark overlay so the operator can discard samples where tracking failed.
4. Metadata per sample: signer pseudonymous ID, sign label, session, camera, lighting tag, pose (sitting/lying), handedness, tool version, MediaPipe version.
5. Hearing team members may record **only** after coaching from an ISL signer, and their samples are tagged `signer_type: learner` so they can be excluded from the test set.

### 3.4 Labelling and annotation

- Labels are assigned at capture time; a second person reviews a random 10% for label errors.
- Dynamic signs additionally get start/end frame indices.
- Ambiguous or poorly performed samples are marked `quality: low` and excluded from test.

### 3.5 Consent and privacy

- Written consent form (plain language, ISL video version of the form for deaf participants).
- Consent covers: what is recorded (landmarks; video if separately ticked), purpose (training a prototype), storage duration, right to withdraw and have data deleted, whether data may be published (default: no).
- No names in data files; a separate offline key maps pseudonyms to consent forms.
- Children are not recorded.
- See `privacy-and-safety.md`.

## 4. Feature engineering

- Per hand: 21 landmarks, translate so wrist is origin, scale by wrist-to-middle-finger-MCP distance, optionally rotate so the wrist-to-middle-MCP vector is vertical (test whether rotation normalisation helps or hurts orientation-dependent signs).
- Two-hand ordering: fixed slots for left and right; zeros plus a presence flag when a hand is absent.
- Location: hand centroid relative to shoulder midpoint, scaled by shoulder width (from Pose Landmarker).
- Orientation: palm normal vector from wrist, index-MCP, pinky-MCP.
- Engineered: pairwise fingertip distances, finger extension angles.
- Dynamic: window of T frames (T = 30 at ~15 FPS, about 2 s), resampled to fixed length; either flattened for RF, aggregated (mean/std/min/max/velocity) for classical ML, or fed as a sequence to a GRU.
- Feature code exists **twice** (Python and TypeScript) and is verified for parity with fixtures in CI.

## 5. Models

### 5.1 Baselines (train all, pick by validation)

1. k-NN (k = 5) on normalised features (also gives distance-based rejection).
2. Random Forest (200 trees).
3. SVM with RBF kernel (probability outputs).
4. MLP (2 hidden layers, 128 and 64 units, dropout) in scikit-learn or PyTorch.

### 5.2 Dynamic signs (Should-have)

1. Aggregated temporal features + RF/SVM.
2. Small GRU (1 layer, 64 units) in PyTorch, exported to ONNX.
3. DTW k-NN as a low-data fallback.

### 5.3 Rejection

Probability threshold and margin tuned on validation to hit a target false-accept rate on the negative class; explicit idle/other class included in training.

## 6. Splits

- **Group split by signer.** No signer appears in more than one of train/validation/test. With 6 signers: 4 train, 1 validation, 1 test, rotated (leave-one-signer-out cross-validation) for reporting; a final fixed held-out signer for the demo claim.
- Within a signer, sessions are kept together to avoid near-duplicate leakage.
- Negative class split the same way.

## 7. Evaluation

| Metric | Why |
|---|---|
| Per-class precision, recall, F1; macro F1 | Class balance matters; a single accuracy hides weak classes |
| Confusion matrix | Shows which sign pairs need vocabulary changes |
| Held-out-signer accuracy vs seen-signer accuracy | Measures generalisation to new users |
| False-accept rate on negative class at chosen threshold | Rejection quality |
| False-reject rate on supported signs | Usability cost of rejection |
| Inference latency (browser, per frame and end-to-end to chip) | NFR-02 |
| Robustness slices: lighting, pose (sitting/lying), handedness | Bias check |

Targets are set in `testing-and-evaluation.md`. Results will be written into `ml/reports/` and summarised in a model card; **none exist yet**.

## 8. Versioning and reproducibility

- Dataset versions: `data/vX.Y/` with a manifest (sample counts per class per signer, tool and MediaPipe versions, hash).
- Training: single `train.py` with config file and fixed seeds; outputs model file, metrics JSON, confusion matrix image, and `model-card.json` (vocabulary, input contract, normalisation version, training data version, metrics, known limitations, date).
- Exported model files named `sign-clf-vX.Y.onnx` and referenced by the frontend by exact version.
- Large files (video) tracked with Git LFS or kept outside the repo; landmarks JSON may be committed if participants consented to that specific use.
- GitLab CI job re-runs evaluation on the committed dataset manifest and fails if metrics regress beyond a tolerance.

## 9. Known limitations to state in the model card

- Small number of signers; regional variants not covered.
- Static-only (if dynamic tier is not reached).
- Single camera, frontal view assumed.
- No non-manual (facial) features.
- Trained for the ISLRTC dictionary forms only.
