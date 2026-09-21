import io
import json
import time
from collections import Counter, defaultdict
from pathlib import Path
import numpy as np
from PIL import Image
import pyarrow.parquet as pq
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

REPO_ROOT = Path(__file__).resolve().parent.parent
import sys
sys.path.insert(0, str(REPO_ROOT))
PARQUET_FILE = REPO_ROOT / "ml" / "data" / "isl-alphabet" / "isl_alphabet_raw.parquet"
HAND_MODEL = REPO_ROOT / "public" / "models" / "hand_landmarker.task"
SAMPLES_DIR = REPO_ROOT / "ml" / "data" / "isl-alphabet" / "samples"

LABEL_NAMES = {
    9: "A", 10: "B", 11: "C", 12: "D", 13: "E", 14: "F", 15: "G", 16: "H",
    17: "I", 18: "J", 19: "K", 20: "L", 21: "M", 22: "N", 23: "O", 24: "P",
    25: "Q", 26: "R", 27: "S", 28: "T", 29: "U", 30: "V", 31: "W", 32: "X",
    33: "Y", 34: "Z"
}

from ml.signdata.features import extract_feature_vector

def main():
    print("[init] Setting up MediaPipe in IMAGE mode...")
    base_options = python.BaseOptions(model_asset_path=str(HAND_MODEL))
    options = vision.HandLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
        min_hand_detection_confidence=0.35,
        min_hand_presence_confidence=0.35,
    )
    detector = vision.HandLandmarker.create_from_options(options)

    print(f"[parquet] Reading {PARQUET_FILE.name}...")
    table = pq.read_table(PARQUET_FILE, columns=["image", "label"])
    labels = table["label"].to_pylist()

    indices_by_letter = defaultdict(list)
    for idx, l in enumerate(labels):
        if l in LABEL_NAMES:
            indices_by_letter[LABEL_NAMES[l]].append(idx)

    # Extract 120 samples per letter across the full 1200 images
    SAMPLES_PER_LETTER = 120
    t0 = time.time()

    for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        indices = indices_by_letter[letter]
        step = max(1, len(indices) // SAMPLES_PER_LETTER)
        chosen = [indices[i * step] for i in range(min(SAMPLES_PER_LETTER, len(indices) // step))]

        vectors = []
        two_hand_count = 0
        one_hand_count = 0

        for row_idx in chosen:
            raw_bytes = table["image"][row_idx]["bytes"].as_py()
            if not raw_bytes:
                continue
            try:
                pil_img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
                mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.array(pil_img))
                res = detector.detect(mp_img)
            except Exception:
                continue

            if not res.hand_landmarks:
                continue

            # Build hands mapping
            detected_hands = []
            for h_idx, lms in enumerate(res.hand_landmarks):
                cat = res.handedness[h_idx][0] if h_idx < len(res.handedness) else None
                hname = cat.category_name if cat else "Right"
                score = float(cat.score) if cat else 0.9
                detected_hands.append({
                    "handedness": hname,
                    "score": score,
                    "landmarks": [{"x": float(p.x), "y": float(p.y), "z": float(p.z)} for p in lms]
                })

            # If 2 hands detected but both have same handedness label, disambiguate by X position
            if len(detected_hands) >= 2:
                h0_wrist_x = detected_hands[0]["landmarks"][0]["x"]
                h1_wrist_x = detected_hands[1]["landmarks"][0]["x"]
                if detected_hands[0]["handedness"] == detected_hands[1]["handedness"]:
                    if h0_wrist_x < h1_wrist_x:
                        detected_hands[0]["handedness"] = "Left"
                        detected_hands[1]["handedness"] = "Right"
                    else:
                        detected_hands[0]["handedness"] = "Right"
                        detected_hands[1]["handedness"] = "Left"

            mapping = {"hands": detected_hands, "pose": None}
            feat = extract_feature_vector(mapping)
            if feat.hand_count > 0:
                vectors.append(feat.vector)
                if feat.hand_count == 2:
                    two_hand_count += 1
                else:
                    one_hand_count += 1

        # Write clean sample file
        payload = {
            "samples": [
                {
                    "id": f"alphabet_{letter}",
                    "signerId": "Hemg:ISL_Alphabet_Clean",
                    "signerType": "fluent",
                    "label": letter,
                    "session": "session_image_mode",
                    "capturedAt": time.strftime("%Y-%m-%d"),
                    "conditions": {"lighting": "studio", "mode": "image_extracted"},
                    "toolVersion": "extract_proper_alphabet.py/2.0",
                    "frameCount": len(vectors),
                    "features": vectors,
                    "provenance": {
                        "source": "Hemg/Indian_sign_language_dataset",
                        "two_hand_ratio": round(two_hand_count / max(1, len(vectors)), 3)
                    }
                }
            ]
        }
        out_path = SAMPLES_DIR / f"alphabet__{letter}.json"
        out_path.write_text(json.dumps(payload), encoding="utf-8")
        print(f"Letter {letter}: {len(vectors)} frames extracted (2-hand: {two_hand_count}, 1-hand: {one_hand_count})")

    t1 = time.time()
    print(f"\n[DONE] Finished extraction in {t1 - t0:.1f}s!")

if __name__ == "__main__":
    main()
