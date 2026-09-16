# Testing and Evaluation Plan

All targets below are **acceptance criteria to be tested**, not results. Each test maps to requirement IDs in `product-requirements.md`.

## 1. Functional tests

### 1.1 Permissions and device failures

| ID | Test | Expected | Req |
|---|---|---|---|
| T-PERM-01 | Deny camera permission | Camera error state with fix instructions; phrase board reachable | FR-STT-01 |
| T-PERM-02 | No camera device (simulate in DevTools or VM) | "No camera found" state | |
| T-PERM-03 | Camera busy in another app | Retry state | |
| T-PERM-04 | Load over plain HTTP | Insecure context message | |
| T-PERM-05 | Deny microphone | Typing shown, explanation visible | FR-ASR-04 |
| T-PERM-06 | Firefox: open speech panel | ASR unsupported notice; typing default | NFR-04 |
| T-PERM-07 | Block MediaPipe WASM URL | Load failure state with retry | |
| T-PERM-08 | Revoke camera mid-session | Stream end detected; state shown within 2 s | |

### 1.2 Sign recognition behaviour

| ID | Test | Expected | Req |
|---|---|---|---|
| T-SIGN-01 | Perform each supported sign (held-out signer) | Correct chip within 2 s (laptop) / 3 s (phone) | FR-STT-03, NFR-02 |
| T-SIGN-02 | Perform 5 unsupported gestures and 3 non-vocabulary ISL signs | "Not recognised", no word emitted | FR-STT-05 |
| T-SIGN-03 | Hands out of frame for 1 s | Tracking indicator changes; no prediction | FR-STT-07 |
| T-SIGN-04 | Rapid transitions between two signs | No flicker; at most one chip per stable sign | FR-STT-05 |
| T-SIGN-05 | Tap chip, choose alternative | Chip updated, marked corrected | FR-STT-06 |
| T-SIGN-06 | Tap chip, type replacement | Same | FR-STT-06 |
| T-SIGN-07 | Two consecutive "Not recognised" | Phrase-board suggestion appears | UC3 |
| T-SIGN-08 | Pause camera | Preview dark, no inference, indicator shows paused | Privacy |

### 1.3 Speech and text

| ID | Test | Expected | Req |
|---|---|---|---|
| T-SPCH-01 | Speak "Where does it hurt?" in Chrome, en-IN | Transcript editable; Send matches phrase; clip plays with badge | FR-ASR-01, FR-VIS-01 |
| T-SPCH-02 | Speak a phrase not in list | Text shown with "No verified ISL video" | FR-VIS-03 |
| T-SPCH-03 | Speak in hi-IN | Transcript in Devanagari; matching against `text_hi`/aliases | FR-ASR-03 |
| T-SPCH-04 | Silence for 8 s | `no-speech` handled; retry offered | FR-ASR-04 |
| T-SPCH-05 | Speak recognised text via TTS | Audio plays; Stop halts within 300 ms; Repeat works | FR-SPK-03 |
| T-SPCH-06 | Device without hi-IN voice | Notice shown; text remains visible | FR-SPK-04 |
| T-SPCH-07 | Auto-speak off by default | No audio until user taps Speak | FR-SPK-02 |

### 1.4 Phrase mapping and hospital mode

| ID | Test | Expected | Req |
|---|---|---|---|
| T-PHR-01 | Every phrase in `phrases.json` with `expert_verified` has a loadable clip | CI script passes | FR-VIS-04 |
| T-PHR-02 | `draft` phrases hidden unless setting on | Verified | FR-HOSP-05 |
| T-PHR-03 | Alias matching ("my chest hurts") | Maps to `pain_chest` | FR-VIS-02 |
| T-PHR-04 | Emergency mode reachable in one tap from Home | Yes | FR-HOSP-04 |
| T-PHR-05 | Any phrase reachable in <= 3 taps | Yes | Mvp |
| T-PHR-06 | Schema validation of `phrases.json` | CI passes | |

### 1.5 Conversation

| ID | Test | Expected |
|---|---|---|
| T-CONV-01 | Alternate deaf/hearing messages | Ordered, attributed, turn indicator correct |
| T-CONV-02 | End conversation | Memory cleared; reload shows empty |
| T-CONV-03 | Hide conversation | Content obscured until revealed |

## 2. Model evaluation

### 2.1 Protocol

- Leave-one-signer-out cross-validation over all signers; report mean and per-fold metrics.
- Final fixed held-out signer (never used in any tuning) for the headline demo number.
- Threshold and margin chosen on validation folds only.

### 2.2 Metrics and acceptance targets (`PROPOSAL`)

| Metric | Target for MVP go/no-go | Notes |
|---|---|---|
| Held-out-signer macro F1 (supported signs) | >= 0.80 | Below this, reduce vocabulary rather than ship confusable signs |
| Per-class recall minimum | >= 0.70 | Any class below is removed or re-collected |
| False-accept rate on negative/unknown set | <= 10% | At chosen threshold |
| False-reject rate on supported signs | <= 20% | Usability cost |
| Seen-signer accuracy | reported, not a target | Shows overfitting gap |
| Per-frame inference latency (browser, reference laptop) | <= 30 ms classifier; total pipeline >= 15 FPS | |
| End-to-end time from holding sign to chip | <= 2 s laptop, <= 3 s mid-range Android | |
| Robustness slices (lighting, lying pose, handedness) | Reported; any slice > 15 points below average flagged in model card | |

Reference devices to be named in Phase 5 (`ASSUMPTION`: one team laptop and one Android phone the team owns).

### 2.3 Artifacts

- `ml/reports/<model-version>/metrics.json`, `confusion_matrix.png`, `per_class.csv`, `model-card.json`.
- Feature-parity test: Python and TypeScript feature functions produce identical vectors (tolerance 1e-5) on shared fixtures.

## 3. Usability testing

- Participants: at least 3 deaf ISL users and 3 healthcare workers or proxies (nursing students). `ASSUMPTION` availability; record actual numbers.
- Tasks: UC1 to UC6 from `user-personas-and-use-cases.md`.
- Measures: task completion, time per turn, number of corrections, errors, SUS-style questionnaire adapted and delivered in ISL/written form, qualitative feedback.
- Acceptance: >= 80% task completion on UC1, UC2, UC3, UC4 without facilitator help; no participant reports the app claimed something it could not do.

## 4. Accessibility testing

| Check | Tool / method | Acceptance |
|---|---|---|
| Automated WCAG scan | axe DevTools / Lighthouse on all screens | Zero critical/serious issues |
| Keyboard only | Manual walkthrough of all flows | All tasks completable; visible focus |
| Screen reader | NVDA (Windows) and TalkBack (Android) on Talk screen | All controls announced; new messages announced via live region |
| Contrast | Contrast checker on tokens and both themes | >= 4.5:1 text |
| Text scaling | Browser zoom 200% and OS large text | No clipping or loss of function |
| Reduced motion | OS setting | No non-essential animation |
| Mobile | Chrome Android, Safari iOS (best effort) | Layout usable, camera works |
| Captions | Every clip | Caption text present |

## 5. Non-functional

- Load time: first meaningful paint < 3 s on 4G (Lighthouse).
- Offline: after first load, camera recognition and phrase board work with network disabled (Should-have).
- Privacy audit: network tab shows no outbound requests carrying frames, landmarks (unless backend flag), or transcripts.

## 6. Test automation in CI

- Unit: feature normalisation, decision logic (threshold/margin/smoothing), phrase matcher, schema validation.
- Component: permission states, correction sheet (React Testing Library).
- E2E (Playwright): typing flow, phrase board flow, permission-denied flows using fake media streams; sign recognition E2E uses recorded landmark fixtures injected in place of the camera.
- Model: evaluation job on dataset manifest with regression tolerance.
