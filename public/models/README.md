# Model files

Fetched by `scripts/setup-assets.mjs`. These are MediaPipe Tasks Vision models, not
SignSpeak models. MediaPipe locates hands and body joints; it does **not** recognise
sign language.

| File | Purpose |
|---|---|
| `hand_landmarker.task` | MediaPipe Hand Landmarker (float16). 21 landmarks per hand. |
| `pose_landmarker_lite.task` | MediaPipe Pose Landmarker (lite). Shoulders and hips, used for sign location. |

The sign classifier itself (`sign-clf-v1.onnx` and `model-card.json`) is **not** here,
because no model can be trained until consented landmark data has been collected from
ISL signers. See `ml/README.md`.
