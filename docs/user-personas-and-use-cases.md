# User Personas and Use Cases

`ASSUMPTION` These personas are constructed from publicly described experiences of deaf ISL users and from general knowledge of Indian hospital workflows. They are **not** based on interviews we have conducted. Phase 1 of the roadmap includes validating them with at least two ISL users and one healthcare worker.

## Personas

### P1: Deaf patient, fluent ISL signer

- **Profile:** Adult, uses ISL as first language, moderate written Hindi or English, owns an Android smartphone.
- **Goal:** Explain what is wrong and understand what staff are asking, without waiting for an interpreter.
- **Challenges:** Staff do not sign; writing is slow and may be in a language the patient reads less comfortably; masks block lip-reading; the patient may be in pain or frightened, so precise signing degrades.
- **Needs from SignSpeak:** Fast recognition of core signs, big clear text, a phrase board for when hands are occupied or signing fails, ISL video responses rather than long text.

### P2: Hard-of-hearing older patient, limited ISL

- **Profile:** Older adult, acquired hearing loss, knows some ISL from community, more comfortable with pointing and simple signs.
- **Goal:** Get basic needs met (water, toilet, pain relief, call family).
- **Challenges:** Small text and low contrast are barriers; may not have a smartphone; relies on a companion.
- **Needs from SignSpeak:** Phrase board with large icons and text, minimal steps, text-to-speech so they can "say" a phrase to staff.

### P3: Triage nurse

- **Profile:** Busy, handles many patients, no sign language training, uses a shared ward tablet or personal phone.
- **Goal:** Establish chief complaint, pain level, allergies, and consent for basic procedures quickly.
- **Challenges:** Cannot spend more than a couple of minutes; needs to trust what the tool tells them; must not be misled by a wrong prediction.
- **Needs from SignSpeak:** Speech input that works on the ward device, obvious confidence indicators, a way to ask the patient to confirm, and a set of pre-built questions with verified ISL videos.

### P4: Family companion acting as interpreter

- **Profile:** Hearing relative with partial ISL knowledge.
- **Goal:** Reduce the burden of interpreting everything, especially private medical details.
- **Needs from SignSpeak:** A way for the patient to communicate directly for sensitive topics; a fallback when the companion is unsure of a sign.

### P5: Emergency responder / reception

- **Profile:** First point of contact, very short interaction.
- **Goal:** Yes/no answers, location of pain, is the person alone, who to call.
- **Needs from SignSpeak:** Emergency mode with the smallest possible vocabulary and largest possible buttons; works without account or setup.

## Primary use cases

### UC1: Patient expresses a symptom via signing

1. Patient opens SignSpeak, grants camera permission.
2. Patient signs PAIN, then points to or signs STOMACH.
3. App shows "PAIN" (confidence high) and "STOMACH" (confidence medium) as separate message chips.
4. Patient taps a chip to confirm, or taps "Not this" to pick the correct word from a short list or type it.
5. Patient taps "Speak" so the nurse hears "Pain. Stomach."

**Acceptance:** Each supported sign recognised within about 2 seconds of holding it; unsupported gestures yield "Not recognised" rather than a wrong word.

### UC2: Nurse asks a question by voice

1. Nurse taps the microphone, says "Where does it hurt?"
2. Speech-to-text shows the text; nurse confirms or edits.
3. App finds a verified ISL clip for "Where does it hurt?" and plays it for the patient, with the text shown alongside.
4. If no clip exists, the app shows the text in large type and says "No ISL video available for this phrase" rather than fabricating a sign sequence.

### UC3: Recognition fails and patient switches to the phrase board

1. Patient tries a sign twice; both attempts return "Not recognised".
2. App suggests the phrase board after two consecutive failures.
3. Patient taps category "Pain", then "Chest pain", then "Speak".

### UC4: Emergency mode at reception

1. Receptionist opens Emergency mode on a shared tablet.
2. Screen shows six large buttons: Help, Pain, Breathing difficulty, Call family, Yes, No, plus a pain scale 1 to 10.
3. Patient taps; app speaks and displays the phrase.

### UC5: Correcting a wrong prediction

1. App predicts "WATER" for a sign the patient meant as "MEDICINE".
2. Patient taps the chip, sees the top-3 alternatives with confidences, selects "MEDICINE".
3. Corrected message is marked as "corrected by user" in the conversation; optional local logging of the correction (landmarks only, opt-in) for later model improvement.

### UC6: No microphone or speech recognition unsupported

1. Nurse's browser does not support SpeechRecognition (for example, Firefox) or mic permission is denied.
2. App shows a clear message and switches to the typing input automatically.

## Environmental constraints to design for

- Variable lighting, cluttered backgrounds, patient lying down or sitting.
- One hand may be occupied (IV line, injury) so two-handed signs may be impossible; the phrase board must remain fully usable one-handed.
- Shared devices: no personal data should persist between sessions by default.
- Noisy wards affect speech recognition; typing must always be available.
- Intermittent connectivity: core recognition should not depend on the network.
