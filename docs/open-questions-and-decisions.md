# Open Questions and Decisions

Items marked **DECISION NEEDED** require the project owner's explicit approval before the related work starts. Items marked **OPEN** need research or an external answer.

## Decisions needed now (before Phase 2)

| ID | Decision | Options | Recommendation | Status |
|---|---|---|---|---|
| D1 | Approve MVP scope as defined in `mvp-scope.md` | Approve / trim / expand | Approve as is; trimming is possible later via feature flags | DECISION NEEDED |
| D2 | Processing location | Browser-only / browser + optional FastAPI landmark backend / backend-first | Browser-first with optional backend behind a flag | DECISION NEEDED |
| D3 | Frontend framework | Next.js / Vite + React | Next.js (ecosystem, static export) unless team prefers Vite | DECISION NEEDED |
| D4 | ISL clip sourcing | Request ISLRTC permission and embed / record own clips with a verified signer / both | Both: start outreach, plan own recordings as baseline | DECISION NEEDED |
| D5 | Expert partner outreach owner and channels | Team member assignment; ISLRTC, NAD, deaf schools, interpreters, university disability office | Assign one owner in Phase 1; approach at least three channels | DECISION NEEDED |
| D6 | Data collection default | Landmarks only / landmarks + optional raw video (separate consent) | Landmarks only by default; raw video only with separate consent and offline encrypted storage | DECISION NEEDED |
| D7 | Speech recognition provider | Web Speech API only / add server ASR fallback | Web Speech API only for MVP; revisit if unusable on target devices | DECISION NEEDED |
| D8 | UI languages for MVP | English only / English + Hindi | English UI, Hindi phrase text where translated; Hindi UI as Should-have | DECISION NEEDED |
| D9 | Hosting | GitLab Pages / Vercel / Netlify | GitLab Pages via CI (same platform as repo) | DECISION NEEDED |
| D10 | Acceptance thresholds in `testing-and-evaluation.md` Section 2.2 | Accept / adjust | Accept as initial targets; may lower vocabulary rather than thresholds | DECISION NEEDED |

## Open research questions

| ID | Question | Why it matters | How to resolve | Status |
|---|---|---|---|---|
| Q1 | Which candidate signs are static vs dynamic in ISL, and which pairs are confusable? | Determines MVP vocabulary and model type | ISL signer review against ISLRTC dictionary | OPEN |
| Q2 | Are ISL numbers 0 to 10 one-handed and static? | Pain scale via signing | Same | OPEN |
| Q3 | INCLUDE dataset licence and exact class list | Whether it can be used at all and whether any classes overlap | Read Zenodo page and paper | OPEN |
| Q4 | ISLRTC video reuse/embedding terms | Clip sourcing | Contact ISLRTC; read site terms | OPEN |
| Q5 | Which browsers/devices are realistic in the target hospital or demo setting? | Compatibility priorities | Ask a healthcare contact; default to Chrome on Android/laptop | OPEN |
| Q6 | Hindi and Indian English TTS/ASR quality on target devices | Speech features | Device testing in Phase 8 | OPEN |
| Q7 | Correct local emergency number and wording for the safety banner | Safety copy | Verify (112 is India's integrated emergency number, to confirm) | OPEN |
| Q8 | Ethics review requirement for data collection with deaf participants at the team's institution | Compliance | Ask institution | OPEN |
| Q9 | How should uncertainty be communicated to deaf users in ISL-friendly ways (icons, ISL video explanation)? | UX for primary users | Deaf user review in Phase 3 | OPEN |
| Q10 | Should corrections be logged locally to improve the model, and how is consent handled on shared devices? | Privacy vs improvement | Decide in Phase 3; default off | OPEN |

## Assumptions to confirm

- Team size 3 to 4, no ISL background, availability unknown (roadmap effort is in person-hours for this reason).
- At least one fluent ISL signer will be available for two review sessions and one recording session.
- At least six signers can be recruited for data collection.
- A mid-range laptop and Android phone are available as reference devices.

## Decision log

| Date | ID | Decision | By |
|---|---|---|---|
| 2026-09-16 | - | Documentation set created; no decisions taken yet | - |
