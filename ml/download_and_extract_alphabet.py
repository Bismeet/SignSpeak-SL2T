#!/usr/bin/env python
"""Download the ISL Alphabet (A-Z) dataset and extract 159D MediaPipe landmark features.

Runs in the extraction environment (`ml/.venv-extract`), which contains MediaPipe and OpenCV.
"""

from __future__ import annotations

import io
import json
import os
import sys
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

import cv2
import mediapipe as mp
import numpy as np
import pyarrow.parquet as pq
from PIL import Image

from ml.signdata.constants import FEATURE_VERSION, FEATURE_VECTOR_LENGTH
from ml.signdata.features import extract_feature_vector

DATASET_URL = (
    "https://huggingface.co/datasets/Hemg/Indian_sign_language_dataset/resolve/main/"
    "data/train-00000-of-00001-a1731e778755d263.parquet"
)

ALPHABET_DIR = REPO_ROOT / "ml" / "data" / "isl-alphabet"
PARQUET_FILE = ALPHABET_DIR / "isl_alphabet_raw.parquet"
SAMPLES_DIR = ALPHABET_DIR / "samples"
HAND_MODEL = REPO_ROOT / "public" / "models" / "hand_landmarker.task"
POSE_MODEL = REPO_ROOT / "public" / "models" / "pose_landmarker_lite.task"

LABEL_NAMES = {
    0: "1", 1: "2", 2: "3", 3: "4", 4: "5", 5: "6", 6: "7", 7: "8", 8: "9",
    9: "A", 10: "B", 11: "C", 12: "D", 13: "E", 14: "F", 15: "G", 16: "H",
    17: "I", 18: "J", 19: "K", 20: "L", 21: "M", 22: "N", 23: "O", 24: "P",
    25: "Q", 26: "R", 27: "S", 28: "T", 29: "U", 30: "V", 31: "W", 32: "X",
    33: "Y", 34: "Z"
}

TARGET_LETTERS = [chr(c) for c in range(ord('A'), ord('Z') + 1)]


def download_file(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 10_000_000:
        print(f"[download] {dest.name} already exists ({dest.stat().st_size / 1024 / 1024:.1f} MB), skipping download.")
        return

    print(f"[download] Downloading {url} to {dest}...")
    req = urllib.request.Request(url, headers={"User-Agent": "SignSpeak-Dataset-Fetcher/1.0"})
    with urllib.request.urlopen(req) as resp, open(dest, "wb") as out_f:
        total = int(resp.headers.get("Content-Length", 0))
        downloaded = 0
        chunk_size = 1024 * 1024
        started = time.time()
        while True:
            chunk = resp.read(chunk_size)
            if not chunk:
                break
            out_f.write(chunk)
            downloaded += len(chunk)
            elapsed = time.time() - started
            if total > 0:
                pct = downloaded / total * 100
                print(f"\r[download] {downloaded / 1024 / 1024:.1f} / {total / 1024 / 1024:.1f} MB ({pct:.1f}%) in {elapsed:.1f}s", end="")
            else:
                print(f"\r[download] {downloaded / 1024 / 1024:.1f} MB in {elapsed:.1f}s", end="")
        print()
    print(f"[download] Completed: {dest.stat().st_size / 1024 / 1024:.1f} MB")


def create_landmarkers():
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions, RunningMode

    hand_opts = HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(HAND_MODEL)),
        running_mode=RunningMode.VIDEO,
        num_hands=2,
        min_hand_detection_confidence=0.4,
        min_hand_presence_confidence=0.4,
        min_tracking_confidence=0.4,
    )
    hand = HandLandmarker.create_from_options(hand_opts)
    return hand


def frame_mapping(hand_result):
    from ml.extract_features import frame_mapping as upstream_mapping
    return upstream_mapping(hand_result, None)


def main():
    ALPHABET_DIR.mkdir(parents=True, exist_ok=True)
    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)

    # 1. Download raw parquet dataset
    download_file(DATASET_URL, PARQUET_FILE)

    # 2. Open parquet and group by letter
    print(f"[dataset] Reading parquet file {PARQUET_FILE}...")
    table = pq.read_table(PARQUET_FILE, columns=["image", "label"])
    df_labels = table["label"].to_numpy()
    print(f"[dataset] Total rows in dataset: {len(df_labels)}")

    # Index rows per target letter
    samples_by_letter = defaultdict(list)
    for idx, raw_label in enumerate(df_labels):
        name = LABEL_NAMES.get(int(raw_label))
        if name in TARGET_LETTERS:
            samples_by_letter[name].append(idx)

    for letter in TARGET_LETTERS:
        print(f"  Letter {letter}: {len(samples_by_letter[letter])} available samples")

    # 3. Initialize MediaPipe
    print("[mediapipe] Initializing HandLandmarker...")
    hand = create_landmarkers()

    # 4. Extract landmarks per letter
    samples_per_letter = 50  # 50 clean samples per letter * 26 = 1300 samples
    clock_ms = 1000.0

    total_extracted = 0
    letter_counts = Counter()

    for letter in TARGET_LETTERS:
        indices = samples_by_letter[letter]
        # Spread evenly across the indices
        if len(indices) > samples_per_letter:
            step = len(indices) / samples_per_letter
            chosen_indices = [indices[int(i * step)] for i in range(samples_per_letter)]
        else:
            chosen_indices = indices

        letter_vectors = []

        for row_idx in chosen_indices:
            clock_ms += 33.3  # 30fps simulation
            row = table.slice(row_idx, 1).to_pydict()
            img_dict = row["image"][0]
            img_bytes = img_dict.get("bytes")
            if not img_bytes:
                continue

            try:
                pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                rgb_arr = np.array(pil_img)
            except Exception:
                continue

            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_arr)
            hand_result = hand.detect_for_video(mp_image, int(clock_ms))

            mapping = frame_mapping(hand_result)
            extracted = extract_feature_vector(mapping)
            if extracted.hand_count > 0:
                letter_vectors.append(extracted.vector)
                letter_counts[letter] += 1

        if letter_vectors:
            sample_payload = {
                "samples": [
                    {
                        "id": f"alphabet_{letter}",
                        "signerId": "Hemg:ISL_Alphabet",
                        "signerType": "fluent",
                        "label": letter,
                        "session": "session01",
                        "capturedAt": time.strftime("%Y-%m-%d"),
                        "conditions": {"lighting": "bright", "handedness": "right"},
                        "toolVersion": "extract_alphabet_features.py/1.0",
                        "frameCount": len(letter_vectors),
                        "features": letter_vectors,
                        "provenance": {"source": "Hemg/Indian_sign_language_dataset", "letter": letter}
                    }
                ]
            }
            out_file = SAMPLES_DIR / f"alphabet__{letter}.json"
            out_file.write_text(json.dumps(sample_payload), encoding="utf-8")
            total_extracted += len(letter_vectors)
            print(f"[extract] {letter}: {len(letter_vectors)} landmark frames extracted -> {out_file.name}")

    print(f"\n[summary] Extracted {total_extracted} total landmark frames across {len(letter_counts)} letters!")
    for l in TARGET_LETTERS:
        print(f"  {l}: {letter_counts.get(l, 0)} frames")


if __name__ == "__main__":
    from collections import Counter
    main()
