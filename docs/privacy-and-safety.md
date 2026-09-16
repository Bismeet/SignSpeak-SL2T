# Privacy and Safety

## 1. Principles

1. **Data minimisation by default:** no camera frames, no audio, no transcripts are stored or transmitted by SignSpeak unless the user opts in for a specific, explained purpose.
2. **Local first:** landmark extraction and sign classification run on the device.
3. **Honesty:** the app always shows uncertainty and verification status, and states its limits.
4. **Not medical:** the app never interprets, diagnoses, or advises.
5. **Human in the loop:** users confirm before anything is spoken or sent.

## 2. Permissions

| Permission | When requested | Explanation shown | Indicator |
|---|---|---|---|
| Camera | Only when the user opens the camera panel | "Used to detect hand positions on this device. Video is not recorded or uploaded." | Header pill "Camera on" and browser indicator; one-tap pause |
| Microphone | Only when the user taps the mic | "Used for speech-to-text. Your browser may send audio to its speech service (e.g., Google for Chrome)." | Header pill "Mic on" |

Permissions are never requested on page load. Denial leads to a functional fallback, never a blocked app.

## 3. Local vs server processing

| Data | Where processed | Stored? | Transmitted? |
|---|---|---|---|
| Camera frames | Browser memory | No | No |
| Hand/pose landmarks | Browser | No (unless opt-in logging) | Only if optional backend inference flag is on; landmarks only |
| Predictions and conversation | Browser memory | Session only; cleared on End/reload | No |
| Microphone audio | Browser Web Speech API | Not by SignSpeak | **Yes, by the browser vendor's speech service** in Chrome/Edge; this is outside our control and is disclosed in the UI |
| Transcripts | Browser memory | Session only | No |
| Settings | `localStorage` | Yes (non-personal) | No |
| Opt-in landmark logs for corrections | Browser `IndexedDB` | Yes, until user exports/deletes | No |

If the optional FastAPI backend is enabled: it receives only landmark arrays over TLS, does no logging of payloads, and keeps no state. This is documented in the help page when active.

## 4. Data retention

- Default retention: **zero** beyond the browser session.
- Shared ward devices: the "End conversation" action is prominent; the app also clears state on page reload and offers an auto-clear timer setting (e.g., 10 minutes idle).
- Training dataset (collected separately, see `ai-ml-and-dataset-plan.md`): retained for the project duration; deleted or anonymised at project end unless participants consented to longer retention or publication.

## 5. Consent

- **App users:** first-run intro explains camera/mic use and non-storage; a link to the full privacy page is always available. No account or personal details collected.
- **Dataset participants:** written informed consent, provided in ISL video form as well as text; withdrawal at any time; pseudonymised IDs.
- **Usability test participants:** separate consent; no recording of sessions without permission.

## 6. Sensitive healthcare information

- Conversations may include health information. Because nothing is stored, exposure is limited to the device screen. The UI includes a "Hide conversation" button for privacy when others are nearby.
- The app never asks for name, ID numbers, or diagnoses.
- If any future feature stores conversation history, it must go through a privacy review, and India's Digital Personal Data Protection Act, 2023 obligations must be assessed. `DECISION NEEDED` before any such feature.

## 7. Security

- HTTPS only (required for camera/mic anyway).
- Content Security Policy restricting script sources; MediaPipe WASM and model files served from our origin or a pinned CDN.
- No third-party analytics in MVP.
- Dependencies scanned in GitLab CI (dependency scanning / SAST where available).
- If backend exists: rate limiting, no payload logging, no persistent storage, CORS restricted to the frontend origin.

## 8. Model bias and recognition errors

- Risks: the classifier may perform worse for signers with different hand sizes, skin tones under poor lighting, left-handed signers, regional variants, or people signing from a bed.
- Mitigations: diverse signer recruitment (documented, not assumed), held-out-signer evaluation, robustness slices, explicit rejection instead of guessing, one-tap correction, and the model card listing known gaps.
- Users are told, in plain language, that recognition can be wrong and to confirm important statements.

## 9. User confirmation and safety messaging

- Recognised words are not spoken automatically unless the user enables auto-speak.
- Hearing users are told whether the deaf user saw an ISL video or only text.
- Safety banner in Emergency mode: "This app helps communicate. In an emergency, call your local emergency number (placeholder 112 in India; verify) and get staff."
- Limitations page lists exactly which signs and phrases are supported.

## 10. Content integrity for ISL clips

- Only clips with `validation.status = expert_verified` are shown by default.
- Each clip records who verified it and when.
- Incorrect or outdated clips can be disabled by editing `phrases.json` without a code change.

## 11. Ethics checklist before demo

- [ ] No ASL content labelled as ISL.
- [ ] Every shown clip verified.
- [ ] Demo states number of signers and that results are from a small prototype.
- [ ] No claims of medical use or interpreter replacement.
- [ ] Dataset participants consented to their landmark data being used for the demo model.
