#!/usr/bin/env python
"""Re-evaluate a trained model without retraining it.

Two uses:

1. **Re-check a shipped artefact.** `npm run ml:eval` reloads the model card, rebuilds the
   test split from the recorded configuration and prints the metrics again. If the numbers
   differ from the card, the card is stale — which is exactly what you want to find out.

2. **Evaluate on a different dataset.** Point ``--data-dir`` at a fresh collection and
   ``--split-kind held-out-signer`` to see how the model behaves on people it has never
   seen. This is the check that actually matters, and it is the one people skip.

    python ml/scripts/evaluate.py --model-dir ml/artifacts/sign-clf-v1 --data-dir ml/data-holdout

The script never modifies the model card. It prints, and optionally writes a report next to
its output path.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "ml"))

from signdata.constants import NEGATIVE_CLASS_GLOSS, TARGET_MACRO_F1  # noqa: E402
from signdata.dataset import (  # noqa: E402
    assess_quality,
    build_bundle,
    describe,
    leave_one_signer_out_folds,
    split_held_out_signers,
)
from signdata.evaluation import evaluate, summarise  # noqa: E402
from signdata.io import (  # noqa: E402
    DEFAULT_ARTIFACT_DIR,
    find_sample_files,
    load_phrases_vocabulary,
    load_samples,
    read_json,
    write_json,
)
from signdata.models import build_candidate  # noqa: E402
from signdata.synthetic import SyntheticConfig, generate_samples  # noqa: E402


def resolve(value: str | None, fallback: Path) -> Path:
    if not value:
        return fallback
    candidate = Path(value)
    return candidate if candidate.is_absolute() else (REPO_ROOT / candidate)


def load_dataset_from_args(args: argparse.Namespace, vocabulary: list[str]) -> tuple[Any, str]:
    """Assemble the evaluation dataset from either a data dir or the synthetic generator."""
    if args.synthetic:
        config = SyntheticConfig(
            signer_count=args.synthetic_signers,
            positive_classes=args.synthetic_classes,
            reps_per_signer=12,
            frames_per_rep=18,
            seed=args.synthetic_seed,
        )
        print(f"[evaluate] Generating synthetic evaluation data (seed {config.seed}).")
        samples = generate_samples(config)
        bundle = build_bundle(
            samples,
            vocabulary=[f"SYNTH_{chr(ord('A') + index)}" for index in range(config.positive_classes)],
            include_learners=True,
        )
        return bundle, "synthetic"

    data_dir = resolve(args.data_dir, REPO_ROOT / "ml" / "data")
    if not data_dir.exists():
        raise SystemExit(
            f"No data directory at {data_dir}. Pass --data-dir, or use --synthetic to evaluate "
            "on generated landmarks."
        )

    files = find_sample_files(data_dir)
    samples, warnings = load_samples(files)
    for message in warnings:
        print(f"[evaluate] WARNING: {message}")
    print(f"[evaluate] Loaded {len(samples)} sample(s) from {len(files)} file(s) in {data_dir}")

    bundle = build_bundle(samples, vocabulary=vocabulary or None, include_learners=args.include_learners)
    return bundle, "collected"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Re-evaluate a trained SignSpeak model.")
    parser.add_argument(
        "--model-dir",
        type=Path,
        default=DEFAULT_ARTIFACT_DIR / "sign-clf-v1",
        help="Directory containing model-card.json and the .onnx file.",
    )
    parser.add_argument("--data-dir", type=str, help="Directory of collected sample JSON files.")
    parser.add_argument(
        "--split-kind",
        choices=["held-out-signer", "loso"],
        default="held-out-signer",
        help="held-out-signer (one split) or loso (leave-one-signer-out across all signers).",
    )
    parser.add_argument("--test-signer-count", type=int, default=2)
    parser.add_argument("--seed", type=int, default=20260101)
    parser.add_argument("--include-learners", action="store_true")
    parser.add_argument(
        "--synthetic",
        action="store_true",
        help="Evaluate on generated landmarks instead of collected data.",
    )
    parser.add_argument("--synthetic-signers", type=int, default=6)
    parser.add_argument("--synthetic-classes", type=int, default=6)
    parser.add_argument("--synthetic-seed", type=int, default=424242)
    parser.add_argument("--out", type=Path, help="Write a JSON report to this path.")
    args = parser.parse_args(argv)

    model_dir = args.model_dir if args.model_dir.is_absolute() else REPO_ROOT / args.model_dir
    card_path = model_dir / "model-card.json"

    card: dict[str, Any] = {}
    if card_path.exists():
        card = read_json(card_path)
        print(f"[evaluate] Model card: {card_path}")
        print(f"[evaluate] Model version: {card.get('modelVersion')}")
        print(f"[evaluate] Algorithm: {card.get('algorithm')}")
        print(f"[evaluate] Training source: {card.get('trainingSource')}")
        print(f"[evaluate] notForRealUse: {card.get('notForRealUse')}")
        if card.get("notForRealUse"):
            print(
                "[evaluate] NOTE: this model is flagged not-for-real-use. Any metric below "
                "describes a pipeline exercise, not sign recognition."
            )
    else:
        print(f"[evaluate] WARNING: no model card at {card_path}; falling back to defaults.")

    algorithm = str(card.get("algorithm") or "random_forest")
    classes = [str(entry) for entry in (card.get("vocabulary") or [])]
    negative_class = card.get("negativeClass") or NEGATIVE_CLASS_GLOSS
    decision_cfg = card.get("decision") or {}
    confidence_threshold = float(decision_cfg.get("confidenceThreshold", 0.7))

    vocabulary: list[str] = []
    if not args.synthetic:
        try:
            vocabulary = [
                str(entry.get("gloss", ""))
                for entry in load_phrases_vocabulary(REPO_ROOT)
                if entry.get("gloss")
            ]
        except Exception as exc:  # noqa: BLE001
            print(f"[evaluate] WARNING: could not read the vocabulary file ({exc}).")

    bundle, source = load_dataset_from_args(args, vocabulary)
    print(f"[evaluate] Dataset source: {source}")

    summary = describe(bundle)
    print(f"[evaluate] Frames: {summary['frameCount']}, signers: {summary['signerCount']}")
    print(f"[evaluate] Classes present: {', '.join(summary['classes']) or '(none)'}")

    findings = assess_quality(bundle)
    for finding in findings:
        marker = "BLOCKER" if finding.severity == "blocker" else "warning"
        print(f"[evaluate]   [{marker}] {finding.code}: {finding.message}")

    if bundle.frame_count == 0:
        print("[evaluate] Nothing to evaluate.")
        return 2

    # Evaluate against the card's declared class order so the confusion matrix is
    # comparable to the one recorded at training time. Any class the card does not know
    # about is reported rather than silently dropped.
    class_order = classes or bundle.classes
    unknown = [name for name in bundle.classes if name not in class_order]
    if unknown:
        print(
            f"[evaluate] WARNING: the dataset contains classes the model card does not list "
            f"({', '.join(unknown)}). Those rows will be scored as errors."
        )
        class_order = [*class_order, *unknown]

    # `bundle.y` is indexed by the *dataset's* class order, which can differ from the
    # card's order. Remap it, otherwise a class list that merely has a different ordering
    # would be scored as a completely wrong model.
    remap = np.asarray(
        [class_order.index(bundle.classes[index]) for index in range(len(bundle.classes))],
        dtype=np.int64,
    )
    y_true = remap[bundle.y]
    if not np.array_equal(remap, np.arange(len(remap))):
        print(
            "[evaluate] The dataset's class order differs from the model card's; labels have "
            "been remapped so the comparison is meaningful."
        )

    reports: list[dict[str, Any]] = []

    if args.split_kind == "loso":
        folds = leave_one_signer_out_folds(bundle)
        if not folds:
            print("[evaluate] No signer had enough data to form a fold.")
            return 2
        scores: list[float] = []
        for signer, train_idx, test_idx in folds:
            estimator = build_candidate(algorithm, seed=args.seed, class_count=len(class_order))
            estimator.fit(bundle.x[train_idx], y_true[train_idx])
            result = evaluate(
                estimator,
                bundle.x[test_idx],
                y_true[test_idx],
                class_order=class_order,
                sample_ids=bundle.sample_ids[test_idx],
                confidence_threshold=confidence_threshold,
                negative_class=negative_class,
                latency_sample=None,
            )
            score = result.macro_f1_positive
            if score is not None:
                scores.append(score)
            print(
                f"[evaluate] fold {signer:<24} frames={test_idx.size:>6} "
                f"macroF1={('n/a' if score is None else f'{score:.4f}')} "
                f"accuracy={result.accuracy:.4f}"
            )
            reports.append({"heldOutSigner": signer, "metrics": result.to_metrics_json()})

        if scores:
            print()
            print(
                f"[evaluate] LOSO mean macro F1: {float(np.mean(scores)):.4f} "
                f"(min {float(np.min(scores)):.4f}, max {float(np.max(scores)):.4f}, "
                f"sd {float(np.std(scores)):.4f})"
            )
            if float(np.min(scores)) < TARGET_MACRO_F1:
                print(
                    f"[evaluate] At least one signer falls below the {TARGET_MACRO_F1:.2f} target. "
                    "Report the worst fold, not the mean."
                )
        payload = {
            "mode": "loso",
            "algorithm": algorithm,
            "datasetSource": source,
            "dataset": summary,
            "meanMacroF1": float(np.mean(scores)) if scores else None,
            "folds": reports,
        }
    else:
        split = split_held_out_signers(
            bundle, test_signer_count=args.test_signer_count, seed=args.seed
        )
        print(f"[evaluate] Split: {split.kind} — {split.note}")
        if split.test_idx.size == 0 or split.train_idx.size == 0:
            print("[evaluate] The split produced an empty half; nothing to evaluate.")
            return 2

        estimator = build_candidate(algorithm, seed=args.seed, class_count=len(class_order))
        estimator.fit(bundle.x[split.train_idx], y_true[split.train_idx])
        result = evaluate(
            estimator,
            bundle.x[split.test_idx],
            y_true[split.test_idx],
            class_order=class_order,
            sample_ids=bundle.sample_ids[split.test_idx],
            confidence_threshold=confidence_threshold,
            negative_class=negative_class,
            latency_sample=bundle.x[split.test_idx][:1],
        )
        print()
        print(summarise(result, title=f"Re-evaluation — {algorithm}"))
        payload = {
            "mode": "held-out-signer",
            "algorithm": algorithm,
            "datasetSource": source,
            "dataset": summary,
            "split": {
                "kind": split.kind,
                "note": split.note,
                "heldOutSigners": split.held_out_signers,
                "trainFrames": int(split.train_idx.size),
                "testFrames": int(split.test_idx.size),
            },
            "metrics": result.to_metrics_json(),
        }

    if args.out:
        out_path = args.out if args.out.is_absolute() else REPO_ROOT / args.out
        write_json(out_path, payload)
        print(f"[evaluate] Wrote {out_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
