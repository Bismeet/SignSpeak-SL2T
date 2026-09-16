# `public/clips` — verified ISL video clips

This directory holds the curated Indian Sign Language clips that SignSpeak plays for the
text-to-visual feature (FR-VIS-01 … FR-VIS-05).

**It is empty on purpose.** Read this before adding anything.

## The rule this directory enforces

SignSpeak shows a whole-phrase ISL clip that a qualified ISL signer has verified, or it
shows the exact sentence:

> No verified ISL video for this phrase

There is no third option. Specifically, the app must never:

- **generate** a sign it does not have (no avatar, no animation, no synthesis);
- **substitute** an American Sign Language clip, or any other sign language, for ISL —
  they are different languages with different grammars;
- **concatenate** English word clips and present the result as grammatical ISL. ISL is a
  complete natural language with its own grammar (verb-final word order, clause-final
  question words and negation, non-manual markers). A sequence of English words signed in
  English order is not ISL, and presenting it as such would misteach the language.

## Why the directory is empty

Every clip must be produced by a qualified ISL signer and signed off before it ships. As of
the current build, **no clip has been verified**, so `data/phrases.json` has
`clip.type: "none"` for all 49 phrases and the app shows the fallback sentence everywhere.

This is the honest state of the project, not a bug. `npm run validate:clips` reports it
explicitly and treats zero clips as the expected condition.

## How to add a clip

1. Record the phrase. One clip per **whole phrase** — never per word. Export as `.mp4`
   (H.264 + AAC) or `.webm`; keep it under a few hundred kilobytes and roughly 2–6 seconds.
2. Name the file after the phrase id, e.g. `p_pain_here.mp4`.
3. Get it verified by a qualified ISL signer.
4. Update the phrase entry in `data/phrases.json`:

   ```json
   {
     "id": "p_pain_here",
     "clip": {
       "type": "file",
       "src": "p_pain_here.mp4",
       "startSeconds": 0,
       "endSeconds": 3.2
     },
     "validation": {
       "status": "expert_verified",
       "verifiedBy": "Name or organisation of the verifier",
       "verifiedOn": "2026-09-16"
     },
     "islGloss": "PAIN HERE",
     "licence": "CC BY 4.0",
     "attribution": "Recorded by …, signed by …"
   }
   ```

5. Run `npm run validate`. It fails the build if a `clip.src` does not resolve, if a file
   is zero bytes, if `startSeconds >= endSeconds`, if a verified phrase has no clip, or if
   a clip exists without a licence and attribution.

A clip on a phrase that is **not** `expert_verified` is allowed but is reported as a
warning, is hidden by default in the interface, and is shown with an UNVERIFIED badge when
a reviewer opts in. That path exists so work in progress can be reviewed — not so unverified
signs can reach a patient.

## YouTube embeds

`clip.type: "youtube"` is supported for content that is already published (for example on
the ISLRTC dictionary). The app never autoloads the embed: it loads only after an explicit
tap, because a third-party embed contacts Google's servers and that must be the user's
choice. A YouTube embed requires `licence` and `attribution` before it can ship.

## Licensing

Do not commit a clip you do not have the right to redistribute. Record the licence in
`data/phrases.json` for every clip. If the licence is unclear, the clip does not ship.

## Files here are gitignored

`.gitignore` excludes `public/clips/*` but keeps this README, so a mistakenly committed clip
cannot silently enter the repository history. If you genuinely need to version a clip,
add an explicit negation for it in `.gitignore` and record its licence in the data file.
