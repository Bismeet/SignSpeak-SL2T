"""Feature extraction — the Python half of the parity pair.

This module is a line-by-line port of `lib/vision/features.ts`. The two implementations
must produce the same 159-float vector for the same input; `ml/scripts/build_fixtures.py`
writes fixtures and `tests/features-parity.test.ts` asserts it in CI.

Rules for editing this file:
  * Keep the arithmetic in float64 (Python floats / numpy float64) and only cast to
    float32 at the very end, because JavaScript numbers are float64 and the TypeScript
    side writes into a Float32Array.
  * Do not "improve" the maths here. Any behavioural difference is a bug in whichever
    side changed, not an optimisation.
  * Rotation normalisation is deliberately absent: palm orientation is one of the five
    ISL phonological parameters, so removing it would destroy signal
    (`docs/technical-research.md` §1.3, decision D-08).

The one place exact bit-equality is not guaranteed is `acos`: `Math.acos` in V8 and
`math.acos` in libm may differ in the last ULP. The parity test therefore asserts a
1e-6 absolute tolerance, which is below float32 resolution at these magnitudes.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Iterable, Mapping, Sequence

from .constants import (
    EPSILON,
    EXTENSION_JOINTS,
    FEATURE_VECTOR_LENGTH,
    FINGERTIPS,
    HAND_LANDMARK_COUNT,
    OFFSET_CENTROID,
    OFFSET_EXTENSION_ANGLE,
    OFFSET_HAND_LANDMARKS,
    OFFSET_PALM_NORMAL,
    OFFSET_POSE_PRESENT,
    OFFSET_PRESENCE,
    OFFSET_TIP_DISTANCE,
    POSE_LEFT_SHOULDER,
    POSE_RIGHT_SHOULDER,
)

Vec3 = tuple[float, float, float]


# ---------------------------------------------------------------------------------------
# Small vector helpers. Named identically to their TypeScript counterparts.
# ---------------------------------------------------------------------------------------


def _sub(a: Vec3, b: Vec3) -> Vec3:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _norm(v: Vec3) -> float:
    return math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])


def _dot(a: Vec3, b: Vec3) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cross(a: Vec3, b: Vec3) -> Vec3:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def _angle_between(a: Vec3, b: Vec3) -> float:
    """Angle between two vectors in radians, clamped to [0, PI]. Degenerate -> 0."""
    na = _norm(a)
    nb = _norm(b)
    if na < EPSILON or nb < EPSILON:
        return 0.0
    cosine = min(1.0, max(-1.0, _dot(a, b) / (na * nb)))
    return math.acos(cosine)


def _is_finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _to_vec3(landmark: Mapping[str, Any] | None) -> Vec3:
    if landmark is None:
        return (0.0, 0.0, 0.0)
    x = landmark.get("x")
    y = landmark.get("y")
    z = landmark.get("z")
    return (
        float(x) if _is_finite_number(x) else 0.0,
        float(y) if _is_finite_number(y) else 0.0,
        float(z) if _is_finite_number(z) else 0.0,
    )


def _is_usable(landmark: Mapping[str, Any] | None) -> bool:
    if landmark is None:
        return False
    return (
        _is_finite_number(landmark.get("x"))
        and _is_finite_number(landmark.get("y"))
        and _is_finite_number(landmark.get("z"))
    )


# ---------------------------------------------------------------------------------------
# Per-hand primitives
# ---------------------------------------------------------------------------------------


def normalise_hand(landmarks: Sequence[Mapping[str, Any]]) -> list[float]:
    """Translate to the wrist and scale by the wrist -> middle-MCP distance.

    Makes the representation invariant to hand size and camera distance. Returns a
    list of ``HAND_LANDMARK_COUNT * 3`` floats, all zero when the hand is incomplete.
    """
    out = [0.0] * (HAND_LANDMARK_COUNT * 3)
    if len(landmarks) < HAND_LANDMARK_COUNT:
        return out

    wrist = _to_vec3(landmarks[0])
    middle_mcp = _to_vec3(landmarks[9])
    raw_scale = _norm(_sub(middle_mcp, wrist))
    scale = 1.0 if raw_scale < EPSILON else raw_scale

    for i in range(HAND_LANDMARK_COUNT):
        p = _to_vec3(landmarks[i])
        out[i * 3] = (p[0] - wrist[0]) / scale
        out[i * 3 + 1] = (p[1] - wrist[1]) / scale
        out[i * 3 + 2] = (p[2] - wrist[2]) / scale
    return out


def palm_normal(landmarks: Sequence[Mapping[str, Any]]) -> Vec3:
    """Unit normal of the palm plane, from the wrist / index-MCP / pinky-MCP triple."""
    if len(landmarks) < HAND_LANDMARK_COUNT:
        return (0.0, 0.0, 0.0)
    wrist = _to_vec3(landmarks[0])
    index_mcp = _to_vec3(landmarks[5])
    pinky_mcp = _to_vec3(landmarks[17])
    normal = _cross(_sub(index_mcp, wrist), _sub(pinky_mcp, wrist))
    length = _norm(normal)
    if length < EPSILON:
        return (0.0, 0.0, 0.0)
    return (normal[0] / length, normal[1] / length, normal[2] / length)


def fingertip_distances(landmarks: Sequence[Mapping[str, Any]]) -> list[float]:
    """Wrist -> fingertip distances in normalised (hand-size) units."""
    out = [0.0, 0.0, 0.0, 0.0, 0.0]
    if len(landmarks) < HAND_LANDMARK_COUNT:
        return out
    wrist = _to_vec3(landmarks[0])
    middle_mcp = _to_vec3(landmarks[9])
    raw_scale = _norm(_sub(middle_mcp, wrist))
    scale = 1.0 if raw_scale < EPSILON else raw_scale

    for i, tip_index in enumerate(FINGERTIPS):
        tip = _to_vec3(landmarks[tip_index])
        out[i] = _norm(_sub(tip, wrist)) / scale
    return out


def extension_angles(landmarks: Sequence[Mapping[str, Any]]) -> list[float]:
    """Extension angle (radians) at the middle joint of each finger.

    Fully extended approaches PI; fully curled approaches 0.
    """
    out = [0.0, 0.0, 0.0, 0.0, 0.0]
    if len(landmarks) < HAND_LANDMARK_COUNT:
        return out
    for i, (a_idx, b_idx, c_idx) in enumerate(EXTENSION_JOINTS):
        a = _to_vec3(landmarks[a_idx])
        b = _to_vec3(landmarks[b_idx])
        c = _to_vec3(landmarks[c_idx])
        out[i] = _angle_between(_sub(a, b), _sub(c, b))
    return out


def hand_centroid(landmarks: Sequence[Mapping[str, Any]]) -> tuple[float, float]:
    """Mean of the hand's landmark coordinates in original image space."""
    if len(landmarks) == 0:
        return (0.0, 0.0)
    sx = 0.0
    sy = 0.0
    n = 0
    for landmark in landmarks:
        if not _is_usable(landmark):
            continue
        sx += float(landmark["x"])
        sy += float(landmark["y"])
        n += 1
    if n == 0:
        return (0.0, 0.0)
    return (sx / n, sy / n)


# ---------------------------------------------------------------------------------------
# Hand selection
# ---------------------------------------------------------------------------------------


@dataclass
class HandInput:
    """One detected hand, as delivered by the browser or read from a fixture."""

    handedness: str
    score: float
    landmarks: list[Mapping[str, Any]] = field(default_factory=list)


def _coerce_hand(raw: Any) -> HandInput | None:
    if isinstance(raw, HandInput):
        return raw
    if not isinstance(raw, Mapping):
        return None
    handedness = raw.get("handedness")
    if handedness not in ("Left", "Right"):
        return None
    score = raw.get("score")
    landmarks = raw.get("landmarks")
    if not isinstance(landmarks, list):
        return None
    return HandInput(
        handedness=str(handedness),
        score=float(score) if _is_finite_number(score) else 0.0,
        landmarks=landmarks,
    )


def select_hand_slots(hands: Iterable[Any]) -> tuple[HandInput | None, HandInput | None]:
    """Collapse a list of detected hands into the fixed ``(left, right)`` slot order.

    When MediaPipe reports two hands of the same handedness (rare, but it happens with
    occlusion), the higher-scoring one wins.
    """
    left: HandInput | None = None
    right: HandInput | None = None

    for raw in hands:
        hand = _coerce_hand(raw)
        if hand is None or len(hand.landmarks) < HAND_LANDMARK_COUNT:
            continue
        if hand.handedness == "Left":
            if left is None or hand.score > left.score:
                left = hand
        else:
            if right is None or hand.score > right.score:
                right = hand
    return left, right


# ---------------------------------------------------------------------------------------
# Full frame -> feature vector
# ---------------------------------------------------------------------------------------


@dataclass
class HandFeatureDebug:
    slot: str
    normalised: list[float]
    centroid: tuple[float, float]
    palm_normal: Vec3
    tip_distances: list[float]
    extension_angles: list[float]


@dataclass
class FeatureVector:
    vector: list[float]
    hand_count: int
    best_hand_score: float
    debug_hands: list[HandFeatureDebug]
    pose_present: bool

    def as_float_list(self) -> list[float]:
        return list(self.vector)


def _write_hand_block(
    out: list[float],
    slot_index: int,
    hand: HandInput | None,
    shoulder_mid: tuple[float, float] | None,
    shoulder_width: float,
    pose_present: bool,
) -> HandFeatureDebug | None:
    base = slot_index * HAND_LANDMARK_COUNT * 3
    presence_index = OFFSET_PRESENCE + slot_index
    position_index = OFFSET_CENTROID + slot_index * 2
    normal_index = OFFSET_PALM_NORMAL + slot_index * 3
    tip_index = OFFSET_TIP_DISTANCE + slot_index * 5
    angle_index = OFFSET_EXTENSION_ANGLE + slot_index * 5

    if hand is None:
        # Absent hand: the block stays at zero and the presence flag is explicitly 0.
        out[presence_index] = 0.0
        return None

    normalised = normalise_hand(hand.landmarks)
    for i, value in enumerate(normalised):
        out[base + i] = value
    out[presence_index] = 1.0

    centroid = hand_centroid(hand.landmarks)
    if pose_present and shoulder_mid is not None and shoulder_width >= EPSILON:
        out[position_index] = (centroid[0] - shoulder_mid[0]) / shoulder_width
        out[position_index + 1] = (centroid[1] - shoulder_mid[1]) / shoulder_width

    normal = palm_normal(hand.landmarks)
    out[normal_index] = normal[0]
    out[normal_index + 1] = normal[1]
    out[normal_index + 2] = normal[2]

    tips = fingertip_distances(hand.landmarks)
    for i, value in enumerate(tips):
        out[tip_index + i] = value

    angles = extension_angles(hand.landmarks)
    for i, value in enumerate(angles):
        out[angle_index + i] = value

    return HandFeatureDebug(
        slot="left" if slot_index == 0 else "right",
        normalised=normalised,
        centroid=centroid,
        palm_normal=normal,
        tip_distances=tips,
        extension_angles=angles,
    )


def _resolve_pose(pose: Any) -> tuple[tuple[float, float] | None, float]:
    if pose is None:
        return (None, 0.0)
    landmarks = pose.get("landmarks") if isinstance(pose, Mapping) else None
    if not isinstance(landmarks, list):
        return (None, 0.0)
    if len(landmarks) <= max(POSE_LEFT_SHOULDER, POSE_RIGHT_SHOULDER):
        return (None, 0.0)
    ls = landmarks[POSE_LEFT_SHOULDER]
    rs = landmarks[POSE_RIGHT_SHOULDER]
    if not _is_usable(ls) or not _is_usable(rs):
        return (None, 0.0)

    left_x = float(ls["x"])
    left_y = float(ls["y"])
    right_x = float(rs["x"])
    right_y = float(rs["y"])
    mid = ((left_x + right_x) / 2, (left_y + right_y) / 2)
    dx = left_x - right_x
    dy = left_y - right_y
    return (mid, math.sqrt(dx * dx + dy * dy))


def extract_feature_vector(frame: Mapping[str, Any]) -> FeatureVector:
    """Convert one frame of landmarks into the fixed-length feature vector.

    Always returns exactly ``FEATURE_VECTOR_LENGTH`` finite floats, whatever the input.
    """
    out = [0.0] * FEATURE_VECTOR_LENGTH
    hands = frame.get("hands") or []
    left, right = select_hand_slots(hands)
    shoulder_mid, shoulder_width = _resolve_pose(frame.get("pose"))
    pose_present = shoulder_mid is not None and shoulder_width >= EPSILON

    debug_hands: list[HandFeatureDebug] = []
    left_debug = _write_hand_block(out, 0, left, shoulder_mid, shoulder_width, pose_present)
    right_debug = _write_hand_block(out, 1, right, shoulder_mid, shoulder_width, pose_present)
    if left_debug is not None:
        debug_hands.append(left_debug)
    if right_debug is not None:
        debug_hands.append(right_debug)

    out[OFFSET_POSE_PRESENT] = 1.0 if pose_present else 0.0

    hand_count = 0
    best_hand_score = 0.0
    if left is not None:
        hand_count += 1
        best_hand_score = max(best_hand_score, left.score)
    if right is not None:
        hand_count += 1
        best_hand_score = max(best_hand_score, right.score)

    return FeatureVector(
        vector=out,
        hand_count=hand_count,
        best_hand_score=best_hand_score,
        debug_hands=debug_hands,
        pose_present=pose_present,
    )


def extract_feature_matrix(frames: Iterable[Mapping[str, Any]]) -> list[list[float]]:
    """Convenience wrapper for a whole capture window."""
    return [extract_feature_vector(frame).vector for frame in frames]


def frame_from_collected_sample(sample: Mapping[str, Any]) -> list[list[float]]:
    """Read the ``features`` matrix out of a ``CollectedSample``.

    The collection tool stores pre-computed feature matrices, so training never needs to
    re-derive features. This exists so a future change of mind (e.g. wanting to re-extract
    from landmarks) has one obvious place to hook into.
    """
    features = sample.get("features")
    if not isinstance(features, list):
        return []
    out: list[list[float]] = []
    for row in features:
        if not isinstance(row, list) or len(row) != FEATURE_VECTOR_LENGTH:
            continue
        out.append([float(value) for value in row])
    return out


__all__ = [
    "FeatureVector",
    "HandFeatureDebug",
    "HandInput",
    "extract_feature_matrix",
    "extract_feature_vector",
    "extension_angles",
    "fingertip_distances",
    "frame_from_collected_sample",
    "hand_centroid",
    "normalise_hand",
    "palm_normal",
    "select_hand_slots",
]
