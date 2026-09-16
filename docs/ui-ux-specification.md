# UI/UX Specification

Design principles: **large, legible, honest, one-handed, no dead ends.** Visual flourish is deprioritised.

## 1. Global design system

| Token | Value (proposal) |
|---|---|
| Base font size | 18 px; conversation text 22 to 28 px; emergency buttons 28 px+ |
| Minimum touch target | 48 x 48 px; emergency mode 96 px+ |
| Contrast | >= 4.5:1 text, >= 3:1 UI components (WCAG 2.2 AA); high-contrast theme toggle |
| Colour semantics | Never colour-only: confidence uses colour + label + icon (High / Medium / Not recognised) |
| Focus | Visible 3 px focus ring on all interactive elements |
| Motion | Respect `prefers-reduced-motion`; no auto-playing animations except user-initiated clip playback |
| Language | UI in English initially; Hindi strings Should-have; all strings externalised |
| Icons | Paired with text labels everywhere |

## 2. Navigation map

```
Home
 ├─ Start conversation (Talk)  ── Camera panel | Speech/Text panel | Conversation feed
 │     ├─ Result & correction sheet
 │     └─ Phrase board (drawer)
 ├─ Emergency (1 tap, 8 buttons)
 ├─ Hospital phrases
 ├─ Settings & accessibility
 ├─ Help, privacy & limitations
 └─ Permission/error states (overlay anywhere)
```

## 3. Screens

### 3.1 Welcome / Home

Purpose: choose mode fast; state what the app is and is not.

```
+------------------------------------------------------+
| SignSpeak                          [Settings] [Help] |
|                                                      |
|  Two-way Indian Sign Language communication aid      |
|  Supports a small set of hospital signs and phrases. |
|  Not a replacement for interpreters or emergency     |
|  services.                                           |
|                                                      |
|  [  START CONVERSATION  ]   (primary, full width)    |
|  [  EMERGENCY PHRASES   ]   (red outline, large)     |
|  [  HOSPITAL PHRASES    ]                            |
|                                                      |
|  Camera: not used until you start.  Mic: same.       |
+------------------------------------------------------+
```

Flow: first launch shows a short 3-card intro (what it does, permissions, limitations) with Skip.

### 3.2 Main two-way communication (Talk)

Desktop / tablet landscape: three columns. Phone: tabs for Camera / Speak-Type, with the feed below.

```
+------------------+---------------------------+------------------+
| DEAF USER        | CONVERSATION              | HEARING USER     |
| [camera preview] | Nurse: Where does it hurt?| [ Mic ]  [ Type ]|
| tracking: ●green | [ISL clip ▶] verified ✓   | lang: en-IN ▾    |
| Detected:        | You: PAIN  (High)         | transcript box   |
| PAIN  High  [✓][✎]| You: STOMACH (Medium) ✎  | [Send]           |
| [Speak] [Clear]  | Nurse: Since when?        |                  |
| [Phrase board]   |   No verified ISL video   |                  |
|                  |   (shown as text)         |                  |
+------------------+---------------------------+------------------+
| Turn: Deaf user signing ...      [End conversation]             |
+-----------------------------------------------------------------+
```

Behaviours:
- Turn indicator text (and ARIA live region) announces mode changes.
- Each message has attribution, timestamp, and for AI-derived content a confidence or verification badge.
- "End conversation" clears memory and confirms.

### 3.3 Camera / sign recognition panel

- Live preview with optional landmark overlay (toggle; off by default for privacy-feel and performance).
- Tracking indicator: green "Hands tracked", amber "Move hands into frame", red "No camera".
- Detected chip appears when decision logic accepts; shows word, confidence band, and two buttons: Confirm, Not this.
- "Not recognised" appears after a stable low-confidence period, with hints; after two in a row, a "Use phrase board instead?" prompt.
- Camera can be paused (privacy) with a single button; preview goes dark and states "Camera paused".

### 3.4 Speech and text input panel

- Big mic button with states: idle, listening (pulsing ring + "Listening..." text), processing, error.
- Interim transcript shown in grey; final in black; editable.
- Language selector (en-IN, hi-IN).
- If unsupported/denied: mic button disabled with explanation; text box focused automatically.
- Send performs phrase matching; the result (clip or "no video") is shown in the feed with a note to the hearing user: "Shown as ISL video" or "Shown as text only".

### 3.5 Hospital / emergency phrases

Category grid then phrase list. Each phrase row: text (EN/HI), [Speak], [Show ISL] (if verified), badge if unverified/hidden by default.

Emergency mode:
```
+------------------------------+
| EMERGENCY        [Back]      |
|  [ HELP ]        [ PAIN ]    |
|  [ CAN'T BREATHE ] [ DOCTOR ]|
|  [ CALL FAMILY ] [ TOILET ]  |
|  [ YES ]         [ NO ]      |
|  Pain: 0 1 2 3 4 5 6 7 8 9 10|
+------------------------------+
```
Each tap speaks (if TTS on) and shows the phrase and its ISL clip. All buttons >= 96 px tall.

### 3.6 Recognition results and corrections (sheet)

Opens when a chip is tapped.
```
+------------------------------------------+
| You signed:  WATER   (Medium 0.64)       |
| Did you mean:                            |
|  [ WATER  0.64 ] [ MEDICINE 0.28 ] [ TOILET 0.05 ] |
|  [ Type something else... ]              |
|  [ Delete this ]                         |
+------------------------------------------+
```
Chosen correction updates the chip and marks it "corrected".

### 3.7 Settings and accessibility

- Text size (3 steps), high contrast, reduce motion.
- Auto-speak recognised words (off by default).
- TTS voice and rate; ASR language.
- Confidence threshold (Normal / Strict) with plain explanation.
- Show landmark overlay.
- Show unverified phrases (off by default).
- Data: "Nothing is stored" statement; opt-in local landmark logging toggle with export/delete.
- Reset all.

### 3.8 Permission and error states

Full-panel states with icon, one-sentence cause, one-sentence fix, and always a button to a working alternative (phrase board / typing). Enumerated in `technical-architecture.md` Section 6.

### 3.9 Privacy, help, and limitations

- What the app can do (list of supported signs and phrases, generated from the model card and phrases.json so it is never stale).
- What it cannot do.
- How camera and mic data are handled; note about browser speech recognition servers.
- Not medical advice; call emergency services statement with local number placeholder.
- Credits: ISL verifiers, data sources and licences.

## 4. Accessibility requirements

- All controls reachable and operable by keyboard; logical tab order; skip link to conversation.
- ARIA: live region (`aria-live="polite"`) for new messages and recognition results; `role="status"` for tracking indicator; labelled buttons; clip player has captions and a text alternative.
- Screen reader: the hearing user's side must be fully usable by a blind hearing user (e.g., a blind relative); the deaf user's side must be fully usable with captions and no audio dependency.
- Mobile: portrait layout with tabs; camera panel maintains 4:3 preview; bottom-anchored primary actions for thumb reach.
- No information conveyed by sound alone; no information conveyed by colour alone.
- Clear permission indicators: persistent small camera/mic status pills in header.
- Audio controls: play/stop/repeat, rate, volume relies on OS.

## 5. User flows

1. **First use:** Home -> intro cards -> Start conversation -> camera permission prompt (with explanation) -> Talk.
2. **Sign and speak:** Talk -> sign -> chip -> confirm -> Speak.
3. **Correct:** chip -> sheet -> choose alternative -> chip updated.
4. **Ask by voice:** Mic -> transcript -> Send -> clip or text shown.
5. **Fallback:** two "Not recognised" -> prompt -> phrase board -> phrase -> Speak.
6. **Emergency:** Home -> Emergency -> tap.

## 6. Design deliverables (Phase 3)

- Low-fidelity wireframes for the 9 screens (Figma or paper photos committed to `docs/design/`).
- Component inventory.
- Accessibility checklist per screen.
- Review with at least one deaf ISL user before build.
