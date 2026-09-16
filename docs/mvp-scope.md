# MVP Scope

Complexity scale: **L** low (hours), **M** medium (1 to 3 days for one person), **H** high (a week or more, or dependent on external people).

## Must have (minimum end-to-end demonstration)

| Feature | User value | Complexity | Dependencies | Risks | Acceptance criteria |
|---|---|---|---|---|---|
| Camera capture + MediaPipe hand landmarks in browser | Foundation for sign input | M | Browser camera API, MediaPipe Tasks Vision | Performance on low-end phones | Hands tracked at >= 15 FPS on reference laptop; tracking indicator visible |
| Static-sign classifier for 10 to 15 hospital signs | Core sign-to-text | M (model) + H (data) | Team-collected dataset, ISL validation of sign forms | Dataset too small; signer variation | Held-out-signer macro F1 meets target in `testing-and-evaluation.md`; unknown gestures rejected |
| Confidence display + "Not recognised" state | Trust and safety | L | Classifier | Threshold tuning | No word emitted below threshold; state shown within 1 s of hands leaving frame |
| Correction UI (top-3 alternatives + type) | Recovers from errors | L | Classifier top-N | None | User can replace any prediction in <= 2 taps |
| Text-to-speech with controls | Deaf user is "heard" | L | SpeechSynthesis | Voice availability for hi-IN | Speak/stop/repeat work; unavailability message shown when no voice |
| Speech-to-text (en-IN, hi-IN) with typing fallback | Hearing user input | L to M | Web Speech API | Browser support, ward noise | Works in Chrome; Firefox shows fallback automatically |
| Curated phrase list -> verified ISL clip playback | Deaf user receives ISL | M (UI) + H (clip sourcing/verification) | ISL expert, licensed or self-recorded clips | Expert access | Every clip shown has `expert_verified` status; unmatched text shows explicit "no video" message |
| Two-way conversation view | Ties it together | M | All above | UX complexity | Both sides' messages attributed and ordered; turn indicator visible |
| Hospital phrase board (approx. 30 phrases) + Emergency 8-button mode | Works even when recognition fails | M | Phrase JSON, TTS | Phrase translation quality | Phrase reachable in <= 3 taps; emergency mode in 1 tap |
| Permission / error states | Prevents dead ends | L | None | None | Every permission denial has a screen with next steps |
| Privacy, help, limitations page | Honesty and consent | L | None | None | Reachable from every screen; states no-storage default |

## Should have (if time permits)

| Feature | User value | Complexity | Dependencies | Risks | Acceptance criteria |
|---|---|---|---|---|---|
| 3 to 5 dynamic signs (movement-based) | Broader natural vocabulary | H | Temporal model, more data | Model complexity; data volume | Dynamic signs meet the same held-out-signer targets |
| Idle / "no sign" class and temporal smoothing | Fewer flickering predictions | M | Classifier | None | Prediction changes only after N consistent frames |
| Message "misunderstood" flag and repeat request | Better turn-taking | L | Conversation view | None | Flag visible to other party |
| Hindi UI strings | Local usability | M | Translation | Quality | All MVP screens translated |
| Opt-in local landmark logging for corrections | Future model improvement | M | Consent UI | Privacy | Off by default; export/delete controls |
| Optional FastAPI landmark inference backend | Fallback if browser inference is slow | M | Python, hosting | Latency, cost | Round-trip < 300 ms on local network |
| PWA installability / offline shell | Ward devices with poor network | M | Service worker | Cache invalidation | App loads offline after first visit |

## Future

| Feature | User value | Complexity | Dependencies | Risks |
|---|---|---|---|---|
| Broader vocabulary (100+ signs) | General use | H | Large dataset, community partners | Data, expert time |
| Continuous signing / sentence segmentation | Natural conversation | H | Sequence models, sentence-level data | Research-grade problem |
| 3D animated ISL avatar | Scalable ISL output | H | Motion capture or animation, expert review of every animation | Uncanny or wrong signing harms trust |
| Fingerspelling recognition | Names, medicines | H | ISL two-handed alphabet data | Two-hand occlusion |
| Additional spoken languages (Tamil, Bengali, Marathi...) | Regional use | M | ASR/TTS support | Voice availability |
| Regional ISL variation handling | Inclusivity | H | Multi-region data | Data |
| Hospital system integration | Workflow fit | H | Partnerships | Compliance |
| Offline ASR (on-device Whisper-class models) | Privacy and reliability | H | WebGPU / WASM models | Device performance |

## Why the MVP is this small

- Every recognised sign needs data from multiple signers and expert confirmation of its form; 10 to 15 signs is the largest set a student team can plausibly collect and validate.
- Every ISL clip shown to a deaf user must be verified; roughly 30 phrases is the largest set that a single expert review session can cover.
- Two-way interaction, honest error states, and accessibility are more valuable in a demo than a larger but unreliable vocabulary.

## MVP definition of done

1. A signer not in the training data performs each of the supported signs; the app transcribes them with the target accuracy and rejects two unsupported gestures.
2. A hearing user speaks a phrase from the curated list; the app displays the verified clip.
3. A hearing user speaks a phrase not on the list; the app shows text and the "no video" message.
4. Camera and microphone denial paths are demonstrated.
5. Keyboard-only and screen-reader walkthrough of the conversation view passes.
6. Limitations page is present and accurate.
