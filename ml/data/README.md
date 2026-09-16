# `ml/data` — collected training data

This directory holds the recorded landmark samples that `ml/scripts/train.py` trains on.

**It is empty.** No ISL data has been collected yet, so there is no real model. Read this
before adding anything.

## The most important thing about this directory

Every sample here is a **feature vector, not a video**. Each frame is 159 floats derived
from MediaPipe hand and pose landmarks. There are no images, no audio and no pixels — so
the training set cannot be used to identify anyone, and no raw footage is ever stored or
transmitted (see `docs/privacy-and-safety.md`).

That property is what makes the dataset safe to hold at all. Do not add video to this
directory, and do not "helpfully" record raw frames alongside the landmarks.

## How to collect data

1. Run the app and open **`/collect`** (the landmark collection tool).
2. Tick the consent acknowledgement. The Record button stays locked until you do.
3. Enter a **pseudonymous** signer id (`signer-01`, not a name). The tool never asks for a
   name and the app stores nothing itself.
4. Tag the signer type. Hearing team members are tagged `learner`; their samples are
   excluded from the test set by default, because evaluating a model on people who are
   still learning to sign measures the wrong thing (risk R20).
5. Record the signs. Frames with no detected hands are counted and dropped rather than
   recorded as noise.
6. Export. The tool downloads a JSON file locally. Nothing is uploaded.

Move the exported file into this directory (or any subdirectory — the loader walks the tree
recursively and reads every `*.json` file it finds).

## File format

Either a single object with a `samples` array (what the tool exports), or a bare array of
sample objects. Both are accepted.

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-09-16T10:00:00.000Z",
  "featureVersion": "ss-features-v1",
  "samples": [
    {
      "id": "s_01H...",
      "signerId": "signer-01",
      "signerType": "fluent",
      "label": "PAIN",
      "session": "session-2026-09-16",
      "capturedAt": "2026-09-16T09:58:00.000Z",
      "conditions": {
        "lighting": "bright",
        "background": "plain",
        "distance": "medium",
        "pose": "sitting",
        "handedness": "right"
      },
      "toolVersion": "0.1.0",
      "frameCount": 42,
      "features": [[0.0, 0.0, 0.0, "... 159 floats total"], "... one row per frame"]
    }
  ]
}
```

`features` must be `[T][159]`. A row with any other length is rejected with a clear error
naming the sample and the index, rather than being silently truncated.

`label` must be a gloss from `data/sign-vocabulary.json`, or the negative class `OTHER`.
Anything else is dropped with a warning and counted in the run report.

## Why the directory is empty, and what that means

There is **no trained recognition model** in this project, and this directory is the reason.
Producing one requires:

1. an ISL signer to confirm the canonical form of each sign in `data/sign-vocabulary.json`
   (every entry is currently `verification: "unverified"`, and `motion: "unverified"` means
   we do not yet know which signs are static and which depend on movement);
2. recordings from **at least 6 signers** per sign, so that a held-out-signer split means
   something — evaluating on a signer the model has already seen inflates the score and
   tells you nothing about a new patient;
3. at least 20 recorded repetitions per sign and at least 300 negative (`OTHER`) frames.

Until then `train.py` refuses to mark a model as usable. It will still train and export a
model, but it is written with `notForRealUse: true`, and the app shows a permanent banner
while it is loaded. That is deliberate: the pipeline is verifiable end to end now, and the
honesty is enforced by code rather than by remembering to be careful.

## Checking what you have

```bash
npm run ml:train        # prints the dataset summary and every quality finding
```

The quality check reports blockers (too few signers, too few classes, thin classes) and
warnings (no negative class, thin negatives). Blockers do not stop training — they force
`notForRealUse: true`, which is the honest outcome.

## Importing an in-app correction log

The app can optionally keep a local log of recognition corrections. Convert one into
samples with:

```bash
node scripts/ml.mjs scripts/import_corrections.py \
  --input signsspeak-corrections.landmark-log.json \
  --signer-id signer-07 \
  --consent-confirmed
```

It requires `--signer-id` and `--consent-confirmed`, prints a consent notice, refuses a log
whose `featureVersion` does not match, and sets the condition metadata to `"unknown"`
rather than inventing plausible values.

## This directory is gitignored

`.gitignore` excludes `ml/data/**` but keeps this README. Landmark exports are pseudonymous,
not anonymous, and are not something to publish by accident. Keep them locally, or store
them wherever your ethics approval says they belong.
