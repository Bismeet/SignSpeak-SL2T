# SignSpeak Documentation

SignSpeak is an AI-assisted, two-way **Indian Sign Language (ISL)** communication aid for deaf and hard-of-hearing people, initially targeting **hospital and emergency communication**. This directory holds all research and planning produced **before any code is written**.

## Labelling conventions

Every non-trivial statement in these documents carries one of these labels so that readers and future coding agents can tell what is established from what is proposed:

| Label | Meaning |
|---|---|
| `FACT` | Verifiable statement with a cited source. Sources were selected from well-known official or peer-reviewed publications; **the team must re-open each link and confirm the detail before quoting it externally**, because the author of these documents could not browse the live web while writing. |
| `ASSUMPTION` | Working assumption used for planning. Must be confirmed or replaced. |
| `PROPOSAL` | A recommended approach. Open to change. |
| `DECISION NEEDED` | Requires explicit approval from the project owner. Collected in `open-questions-and-decisions.md`. |
| `UNVERIFIED` | Something the team believes but has not confirmed (for example, whether a particular sign is static or dynamic in ISL). |

No document in this directory reports model accuracy, dataset sizes we collected, or user-study results, because **none exist yet**. Any number that looks like a result is an acceptance target, not a measurement.

## Document index and reading order

| # | Document | Purpose |
|---|---|---|
| 1 | [problem-statement.md](problem-statement.md) | Why the project exists, who it serves, what it is not |
| 2 | [user-personas-and-use-cases.md](user-personas-and-use-cases.md) | Target users, communication challenges, concrete scenarios |
| 3 | [product-requirements.md](product-requirements.md) | Functional and non-functional requirements, out of scope |
| 4 | [mvp-scope.md](mvp-scope.md) | Must / Should / Future with value, complexity, risks, acceptance criteria |
| 5 | [technical-research.md](technical-research.md) | ISL linguistics, datasets, CV/ML approaches, speech APIs, related work, standards |
| 6 | [technical-architecture.md](technical-architecture.md) | Stack decision, system architecture, data flow, sequence and error diagrams |
| 7 | [ai-ml-and-dataset-plan.md](ai-ml-and-dataset-plan.md) | Vocabulary, data collection, training, evaluation, versioning |
| 8 | [ui-ux-specification.md](ui-ux-specification.md) | Screens, flows, wireframes, accessibility requirements |
| 9 | [privacy-and-safety.md](privacy-and-safety.md) | Permissions, data retention, consent, healthcare sensitivity, bias, safety messaging |
| 10 | [testing-and-evaluation.md](testing-and-evaluation.md) | Functional, model, usability and accessibility test plans |
| 11 | [risk-register.md](risk-register.md) | Risks, impact, likelihood, mitigations, fallbacks |
| 12 | [development-roadmap.md](development-roadmap.md) | Ten phases with objectives, deliverables, acceptance criteria, effort assumptions |
| 13 | [hackathon-demo-plan.md](hackathon-demo-plan.md) | Truthful live demo plus fallback demo |
| 14 | [open-questions-and-decisions.md](open-questions-and-decisions.md) | Everything that needs the owner's approval |

## One-paragraph summary of the proposal

`PROPOSAL` Build a **browser-first** web app (Next.js + TypeScript + Tailwind) that uses **MediaPipe hand and pose landmarks** extracted in the browser, feeds normalised landmark features to a **small classifier** trained in Python on a **team-collected, consent-based dataset of 10 to 15 hospital-relevant ISL signs**, and shows predictions with confidence, an explicit "not recognised" state, and one-tap correction. The hearing side uses the **Web Speech API** for speech-to-text (with typing as the always-available fallback) and **SpeechSynthesis** for text-to-speech. Text is mapped to **expert-verified ISL video clips** from a curated phrase list, never to word-by-word concatenation presented as grammatical ISL. No camera frames or audio leave the device by default. A FastAPI backend is optional and only receives landmark arrays if browser inference proves too slow.

## Non-negotiables

- This project uses **Indian Sign Language**. ASL data or ASL clips are never labelled or presented as ISL.
- Recognition output always shows uncertainty and can be corrected or rejected.
- Anything shown to a hearing person as "the ISL sign for X" must be validated by a qualified ISL signer.
- SignSpeak is a **communication aid**, not a medical, diagnostic, or emergency-response system, and the UI says so.
