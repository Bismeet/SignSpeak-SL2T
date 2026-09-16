# Hackathon Demo Plan

## 1. Demo goals

Show, truthfully, in under 5 minutes:

1. A supported ISL sign becomes text with visible confidence, then speech.
2. A hearing person's spoken question becomes a verified ISL video.
3. The app refuses to guess on an unsupported gesture and offers the phrase board.
4. Honest statement of scope: how many signs, how many signers, what is verified.

## 2. Live demo script (`PROPOSAL`)

| Step | Who | Action | What the audience sees | Time |
|---|---|---|---|---|
| 0 | Presenter | One-slide context: problem, what SignSpeak is and is not | Slide | 40 s |
| 1 | Presenter | Open app on laptop (local build as backup), show Home, point out limitations link | Home screen | 20 s |
| 2 | Deaf-role demonstrator (ideally a real ISL signer who was **not** in training data) | Start conversation, grant camera | Permission explanation, tracking indicator | 20 s |
| 3 | Demonstrator | Sign PAIN, then STOMACH | Chips with confidence; presenter reads them aloud as "live prediction" | 30 s |
| 4 | Demonstrator | Tap Speak | TTS says "Pain. Stomach." | 10 s |
| 5 | Nurse-role presenter | Tap mic, say "Where does it hurt?" | Transcript, Send, verified ISL clip plays with "verified" badge | 30 s |
| 6 | Nurse-role | Say "Do you have insurance?" (not in list) | Text shown with "No verified ISL video" message | 20 s |
| 7 | Demonstrator | Perform an unsupported gesture | "Not recognised", then phrase board suggestion | 20 s |
| 8 | Demonstrator | Phrase board -> "I need water" -> Speak | Phrase spoken and shown | 15 s |
| 9 | Presenter | Show Emergency mode and Limitations page (supported sign list generated from model card, signer count, verification credits) | | 30 s |
| 10 | Presenter | Close: what is next, what needs experts | Slide | 30 s |

On-screen and spoken labelling: every prediction is announced as **"live"**; any pre-recorded material is labelled **"recorded"** in a persistent corner banner.

## 3. Fallback demo

- **Trigger:** camera fails, FPS too low, lighting bad, or two failed recognitions in a row during the live run.
- **Fallback A (semi-live):** Replay a recorded landmark fixture through the real inference pipeline in the browser (a developer toggle in Settings labelled "Demo: replay recorded landmarks"). The banner reads "Recorded landmarks, live model". This is honest because the model is still running live on real inputs captured earlier.
- **Fallback B (video):** A pre-recorded screen capture of the full flow, labelled "Recorded demo", with the presenter narrating. Recorded at least two days before, on the final build.
- **Fallback C (no app):** Phrase board and speech features do not need the camera; demonstrate those live and describe recognition with the video.

The presenter states which fallback is in use. Never present recorded material as live.

## 4. Demo environment checklist

- [ ] Final build deployed and also running locally.
- [ ] Laptop with a good webcam; a plain background and a lamp for consistent lighting.
- [ ] Chrome with camera and mic permissions pre-granted for the deployed origin.
- [ ] Network check; hotspot backup for Web Speech API.
- [ ] Volume tested for TTS.
- [ ] Fallback video on local disk.
- [ ] Demonstrator rehearsed the signs at the demo distance; confirmed not in training set (or disclosed if they are).
- [ ] Limitations page reflects the final model card.

## 5. Claims we may and may not make

**May:** "Recognises N ISL signs from the ISLRTC dictionary forms, tested on M held-out signers with macro F1 of X" (once measured). "All ISL videos shown were verified by <named verifier>." "Processes camera data on-device."

**May not:** "Translates sign language." "Works for any signer." "Medically validated." "First/only ISL app" (related work exists; see `technical-research.md` Section 5).

## 6. Related work to acknowledge in the pitch

- INCLUDE dataset and AI4Bharat's ISL work (IIT Madras).
- CISLR and iSign benchmarks (ISL recognition and translation research).
- ISLRTC dictionary and Sign Learn app as the official reference.
- Existing ISL learning/translation apps and hospital communication boards.

SignSpeak's contribution is framed as: a **focused, honest, accessible hospital communication aid** combining on-device landmark recognition for a small verified vocabulary with verified ISL video responses and robust fallbacks, not as a novel recognition algorithm.
