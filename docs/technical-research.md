# Technical Research

This document collects research on ISL, datasets, computer vision and ML approaches, speech APIs, related work, and standards. Every external claim is labelled; **the team must re-verify each cited link and detail before relying on it**, because the writer could not browse the live web when drafting.

## 1. Indian Sign Language (ISL)

### 1.1 Status and institutions

- `FACT` ISL is the sign language used by deaf communities across India, with documented regional variation. Zeshan (2000) described it as part of an "Indo-Pakistani Sign Language" continuum with largely mutually intelligible varieties. Source: Zeshan, U. (2000). *Sign Language in Indo-Pakistan*. John Benjamins.
- `FACT` The **Indian Sign Language Research and Training Centre (ISLRTC)** was established under the Department of Empowerment of Persons with Disabilities and publishes the ISL Dictionary (editions in 2018, 2019, 2021; the 2021 edition is around 10,000 terms, including everyday, academic, legal, medical and technical vocabulary) plus video content. Source: https://islrtc.nic.in/ and ISLRTC's official YouTube channel.
- `FACT` ISLRTC also released the "Sign Learn" mobile app for the ISL dictionary. Source: ISLRTC / PIB press releases (https://pib.gov.in/). Verify exact date and terms of use.
- `UNVERIFIED` The licence terms of ISLRTC dictionary videos for redistribution inside a third-party app. Embedding official YouTube videos via the YouTube player is a lower-risk path than downloading and re-hosting; written permission is the safest path. **DECISION NEEDED.**

### 1.2 Grammar and structure (relevant to text -> ISL)

- `FACT` ISL is not a signed version of Hindi or English. Its basic clause order is typically **Subject-Object-Verb**; question words tend to appear at the **end** of a clause; negation often comes at the end; time expressions typically come first; there are no articles or copula equivalents. Non-manual markers (eyebrows, head tilt, mouth patterns) carry grammatical meaning such as questions and negation. Source: Zeshan (2000); Sinha, S. (2017), *Indian Sign Language: An Analysis of Its Grammar*, Gallaudet University Press.
- **Implication:** concatenating one clip per English word produces a word list in English order, not an ISL sentence. The MVP therefore maps **whole phrases** to **whole verified clips** (FR-VIS-01, FR-VIS-02). Any future word-level concatenation must be labelled as such (FR-VIS-05).

### 1.3 Phonological parameters (relevant to recognition)

Signs are distinguished by five parameters; a recogniser must be sensitive to the ones that differ within our vocabulary:

| Parameter | What MediaPipe gives us | Notes |
|---|---|---|
| Handshape | 21 hand landmarks per hand | Well captured; normalise for scale and rotation |
| Location (where on/near the body) | Pose landmarks (shoulders, nose, hips) for reference | Needed to separate e.g. signs at head vs chest |
| Movement | Landmark trajectories over time | Requires a temporal window |
| Palm orientation | Derived from landmark geometry (normal of palm plane) | Compute explicitly as a feature |
| Non-manual features (face) | Face landmarks (optional) | Out of MVP scope for recognition; matters for grammar |

- `FACT` Many signs are **dynamic** (require movement). A static single-frame classifier cannot distinguish two signs that share handshape and location but differ in movement. Our vocabulary selection (see `ai-ml-and-dataset-plan.md`) prefers signs distinguishable by handshape and location, and treats movement-based signs as Should-have.
- `UNVERIFIED` Which of our candidate hospital signs are static vs dynamic in ISL. This must be confirmed against the ISLRTC dictionary video and by an ISL signer.

### 1.4 Fingerspelling

- `FACT` ISL fingerspelling of the English alphabet is predominantly **two-handed** (unlike ASL's one-handed alphabet). Source: ISLRTC alphabet resources; Zeshan (2000).
- Two-handed fingerspelling involves hand-on-hand contact and occlusion, which is hard for single-camera landmark tracking. Fingerspelling recognition is **out of MVP scope**.
- Datasets marketed as "Indian Sign Language alphabet" that show one-handed letters are very likely ASL or a mixture; treat with suspicion.

### 1.5 Variation

- `FACT` Regional and signer variation exists (lexical variants across cities and schools). Source: Zeshan (2000); ISLRTC dictionary notes on regional signs.
- **Implication:** the app must state which variant it supports (ideally the ISLRTC dictionary form) and evaluate on signers outside the training set.

### 1.6 Where expert validation is mandatory

1. Confirming the canonical form of every sign in the recognition vocabulary before recording data.
2. Confirming that each hospital phrase's ISL clip is correct, natural, and appropriate in a medical setting.
3. Reviewing UI copy and icons for cultural appropriateness.
4. Reviewing how the app communicates uncertainty to a deaf user.
5. Participating in usability testing.

Potential partners (to be approached, not yet contacted): ISLRTC, National Association of the Deaf (India), local deaf schools and colleges, university disability offices, certified ISL interpreters. `DECISION NEEDED` on who contacts whom.

## 2. Datasets

`FACT` unless marked. All sizes and licences must be re-checked on the source page before use.

| Dataset | Content | Level | Where | Licence / consent notes | Suitability for SignSpeak |
|---|---|---|---|---|---|
| **INCLUDE** (Sridhar et al., ACM Multimedia 2020, IIT Madras / AI4Bharat) | ~4,300 videos of ~260 isolated ISL word signs across everyday categories, performed by deaf students | Isolated word | Zenodo (search "INCLUDE Indian Sign Language") and paper at https://dl.acm.org/doi/10.1145/3394171.3413528 | Check the Zenodo licence field (believed to be a Creative Commons licence; **verify**). Signers were consenting students per paper. | Best public option for pre-training or for any overlap with our vocabulary. `UNVERIFIED` whether it contains medical terms; preliminary reading suggests it is not medically focused. |
| **ISL-CSLTR** (Elakkiya & Natarajan, Mendeley Data, 2021) | Sentence-level continuous ISL videos, several signers | Continuous sentence | Mendeley Data (search "ISL-CSLTR") | Check licence on the dataset page | Useful as reference for how sentences are signed; too advanced for MVP recognition |
| **CISLR** (Joshi et al., EMNLP 2022) | Large-vocabulary (thousands of words) isolated ISL, few examples per word, sourced from public dictionary content | Isolated word, one-shot | https://aclanthology.org/2022.emnlp-main.707/ | Derived from publicly posted videos; check redistribution terms | Reference for vocabulary coverage; too few examples per class to train our classifier directly |
| **iSign** (Joshi et al., Findings of ACL 2024) | Large ISL video-sentence benchmark | Sentence | https://aclanthology.org/2024.findings-acl.643/ | Check terms | Future work (translation) |
| Kaggle "ISL" alphabet / digit image sets | Static hand images | Letters/digits | https://www.kaggle.com/ (multiple) | Licences vary; provenance often unclear; **some are ASL mislabelled** | Not suitable for hospital vocabulary; use only after visual check that letters are ISL two-handed forms |
| **WLASL**, **MS-ASL**, **ASL Citizen** | American Sign Language | | | | **Not ISL. Never use as ISL.** Only usable to prototype pipelines with the label "ASL test" removed before demo. |
| ISLRTC dictionary videos | One clip per term, official signers | Isolated word | https://islrtc.nic.in/, official YouTube | Redistribution licence unclear; embedding likely acceptable; **verify** | Primary reference for canonical sign forms; candidate source for verified clips if permission is granted |

**Conclusion:** `PROPOSAL` No public dataset covers our hospital vocabulary with enough examples per class and multiple signers. The plan therefore is to **collect a small, consented dataset ourselves** (see `ai-ml-and-dataset-plan.md`), using INCLUDE for pipeline development and optional pretraining if its licence permits.

## 3. Computer vision and ML approaches

### 3.1 Landmark extraction: MediaPipe

- `FACT` **MediaPipe Hand Landmarker** returns 21 3D landmarks per detected hand (x, y normalised to image, z relative depth), plus handedness, for up to N hands, and runs in the browser via WebAssembly/WebGPU through the `@mediapipe/tasks-vision` package. **Pose Landmarker** returns 33 body landmarks. **Face Landmarker** returns 478 face landmarks. The legacy **Holistic** solution combined all three; the Tasks API also offers a Holistic Landmarker. Source: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker and sibling pages. Verify current API names and browser support tables.
- **Important clarification:** MediaPipe locates hands and body joints. **It does not recognise or translate sign language.** All sign recognition is done by a model we train on top of these landmarks.

### 3.2 Candidate recognition approaches

| Approach | How it works | Pros | Cons | Fit |
|---|---|---|---|---|
| **Rule-based on landmarks** | Hand-written geometric rules (finger extended? thumb touching index?) | No training data; transparent; instant | Brittle; does not scale past a handful of signs; signer variation breaks rules | Good for a 2 to 3 sign smoke test in week 1; not the product |
| **Classical ML on normalised landmarks** (k-NN, SVM, Random Forest, logistic regression, small MLP) | Flatten normalised landmark coordinates (+ engineered angles/distances) into a feature vector; train per-sign classifier | Trains in seconds on hundreds of samples; easy to export; strong for static signs | Static only unless features are aggregated over time | **Recommended MVP core** |
| **Small neural network (MLP) on landmarks** | Same features, 2 to 3 dense layers, softmax | Easy ONNX/TF.js export; calibrates reasonably | Needs more data than RF to beat it | Recommended alongside RF; pick by validation |
| **Temporal models** (1D-CNN, GRU/LSTM, small Transformer) on landmark sequences | Fixed window of T frames (e.g. 30) of landmark vectors -> sequence model | Handles movement-based signs | Needs many more clips per class; harder to export and debug | Should-have for dynamic signs |
| **Aggregated temporal features + classical ML** | Compute mean, std, velocity stats of landmarks over a window, then RF/SVM | Cheap way to capture movement | Loses fine temporal ordering | Good first attempt at dynamic signs |
| **DTW / template matching** | Compare landmark trajectory to stored templates with Dynamic Time Warping | Works with 5 to 10 examples per class | Slow with many templates; sensitive to speed | Viable fallback for a few dynamic signs |
| **End-to-end video CNN (I3D, etc.)** | Raw pixels | Best accuracy in literature with large data | Needs thousands of videos, GPUs, no browser inference | Not feasible |

### 3.3 Recommended pipeline

```
Camera frame (browser)
  -> MediaPipe Hand Landmarker (+ Pose Landmarker for shoulders/nose)
  -> Preprocess: drop frames with no hands; pick up to 2 hands; order left/right
  -> Normalise: translate to wrist origin, scale by hand size (wrist to middle-MCP distance),
     optionally rotate to align palm; express hand position relative to shoulder midpoint
  -> Feature vector: 2 hands x 21 x 3 = 126 values + palm normal + hand-to-face distances
     (+ for dynamic: window of T frames or aggregated stats)
  -> Classifier (RF / MLP, exported to ONNX or TF.js) -> class probabilities
  -> Decision: top-1 prob >= threshold AND margin over top-2 >= delta AND
     consistent for k consecutive frames -> emit word; else "Not recognised"
  -> UI: word chip with confidence band, top-3 alternatives for correction
```

### 3.4 Unknown-sign rejection

A softmax classifier always outputs *some* class. Strategies, in order of effort:

1. **Probability threshold + margin**: emit only if top-1 >= 0.7 (tunable) and top-1 minus top-2 >= 0.2.
2. **Explicit "other/idle" class**: record resting hands, random gestures, and non-vocabulary signs as a negative class.
3. **Temporal consistency**: require the same class in k of the last n frames.
4. **Distance-based rejection**: k-NN distance to nearest training sample above a threshold -> unknown.
5. (Future) Calibrated probabilities (temperature scaling), open-set methods.

The MVP uses 1 to 3. Rejection performance is a first-class metric (see `testing-and-evaluation.md`).

### 3.5 Browser inference vs Python backend

| Criterion | Browser-only (MediaPipe JS + ONNX Runtime Web / TF.js) | Frontend + FastAPI backend (landmarks over WebSocket) |
|---|---|---|
| Privacy | Best: nothing leaves device | Good if only landmarks are sent; worse if frames are sent |
| Latency | Lowest (no network) | +20 to 200 ms per frame; depends on hosting |
| Complexity | Model export step (sklearn -> ONNX via skl2onnx, or Keras -> TF.js) | Two deployables, CORS, WebSockets, hosting |
| Compatibility | Depends on WASM/WebGPU support; fine in modern Chrome/Edge/Safari | Backend removes model-format constraints |
| Offline | Works after first load | Requires network |
| Cost | Static hosting, free tier | Small server; free tiers sleep, causing cold starts in demos |
| Hackathon feasibility | High, single deploy | Medium |

`PROPOSAL` **Browser-first.** Keep a thin FastAPI landmark-inference service as an optional fallback that speaks the same JSON contract, so the frontend can switch with a flag. Never send raw frames to a server.

### 3.6 Limitations of the recommended approach

- Landmark-based models lose information MediaPipe fails to capture: occlusions in two-handed contact signs, fast motion blur, hands leaving frame, low light.
- A 10 to 15 class static classifier will confuse signs that differ only in movement or facial expression; the vocabulary must avoid such pairs.
- Performance on signers with different hand sizes, skin tones under poor lighting, or camera angles will vary; MediaPipe itself has documented fairness evaluations but our downstream classifier must be tested on held-out signers.
- MediaPipe's z coordinate is a relative depth estimate and is noisy; features should not depend heavily on it.

## 4. Speech technologies

### 4.1 Speech-to-text: Web Speech API `SpeechRecognition`

- `FACT` Available in Chrome and Edge (as `webkitSpeechRecognition`) and Safari; **not** available in Firefox by default. Requires a secure context (HTTPS or localhost) and microphone permission. In Chrome, recognition is performed by sending audio to Google's servers, so it requires network and has privacy implications. Language is set with `lang` (for example `en-IN`, `hi-IN`). Source: MDN https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API and browser compatibility table.
- Known failure modes to handle: `not-allowed` (permission), `no-speech`, `audio-capture` (no mic), `network`, `aborted`; continuous mode stops unexpectedly on some mobile browsers; accuracy drops with ward noise and Indian-English or Hindi accents varies.
- Alternatives if needed: server-side ASR (e.g. open-source Whisper via FastAPI) at the cost of sending audio to our server, which changes the privacy story (`DECISION NEEDED` only if Web Speech proves unusable).

### 4.2 Text-to-speech: `SpeechSynthesis`

- `FACT` Broadly supported across modern browsers; available voices depend on the operating system and browser. Hindi (`hi-IN`) and Indian English (`en-IN`) voice availability varies by device. Source: MDN Web Speech API page.
- Handle: no voice for requested language (fall back to any `en` voice and show a notice), speech interrupted, `speechSynthesis.speaking` state for controls.

## 5. Related work

These are examples of prior art; SignSpeak does not claim novelty over them.

- Academic ISL recognition papers: INCLUDE (ACM MM 2020), CISLR (EMNLP 2022), iSign (ACL 2024), and many landmark-based ISL classifiers published in Indian conferences using MediaPipe + classical ML or LSTMs. Search terms: "Indian Sign Language recognition MediaPipe", "ISL landmark LSTM".
- Commercial and community apps: several Indian startups and student projects have built ISL learning or translation apps (for example, apps that render ISL for text using avatars or clips). Names and capabilities change frequently; the team should survey the Play Store and GitHub during Phase 1 and record findings here rather than rely on this document.
- Sign-language avatar research (e.g. European projects on avatar-based signing) shows that avatars are often judged as unnatural or hard to understand by deaf users; this supports our decision to use verified human clips first.
- Hospital communication boards (picture boards) are an established low-tech aid; SignSpeak's phrase board is a digital equivalent with audio and ISL video.

## 6. Standards and guidelines

- `FACT` **WCAG 2.2** (W3C Recommendation, 2023): https://www.w3.org/TR/WCAG22/. Target Level AA.
- `FACT` **WAI-ARIA Authoring Practices**: https://www.w3.org/WAI/ARIA/apg/.
- `FACT` **Guidelines for Indian Government Websites (GIGW)**, India's web accessibility guideline aligned with WCAG: https://guidelines.india.gov.in/.
- `FACT` **Rights of Persons with Disabilities Act, 2016** (India).
- `FACT` **Digital Personal Data Protection Act, 2023** (India) governs processing of personal data; health data is sensitive in most frameworks. Source: https://www.meity.gov.in/. Our default of not storing data minimises exposure.
- Design guidance for deaf users: prefer video and visuals over long text; keep captions; avoid audio-only cues.

## 7. Open research questions

See `open-questions-and-decisions.md`. Key ones: clip licensing, expert partner, static/dynamic status of candidate signs, and whether INCLUDE's licence permits use.
