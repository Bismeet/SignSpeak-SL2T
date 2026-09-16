"""Constants shared across the training pipeline.

Every value here has a counterpart in the TypeScript codebase. When you change one,
change both and re-run `npm run ml:fixtures && npm test` — the parity test will fail
loudly if they drift.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------------------
# Feature vector contract — mirrors lib/types.ts
# ---------------------------------------------------------------------------------------

#: Total number of floats in one feature vector.
FEATURE_VECTOR_LENGTH = 159

#: Version tag recorded in the model card. The browser refuses to load a model whose
#: declared feature version differs from its own (see lib/model/card.ts).
FEATURE_VERSION = "ss-features-v1"

#: Number of landmarks MediaPipe reports per hand.
HAND_LANDMARK_COUNT = 21

#: Guards against division by zero for degenerate hands. Identical to EPSILON in
#: lib/vision/features.ts.
EPSILON = 1e-6

# ---------------------------------------------------------------------------------------
# MediaPipe Hand Landmarker indices — mirrors HAND in lib/vision/features.ts
# ---------------------------------------------------------------------------------------

HAND_WRIST = 0
HAND_THUMB_CMC = 1
HAND_THUMB_MCP = 2
HAND_THUMB_IP = 3
HAND_THUMB_TIP = 4
HAND_INDEX_MCP = 5
HAND_INDEX_PIP = 6
HAND_INDEX_DIP = 7
HAND_INDEX_TIP = 8
HAND_MIDDLE_MCP = 9
HAND_MIDDLE_PIP = 10
HAND_MIDDLE_DIP = 11
HAND_MIDDLE_TIP = 12
HAND_RING_MCP = 13
HAND_RING_PIP = 14
HAND_RING_DIP = 15
HAND_RING_TIP = 16
HAND_PINKY_MCP = 17
HAND_PINKY_PIP = 18
HAND_PINKY_DIP = 19
HAND_PINKY_TIP = 20

#: Joint triples (a, b, c); the extension angle is measured at b.
EXTENSION_JOINTS: tuple[tuple[int, int, int], ...] = (
    (HAND_THUMB_CMC, HAND_THUMB_MCP, HAND_THUMB_TIP),
    (HAND_INDEX_MCP, HAND_INDEX_PIP, HAND_INDEX_TIP),
    (HAND_MIDDLE_MCP, HAND_MIDDLE_PIP, HAND_MIDDLE_TIP),
    (HAND_RING_MCP, HAND_RING_PIP, HAND_RING_TIP),
    (HAND_PINKY_MCP, HAND_PINKY_PIP, HAND_PINKY_TIP),
)

#: Fingertips in the same order as EXTENSION_JOINTS.
FINGERTIPS: tuple[int, ...] = (
    HAND_THUMB_TIP,
    HAND_INDEX_TIP,
    HAND_MIDDLE_TIP,
    HAND_RING_TIP,
    HAND_PINKY_TIP,
)

# ---------------------------------------------------------------------------------------
# MediaPipe Pose Landmarker indices — mirrors POSE in lib/vision/features.ts
# ---------------------------------------------------------------------------------------

POSE_NOSE = 0
POSE_LEFT_SHOULDER = 11
POSE_RIGHT_SHOULDER = 12
POSE_LEFT_HIP = 23
POSE_RIGHT_HIP = 24
POSE_LANDMARK_COUNT = 33

# ---------------------------------------------------------------------------------------
# Feature block offsets. Kept as named constants because the layout is otherwise a wall
# of magic numbers, and an off-by-one here silently corrupts training data.
# ---------------------------------------------------------------------------------------

OFFSET_HAND_LANDMARKS = 0  # 0..125   two hands x 21 landmarks x (x, y, z)
OFFSET_PRESENCE = 126  # 126..127 presence flag per hand
OFFSET_CENTROID = 128  # 128..131 centroid relative to shoulder mid, / shoulder width
OFFSET_PALM_NORMAL = 132  # 132..137 palm unit normal per hand
OFFSET_TIP_DISTANCE = 138  # 138..147 wrist -> fingertip distances per hand
OFFSET_EXTENSION_ANGLE = 148  # 148..157 finger extension angles per hand
OFFSET_POSE_PRESENT = 158  # 158     pose presence flag

#: Human-readable layout, used to generate documentation and the collection UI.
FEATURE_LAYOUT: tuple[tuple[str, str], ...] = (
    ("0-125", "2 hands x 21 landmarks x (x, y, z), wrist-origin and hand-size scaled"),
    ("126-127", "Hand presence flags (left, right)"),
    ("128-131", "Hand centroid relative to shoulder midpoint, divided by shoulder width"),
    ("132-137", "Palm unit normal per hand (x, y, z)"),
    ("138-147", "Wrist to fingertip distances per hand"),
    ("148-157", "Finger extension angles in radians per hand"),
    ("158", "Pose presence flag"),
)

# ---------------------------------------------------------------------------------------
# Vocabulary and dataset conventions
# ---------------------------------------------------------------------------------------

#: Gloss of the explicit negative / "none of the above" class, when a model has one.
#: `docs/technical-research.md` §3.4 strategy 2. The browser reads the same value from
#: the model card rather than hardcoding it.
NEGATIVE_CLASS_GLOSS = "OTHER"

#: Minimum requirements from docs/ai-ml-and-dataset-plan.md §2. Training refuses to
#: produce a "real" model below these, and marks the output not_for_real_use instead.
MIN_SIGNERS = 6
MIN_STATIC_REPS_PER_CLASS = 20
MIN_NEGATIVE_SAMPLES = 300

#: Acceptance targets from docs/testing-and-evaluation.md §2.2. Reported, never asserted
#: silently — `evaluate.py` prints a pass/fail table against these numbers.
TARGET_MACRO_F1 = 0.80
TARGET_PER_CLASS_RECALL = 0.70
TARGET_FALSE_ACCEPT_RATE = 0.10
TARGET_FALSE_REJECT_RATE = 0.20
TARGET_CLASSIFIER_LATENCY_MS = 30.0
