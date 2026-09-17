#!/usr/bin/env python
"""Extract ``ss-features-v1`` landmark features from the downloaded clips.

Runs in the **extraction environment** (``ml/.venv-extract``), not the training one. That
split is forced, not a preference: MediaPipe requires numpy 2, while scikit-learn 1.4.2 and
skl2onnx 1.17.0 are built against the numpy 1.x ABI and break on numpy 2. The two stages
communicate through JSON on disk, so they never need to share an interpreter.

Landmark parity with the browser
--------------------------------
The same ``.task`` model files the web app loads at runtime are used here
(``public/models/hand_landmarker.task`` and ``pose_landmarker_lite.task``), via the same
Tasks API. Frames are fed **unmirrored**, exactly as the browser feeds its ``<video>``
element — the preview is mirrored with CSS only, which does not change the pixels handed to
MediaPipe. Handedness labels are therefore produced under identical conditions on both sides,
which matters because ``select_hand_slots`` assigns the left/right feature blocks by them.

The 159-float layout itself is **not** reimplemented here. ``ml/signdata/features.py`` is the
single definition of the contract (parity-tested against ``lib/vision/features.ts``), so this
script only converts MediaPipe output into the frame mapping that module expects and calls it.
Reimplementing it would be the fastest way to silently diverge from what the browser computes.

Usage
-----
    ml/.venv-extract/Scripts/python ml/extract_features.py
    ml/.venv-extract/Scripts/python ml/extract_features.py --stride 2 --max-frames 60
    ml/.venv-extract/Scripts/python ml/extract_features.py --limit 10   # quick trial
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
# The training package is importable from the repo root; `features.py` itself is numpy-free.
sys.path.insert(0, str(REPO_ROOT))

from ml.signdata.constants import FEATURE_VERSION, FEATURE_VECTOR_LENGTH  # noqa: E402
from ml.signdata.features import extract_feature_vector  # noqa: E402

DEFAULT_DATA_DIR = REPO_ROOT / "ml" / "data" / "isl-subset"
HAND_MODEL = REPO_ROOT / "public" / "models" / "hand_landmarker.task"
POSE_MODEL = REPO_ROOT / "public" / "models" / "pose_landmarker_lite.task"

TOOL_VERSION = "extract_features.py/1.0"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract ss-features-v1 from ISL clips.")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--manifest", type=Path, default=None, help="default: <data-dir>/manifest.json")
    parser.add_argument("--out", type=Path, default=None, help="default: <data-dir>/samples")
    parser.add_argument("--stride", type=int, default=1, help="process every Nth frame")
    parser.add_argument(
        "--max-frames",
        type=int,
        default=60,
        help="cap the frames kept per clip, evenly sampled (0 = keep all)",
    )
    parser.add_argument("--limit", type=int, default=0, help="only process the first N clips")
    parser.add_argument("--overwrite", action="store_true", help="redo clips already extracted")
    return parser.parse_args(argv)


def require_mediapipe():
    try:
        import cv2  # noqa: PLC0415
        from mediapipe.tasks import python as mp_python  # noqa: PLC0415
        from mediapipe.tasks.python import vision  # noqa: PLC0415
    except ImportError as error:  # pragma: no cover - environment guard
        sys.exit(
            f"{error}\n\nThis script needs the extraction environment:\n"
            "  npm run ml:setup:extract\n"
            "  npm run ml:extract"
        )
    return cv2, mp_python, vision


def build_landmarkers(mp_python, vision):
    """One hand landmarker and one pose landmarker, in VIDEO mode, from the browser's models."""
    hand = vision.HandLandmarker.create_from_options(
        vision.HandLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=str(HAND_MODEL)),
            running_mode=vision.RunningMode.VIDEO,
            num_hands=2,
            min_hand_detection_confidence=0.5,
            min_hand_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
    )
    pose = vision.PoseLandmarker.create_from_options(
        vision.PoseLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=str(POSE_MODEL)),
            running_mode=vision.RunningMode.VIDEO,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_pose_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
    )
    return hand, pose


def frame_mapping(hand_result, pose_result) -> dict[str, object]:
    """MediaPipe results -> the frame mapping ``extract_feature_vector`` expects.

    ``handedness`` comes through as MediaPipe's own label. It is used verbatim, because the
    browser does the same and the left/right feature blocks are assigned from it.
    """
    hands: list[dict[str, object]] = []
    for index, landmarks in enumerate(hand_result.hand_landmarks or []):
        categories = (hand_result.handedness or [])[index] if index < len(hand_result.handedness or []) else []
        if not categories:
            continue
        category = categories[0]
        hands.append(
            {
                "handedness": category.category_name,
                "score": float(category.score),
                "landmarks": [
                    {"x": float(point.x), "y": float(point.y), "z": float(point.z)}
                    for point in landmarks
                ],
            }
        )

    pose: dict[str, object] | None = None
    # The Tasks API names this `pose_landmarks`; `.landmarks` (the legacy Solutions name)
    # does not exist on the 1.x result object.
    pose_points = getattr(pose_result, "pose_landmarks", None)
    if pose_points:
        pose = {
            "landmarks": [
                {"x": float(point.x), "y": float(point.y), "z": float(point.z)}
                for point in pose_points[0]
            ]
        }

    return {"hands": hands, "pose": pose}


def read_video_frames(cv2, path: Path, stride: int):
    """Read a clip, returning ``([(frame_index, bgr_frame)], fps)``."""
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        return None, 0.0
    fps = capture.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0 or fps != fps:  # NaN guard
        fps = 30.0
    frames = []
    index = 0
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        if index % stride == 0:
            frames.append((index, frame))
        index += 1
    capture.release()
    return frames, fps


def evenly_sample(items: list, limit: int) -> list:
    """Keep at most ``limit`` items, evenly spaced, preserving order and endpoints."""
    if limit <= 0 or len(items) <= limit:
        return items
    if limit == 1:
        return [items[len(items) // 2]]
    step = (len(items) - 1) / (limit - 1)
    return [items[round(i * step)] for i in range(limit)]


def round_vector(vector: list[float], places: int = 6) -> list[float]:
    """Trim precision. The browser stores float32, so 6 dp is already generous."""
    return [round(value, places) for value in vector]


def extract_clip(
    cv2, landmarkers, path: Path, *, stride: int, max_frames: int, clock_ms: float
) -> tuple[dict[str, object], float]:
    """Extract one clip. Returns ``(result, new_clock_ms)``.

    ``clock_ms`` is threaded through every clip in the run and only ever moves forward. The
    Tasks API landmarkers keep internal tracking state and reject a timestamp that goes
    backwards, and each clip's own frame times start at zero — so a per-clip timestamp
    restarts the clock and raises "Input timestamp must be monotonically increasing" on the
    second clip. Advancing one shared clock across the whole session avoids that, and also
    keeps a fresh landmarker from being built per clip.
    """
    hand, pose = landmarkers
    frames, fps = read_video_frames(cv2, path, stride)
    if not frames:
        return {"ok": False, "reason": "could not open or decode"}, clock_ms

    kept = evenly_sample(frames, max_frames)
    step_ms = 1000.0 / (fps if fps and fps > 0 else 30.0)
    vectors: list[list[float]] = []
    hand_counts: list[int] = []
    pose_seen = 0

    import mediapipe as mp  # noqa: PLC0415

    for _frame_index, bgr in kept:
        clock_ms += step_ms
        timestamp = int(clock_ms)
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        hand_result = hand.detect_for_video(image, timestamp)
        pose_result = pose.detect_for_video(image, timestamp)

        mapping = frame_mapping(hand_result, pose_result)
        extracted = extract_feature_vector(mapping)
        vectors.append(round_vector(extracted.vector))
        hand_counts.append(extracted.hand_count)
        if extracted.pose_present:
            pose_seen += 1

    usable = sum(1 for count in hand_counts if count > 0)
    return (
        {
            "ok": True,
            "fps": fps,
            "framesDecoded": len(frames),
            "features": vectors,
            "handCounts": hand_counts,
            "framesWithHands": usable,
            "framesWithPose": pose_seen,
        },
        clock_ms,
    )


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    data_dir = args.data_dir.resolve()
    manifest_path = (args.manifest or (data_dir / "manifest.json")).resolve()
    out_dir = (args.out or (data_dir / "samples")).resolve()

    if not manifest_path.exists():
        sys.exit(f"manifest not found: {manifest_path}\nRun: npm run ml:download")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    clips = manifest.get("clips", [])
    if args.limit:
        clips = clips[: args.limit]
    if not clips:
        sys.exit("manifest lists no clips")

    cv2, mp_python, vision = require_mediapipe()
    for model in (HAND_MODEL, POSE_MODEL):
        if not model.exists():
            sys.exit(f"missing model file: {model}\nRun: npm run setup:assets")

    out_dir.mkdir(parents=True, exist_ok=True)
    landmarkers = build_landmarkers(mp_python, vision)

    print(f"[extract] {len(clips)} clips -> {out_dir}")
    print(f"[extract] stride={args.stride} max_frames={args.max_frames}")

    started = time.time()
    written = 0
    skipped = 0
    failed: list[dict[str, str]] = []
    frame_total = 0
    with_hands = 0
    # One monotonic clock for the whole run — see extract_clip.
    clock_ms = 0.0

    for position, clip in enumerate(clips, start=1):
        clip_id = str(clip.get("clip_id", ""))
        video = data_dir / "clips" / str(clip.get("video_path", ""))
        sample_path = out_dir / f"{clip_id.replace('/', '__')}.json"

        if sample_path.exists() and not args.overwrite:
            skipped += 1
            continue
        if not video.exists():
            failed.append({"clip_id": clip_id, "error": "video file missing"})
            continue

        result, clock_ms = extract_clip(
            cv2,
            landmarkers,
            video,
            stride=args.stride,
            max_frames=args.max_frames,
            clock_ms=clock_ms,
        )
        if not result.get("ok"):
            failed.append({"clip_id": clip_id, "error": str(result.get("reason"))})
            continue

        features = result["features"]
        frame_total += len(features)
        with_hands += int(result["framesWithHands"] > 0)

        sample = {
            "samples": [
                {
                    "id": clip_id,
                    "signerId": clip.get("group_key", "unknown"),
                    "signerType": "fluent",
                    "label": clip.get("label", ""),
                    "session": clip.get("source_dataset", ""),
                    "capturedAt": "",
                    "conditions": {
                        "lighting": "unknown",
                        "background": "unknown",
                        "distance": "unknown",
                        "pose": "unknown",
                        "handedness": "unknown",
                    },
                    "toolVersion": TOOL_VERSION,
                    "frameCount": len(features),
                    "features": features,
                    "provenance": {
                        "sourceDataset": clip.get("source_dataset", ""),
                        "originalFilename": clip.get("original_filename", ""),
                        "signerLabel": clip.get("signer_label", ""),
                        "signerIsRealId": clip.get("signer_is_real_id", False),
                        "groupKey": clip.get("group_key", ""),
                        "role": clip.get("role", ""),
                        "license": clip.get("license", ""),
                        "sha256": clip.get("sha256", ""),
                        "fps": round(float(result.get("fps") or 0), 3),
                        "framesDecoded": result["framesDecoded"],
                        "framesWithHands": result["framesWithHands"],
                        "framesWithPose": result["framesWithPose"],
                    },
                }
            ]
        }
        sample_path.write_text(
            json.dumps(sample, ensure_ascii=False), encoding="utf-8"
        )
        written += 1

        if position % 20 == 0 or position == len(clips):
            rate = position / max(1e-9, time.time() - started)
            print(
                f"[extract] {position}/{len(clips)} clips  "
                f"written={written} skipped={skipped} failed={len(failed)}  {rate:.1f} clip/s",
                flush=True,
            )

    elapsed = time.time() - started
    report = {
        "featureVersion": FEATURE_VERSION,
        "featureVectorLength": FEATURE_VECTOR_LENGTH,
        "clipsInManifest": len(clips),
        "samplesWritten": written,
        "clipsSkipped": skipped,
        "clipsFailed": len(failed),
        "framesExtracted": frame_total,
        "clipsWithAnyHandDetected": with_hands,
        "handDetectionRate": round(with_hands / max(1, written + skipped), 4),
        "elapsedSeconds": round(elapsed, 2),
        "stride": args.stride,
        "maxFrames": args.max_frames,
        "failures": failed,
        "extractedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    report_path = data_dir / "extraction-report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print()
    print(f"[extract] wrote {written} sample file(s), skipped {skipped}, failed {len(failed)}")
    print(f"[extract] frames extracted: {frame_total}")
    print(f"[extract] clips with at least one hand detected: {with_hands}/{written + skipped}")
    print(f"[extract] elapsed: {elapsed:.1f}s")
    print(f"[extract] report: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
