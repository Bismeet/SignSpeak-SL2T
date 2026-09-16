# Development Roadmap

## Effort assumptions (explicit)

- `ASSUMPTION` Team of **3 to 4 students**, intermediate web skills, beginner-to-intermediate ML, **no prior ISL knowledge**.
- `ASSUMPTION` Effort is given in **person-hours**; the team maps these to calendar time based on their real availability and hackathon date, which this document does not know.
- `ASSUMPTION` Access to at least one ISL signer for two review sessions and one data-collection session. If not, phases 4, 5 and 9 stretch or shrink in scope.
- Phases overlap where dependencies allow; gates are approval points for the project owner.

Total rough estimate: **220 to 340 person-hours** for Must-have MVP, excluding participant and expert time.

## Phase 1: Research and requirements (this documentation)

- **Objectives:** Understand the problem, ISL, feasible technology; produce approved requirements.
- **Tasks:** Verify every `FACT` link in the docs; contact potential ISL partners; survey existing apps; confirm INCLUDE licence; validate personas with 2 ISL users and 1 healthcare worker if possible.
- **Dependencies:** None.
- **Deliverables:** This `docs/` set with verification marks updated; contact log.
- **Acceptance:** Owner approves `product-requirements.md` and `mvp-scope.md`; open decisions D1 to D6 resolved.
- **Definition of done:** All `UNVERIFIED` links checked; decisions logged.
- **Effort:** 15 to 25 h (beyond this draft).

## Phase 2: MVP and architecture approval

- **Objectives:** Lock scope and stack.
- **Tasks:** Review architecture; choose Next.js vs Vite; decide browser-only vs optional backend; set up GitLab project structure, issue board, labels, milestones; CI skeleton (lint/type-check).
- **Dependencies:** Phase 1 approval.
- **Deliverables:** Approved `technical-architecture.md`; repo scaffold plan; issue backlog created from requirements.
- **Acceptance:** Owner sign-off; every Must requirement has an issue.
- **DoD:** Backlog estimated; CI runs on an empty scaffold.
- **Effort:** 8 to 12 h.

## Phase 3: UI/UX design

- **Objectives:** Wireframes and accessibility spec for 9 screens.
- **Tasks:** Low-fi wireframes; design tokens; component inventory; review with one deaf user; adjust.
- **Dependencies:** Phase 2.
- **Deliverables:** `docs/design/` wireframes; updated `ui-ux-specification.md`.
- **Acceptance:** Accessibility checklist complete per screen; reviewer feedback logged.
- **DoD:** Wireframes committed; open UX questions moved to decisions doc.
- **Effort:** 15 to 25 h.

## Phase 4: ISL vocabulary and dataset plan

- **Objectives:** Final recognition vocabulary and phrase list, validated by an ISL signer; consent materials ready.
- **Tasks:** Expert review session 1 (sign forms, static/dynamic, confusability, phrase wording); finalise `phrases.json` drafts; write consent form and ISL video version; recruit signers; build landmark collection tool (early camera module).
- **Dependencies:** Phase 2; expert access (R10).
- **Deliverables:** Vocabulary list with expert notes; consent pack; collection tool; recording schedule.
- **Acceptance:** >= 10 Must-tier signs confirmed feasible; >= 6 signers scheduled (or scope reduced and documented).
- **DoD:** Collection tool exports labelled landmark JSON with metadata; dry run recorded and inspected.
- **Effort:** 25 to 40 h plus expert/participant time.

## Phase 5: Recognition prototype (Python)

- **Objectives:** Trained, evaluated, exported static-sign classifier with rejection.
- **Tasks:** Run data collection sessions; feature engineering; train baselines; leave-one-signer-out evaluation; threshold tuning; export to ONNX; model card; parity fixtures.
- **Dependencies:** Phase 4 data.
- **Deliverables:** `ml/` code, dataset manifest v1, `sign-clf-v1.onnx`, `model-card.json`, evaluation report.
- **Acceptance:** Targets in `testing-and-evaluation.md` Section 2.2 met, or vocabulary reduced until met and documented.
- **DoD:** `train.py` reproduces metrics from manifest with fixed seed; CI evaluation job green.
- **Effort:** 30 to 50 h plus collection sessions (est. 2 h per signer).

## Phase 6: Frontend foundation

- **Objectives:** App shell, navigation, design system, settings, help/privacy pages, permission states.
- **Tasks:** Scaffold Next.js + TS + Tailwind; routes; components; localStorage settings; static deploy to GitLab Pages via CI; accessibility lint.
- **Dependencies:** Phases 2 and 3.
- **Deliverables:** Deployed shell with all screens as static states.
- **Acceptance:** axe zero critical issues; keyboard navigation works; HTTPS deploy live.
- **DoD:** E2E test for navigation and permission-denied states passes in CI.
- **Effort:** 30 to 45 h.

## Phase 7: Camera and model integration

- **Objectives:** Live sign-to-text in browser.
- **Tasks:** Camera module with error handling; MediaPipe Hand + Pose Landmarker; TypeScript feature normalisation (parity-tested); ONNX Runtime Web inference; decision logic; chips, confidence, correction sheet; "Not recognised" flow; FPS monitoring.
- **Dependencies:** Phases 5 and 6.
- **Deliverables:** Working camera panel.
- **Acceptance:** T-SIGN-01 to T-SIGN-08 pass on reference devices with a held-out signer.
- **DoD:** Landmark-fixture E2E test passes; latency measured and recorded in model card.
- **Effort:** 35 to 55 h.

## Phase 8: Speech and text features

- **Objectives:** Speech-to-text, text input, text-to-speech, conversation view.
- **Tasks:** ASR wrapper with capability detection and error mapping; TTS wrapper with voice selection; conversation store; turn indicator; live regions.
- **Dependencies:** Phase 6.
- **Deliverables:** Talk screen with hearing-side input and speech output.
- **Acceptance:** T-SPCH-01 to T-SPCH-07 and T-CONV-01 to T-CONV-03 pass.
- **DoD:** Browser matrix documented (Chrome, Edge, Firefox, Safari).
- **Effort:** 20 to 30 h.

## Phase 9: Verified visual signs and hospital mode

- **Objectives:** Verified ISL clips for phrase list; phrase board; emergency mode.
- **Tasks:** Obtain clips (permission for ISLRTC embeds or record with verified signer); expert review session 2 (verify each clip); fill `phrases.json` metadata; clip player with captions; phrase matcher with aliases; phrase board and emergency UI.
- **Dependencies:** Phase 4 phrase list; expert access; Phase 6.
- **Deliverables:** `phrases.json` with verification statuses; clips or embed manifest; phrase board.
- **Acceptance:** >= 20 phrases `expert_verified`; T-PHR-01 to T-PHR-06 pass.
- **DoD:** Unverified phrases hidden by default; credits page lists verifiers and licences.
- **Effort:** 25 to 40 h plus expert time.

## Phase 10: Integration, testing, deployment, demo

- **Objectives:** End-to-end MVP, tested, deployed, demo-ready.
- **Tasks:** Integrate all panels; usability sessions; accessibility audit; privacy network audit; fix list; final deploy; record fallback demo video; rehearse.
- **Dependencies:** Phases 7, 8, 9.
- **Deliverables:** Deployed MVP; test report; demo script; fallback video; updated model card and limitations page.
- **Acceptance:** MVP definition of done in `mvp-scope.md` met; ethics checklist complete.
- **DoD:** Two full dry runs completed, one with network disabled.
- **Effort:** 20 to 35 h.

## Gates requiring owner approval

1. After Phase 1: requirements and MVP scope.
2. After Phase 2: architecture and stack.
3. After Phase 4: final vocabulary and consent approach.
4. After Phase 5: go/no-go on recognition quality (reduce vocabulary vs proceed).
5. Before Phase 10 demo: script and claims.
