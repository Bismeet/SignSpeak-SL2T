# ISL Dataset and Model Feasibility Report
Date: 2026-09-16 UTC. Audit only. No training, download, or execution was performed.
Goal: webcam -> recognize one isolated ISL word -> show English text.
## 1. Executive Summary

No resource provides a ready, verified webcam ISL word recognizer. Every pretrained claim has a catch.

- Best data for MVP (Verified): Resource D `vidit031/isl-isolated-40words` — 642 MP4 clips, 40 glosses, 196 MB, per-clip provenance, direct HF download. Only word-level ISL set small enough for a hackathon.
- Best webcam pattern (Verified code, weak model): Resource E `Sooryak12/Indian-Sign-Language-Recognition` pycode branch — 5-sec OpenCV capture to MediaPipe Holistic to LSTM argmax, weight file `lstm-model/170-0.83.hdf5` present. Only 3 signs, outdated deps, Windows paths, no license, no unknown gate. Accuracy 74-84% is Author-reported, not tested here.
- Heaviest but rigorous: Resource A INCLUDE — 4292 videos, 263 signs, CC-BY-4.0, 56.8 GB, full PyTorch LSTM/Transformer code, 6 real wandb URLs + 4 placeholder links. No webcam code. Second-phase option.
- Avoid for MVP: B Kaggle (login-gated, unverifiable, unknown license) and C ISLTranslate/iSign (31k-118k sentence pairs, 228 GB, CC-BY-NC-SA-4.0, continuous translation, wrong task, no word classifier).
- Path: prototype on D data + E pattern, train small sequence model for 5-10 words with confidence and unknown gate. Fall back to INCLUDE-50 if D label noise too high.
## 2. Project Requirements

MVP: judge performs isolated ISL sign to webcam; system shows English word; repeat; ideally confidence + unknown sign handling. Not sentence translation.

SignSpeak repo context (inspected 2026-09-16): Next.js static export, browser-first on-device inference via MediaPipe Tasks Vision + ONNX Runtime Web, 159-float ss-features-v1 per frame, sklearn-to-ONNX pipeline in ml/. No real model ships yet; vocab entries unverified; acceptance needs held-out-signer macro-F1 and false-accept/reject through lib/vision/decision.ts. PyTorch LSTM/Transformer weights from A/E do not drop into that path without export work.

Missing info and assumptions: OS/GPU/RAM/camera unknown — assume CPU-only 8GB laptop, 640x480 webcam. Time unknown — assume 24-72h. Bandwidth unknown — assume 200MB OK, 56-228GB not OK at venue. HF/Kaggle accounts — assume creatable. Demo use — assume research/demo only. ISL signer access — assume none, so correctness unverifiable live.

## 3. Investigation Methodology

Per resource: inspect primary source; classify availability A public downloadable, B registration/approval, C request authors, D missing/inaccessible, E paper-only; inspect README/tree/requirements/train/infer/labels/webcam/license/issues; label claims Verified / Author-reported / Unverified / Unavailable; score only on webcam isolated-word task.

Inspected raw files: A README, requirements, pretrained_links.json, runner.py, train_nn.py, configs.py, dataset.py, generate_keypoints.py, evaluate.py, LICENSE; E README, requirements, app.py, deploy-code.py, run-through-cmd-line.py, helper_functions.py; D README raw + viewer JSON; HF cards CISLR, ISL500/ISL-DATA, iSign; ACL CISLR + ISLTranslate; arXiv iSign + search; Zenodo 4010759; GitHub trees A label_maps, E lstm-model + training-data. No clone/download/install/run. Kaggle fetch returned title-only JS shell; no auth attempted.
## 4. Resource-by-Resource Analysis

### Resource A — INCLUDE / INCLUDE-50 (AI4Bharat)

Availability: A for code + metadata; A with heavy cost for videos (public Zenodo, no login). Code MIT (Verified, LICENSE raw). Data CC-BY-4.0 (Verified, Zenodo rights).

Contents (Verified from Zenodo + raw code): 4292 videos, paper said 4287 +5 added; train.csv 3475, test.csv 817; INCLUDE50 766 train +192 test; 263 word signs, 15 categories, 0.27M frames; deaf students St Louis School for Deaf Chennai; isolated 1-sign clips. Splits in `train_test_paths/` + label maps `label_map_include.json`, `label_map_include50.json` (filenames Verified, label contents not opened). Requires `generate_keypoints.py` (MediaPipe Hands + Pose upper_body_only) to JSON keypoints, then `runner.py` trains LSTM/Transformer/XGBoost. Input 134-dim/frame (25 pose +21+21 hands x,y; configs.py Verified), padded max_frame_len 200 train /169 eval, interpolated. LSTM 5-layer bi 256 hidden; Transformer small 2L/256/4-head vs large 4L/512/8-head BERT backbone; MobileNetV2_100 CNN option 1280-dim; XGBoost no pretrained. Reported best 94.5% INCLUDE-50, 85.6% INCLUDE — Author-reported (Zenodo/paper abstract; not run here). Pretrained_links.json Verified: 6 api.wandb.ai URLs (no-cnn LSTM + small/large Transformer for include + include50) + 4 `link` placeholders for use_cnn variants = Unavailable. No webcam file (Verified by file list). evaluate.py takes directory of videos, extracts keypoints, loads `include_no_cnn_transformer_large.pth` 263-class, argmax JSON — file clips only, no threshold/unknown.

Dataset suitability: genuine ISL Yes Verified; labeled Yes Verified; ~16 clips/sign avg (4292/263) low; vocab demo-appropriate Partial; multi-signer limited single school; varied conditions No (classroom-like); splits Yes; leakage risk low if split respected; generalization to judges Unverified/likely weak; legal CC-BY-4.0 Yes with attribution.

Model: checkpoint Partial (6/10); RGB? No — keypoints only; words Yes isolated; motion Yes sequences; fixed frames via pad; camera angle unspecified; webcam No; local CPU possible but MediaPipe + Transformer heavy, latency Unknown; unknown rejection No.
### Resource B — Kaggle ISL Video Dataset (prasadshet)

Availability: D/B — Unavailable to verify. Page fetch returned title-only JS shell (~10KB); data tab same. Cannot confirm sign count, videos, format, structure, labels, size, license without login. Kaggle datasets typically need login + accept rules; state explicitly: requires Kaggle account/auth (Unverified but expected). Do not use as primary.

All suitability questions: Unverified. Risks: unknown provenance (genuine ISL? duplicates? missing labels? inconsistent conditions?), unknown license (cannot demo legally), no known pretrained/webcam code. Suitable for realtime? Unknown. If you must check: create account, record exact title/owner/file count/folder tree/video codec/sample labels/license tab, open 5+ clips per class, do not claim inspection until done.

### Resource C — ISLTranslate / iSign (Exploration-Lab)

Relationship (Verified): ISLTranslate (ACL Findings 2023, 31k continuous ISL-English sentence/phrase pairs) is predecessor/subset; iSign (ACL Findings 2024, 118k+ video-sentence pairs) is superset benchmark with 5 tasks: SignVideo2Text, SignPose2Text, Text2Pose, CISLR word recognition, word-presence + semantics. ISLTranslate repo holds only data/ + README + thumbnail (3 commits, no training/inference .py Verified).

Data (Verified from HF card + site + papers): sentence-level Yes; isolated word clips suitable for MVP No (except via CISLR Task-3 or word-presence pairs, not a classifier). Annotations English translations + UIDs `videoID-seq`; pose-format .pose files; CSVs `iSign_v1.1.csv`, word-presence + word-description sets. Access: HF gated — must log in + share contact info (B). Size 228 GB video+pose split parts (`cat part_aa part_ab > zip` Verified instructions). License CC-BY-NC-SA-4.0 (Verified) — research-only, non-commercial, share-alike; conflicts with permissive/commercial demo. No usable word checkpoint (Verified — site/HF list tasks/data only; one community fine-tune `kvn420/Tenro_V4.1` unrelated). No webcam code (Verified). Baseline transformer translation exists in paper only; BLEU details not extracted here — do not cite numbers. Excessive for word MVP: Yes — 1000x data, wrong task (continuous translation != isolated classification), heavy compute, NC-SA risk.
### Resource D — HF `vidit031/isl-isolated-40words`

Availability: A (Verified). Public ungated HF dataset; metadata via `load_dataset`, clips via `hf_hub_download` (code Verified in README raw).

Contents (Verified): 642 H.264 MP4, 40 glosses, height 480, ~30fps, 196 MB total, 897 downloads last month. Layout `metadata.csv` + `<word_slug>/*.mp4` + `sources.txt`; `video_path` relative. Vocab: hello goodbye thank you sorry please yes no help stop okay me you he she mother father brother sister friend teacher student home school hospital market eat drink water food tea come go sit stand read write what where when today. Viewer row Verified fields: word, normalized_word, dataset, original_label, video_path, original_filename, signer, split=null, fps 30, resolution 480x480 or 854x480, duration 1.73-14.3s, license, paper, repository, download_url, sha256, phash, quality_score 0.85/1, duplicate_status unique, review_status accepted/Needs Manual Review.

Sources (Verified table): ISL500 405, INCLUDE 143 CC-BY-4.0, CISLR 81 AFL-3.0, ISLRTC re-encode 13 MIT + data.gov.in terms. Derived aggregate, no single license — must respect per-subset. Aliases e.g. INCLUDE alright->okay, house->home; some rows Needs Manual Review. No train/test split column populated (split=null Verified) — you must make signer-aware split. No pretrained model, data only (Verified).

Dataset: genuine ISL Partial (depends on upstream; ISL500 provenance weakest — card says research/academic only, contact authors for commercial). Labels Partial (aliases + review flags). ~16 clips/sign avg, good for 40 words at 196MB. Multi-signer Yes (User001 etc + CISLR hashes). Conditions varied Partial (480x480 square vs 854x480 wide = domain gap). Splits No (must build). Leakage risk Medium (near-dupes across sources; use sha256/phash + signer holdout). Judge generalization Unverified. Legal Partial — per-source NC/AFL/MIT/research-only; demo OK with attribution, commercial No.

Model: none. Engineering: easiest — pip hf_hub_download, filter metadata.csv, train small net. Preprocessing: resize/normalize frames or extract landmarks. Webcam: none included.
### Resource E — Sooryak12 Indian-Sign-Language-Recognition (pycode)

Uses INCLUDE? Yes Partial (Verified README: INCLUDE50 + self-recorded; 25 INCLUDE +60 own per action, augmented to 340/action, 1020 train; val 10+20/action=90; realtime test 8/action=24). Code runs today? No/Unverified — pinned TF 2.13/Keras 2.13/mediapipe 0.10.2/numpy 1.25.1/opencv 4.5.2.52/pandas 1.3.5/sk_video 1.1.10/fastapi/uvicorn (Verified requirements); TF-Keras vs standalone keras conflict, skvideo ffmpeg, mediapipe 0.10.2 vs py3.13 likely break; helper has bug `keypoints.shape()` + `shape` possibly undefined if 0 frames; hardcoded Windows `lstm-model\170-0.83.hdf5` + `input-video\input.mp4` break Linux. Weights present? Yes Verified (tree lists `170-0.83.hdf5`). Isolated words Yes (3-class: Hello / How are you / thank you — note inconsistent casing Verified). Webcam Yes Verified pattern: deploy-code.py loops 10x, VideoCapture(0), 5-sec DIVX avi-in-mp4, holistic extract, LSTM predict argmax print; plus FastAPI upload `app.py` and CLI `run-through-cmd-line.py -i`. No confidence/unknown: argmax only, None class mentioned in README but not in `actions` array (Verified mismatch). Setup: `pip install -r requirements.txt; python deploy_code.py` (Verified) — Suggested to fix paths/deps first. Accuracy 78 train /74.6 val /84 realtime LSTM vs 82/42.4/5 CRNN — Author-reported only. License: none found (Unavailable — do not assume reusable; contact author). Reuse: technically instructive, legally unclear, only 3 words so not a product.
## 5. Fair Comparison

| Resource | ISL verified? | Word-level data? | Sentence-level data? | Pretrained weights? | Webcam inference? | License clear? | Setup difficulty | Main limitation |
|---|---|---|---|---|---|---|---|---|
| A INCLUDE | Yes | Yes | No | Partial | No | Yes (MIT+CC-BY-4.0) | Hard (56.8GB+keypoints) | Heavy; no webcam; ~16 clips/class |
| B Kaggle | Unverified | Unverified | Unverified | No | Unverified | No | Unknown (login) | Cannot verify without auth |
| C ISLTranslate/iSign | Yes | Partial (via CISLR task) | Yes | No | No | Partial (CC-BY-NC-SA-4.0) | Very hard (228GB gated) | Wrong task; huge; NC-SA |
| D HF 40-words | Partial | Yes | No | No | No | Partial (multi-source) | Easy (196MB) | Mixed-source noise; no split/model |
| E Sooryak12 | Partial | Yes (3 words) | No | Yes (3-class) | Partial | No (no license) | Medium (outdated) | Toy vocab; stale deps; no gate |

| Resource | Data access | Model availability | Training required? | Real-time potential | Main engineering work | Evidence confidence |
|---|---|---|---|---|---|---|
| A | Public, 56.8GB zips + splits | 6 wandb .pth, 4 missing | Yes (keypoints+train) | Medium (keypoint Transformer CPU-heavy) | Download subset; keypoints; train; build webcam+gate; ONNX export | High (raw files read) |
| B | Login-gated, unverified | None known | Unknown | Unknown | Verify access/labels/license first | Low (title-only fetch) |
| C | Gated HF, 228GB parts | None (word) | Yes + huge | Low (translation seq2seq) | Do not use for MVP | High (cards/papers read) |
| D | Public HF, 196MB | None | Yes (small) | High (small classifier) | Signer split; train 5-10 words; gate; ONNX | High (README+viewer read) |
| E | 3-class weights present | 3-class .hdf5 present | For >3 words yes | High (tiny LSTM) but trivial task | Fix paths/deps; add confidence/unknown; retrain | Medium (code read, not run) |

Trade-offs: D is smallest verified word data; A is cleanest single-source but costly; E is only webcam pattern but toy; C is rigorous but wrong task; B is unusable until verified.
## 6. Model and Checkpoint Availability

- A: 6 real wandb URLs + 4 `link` placeholders (Verified pretrained_links.json). 263-class +50-class LSTM/Transformer no-cnn. No XGBoost/CNN weights. Links not downloaded/tested — availability Unverified at fetch time.
- E: `lstm-model/170-0.83.hdf5` listed in tree (Verified present). 3-class LSTM 64-128-256-64 + Dense 64/32/softmax, input (45,258) holistic (pose 33x4 +2x21x3) (Verified app.py/helper). Not tested; TF version risk.
- D/C/B: no word classifier checkpoint (Verified absent for D/C; Unverified for B).
- SignSpeak needs ONNX sklearn-compatible export; PyTorch .pth / TF .hdf5 need conversion work (Verified from ml/README + package.json).

## 7. Webcam and Real-Time Feasibility

Only E has webcam code Verified: fixed 5-sec capture, offline predict, ~10-video loop, no streaming, no confidence, no idle rejection. Usable as pattern, not product. A evaluate.py is file-clip only (needs capture wrapper + buffering + gate). D needs full pipeline. C sequence translation unsuitable for low-latency single-word demo. B unknown. CPU: tiny LSTM (E) plausible; A Transformer + MediaPipe Hands+Pose per frame heavy on student CPU — latency Unknown, must measure. Required gate for MVP: softmax confidence + margin + no-hand/idle rule + temporal majority vote; none of A-E Verified to include it.

## 8. Licensing and Data Risks

- A: code MIT, data CC-BY-4.0 — clearest; attribute Sridhar et al + AI4Bharat; check bit.ly download script trust.
- D: aggregate — ISL500 research/academic-only (contact authors for commercial), INCLUDE CC-BY-4.0, CISLR AFL-3.0, ISLRTC MIT + data.gov.in terms. Keep per-clip license column, cite originals, demo-only, do not relicense as one license.
- C: CC-BY-NC-SA-4.0 — no commercial/public-commercial demo; share-alike.
- CISLR standalone: AFL-3.0 + gated contact share.
- E: no license file — all reuse technically infringing until clarified; do not ship weights; reimplement pattern.
- Ethics: A signers deaf students; D/E consent/provenance uneven; no ISL signer verification available — label demo unverified, do not claim certified.
## 9. Technical Risks and Unknowns

1. Generalization to judges: all sets train on few signers/conditions; live accuracy will be below reported splits. Mitigate: signer holdout, confidence gate, small vocab.
2. D label/domain noise: aliases + mixed resolutions + review flags. Mitigate: start INCLUDE-only or accepted-only subset.
3. No verified checkpoint: A links untested, E toy. Assume training required.
4. Stale deps: A unpinned torch/transformers/timm/mediapipe; E TF2.13/mediapipe0.10.2. Pin + venv; do not run blind.
5. MediaPipe API drift: A uses Hands+Pose, E Holistic, SignSpeak Tasks Vision — extractors differ; lock one.
6. Temporal modeling: static-frame SignSpeak pipeline may fail motion signs; need sequence pooling/LSTM. Start with static-friendly words (hello, stop, yes/no) + 1-2 motion words to test.
7. Latency unknown everywhere — measure MediaPipe + inference ms/frame on target laptop.
8. Kaggle unknown — timebox to 30 min verify or drop.
9. ONNX export gap — A/E weights not directly shippable to SignSpeak web app.
10. No unknown rejection in any resource — must build; else idle hands force wrong word.

## 10. Minimal Validation Test Plan (primary: D; backup: A-50; pattern: E)

Scope: prove data loads, baseline trains, webcam path works, gate rejects unknown. Suggested commands are NOT confirmed; Verified lines are quoted from sources.

1. Get repos/data (Verified snippets):
   - D README (Verified): `ds = load_dataset("vidit031/isl-isolated-40words")`; `hf_hub_download(repo_id="vidit031/isl-isolated-40words", repo_type="dataset", filename=df.loc[0,"video_path"])`.
   - A README (Verified): `pip install -r requirements.txt`; `python generate_keypoints.py --include_dir <path> --save_dir <path> --dataset <include/include50>`; `python runner.py --dataset <include/include50> --use_augs --model transformer --data_dir <keypoints>`; `python evaluate.py --data_dir <dir with videos>`.
   - E README (Verified): `pip install -r requirements.txt`; `python app.py`; `python deploy_code.py`; `python run_through_cmd_line.py -i input_file_path`.
2. Suggested env: `python -m venv .venv; source/.venv activate; pip install datasets huggingface_hub pandas opencv-python mediapipe scikit-learn onnxruntime torch --extra-index-url cpu`.
3. Suggested D smoke: download metadata.csv; count per word/signer/resolution/license; play 3 clips/word for 8 words; drop Needs Manual Review; build signer holdout (e.g. train User001-012, test User013-015 + CISLR hashes grouped); check sha256/phash dupes across splits.
4. Suggested baseline: 5-10 words (hello, thank you, yes, no, help, stop, please, sorry). Extract MediaPipe landmarks per frame OR uniform 45-frame sampling (E pattern); train small LSTM/Temporal-CNN or sklearn on pooled features; report held-out-signer macro-F1 + confusion.
5. Sample video check: hold out 2 clips/word unseen signer; confirm argmax maps via label map; test motion words (thank you, hello) vs static (stop); log softmax + margin.
6. Webcam check (adapt E deploy-code.py pattern, fix Windows paths): 5-sec capture -> landmarks -> predict; measure MediaPipe ms + model ms + end-to-end s; test new signer; test idle/no-hands and unsupported word must yield Unknown via thresholds.
7. Accuracy/latency: top-1 + macro-F1 on holdout; FAR/FRR through gate; fps at 640x480; CPU-only.
8. Stop/go: GO if holdout macro-F1 usable + gate rejects idle; else shrink vocab, filter to single source (INCLUDE-only), or fall back to A-50 subset.
## 11. Recommendation and Backup Option

1. Investigate first: D. Smallest verified word data, fastest to disprove/prove.
2. Quick prototype: D + E pattern (data from D, capture/sequence idea from E). No single ready prototype exists.
3. Most suitable data: D for speed; A for rigor (backup).
4. Most usable pretrained: E 3-class .hdf5 technically present but toy/unlicensed — best available, not most suitable. A 6 wandb .pth more capable but untested + no webcam. Answer: none production-ready; E for pattern, A for real weights.
5. Avoid MVP: C (wrong task/huge/NC-SA), B (unverifiable), full A-263 (too big), E weights as product (3 words).
6. Pretrained vs fine-tune vs small train: train small sequence model on 5-10 D words; optionally init from A-50 keypoint Transformer if links work. Do not use translation models.
7. Simplest sound arch: uniform 32-45 frames -> MediaPipe hand+pose landmarks -> interpolate -> per-frame normalize -> small BiLSTM/TCN or pooled sklearn -> softmax + confidence/margin + idle gate + majority vote. Matches A/E evidence and SignSpeak temporal need.
8. Smallest vocab: 5 (hello, thank you, yes, no, help); stretch 8 (+stop, please, sorry). Distinct motion/static mix, judge-friendly.
9. If nothing works: rule-based demo fallback — phrase board + typing + prerecorded verified clips; show pipeline + gate + honesty card; do not fake recognition.
10. First 24h: see next section.

## 12. First 24-Hour Action Plan

H0-2: freeze 5-8 words; create venv; load D metadata; download subset; log counts/licenses.
H2-6: visual check 3 clips/word; build signer holdout; extract landmarks; train tiny baseline.
H6-10: holdout eval + confusion; set confidence/margin/idle thresholds; adapt E capture loop with portable paths.
H10-16: live test new signer + idle/unknown; measure latency; decide GO/SHRINK/SWITCH to A-50.
H16-24: export ONNX if SignSpeak path, or freeze Python demo; write model card with metrics + limits; rehearse fallback.

## 13. Final Decision Checklist

- [ ] 5-8 word list frozen; ISL signer review status labeled unverified.
- [ ] D subset downloaded; per-word/signer/license counts logged; review-flag rows handled.
- [ ] Signer-grouped split, no sha/phash leakage.
- [ ] Baseline macro-F1 + confusion on unseen signer recorded (not just train acc).
- [ ] Confidence/margin/idle gate rejects no-hands + unsupported signs.
- [ ] CPU latency + fps measured on demo laptop.
- [ ] ONNX/browser path or explicit Python-demo decision documented.
- [ ] Licenses attributed; E code not shipped verbatim without permission.
- [ ] Fallback (phrase board/clips) rehearsed.
- [ ] No ASL-as-ISL, no reported-as-tested, no real-time claim without measurement.
## 14. Sources and Evidence (accessed 2026-09-16)

- A repo https://github.com/AI4Bharat/INCLUDE — files, MIT, no webcam. Evidence: High/Verified.
- A data https://zenodo.org/records/4010759 — 4292 vids, 263 signs, CC-BY-4.0, 56.8GB. Verified.
- A raw: requirements, pretrained_links.json (6 wandb +4 link), README, runner/train_nn/configs/dataset/generate_keypoints/evaluate, LICENSE. Verified.
- B https://www.kaggle.com/datasets/prasadshet/indian-sign-language-video-dataset + /data — title-only; login needed. Low/Unavailable.
- C repo https://github.com/Exploration-Lab/ISLTranslate — 3 commits, data-only. Verified.
- C site https://exploration-lab.github.io/iSign/ — 5 tasks, CISLR link. Verified.
- C HF https://huggingface.co/datasets/Exploration-Lab/iSign — gated, 228GB, CC-BY-NC-SA-4.0. Verified.
- C papers https://aclanthology.org/2023.findings-acl.665 (31k) + https://arxiv.org/abs/2407.05404 (118k). Verified.
- D https://huggingface.co/datasets/vidit031/isl-isolated-40words + /raw/main/README.md — 642/40/196MB, sources, vocab, load code. Verified.
- D upstreams: https://huggingface.co/datasets/Exploration-Lab/CISLR (AFL-3.0, ~4700 words, I3D) + https://huggingface.co/datasets/ISL500/ISL-DATA (500x15 ~7500, research-only) + CISLR paper https://aclanthology.org/2022.emnlp-main.707. Verified.
- E https://github.com/Sooryak12/Indian-Sign-Language-Recognition — 65 stars, pycode branch, 3 words. Verified.
- E raw: README, requirements (TF2.13 etc), app.py, deploy-code.py, run-through-cmd-line.py, helper_functions.py; tree lstm-model/170-0.83.hdf5. Verified present, not run.
- Local: README.md, ml/README.md, docs/implementation-decisions.md, package.json, .env.example, ml/ + docs/ listings. Verified.
- arXiv search for INCLUDE returned unrelated 2407.14224; correct INCLUDE paper is ACM MM20 DOI 10.1145/3394171.3413528, no arXiv ID claimed here.

## Bottom line (required format)

- Primary candidate: D + E pattern (D data, E capture idea; train 5-10 word small model).
- Backup candidate: A INCLUDE-50 subset + wandb Transformer/LSTM if D noise too high.
- Best dataset for MVP: D (196MB verified word clips); A most rigorous backup.
- Best available pretrained model: none production-ready; E 3-class .hdf5 present but toy; A 6 .pth capable but untested.
- Biggest unresolved risk: generalization to unseen judges + no verified checkpoint/gate; live accuracy unknown.
- Recommended next action: run Section 10 D smoke + signer holdout baseline + webcam gate test.
- What still needs verification: actual downloads, wandb link liveness, holdout metrics, CPU latency, Kaggle/B if pursued, E license, ISL signer sign check.
<!--END-->
