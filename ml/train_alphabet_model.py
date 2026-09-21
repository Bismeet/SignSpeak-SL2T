#!/usr/bin/env python
"""Train, evaluate and export the ISL Alphabet (A-Z) classifier `alphabet-clf-v1.onnx`.

Runs in the training environment (`ml/.venv`).
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
from sklearn.ensemble import RandomForestClassifier

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from ml.signdata.dataset import apply_synthetic_occlusion
from ml.signdata.export import export_to_onnx, verify_onnx_agreement
from ml.train_and_export import mirror_vector

ALPHABET_SAMPLES_DIR = REPO_ROOT / "ml" / "data" / "isl-alphabet" / "samples"
WORD_SAMPLES_DIR = REPO_ROOT / "ml" / "data" / "isl-subset" / "samples"
OUTPUT_ONNX = REPO_ROOT / "public" / "models" / "alphabet-clf-v1.onnx"
OUTPUT_CARD = REPO_ROOT / "public" / "models" / "alphabet-model-card.json"

LETTERS = [chr(c) for c in range(ord('A'), ord('Z') + 1)]
VOCABULARY = [*LETTERS, "OTHER"]


def load_alphabet_samples():
    x_list = []
    y_list = []

    print("[load] Loading A-Z alphabet samples...")
    for idx, letter in enumerate(LETTERS):
        sample_path = ALPHABET_SAMPLES_DIR / f"alphabet__{letter}.json"
        if not sample_path.exists():
            print(f"  Warning: {sample_path.name} not found")
            continue

        data = json.loads(sample_path.read_text(encoding="utf-8"))
        features = data["samples"][0]["features"]
        for f in features:
            x_list.append(f)
            y_list.append(idx)
        print(f"  Letter {letter}: {len(features)} frames loaded")

    # Load negative samples for OTHER from word samples
    print("[load] Loading negative samples for OTHER class...")
    other_idx = len(LETTERS)  # 26
    other_count = 0
    for word_sample_file in list(WORD_SAMPLES_DIR.glob("*.json"))[:30]:
        try:
            d = json.loads(word_sample_file.read_text(encoding="utf-8"))
            s = d["samples"][0]
            feats = s["features"]
            # Subsample 5 frames per file
            step = max(1, len(feats) // 5)
            for i in range(0, len(feats), step):
                x_list.append(feats[i])
                y_list.append(other_idx)
                other_count += 1
        except Exception:
            continue

    # Add synthetic empty vectors to OTHER
    n_zeros = 150
    for _ in range(n_zeros):
        x_list.append([0.0] * 159)
        y_list.append(other_idx)
    other_count += n_zeros

    print(f"  Class OTHER: {other_count} frames loaded (including empty hand vectors)")
    return np.array(x_list, dtype=np.float32), np.array(y_list, dtype=np.int64)


def main():
    x, y = load_alphabet_samples()
    print(f"[data] Total raw samples: {len(x)} across {len(VOCABULARY)} classes")

    # 1. Mirror augmentation
    print("[augment] Applying horizontal mirror augmentation...")
    x_mir = np.array([mirror_vector(row) for row in x], dtype=np.float32)
    x_aug = np.vstack([x, x_mir])
    y_aug = np.concatenate([y, y])

    # 2. Synthetic distal occlusion augmentation
    print("[augment] Applying synthetic distal keypoint occlusion...")
    x_train = apply_synthetic_occlusion(x_aug, p=0.25, seed=2026)
    y_train = y_aug
    print(f"[data] Total augmented training samples: {len(x_train)}")

    # 3. Fit Random Forest
    print("[train] Fitting Random Forest (200 trees, class_weight='balanced')...")
    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=None,
        min_samples_split=2,
        min_samples_leaf=1,
        class_weight="balanced",
        random_state=2026,
        n_jobs=-1,
    )
    started = time.time()
    clf.fit(x_train, y_train)
    print(f"[train] Fitted in {time.time() - started:.1f}s")

    # 4. Evaluate on raw unaugmented set
    preds = clf.predict(x)
    acc = np.mean(preds == y)
    print(f"\n[eval] Direct accuracy on base dataset: {acc:.1%}")

    print("-" * 65)
    print(f"{'LETTER / CLASS':<16} | {'SAMPLES':<10} | {'ACCURACY':<10}")
    print("-" * 65)
    for idx, cname in enumerate(VOCABULARY):
        mask = y == idx
        if np.any(mask):
            class_acc = np.mean(preds[mask] == idx)
            print(f"{cname:<16} | {np.sum(mask):<10} | {class_acc:<10.1%}")
    print("-" * 65)

    # 5. Export to ONNX
    print(f"\n[onnx] Exporting to {OUTPUT_ONNX}...")
    OUTPUT_ONNX.parent.mkdir(parents=True, exist_ok=True)
    export_to_onnx(clf, OUTPUT_ONNX)
    print(f"[onnx] Wrote {OUTPUT_ONNX} ({OUTPUT_ONNX.stat().st_size / 1024 / 1024:.1f} MB)")

    # Verify ONNX agreement
    print("[onnx] Verifying agreement between scikit-learn and ONNX...")
    verification = verify_onnx_agreement(clf, OUTPUT_ONNX, x[:100])
    print(f"[onnx] Verified agreement on {verification.checked_rows} rows, max delta {verification.max_absolute_difference:.2e}")

    # 6. Write model card
    card = {
        "schemaVersion": 1,
        "modelVersion": "alphabet-clf-v1",
        "trainedOn": time.strftime("%Y-%m-%d"),
        "algorithm": "random_forest",
        "featureVersion": "ss-features-v1",
        "inputDim": 159,
        "vocabulary": VOCABULARY,
        "labels": {k: k for k in VOCABULARY},
        "negativeClass": "OTHER",
        "trainingSource": "collected_consented_dataset",
        "notForRealUse": False,
        "decision": {
            "confidenceThreshold": 0.35,
            "marginThreshold": 0.05,
            "minHandScore": 0.4,
            "smoothing": {
                "windowSize": 4,
                "requiredVotes": 3
            }
        },
        "metrics": {
            "overallAccuracy": float(acc),
            "classCount": len(VOCABULARY),
            "sampleCount": int(len(x))
        }
    }
    OUTPUT_CARD.write_text(json.dumps(card, indent=2), encoding="utf-8")
    print(f"[card] Wrote model card to {OUTPUT_CARD}")
    print("\n[SUCCESS] ISL Alphabet Model trained and deployed successfully!")


if __name__ == "__main__":
    main()
