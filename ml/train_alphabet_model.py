#!/usr/bin/env python
"""Train, evaluate and export the robust ISL Alphabet (A-Z) classifier `alphabet-clf-v1.onnx`.

Runs in the training environment (`ml/.venv`).
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score

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


def add_landmark_jitter(vectors: np.ndarray, sigma: float = 0.015, seed: int = 42) -> np.ndarray:
    """Adds small Gaussian perturbation to hand landmarks (indices 0..125)."""
    rng = np.random.default_rng(seed)
    augmented = vectors.copy()
    noise = rng.normal(0.0, sigma, size=(len(vectors), 126)).astype(np.float32)
    # Only jitter where landmarks are non-zero
    mask = augmented[:, :126] != 0
    augmented[:, :126] += noise * mask
    return augmented


def add_scale_perturbation(vectors: np.ndarray, scale: float) -> np.ndarray:
    """Scales hand landmark coordinates (indices 0..125) and tip distances (138..147)."""
    augmented = vectors.copy()
    augmented[:, :126] *= scale
    augmented[:, 138:148] *= scale
    return augmented


def load_clean_alphabet_samples():
    x_list = []
    y_list = []

    print("[load] Loading clean A-Z alphabet samples...")
    for idx, letter in enumerate(LETTERS):
        sample_path = ALPHABET_SAMPLES_DIR / f"alphabet__{letter}.json"
        if not sample_path.exists():
            print(f"  Warning: {sample_path.name} not found")
            continue

        data = json.loads(sample_path.read_text(encoding="utf-8"))
        features = data["samples"][0]["features"]
        for f in features:
            vec = list(f)
            # Enforce pose-invariance for alphabet handshapes
            vec[128] = 0.0
            vec[129] = 0.0
            vec[130] = 0.0
            vec[131] = 0.0
            vec[158] = 0.0
            x_list.append(vec)
            y_list.append(idx)
        print(f"  Letter {letter}: {len(features)} clean frames loaded")

    # Load rich negative samples for OTHER class
    print("[load] Loading negative samples for OTHER class...")
    other_idx = len(LETTERS)  # 26
    other_count = 0
    word_files = list(WORD_SAMPLES_DIR.glob("*.json"))
    for word_sample_file in word_files:
        try:
            d = json.loads(word_sample_file.read_text(encoding="utf-8"))
            feats = d["samples"][0]["features"]
            # Subsample frames
            step = max(1, len(feats) // 10)
            for i in range(0, len(feats), step):
                vec = list(feats[i])
                vec[128] = 0.0
                vec[129] = 0.0
                vec[130] = 0.0
                vec[131] = 0.0
                vec[158] = 0.0
                x_list.append(vec)
                y_list.append(other_idx)
                other_count += 1
        except Exception:
            continue

    # Add synthetic empty vectors (no hands)
    for _ in range(250):
        x_list.append([0.0] * 159)
        y_list.append(other_idx)
        other_count += 1

    print(f"  Class OTHER: {other_count} frames loaded")
    return np.array(x_list, dtype=np.float32), np.array(y_list, dtype=np.int64)


def main():
    x_raw, y_raw = load_clean_alphabet_samples()
    print(f"[data] Total base samples: {len(x_raw)} across {len(VOCABULARY)} classes")

    # Train / Val Split to evaluate TRUE held-out generalization
    x_train_base, x_val, y_train_base, y_val = train_test_split(
        x_raw, y_raw, test_size=0.15, random_state=2026, stratify=y_raw
    )
    print(f"[split] Training base: {len(x_train_base)}, Held-out Validation: {len(x_val)}")

    # 1. Mirror Augmentation
    print("[augment] Applying horizontal mirror augmentation...")
    x_mir = np.array([mirror_vector(row) for row in x_train_base], dtype=np.float32)
    # Ensure pose stays zeroed
    x_mir[:, 128:132] = 0.0
    x_mir[:, 158] = 0.0

    # 2. Jitter Augmentation
    print("[augment] Applying landmark jitter augmentation...")
    x_jit = add_landmark_jitter(x_train_base, sigma=0.015, seed=2026)

    # 3. Scale Augmentations
    print("[augment] Applying scale variations (0.93x and 1.07x)...")
    x_small = add_scale_perturbation(x_train_base, 0.93)
    x_large = add_scale_perturbation(x_train_base, 1.07)

    # 4. Distal Occlusion Augmentation
    print("[augment] Applying synthetic distal occlusion...")
    x_occ = apply_synthetic_occlusion(x_train_base, p=0.20, seed=2026)

    # Combine all augmentations
    x_train = np.vstack([x_train_base, x_mir, x_jit, x_small, x_large, x_occ])
    y_train = np.concatenate([y_train_base, y_train_base, y_train_base, y_train_base, y_train_base, y_train_base])
    print(f"[augment] Total augmented training samples: {len(x_train)}")

    # 5. Fit Random Forest Classifier with regularization to prevent memorization
    print("[train] Fitting Random Forest (250 trees, max_depth=26, min_samples_split=3)...")
    clf = RandomForestClassifier(
        n_estimators=250,
        max_depth=26,
        min_samples_split=3,
        min_samples_leaf=1,
        max_features="sqrt",
        class_weight="balanced",
        random_state=2026,
        n_jobs=-1,
    )
    t0 = time.time()
    clf.fit(x_train, y_train)
    print(f"[train] Model fitted in {time.time() - t0:.1f}s")

    # 6. Evaluate on Held-out Validation Set
    val_preds = clf.predict(x_val)
    val_acc = accuracy_score(y_val, val_preds)
    print(f"\n=======================================================")
    print(f"HELD-OUT VALIDATION ACCURACY: {val_acc:.1%}")
    print(f"=======================================================")

    print("\nPer-Class Performance on Unseen Held-Out Data:")
    print("-" * 65)
    print(f"{'LETTER':<10} | {'VAL SAMPLES':<12} | {'VAL ACCURACY':<12}")
    print("-" * 65)
    for idx, cname in enumerate(VOCABULARY):
        mask = y_val == idx
        if np.any(mask):
            acc_c = accuracy_score(y_val[mask], val_preds[mask])
            print(f"{cname:<10} | {np.sum(mask):<12} | {acc_c:<12.1%}")
    print("-" * 65)

    # 7. Export to ONNX
    print(f"\n[onnx] Exporting to {OUTPUT_ONNX}...")
    OUTPUT_ONNX.parent.mkdir(parents=True, exist_ok=True)
    export_to_onnx(clf, OUTPUT_ONNX)
    print(f"[onnx] Exported {OUTPUT_ONNX} ({OUTPUT_ONNX.stat().st_size / 1024 / 1024:.1f} MB)")

    # Verify ONNX agreement
    print("[onnx] Verifying scikit-learn vs ONNX runtime parity...")
    verification = verify_onnx_agreement(clf, OUTPUT_ONNX, x_val[:100])
    print(f"[onnx] Verified on {verification.checked_rows} test vectors, max difference: {verification.max_absolute_difference:.2e}")

    # 8. Update Model Card with responsive decision thresholds
    card = {
        "schemaVersion": 1,
        "modelVersion": "alphabet-clf-v1",
        "trainedOn": time.strftime("%Y-%m-%d"),
        "algorithm": "random_forest_robust_augmented",
        "featureVersion": "ss-features-v1",
        "inputDim": 159,
        "vocabulary": VOCABULARY,
        "labels": {k: k for k in VOCABULARY},
        "negativeClass": "OTHER",
        "trainingSource": "collected_consented_dataset",
        "notForRealUse": False,
        "decision": {
            "confidenceThreshold": 0.25,
            "marginThreshold": 0.03,
            "minHandScore": 0.35,
            "smoothing": {
                "windowSize": 3,
                "requiredVotes": 2
            }
        },
        "metrics": {
            "validationAccuracy": float(val_acc),
            "classCount": len(VOCABULARY),
            "trainingVectorCount": int(len(x_train)),
            "validationVectorCount": int(len(x_val))
        }
    }
    OUTPUT_CARD.write_text(json.dumps(card, indent=2), encoding="utf-8")
    print(f"[card] Wrote responsive model card to {OUTPUT_CARD}")
    print("\n[SUCCESS] Robust ISL Alphabet Model trained, verified, and deployed!")


if __name__ == "__main__":
    main()
