# Product Requirements

Requirements use IDs so that later issues, tests, and code can trace back to them. Priority: **M** (must, MVP), **S** (should), **F** (future).

## Functional requirements

### Sign-to-Text

| ID | Requirement | Priority |
|---|---|---|
| FR-STT-01 | The app captures live video from the user's camera in the browser after explicit permission. | M |
| FR-STT-02 | The app extracts hand landmarks (and upper-body pose landmarks where needed for sign location) from each frame on-device. | M |
| FR-STT-03 | The app classifies the current sign against a **defined, published vocabulary** (see `ai-ml-and-dataset-plan.md`). | M |
| FR-STT-04 | The app displays the predicted word with a visible confidence level (for example high / medium / low, plus numeric on hover or in settings). | M |
| FR-STT-05 | When confidence is below a configured threshold, or no hands are detected, the app shows "Not recognised" and does **not** output a word. | M |
| FR-STT-06 | The user can correct a prediction by choosing from top-N alternatives or typing. | M |
| FR-STT-07 | The app shows a live indicator of whether hands are being tracked, so the user can reposition. | M |
| FR-STT-08 | The user can delete or reorder recognised words before sending/speaking. | S |
| FR-STT-09 | The app supports a small number of **dynamic** (movement-based) signs in addition to static hand shapes. | S |
| FR-STT-10 | Continuous signing (sentence-level segmentation) | F |

### Sign-to-Speech

| ID | Requirement | Priority |
|---|---|---|
| FR-SPK-01 | Recognised or composed text can be spoken aloud via text-to-speech on user action. | M |
| FR-SPK-02 | Speech never auto-plays a prediction without the user confirming or having enabled auto-speak in settings. | M |
| FR-SPK-03 | Playback controls: play, stop, repeat; voice language selectable (English (India), Hindi where available). | M |
| FR-SPK-04 | If TTS is unavailable, the text remains visible in large type and the UI says audio is unavailable. | M |

### Speech-to-Text

| ID | Requirement | Priority |
|---|---|---|
| FR-ASR-01 | A hearing user can press-and-hold or tap to record speech and receive text. | M |
| FR-ASR-02 | The user can edit the transcript before sending. | M |
| FR-ASR-03 | Supported languages are explicitly listed (initially `en-IN` and `hi-IN`) and selectable. | M |
| FR-ASR-04 | If speech recognition is unsupported, permission is denied, or recognition errors, the app explains why and offers typing. | M |
| FR-ASR-05 | The UI states that browser speech recognition may send audio to the browser vendor's servers (see `privacy-and-safety.md`). | M |

### Text/Speech-to-Visual ISL

| ID | Requirement | Priority |
|---|---|---|
| FR-VIS-01 | Text is matched against a curated phrase list; matches display a **verified ISL video clip** with caption. | M |
| FR-VIS-02 | Matching is exact or near-exact (normalised text, small synonym table). No free-text generation of signs. | M |
| FR-VIS-03 | If no verified clip exists, the app shows the text in large type with the message "No verified ISL video for this phrase". | M |
| FR-VIS-04 | Each clip stores metadata: phrase, gloss, signer/verifier, date verified, licence/source. | M |
| FR-VIS-05 | Word-by-word clip concatenation, if ever offered, is labelled as "word list, not ISL grammar". | S |
| FR-VIS-06 | 3D animated avatar rendering of ISL | F |

### Two-Way Conversation

| ID | Requirement | Priority |
|---|---|---|
| FR-CONV-01 | A single conversation view shows both parties' messages in order, with clear "Deaf user" / "Hearing user" attribution. | M |
| FR-CONV-02 | A turn indicator shows whose input mode is active (camera vs microphone/keyboard). | M |
| FR-CONV-03 | Either party can mark a message as "misunderstood" to prompt a repeat or rephrase. | S |
| FR-CONV-04 | Conversation is held in memory only and cleared on "End conversation" or page reload, unless the user opts to keep it for the session. | M |

### Hospital/Emergency Mode

| ID | Requirement | Priority |
|---|---|---|
| FR-HOSP-01 | A phrase board with categories: Pain, Symptoms, Basic needs, Help requests, Common questions (staff side), Answers (Yes/No/Don't understand). | M |
| FR-HOSP-02 | Pain scale 0 to 10 selectable by tap. | M |
| FR-HOSP-03 | Every phrase has: text (English, Hindi where translated), optional TTS, and an ISL clip where verified. | M |
| FR-HOSP-04 | Emergency sub-mode: a maximum of 8 very large buttons, reachable in one tap from home. | M |
| FR-HOSP-05 | Phrases are configurable via a JSON file with a validation status field (`draft`, `expert_verified`). Unverified phrases show a visible "unverified" badge or are hidden by a setting. | M |

## Non-functional requirements

| ID | Requirement | Priority |
|---|---|---|
| NFR-01 | **Privacy:** camera frames and microphone audio are not stored or transmitted by SignSpeak by default. Only landmark arrays may optionally be sent to a backend or stored, with consent. | M |
| NFR-02 | **Latency:** prediction for a held static sign appears within 2 seconds on a mid-range laptop and within 3 seconds on a mid-range Android phone (targets, to be measured). | M |
| NFR-03 | **Accessibility:** WCAG 2.2 Level AA as the target; all functions keyboard-operable; screen-reader labels on all controls; minimum 4.5:1 text contrast; base font size at least 18 px in conversation view. | M |
| NFR-04 | **Compatibility:** Chrome and Edge (desktop and Android) fully supported; Safari best-effort; Firefox supported for everything except speech recognition (typing fallback). | M |
| NFR-05 | **Offline tolerance:** sign recognition and phrase board work with no network after first load. Speech recognition may need network. | S |
| NFR-06 | **No accounts:** the app requires no login. | M |
| NFR-07 | **Honesty:** every screen that shows AI output shows a confidence indicator or a "verified" badge; limitations page is one tap away. | M |
| NFR-08 | **Reproducibility:** model training is scripted, seeded, and versioned with a model card. | M |
| NFR-09 | **Deployability:** static hosting (for example GitLab Pages or Vercel) for frontend; backend optional. | M |

## Explicitly out of scope

- Medical diagnosis, triage scoring, or clinical recommendations.
- Storage of patient identity or medical records.
- Recognition of arbitrary ISL beyond the published vocabulary.
- Fingerspelling recognition in MVP (may be revisited).
- ASL or any non-ISL sign language.
- Integration with hospital IT systems (EHR, PACS) in MVP.

## Traceability

- Requirements map to MVP tiers in `mvp-scope.md`.
- Requirements map to test cases in `testing-and-evaluation.md`.
- Privacy NFRs are elaborated in `privacy-and-safety.md`.
