#!/usr/bin/env python
"""Generate the TypeScript/Python feature-parity fixtures.

The feature vector is implemented twice — once in `lib/vision/features.ts` for the
browser and once in `ml/signdata/features.py` for training. If they ever disagree, the
browser would feed the model vectors that mean something different from what it was
trained on, and the failure mode is silent wrong answers. That is risk R14 in
`docs/risk-register.md`.

This script writes `tests/fixtures/features-parity.json`, containing deliberately awkward
frames and the vector Python produces for each. `tests/features-parity.test.ts` runs the
same frames through the TypeScript implementation and asserts equality.

Run with:
    npm run ml:fixtures

Then:
    npm test

Non-finite values
-----------------
JSON cannot represent NaN or Infinity, so those appear in the fixture as the strings
"NaN", "Infinity" and "-Infinity". The parity test decodes them before use; see the
`valueEncoding` key in the fixture.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "ml"))

from signdata.constants import FEATURE_VECTOR_LENGTH, FEATURE_VERSION, HAND_LANDMARK_COUNT  # noqa: E402
from signdata.features import extract_feature_vector  # noqa: E402
from signdata.io import write_json  # noqa: E402
from signdata.schema import ParityCase, ParityFixture  # noqa: E402
from signdata.synthetic import (  # noqa: E402
    SyntheticConfig,
    _BASE_HAND,
    _build_hand,
    _hand_landmarks,
    _make_signers,
    _pose_landmarks,
)

import numpy as np  # noqa: E402

OUTPUT_PATH = REPO_ROOT / "tests" / "fixtures" / "features-parity.json"

#: Absolute tolerance used by the parity test. `acos` differs between V8 and libm in the
#: last ULP, and the outputs are float32, so anything below this is indistinguishable.
TOLERANCE = 1e-6


def _landmarks(values: list[tuple[float, float, float]]) -> list[dict[str, float]]:
    return [{"x": x, "y": y, "z": z} for x, y, z in values]


def _hand(
    handedness: str,
    score: float,
    values: list[tuple[float, float, float]],
) -> dict[str, object]:
    return {"handedness": handedness, "score": score, "landmarks": _landmarks(values)}


def _open_hand_values() -> list[tuple[float, float, float]]:
    return list(_BASE_HAND)


def _curled_hand_values() -> list[tuple[float, float, float]]:
    return [
        tuple(row)  # type: ignore[misc]
        for row in _build_hand((0.2, 1.0, 1.0, 1.0, 1.0), 0.0, 1.0)
    ]


def _shift(values: list[tuple[float, float, float]], dx: float, dy: float) -> list[tuple[float, float, float]]:
    return [(x + dx, y + dy, z) for x, y, z in values]


def _scale(values: list[tuple[float, float, float]], factor: float) -> list[tuple[float, float, float]]:
    return [(x * factor, y * factor, z * factor) for x, y, z in values]


def _realistic_frame() -> dict[str, object]:
    """A frame produced by the same generator the smoke test uses, so it is not hand-tuned."""
    rng = np.random.default_rng(7)
    signer = _make_signers(rng, 1)[0]
    local = _build_hand((0.0, 0.0, 0.0, 0.0, 0.0), 0.35, 0.16 * signer.scale)
    right = _hand_landmarks(local, (-0.4, -0.1), rng, noise=0.0, jitter=(0.0, 0.0))
    left = _hand_landmarks(
        np.asarray(local) * np.asarray([-1.0, 1.0, 1.0]),
        (-0.5, -0.05),
        rng,
        noise=0.0,
        jitter=(0.0, 0.0),
    )
    return {
        "hands": [
            {"handedness": "Left", "score": 0.94, "landmarks": left},
            {"handedness": "Right", "score": 0.96, "landmarks": right},
        ],
        "pose": {"landmarks": _pose_landmarks(rng, (0.01, 0.0))},
        "timestampMs": 1234,
    }


def build_cases() -> list[tuple[str, str, dict[str, object]]]:
    """Every case is (name, description, frame)."""
    open_hand = _open_hand_values()
    curled = _curled_hand_values()
    tiny = _scale(open_hand, 0.004)
    huge = _scale(open_hand, 40.0)

    cases: list[tuple[str, str, dict[str, object]]] = []

    cases.append(
        (
            "empty-frame",
            "No hands and no pose. The vector must still be exactly 159 finite floats.",
            {"hands": [], "pose": None, "timestampMs": 0},
        )
    )
    cases.append(
        (
            "pose-only",
            "Torso visible, no hands. Only the pose flag should be set.",
            {"hands": [], "pose": {"landmarks": _pose_landmarks(np.random.default_rng(1), (0.0, 0.0))}, "timestampMs": 1},
        )
    )
    cases.append(
        (
            "left-hand-only",
            "Single left hand, no pose. Centroid features must stay zero.",
            {"hands": [_hand("Left", 0.9, open_hand)], "pose": None, "timestampMs": 2},
        )
    )
    cases.append(
        (
            "right-hand-only",
            "Single right hand, no pose.",
            {"hands": [_hand("Right", 0.9, open_hand)], "pose": None, "timestampMs": 3},
        )
    )
    cases.append(
        (
            "both-hands-open",
            "Open left and right hands with pose, the ordinary case.",
            {
                "hands": [_hand("Left", 0.91, open_hand), _hand("Right", 0.93, open_hand)],
                "pose": {"landmarks": _pose_landmarks(np.random.default_rng(2), (0.0, 0.0))},
                "timestampMs": 4,
            },
        )
    )
    cases.append(
        (
            "both-hands-curled",
            "Curled fingers, to exercise the extension-angle block (indices 148-157).",
            {
                "hands": [_hand("Left", 0.88, curled), _hand("Right", 0.92, curled)],
                "pose": {"landmarks": _pose_landmarks(np.random.default_rng(3), (0.0, 0.0))},
                "timestampMs": 5,
            },
        )
    )
    cases.append(
        (
            "duplicate-handedness-higher-score-wins",
            "Two right hands: the higher-scoring one must occupy the right slot.",
            {
                "hands": [
                    _hand("Right", 0.42, _shift(open_hand, 0.3, 0.3)),
                    _hand("Right", 0.97, open_hand),
                ],
                "pose": None,
                "timestampMs": 6,
            },
        )
    )
    cases.append(
        (
            "duplicate-handedness-lower-score-first",
            "Same as above with the order reversed, to prove selection is order-independent.",
            {
                "hands": [
                    _hand("Right", 0.97, open_hand),
                    _hand("Right", 0.42, _shift(open_hand, 0.3, 0.3)),
                ],
                "pose": None,
                "timestampMs": 7,
            },
        )
    )
    cases.append(
        (
            "incomplete-hand-ignored",
            "A hand with 20 landmarks is unusable and must be treated as absent.",
            {
                "hands": [
                    {"handedness": "Right", "score": 0.99, "landmarks": _landmarks(open_hand[:20])},
                ],
                "pose": None,
                "timestampMs": 8,
            },
        )
    )
    cases.append(
        (
            "hand-with-nan-coordinates",
            "Non-finite coordinates must be replaced with zero, never propagated.",
            {
                "hands": [
                    {
                        "handedness": "Right",
                        "score": 0.9,
                        "landmarks": _landmarks(
                            [
                                (float("nan"), 0.1, 0.0),
                                (float("inf"), 0.2, 0.0),
                                *open_hand[2:],
                            ]
                        ),
                    }
                ],
                "pose": None,
                "timestampMs": 9,
            },
        )
    )
    cases.append(
        (
            "degenerate-hand-zero-scale-guard",
            "All landmarks identical: the scale guard must prevent a division by zero.",
            {
                "hands": [
                    _hand("Right", 0.9, [(0.5, 0.5, 0.0)] * HAND_LANDMARK_COUNT),
                ],
                "pose": None,
                "timestampMs": 10,
            },
        )
    )
    cases.append(
        (
            "tiny-hand-scale-invariance",
            "A 0.004x hand must normalise to nearly the same vector as the open hand.",
            {"hands": [_hand("Right", 0.9, tiny)], "pose": None, "timestampMs": 11},
        )
    )
    cases.append(
        (
            "huge-hand-scale-invariance",
            "A 40x hand must normalise to nearly the same vector as the open hand.",
            {"hands": [_hand("Right", 0.9, huge)], "pose": None, "timestampMs": 12},
        )
    )
    cases.append(
        (
            "pose-missing-shoulders",
            "Pose present but shoulder landmarks are not finite: pose flag must be 0.",
            {
                "hands": [_hand("Right", 0.9, open_hand)],
                "pose": {
                    "landmarks": [
                        {"x": 0.5, "y": 0.5, "z": 0.0} for _ in range(11)
                    ]
                    + [
                        {"x": float("nan"), "y": 0.6, "z": 0.0},
                        {"x": float("nan"), "y": 0.6, "z": 0.0},
                    ]
                    + [{"x": 0.5, "y": 0.5, "z": 0.0} for _ in range(21)]
                },
                "timestampMs": 13,
            },
        )
    )
    cases.append(
        (
            "pose-truncated-array",
            "Pose with fewer than 13 landmarks must be handled without an index error.",
            {
                "hands": [_hand("Right", 0.9, open_hand)],
                "pose": {"landmarks": [{"x": 0.5, "y": 0.6, "z": 0.0}] * 5},
                "timestampMs": 14,
            },
        )
    )
    cases.append(
        (
            "zero-width-shoulders",
            "Both shoulders at the same point: the width guard must zero the centroid block.",
            {
                "hands": [_hand("Right", 0.9, open_hand)],
                "pose": {
                    "landmarks": [
                        {"x": 0.5, "y": 0.5, "z": 0.0} for _ in range(11)
                    ]
                    + [
                        {"x": 0.5, "y": 0.55, "z": 0.0},
                        {"x": 0.5, "y": 0.55, "z": 0.0},
                    ]
                    + [{"x": 0.5, "y": 0.5, "z": 0.0} for _ in range(21)]
                },
                "timestampMs": 15,
            },
        )
    )
    cases.append(
        (
            "unmirrored-camera-handedness",
            "Handedness labels are whatever MediaPipe reported; the feature code must not swap them.",
            {
                "hands": [_hand("Left", 0.9, curled), _hand("Right", 0.8, open_hand)],
                "pose": None,
                "timestampMs": 16,
            },
        )
    )
    cases.append(
        (
            "realistic-generated-frame",
            "A frame from the same generator the smoke test uses, with both hands and pose.",
            _realistic_frame(),
        )
    )
    cases.append(
        (
            "hand-count-zero-with-stale-pose",
            "No hands but a valid pose: hand count 0, pose flag 1.",
            {
                "hands": [],
                "pose": {"landmarks": _pose_landmarks(np.random.default_rng(9), (-0.03, 0.0))},
                "timestampMs": 17,
            },
        )
    )

    return cases


def _encode_non_finite(value: Any) -> Any:
    """Replace NaN/Infinity with the string sentinels the fixture format documents.

    `write_json` refuses to emit bare `NaN`, because that produces a file `JSON.parse`
    rejects. The parity test decodes these strings back into numbers before running the
    frame through the TypeScript implementation, so the non-finite cases are still genuinely
    exercised on both sides.
    """
    if isinstance(value, float):
        if math.isnan(value):
            return "NaN"
        if value == float("inf"):
            return "Infinity"
        if value == float("-inf"):
            return "-Infinity"
        return value
    if isinstance(value, dict):
        return {key: _encode_non_finite(entry) for key, entry in value.items()}
    if isinstance(value, (list, tuple)):
        return [_encode_non_finite(entry) for entry in value]
    return value


def _assert_finite(name: str, vector: list[float]) -> None:
    if len(vector) != FEATURE_VECTOR_LENGTH:
        raise AssertionError(f"{name}: vector has {len(vector)} values, expected {FEATURE_VECTOR_LENGTH}")
    for index, value in enumerate(vector):
        if not math.isfinite(value):
            raise AssertionError(f"{name}: value at index {index} is {value!r}, expected a finite float")


def main() -> int:
    cases: list[ParityCase] = []

    for name, description, frame in build_cases():
        result = extract_feature_vector(frame)  # type: ignore[arg-type]
        vector = [float(value) for value in result.vector]
        _assert_finite(name, vector)
        cases.append(
            ParityCase(
                name=name,
                description=description,
                # The frame may legitimately contain NaN/Infinity (that is the point of
                # several cases), so encode them for JSON.
                frame=_encode_non_finite(frame),  # type: ignore[arg-type]
                expected_vector=vector,
                expected_hand_count=result.hand_count,
                expected_best_hand_score=float(result.best_hand_score),
            )
        )

    fixture = ParityFixture(
        feature_version=FEATURE_VERSION,
        generator="ml/scripts/build_fixtures.py",
        tolerance=TOLERANCE,
        cases=cases,
    )

    payload = fixture.to_json()
    payload["valueEncoding"] = (
        "JSON cannot represent non-finite numbers. The strings \"NaN\", \"Infinity\" and "
        "\"-Infinity\" appear in `frame` and must be decoded to the corresponding JavaScript "
        "number before the frame is passed to extractFeatureVector(). `expectedVector` is "
        "always finite."
    )
    payload["notes"] = [
        "Generated by ml/scripts/build_fixtures.py. Do not edit by hand.",
        "Consumed by tests/features-parity.test.ts (risk R14 in docs/risk-register.md).",
        "Regenerate after ANY change to lib/vision/features.ts or ml/signdata/features.py.",
    ]

    write_json(OUTPUT_PATH, payload)

    print(f"[build_fixtures] Wrote {len(cases)} cases to {OUTPUT_PATH.relative_to(REPO_ROOT)}")
    print(f"[build_fixtures] Feature version: {FEATURE_VERSION}, vector length {FEATURE_VECTOR_LENGTH}")
    print(f"[build_fixtures] Tolerance: {TOLERANCE:g}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
