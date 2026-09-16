"""Procedurally generated landmarks — for exercising the pipeline, never for signs.

Why this exists
---------------
The full path is features -> dataset -> training -> held-out-signer evaluation -> ONNX
export -> browser inference. Every part of it can be built and tested before a single
consented recording exists. This module supplies the data for that test.

Why it is safe
--------------
The generated poses are a hand skeleton with per-class finger curls and rotations. They
have no relationship to any ISL sign, and nothing here is derived from anyone's signing.
Every artefact produced from this data carries:

    trainingSource: "synthetic_smoke_test"
    notForRealUse:  true

and the application renders a permanent banner when it loads such a model. There is no
code path that presents these predictions as sign recognition.

The generator deliberately varies hand size, position and per-signer style, so that
held-out-signer splitting, normalisation and the rejection thresholds are all genuinely
exercised rather than trivially satisfied.
"""

from __future__ import annotations

import datetime as _dt
import math
from dataclasses import dataclass
from typing import Any

import numpy as np

from .constants import (
    FEATURE_VECTOR_LENGTH,
    HAND_LANDMARK_COUNT,
    NEGATIVE_CLASS_GLOSS,
    POSE_LANDMARK_COUNT,
)
from .schema import CollectedSample, SampleConditions

# ---------------------------------------------------------------------------------------
# A plausible right-hand skeleton in a local frame.
#
# Wrist at the origin, middle-finger MCP at (0, -0.52, 0) so the wrist->middle-MCP
# distance is 0.52 — that is the scale the feature code divides by, so keeping it at a
# realistic ratio makes the generated vectors look like real ones.
# ---------------------------------------------------------------------------------------

_BASE_HAND: tuple[tuple[float, float, float], ...] = (
    (0.00, 0.00, 0.00),  # 0  wrist
    (-0.25, -0.12, 0.020),  # 1  thumb CMC
    (-0.38, -0.28, 0.020),  # 2  thumb MCP
    (-0.46, -0.42, 0.010),  # 3  thumb IP
    (-0.50, -0.55, 0.000),  # 4  thumb tip
    (-0.16, -0.50, 0.000),  # 5  index MCP
    (-0.18, -0.72, 0.000),  # 6  index PIP
    (-0.19, -0.85, 0.000),  # 7  index DIP
    (-0.19, -0.95, 0.000),  # 8  index tip
    (0.00, -0.52, 0.000),  # 9  middle MCP
    (0.00, -0.78, 0.000),  # 10 middle PIP
    (0.00, -0.93, 0.000),  # 11 middle DIP
    (0.00, -1.03, 0.000),  # 12 middle tip
    (0.15, -0.50, 0.000),  # 13 ring MCP
    (0.17, -0.74, 0.000),  # 14 ring PIP
    (0.18, -0.87, 0.000),  # 15 ring DIP
    (0.18, -0.96, 0.000),  # 16 ring tip
    (0.28, -0.45, 0.000),  # 17 pinky MCP
    (0.31, -0.64, 0.000),  # 18 pinky PIP
    (0.32, -0.75, 0.000),  # 19 pinky DIP
    (0.32, -0.83, 0.000),  # 20 pinky tip
)

#: (MCP index, first sub-joint, second sub-joint, tip index) per finger, in the order
#: (thumb, index, middle, ring, pinky) used by the feature vector.
_FINGER_CHAINS: tuple[tuple[int, int, int, int], ...] = (
    (2, 3, 4, 4),  # thumb: MCP, IP, tip, tip
    (5, 6, 7, 8),
    (9, 10, 11, 12),
    (13, 14, 15, 16),
    (17, 18, 19, 20),
)

#: Synthetic class definitions. Each is (name, curls, rotation, location, two-handed).
#: These are arbitrary poses, chosen only to be distinguishable from one another.
_CLASS_SPECS: tuple[tuple[str, tuple[float, float, float, float, float], float, tuple[float, float], bool], ...] = (
    ("SYNTH_A", (0.0, 0.0, 0.0, 0.0, 0.0), 0.00, (-0.45, -0.15), False),
    ("SYNTH_B", (0.9, 0.0, 0.0, 0.0, 0.0), 0.30, (-0.35, 0.05), False),
    ("SYNTH_C", (0.2, 1.0, 1.0, 1.0, 1.0), -0.25, (-0.30, -0.30), False),
    ("SYNTH_D", (0.5, 0.5, 0.5, 0.5, 0.5), 1.10, (-0.50, -0.05), False),
    ("SYNTH_E", (0.0, 0.0, 1.0, 1.0, 1.0), -0.60, (-0.25, -0.20), True),
    ("SYNTH_F", (1.0, 1.0, 0.0, 0.0, 1.0), 0.75, (-0.40, 0.10), True),
)

#: Negative-class poses: curl patterns deliberately not in the list above, so the
#: negative class is genuinely separable rather than a copy of a positive class.
_NEGATIVE_SPECS: tuple[tuple[float, float, float, float, float], ...] = (
    (0.0, 1.0, 0.0, 1.0, 0.0),
    (1.0, 0.0, 1.0, 0.0, 1.0),
    (0.3, 0.9, 0.1, 0.6, 0.4),
    (0.7, 0.2, 0.8, 0.3, 0.9),
)


@dataclass
class SyntheticConfig:
    signer_count: int = 6
    positive_classes: int = 6
    reps_per_signer: int = 12
    frames_per_rep: int = 18
    label: str = "synthetic_smoke_test"
    seed: int = 424242
    #: Probability that a negative-class frame has no hands at all.
    no_hands_fraction: float = 0.25

    @staticmethod
    def from_mapping(raw: dict[str, Any]) -> "SyntheticConfig":
        return SyntheticConfig(
            signer_count=int(raw.get("signer_count", 6)),
            positive_classes=int(raw.get("positive_classes", 6)),
            reps_per_signer=int(raw.get("reps_per_signer", 12)),
            frames_per_rep=int(raw.get("frames_per_rep", 18)),
            label=str(raw.get("label", "synthetic_smoke_test")),
            seed=int(raw.get("seed", 424242)),
            no_hands_fraction=float(raw.get("no_hands_fraction", 0.25)),
        )


# ---------------------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------------------


def _rotate_about(
    point: tuple[float, float, float],
    centre: tuple[float, float, float],
    angle: float,
) -> tuple[float, float, float]:
    cos_a = math.cos(angle)
    sin_a = math.sin(angle)
    dx = point[0] - centre[0]
    dy = point[1] - centre[1]
    return (
        centre[0] + dx * cos_a - dy * sin_a,
        centre[1] + dx * sin_a + dy * cos_a,
        point[2],
    )


def _curl_finger(
    points: list[tuple[float, float, float]],
    chain: tuple[int, int, int, int],
    amount: float,
) -> None:
    """Rotate a finger's sub-chain about its MCP so the tip folds toward the palm."""
    mcp_index, first_index, second_index, tip_index = chain
    centre = points[mcp_index]
    angle = amount * 2.7
    for index in {first_index, second_index, tip_index}:
        rotated = _rotate_about(points[index], centre, angle)
        # Curling also lifts the fingertip out of the palm plane, which the palm-normal
        # feature picks up. Without this, every curled pose would share one normal.
        points[index] = (rotated[0], rotated[1], rotated[2] + amount * 0.06)


def _build_hand(
    curls: tuple[float, float, float, float, float],
    rotation: float,
    scale: float,
) -> np.ndarray:
    """Return a 21x3 array in the local (hand-relative) frame."""
    points = [tuple(point) for point in _BASE_HAND]
    for chain, amount in zip(_FINGER_CHAINS, curls):
        _curl_finger(points, chain, amount)

    array = np.asarray(points, dtype=np.float64)
    cos_a = math.cos(rotation)
    sin_a = math.sin(rotation)
    rotated = np.empty_like(array)
    rotated[:, 0] = array[:, 0] * cos_a - array[:, 1] * sin_a
    rotated[:, 1] = array[:, 0] * sin_a + array[:, 1] * cos_a
    rotated[:, 2] = array[:, 2]
    return rotated * scale


def _mirror(hand: np.ndarray) -> np.ndarray:
    """Mirror a right hand into a left hand (negate x, reverse handedness)."""
    mirrored = hand.copy()
    mirrored[:, 0] *= -1.0
    return mirrored


# ---------------------------------------------------------------------------------------
# Frame construction
# ---------------------------------------------------------------------------------------

#: Synthetic image geometry. Shoulders sit at y = 0.55, width 0.28 — roughly a
#: webcam-framed torso, which is what MediaPipe sees in the real app.
_SHOULDER_Y = 0.55
_SHOULDER_WIDTH = 0.28
_HAND_SCALE = 0.16


def _pose_landmarks(rng: np.random.Generator, shoulder_offset: tuple[float, float]) -> list[dict[str, float]]:
    """33 pose landmarks, with the shoulders where the generator says they are."""
    landmarks: list[dict[str, float]] = []
    for index in range(POSE_LANDMARK_COUNT):
        landmarks.append(
            {
                "x": float(0.5 + rng.normal(0.0, 0.002)),
                "y": float(0.5 + rng.normal(0.0, 0.002)),
                "z": float(rng.normal(0.0, 0.002)),
            }
        )
    left_x = 0.5 - _SHOULDER_WIDTH / 2 + shoulder_offset[0]
    right_x = 0.5 + _SHOULDER_WIDTH / 2 + shoulder_offset[0]
    landmarks[11] = {"x": float(left_x), "y": float(_SHOULDER_Y), "z": 0.0, "visibility": 0.95}
    landmarks[12] = {"x": float(right_x), "y": float(_SHOULDER_Y), "z": 0.0, "visibility": 0.95}
    landmarks[0] = {"x": float(0.5), "y": float(_SHOULDER_Y - 0.22), "z": 0.0, "visibility": 0.95}
    return landmarks


def _hand_landmarks(
    local_hand: np.ndarray,
    location: tuple[float, float],
    rng: np.random.Generator,
    *,
    noise: float,
    jitter: tuple[float, float],
) -> list[dict[str, float]]:
    """Place a local-frame hand into image coordinates with noise."""
    centroid_x = 0.5 + location[0] * _SHOULDER_WIDTH + jitter[0]
    centroid_y = _SHOULDER_Y + location[1] * _SHOULDER_WIDTH + jitter[1]

    # The local frame is centred roughly at the palm; offset so the requested location
    # refers to the hand's centroid rather than its wrist.
    offset_x = centroid_x - float(local_hand[:, 0].mean())
    offset_y = centroid_y - float(local_hand[:, 1].mean())

    out: list[dict[str, float]] = []
    for index in range(HAND_LANDMARK_COUNT):
        x = float(local_hand[index, 0]) + offset_x + rng.normal(0.0, noise)
        y = float(local_hand[index, 1]) + offset_y + rng.normal(0.0, noise)
        z = float(local_hand[index, 2]) + rng.normal(0.0, noise * 0.5)
        out.append({"x": x, "y": y, "z": z})
    return out


# ---------------------------------------------------------------------------------------
# Signer style
# ---------------------------------------------------------------------------------------


@dataclass
class _SignerStyle:
    signer_id: str
    scale: float
    rotation_bias: float
    jitter_bias: tuple[float, float]
    noise: float
    shoulder_offset: tuple[float, float]
    score_bias: float


def _make_signers(rng: np.random.Generator, count: int) -> list[_SignerStyle]:
    signers: list[_SignerStyle] = []
    for index in range(count):
        signers.append(
            _SignerStyle(
                signer_id=f"synthetic-signer-{index + 1:02d}",
                scale=float(rng.uniform(0.82, 1.22)),
                rotation_bias=float(rng.normal(0.0, 0.16)),
                jitter_bias=(float(rng.normal(0.0, 0.03)), float(rng.normal(0.0, 0.03))),
                noise=float(rng.uniform(0.0025, 0.0060)),
                shoulder_offset=(float(rng.normal(0.0, 0.02)), 0.0),
                score_bias=float(rng.uniform(-0.05, 0.02)),
            )
        )
    return signers


def _frame(
    rng: np.random.Generator,
    signer: _SignerStyle,
    *,
    curls: tuple[float, float, float, float, float],
    rotation: float,
    location: tuple[float, float],
    two_handed: bool,
    timestamp_ms: int,
    with_pose: bool = True,
) -> dict[str, Any]:
    pose = (
        {"landmarks": _pose_landmarks(rng, signer.shoulder_offset)} if with_pose else None
    )

    right_local = _build_hand(curls, rotation + signer.rotation_bias, _HAND_SCALE * signer.scale)
    right_landmarks = _hand_landmarks(
        right_local, location, rng, noise=signer.noise, jitter=signer.jitter_bias
    )
    hands: list[dict[str, Any]] = [
        {
            "handedness": "Right",
            "score": float(min(0.99, max(0.6, 0.93 + signer.score_bias + rng.normal(0.0, 0.01)))),
            "landmarks": right_landmarks,
        }
    ]

    if two_handed:
        left_local = _mirror(right_local)
        left_location = (-location[0] - 0.06, location[1] + 0.04)
        left_landmarks = _hand_landmarks(
            left_local, left_location, rng, noise=signer.noise, jitter=signer.jitter_bias
        )
        hands.append(
            {
                "handedness": "Left",
                "score": float(min(0.99, max(0.6, 0.91 + signer.score_bias + rng.normal(0.0, 0.01)))),
                "landmarks": left_landmarks,
            }
        )

    return {"hands": hands, "pose": pose, "timestampMs": timestamp_ms}


def _no_hands_frame(
    rng: np.random.Generator, signer: _SignerStyle, timestamp_ms: int
) -> dict[str, Any]:
    """A frame with a visible torso but no hands — a real negative case."""
    return {
        "hands": [],
        "pose": {"landmarks": _pose_landmarks(rng, signer.shoulder_offset)},
        "timestampMs": timestamp_ms,
    }


# ---------------------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------------------


def generate_frames(config: SyntheticConfig) -> dict[str, list[list[dict[str, Any]]]]:
    """Generate windows of frames, keyed by ``"<signer_id>|<label>"``.

    Returns raw ``FrameLandmarks`` dicts, so the caller can push them through
    ``extract_feature_vector`` — the same function the browser uses. That is the point:
    the smoke test exercises the real feature code, not a shortcut.
    """
    rng = np.random.default_rng(config.seed)
    signers = _make_signers(rng, max(2, config.signer_count))
    specs = list(_CLASS_SPECS[: max(2, config.positive_classes)])

    windows: dict[str, list[list[dict[str, Any]]]] = {}

    for signer in signers:
        timestamp = 0
        for name, curls, rotation, location, two_handed in specs:
            for _rep in range(config.reps_per_signer):
                frames: list[dict[str, Any]] = []
                # A small per-repetition drift, so frames within a window are correlated
                # (as they are in reality) rather than independent samples.
                drift = (float(rng.normal(0.0, 0.006)), float(rng.normal(0.0, 0.006)))
                for _frame_index in range(config.frames_per_rep):
                    timestamp += 33
                    frames.append(
                        _frame(
                            rng,
                            signer,
                            curls=curls,
                            rotation=rotation,
                            location=(location[0] + drift[0], location[1] + drift[1]),
                            two_handed=two_handed,
                            timestamp_ms=timestamp,
                        )
                    )
                windows[f"{signer.signer_id}|{name}"] = frames

        # Negative class: poses outside the supported set, plus some empty-hand frames.
        for rep in range(config.reps_per_signer):
            frames = []
            curls = _NEGATIVE_SPECS[rep % len(_NEGATIVE_SPECS)]
            two_handed = rep % 3 == 0
            location = (float(rng.uniform(-0.6, -0.2)), float(rng.uniform(-0.3, 0.2)))
            for frame_index in range(config.frames_per_rep):
                timestamp += 33
                if rng.random() < config.no_hands_fraction:
                    frames.append(_no_hands_frame(rng, signer, timestamp))
                else:
                    frames.append(
                        _frame(
                            rng,
                            signer,
                            curls=curls,
                            rotation=float(rng.uniform(-0.5, 1.2)),
                            location=location,
                            two_handed=two_handed,
                            timestamp_ms=timestamp,
                        )
                    )
            windows[f"{signer.signer_id}|{NEGATIVE_CLASS_GLOSS}"] = frames

    return windows


def generate_samples(config: SyntheticConfig) -> list[CollectedSample]:
    """Generate ``CollectedSample`` objects, ready for ``build_bundle``.

    The samples go through the same ``extract_feature_vector`` the browser uses, so a
    change to the feature code that breaks the pipeline is caught by the smoke test.
    """
    from .features import extract_feature_vector

    windows = generate_frames(config)
    samples: list[CollectedSample] = []
    captured = _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat()
    index = 0

    for key, frames in windows.items():
        signer_id, label = key.split("|", 1)
        matrix: list[list[float]] = []
        for frame in frames:
            vector = extract_feature_vector(frame).vector
            if len(vector) != FEATURE_VECTOR_LENGTH:
                raise RuntimeError(
                    f"Feature extraction returned {len(vector)} values, expected {FEATURE_VECTOR_LENGTH}."
                )
            matrix.append(vector)

        index += 1
        samples.append(
            CollectedSample(
                id=f"synthetic-{index:05d}",
                signer_id=signer_id,
                signer_type="fluent",
                label=label,
                session=f"synthetic-{config.label}",
                captured_at=captured,
                conditions=SampleConditions(
                    lighting="bright",
                    background="plain",
                    distance="medium",
                    pose="sitting",
                    handedness="both" if label == NEGATIVE_CLASS_GLOSS else "right",
                ),
                tool_version="synthetic-generator/1",
                frame_count=len(matrix),
                features=matrix,
            )
        )

    return samples


__all__ = [
    "SyntheticConfig",
    "generate_frames",
    "generate_samples",
]
