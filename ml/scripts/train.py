#!/usr/bin/env python
"""Train, evaluate and export a SignSpeak sign classifier.

Usage
-----
    python ml/scripts/train.py --config ml/configs/smoke-test.yaml   # pipeline smoke test
    python ml/scripts/train.py --config ml/configs/default.yaml      # real run
    python ml/scripts/train.py --list-algorithms

What it produces (in ``artifact_dir``):
    sign-clf-v1.onnx        the exported model the browser loads
    model-card.json         everything the app needs to be honest about the model
    run-report.json         the full record: config, dataset, every candidate's metrics
    evaluation.txt          a human-readable report for the pull request

Honesty rules enforced here, not left to the operator:
  * A model is only marked ``notForRealUse: false`` when it was trained on real collected
    data AND the dataset meets every minimum in docs/ai-ml-and-dataset-plan.md §2.
  * A non-exportable winner (SVM) is never shipped; the best exportable candidate is used
    instead and the substitution is recorded.
  * The export is verified against scikit-learn on real rows before it is written out.
  * Metrics are computed on held-out signers. When there are too few signers to do that,
    the split kind is recorded as ``random-sample`` and every metric is labelled optimistic.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import sys
import traceback
from pathlib import Path
from typing import Any

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "ml"))

from signdata.constants import (  # noqa: E402
    FEATURE_VERSION,
    NEGATIVE_CLASS_GLOSS,
    TARGET_CLASSIFIER_LATENCY_MS,
    TARGET_FALSE_ACCEPT_RATE,
    TARGET_FALSE_REJECT_RATE,
    TARGET_MACRO_F1,
    TARGET_PER_CLASS_RECALL,
)
from signdata.dataset import (  # noqa: E402
    DatasetBundle,
    assess_quality,
    blockers,
    build_bundle,
    describe,
    leave_one_signer_out_folds,
    split_held_out_signers,
)
from signdata.evaluation import evaluate, summarise  # noqa: E402
from signdata.export import (  # noqa: E402
    EXPORT_TOLERANCE,
    build_model_card,
    default_limitations,
    export_to_onnx,
    stage_for_browser,
    verify_onnx_agreement,
)
from signdata.io import (  # noqa: E402
    DEFAULT_ARTIFACT_DIR,
    PUBLIC_MODEL_DIR,
    find_sample_files,
    load_phrases_vocabulary,
    load_samples,
    sha256_of_json,
    write_json,
)
from signdata.models import build_candidate, describe_registry, exportable_keys  # noqa: E402
from signdata.schema import DatasetSummary, DecisionConfig  # noqa: E402
from signdata.synthetic import SyntheticConfig, generate_samples  # noqa: E402


# ---------------------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------------------


def load_config(path: Path) -> dict[str, Any]:
    import yaml

    if not path.exists():
        raise FileNotFoundError(f"Configuration file not found: {path}")
    payload = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path} does not contain a YAML mapping.")
    return payload


def resolve_path(value: str | None, fallback: Path) -> Path:
    if not value:
        return fallback
    candidate = Path(value)
    return candidate if candidate.is_absolute() else (REPO_ROOT / candidate)


# ---------------------------------------------------------------------------------------
# Reporting helpers
# ---------------------------------------------------------------------------------------


def banner(title: str) -> None:
    print()
    print("=" * 78)
    print(title)
    print("=" * 78)


def info(message: str) -> None:
    print(f"[train] {message}")


def warn(message: str) -> None:
    print(f"[train] WARNING: {message}")


def target_table(metrics: dict[str, Any]) -> list[str]:
    """Compare measured numbers against the documented acceptance targets.

    This prints a table. It never asserts, and it never edits the numbers. Whether the
    targets are met is a fact to be reported, not a test to be passed.
    """
    lines: list[str] = []
    lines.append("Acceptance targets (docs/testing-and-evaluation.md §2.2)")
    lines.append("-" * 78)
    lines.append(f"  {'metric':<34} {'target':>12} {'measured':>12}  verdict")

    def row(name: str, target: float, measured: float | None, *, lower_is_better: bool = False) -> None:
        if measured is None:
            lines.append(f"  {name:<34} {target:>12.4f} {'n/a':>12}  not measured")
            return
        if lower_is_better:
            ok = measured <= target
        else:
            ok = measured >= target
        lines.append(
            f"  {name:<34} {target:>12.4f} {measured:>12.4f}  {'MET' if ok else 'NOT MET'}"
        )

    row("Held-out-signer macro F1", TARGET_MACRO_F1, metrics.get("heldOutSignerMacroF1"))
    row("Mean LOSO macro F1", TARGET_MACRO_F1, metrics.get("losoMeanMacroF1"))

    recalls = metrics.get("perClassRecall") or {}
    positive = {
        name: value
        for name, value in recalls.items()
        if name != metrics.get("negativeClass")
    }
    worst = min(positive.values()) if positive else None
    row("Worst per-class recall", TARGET_PER_CLASS_RECALL, worst)

    row(
        "False accept rate",
        TARGET_FALSE_ACCEPT_RATE,
        metrics.get("falseAcceptRate"),
        lower_is_better=True,
    )
    row(
        "False reject rate",
        TARGET_FALSE_REJECT_RATE,
        metrics.get("falseRejectRate"),
        lower_is_better=True,
    )
    row(
        "Classifier latency (ms)",
        TARGET_CLASSIFIER_LATENCY_MS,
        metrics.get("inferenceLatencyMs"),
        lower_is_better=True,
    )
    lines.append("")
    lines.append(
        "  Note: latency is measured on this machine with a single row at a time. "
        "The browser target (<=2 s laptop, <=3 s Android) also includes MediaPipe."
    )
    return lines


# ---------------------------------------------------------------------------------------
# Dataset assembly
# ---------------------------------------------------------------------------------------


def assemble_dataset(config: dict[str, Any]) -> tuple[DatasetBundle, dict[str, Any], bool]:
    """Return ``(bundle, provenance, is_synthetic)``."""
    synthetic_cfg_raw = config.get("synthetic") or {}
    is_synthetic = bool(synthetic_cfg_raw.get("enabled"))

    vocabulary: list[str] = []
    vocabulary_source = (config.get("data") or {}).get("vocabulary_source") or ""
    if vocabulary_source:
        try:
            entries = load_phrases_vocabulary(REPO_ROOT)
            vocabulary = [str(entry.get("gloss", "")) for entry in entries if entry.get("gloss")]
            info(f"Vocabulary from {vocabulary_source}: {len(vocabulary)} glosses")
        except Exception as exc:  # noqa: BLE001 - vocabulary is advisory, not fatal
            warn(f"Could not read the vocabulary file ({exc}); unknown labels will be allowed.")

    negative_class = (config.get("data") or {}).get("negative_class", NEGATIVE_CLASS_GLOSS)
    include_learners = bool((config.get("data") or {}).get("include_learners", False))

    if is_synthetic:
        synthetic_cfg = SyntheticConfig.from_mapping(synthetic_cfg_raw)
        warn(
            "SYNTHETIC DATA. This run generates its own landmarks, which are not signs and "
            "have no relationship to ISL. The resulting model is marked notForRealUse and "
            "the app will display a permanent smoke-test banner."
        )
        info(
            f"Generating {synthetic_cfg.signer_count} signers x "
            f"{synthetic_cfg.positive_classes} signs x {synthetic_cfg.reps_per_signer} reps "
            f"x {synthetic_cfg.frames_per_rep} frames..."
        )
        samples = generate_samples(synthetic_cfg)
        warnings: list[str] = []
        provenance = {
            "source": "synthetic",
            "label": synthetic_cfg.label,
            "seed": synthetic_cfg.seed,
            "signerCount": synthetic_cfg.signer_count,
            "positiveClasses": synthetic_cfg.positive_classes,
            "repsPerSigner": synthetic_cfg.reps_per_signer,
            "framesPerRep": synthetic_cfg.frames_per_rep,
        }
        # The synthetic vocabulary is generated, so it is passed in directly.
        vocabulary = [f"SYNTH_{chr(ord('A') + index)}" for index in range(synthetic_cfg.positive_classes)]
    else:
        data_dir = resolve_path((config.get("run") or {}).get("data_dir"), REPO_ROOT / "ml" / "data")
        info(f"Reading samples from {data_dir}")
        if not data_dir.exists():
            raise SystemExit(
                f"No data directory at {data_dir}.\n"
                "Collect data with the /collect screen in the app and export it there, or run "
                "the smoke test with: npm run ml:smoke"
            )
        files = find_sample_files(data_dir)
        info(f"Found {len(files)} candidate JSON file(s)")
        samples, warnings = load_samples(files)
        info(f"Loaded {len(samples)} sample(s)")
        provenance = {
            "source": "collected",
            "dataDir": str(data_dir),
            "fileCount": len(files),
        }

    for message in warnings:
        warn(message)

    bundle = build_bundle(
        samples,
        vocabulary=vocabulary or None,
        include_learners=include_learners,
        negatives_from=(negative_class,),
    )

    manifest_hash = sha256_of_json(
        [
            {"id": sample.id, "signer": sample.signer_id, "label": sample.label, "frames": sample.frame_count}
            for sample in samples
        ]
    )
    bundle.manifest_hash = manifest_hash
    bundle.warnings = list(warnings)

    return bundle, provenance, is_synthetic


# ---------------------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------------------


def train_one(
    key: str,
    bundle: DatasetBundle,
    split: Any,
    *,
    seed: int,
    decision: DecisionConfig,
    negative_class: str | None = NEGATIVE_CLASS_GLOSS,
) -> tuple[Any, dict[str, Any]]:
    """Fit one candidate and evaluate it on the held-out-signer split."""
    estimator = build_candidate(key, seed=seed, class_count=len(bundle.classes))
    estimator.fit(bundle.x[split.train_idx], bundle.y[split.train_idx])

    result = evaluate(
        estimator,
        bundle.x[split.test_idx],
        bundle.y[split.test_idx],
        class_order=bundle.classes,
        sample_ids=bundle.sample_ids[split.test_idx],
        confidence_threshold=decision.confidence_threshold,
        negative_class=negative_class,
        latency_sample=bundle.x[split.test_idx][:1] if split.test_idx.size else bundle.x[:1],
    )
    return estimator, {
        "key": key,
        "macroF1Positive": result.macro_f1_positive,
        "macroF1All": result.macro_f1_all,
        "accuracy": result.accuracy,
        "windowAccuracy": result.window_accuracy,
        "falseAcceptRate": result.false_accept_rate,
        "falseRejectRate": result.false_reject_rate,
        "inferenceLatencyMs": result.inference_latency_ms,
        "evaluation": result,
    }


def run_loso(
    bundle: DatasetBundle,
    key: str,
    *,
    seed: int,
    decision: DecisionConfig,
    negative_class: str | None = NEGATIVE_CLASS_GLOSS,
) -> dict[str, Any]:
    """Leave-one-signer-out cross-validation for one algorithm."""
    folds = leave_one_signer_out_folds(bundle)
    if not folds:
        return {
            "algorithm": key,
            "foldCount": 0,
            "meanMacroF1": None,
            "folds": [],
            "note": "No signer had enough data to form a leave-one-out fold.",
        }

    fold_reports: list[dict[str, Any]] = []
    scores: list[float] = []

    for signer, train_idx, test_idx in folds:
        try:
            estimator = build_candidate(key, seed=seed, class_count=len(bundle.classes))
            estimator.fit(bundle.x[train_idx], bundle.y[train_idx])
            result = evaluate(
                estimator,
                bundle.x[test_idx],
                bundle.y[test_idx],
                class_order=bundle.classes,
                sample_ids=bundle.sample_ids[test_idx],
                confidence_threshold=decision.confidence_threshold,
                negative_class=negative_class,
                latency_sample=None,
            )
        except Exception as exc:  # noqa: BLE001 - one bad fold must not kill the run
            fold_reports.append({"heldOutSigner": signer, "error": str(exc)})
            continue

        score = result.macro_f1_positive
        fold_reports.append(
            {
                "heldOutSigner": signer,
                "testFrames": int(test_idx.size),
                "macroF1Positive": score,
                "macroF1All": result.macro_f1_all,
                "accuracy": result.accuracy,
                "windowAccuracy": result.window_accuracy,
                "falseRejectRate": result.false_reject_rate,
            }
        )
        if score is not None:
            scores.append(score)

    mean = float(np.mean(scores)) if scores else None
    return {
        "algorithm": key,
        "foldCount": len(fold_reports),
        "scoredFoldCount": len(scores),
        "meanMacroF1": mean,
        "standardDeviation": float(np.std(scores)) if scores else None,
        "minimum": float(np.min(scores)) if scores else None,
        "maximum": float(np.max(scores)) if scores else None,
        "folds": fold_reports,
        "note": (
            "Mean macro F1 over positive classes, averaged across leave-one-signer-out folds. "
            "The spread across folds is the honest indicator of generalisation: a large gap "
            "between minimum and maximum means the model is signer-dependent."
        ),
    }


# ---------------------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Train and export a SignSpeak classifier.")
    parser.add_argument("--config", type=Path, help="Path to a YAML config file.")
    parser.add_argument(
        "--list-algorithms",
        action="store_true",
        help="Print the candidate algorithms and exit.",
    )
    parser.add_argument(
        "--stage-for-browser",
        action="store_true",
        help="Force-copy the exported model into public/models even if the config says not to.",
    )
    parser.add_argument(
        "--no-stage-for-browser",
        action="store_true",
        help="Never copy the exported model into public/models.",
    )
    args = parser.parse_args(argv)

    if args.list_algorithms:
        print("Candidate algorithms (ml/signdata/models.py):")
        for entry in describe_registry():
            flag = "exportable" if entry["exportable"] else "NOT EXPORTABLE"
            print(f"  {entry['key']:<20} [{flag}]")
            print(f"      {entry['description']}")
            if entry["notes"]:
                print(f"      {entry['notes']}")
        print()
        print(f"Exportable: {', '.join(exportable_keys())}")
        return 0

    if not args.config:
        parser.error("--config is required (or use --list-algorithms)")

    config = load_config(args.config)
    run_cfg = config.get("run") or {}
    data_cfg = config.get("data") or {}
    split_cfg = config.get("split") or {}
    training_cfg = config.get("training") or {}
    decision_cfg = config.get("decision") or {}
    reporting_cfg = config.get("reporting") or {}

    model_version = str(run_cfg.get("model_version", "sign-clf-v1"))
    artifact_dir = resolve_path(run_cfg.get("artifact_dir"), DEFAULT_ARTIFACT_DIR / model_version)
    artifact_dir.mkdir(parents=True, exist_ok=True)

    seed = int(training_cfg.get("seed", split_cfg.get("seed", 20260101)))
    verbose = bool(reporting_cfg.get("verbose", True))

    negative_class = str(data_cfg.get("negative_class", NEGATIVE_CLASS_GLOSS))
    decision = DecisionConfig(
        confidence_threshold=float(decision_cfg.get("confidence_threshold", 0.7)),
        margin_threshold=float(decision_cfg.get("margin_threshold", 0.2)),
        min_hand_score=float(decision_cfg.get("min_hand_score", 0.5)),
        window_size=int(decision_cfg.get("window_size", 5)),
        required_votes=int(decision_cfg.get("required_votes", 3)),
    )

    banner(f"SignSpeak training — {model_version}")
    info(f"Config: {args.config}")
    info(f"Artifacts: {artifact_dir}")
    info(f"Feature version: {FEATURE_VERSION}")

    # ---- dataset ------------------------------------------------------------------
    banner("1. Dataset")
    try:
        bundle, provenance, is_synthetic = assemble_dataset(config)
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001
        print(traceback.format_exc())
        print(f"\n[train] FAILED while assembling the dataset: {exc}")
        return 2

    summary = describe(bundle)
    info(f"Frames: {summary['frameCount']}")
    info(f"Recordings: {summary['sampleCount']}")
    info(f"Signers: {summary['signerCount']}")
    info(f"Classes ({len(summary['classes'])}): {', '.join(summary['classes']) or '(none)'}")

    findings = assess_quality(bundle)
    blocking = blockers(findings)
    if findings:
        print()
        for finding in findings:
            marker = "BLOCKER" if finding.severity == "blocker" else "warning"
            print(f"  [{marker}] {finding.code}: {finding.message}")

    if bundle.frame_count == 0:
        print()
        print("[train] There is nothing to train on. Stopping.")
        return 2

    not_for_real_use = is_synthetic or bool(blocking)
    if not_for_real_use:
        print()
        warn(
            "This model will be marked notForRealUse=true. "
            + ("It was trained on synthetic data. " if is_synthetic else "")
            + (f"{len(blocking)} dataset minimum(s) were not met. " if blocking else "")
        )
    else:
        info("Dataset meets every documented minimum. The model will be marked notForRealUse=false.")

    # ---- split --------------------------------------------------------------------
    banner("2. Held-out-signer split")
    split = split_held_out_signers(
        bundle,
        test_signer_count=int(split_cfg.get("test_signer_count", 2)),
        seed=int(split_cfg.get("seed", seed)),
    )
    info(f"Split kind: {split.kind}")
    info(split.note)
    if split.kind != "held-out-signer":
        warn("Metrics from this run are OPTIMISTIC. See the note above.")
    info(f"Train frames: {split.train_idx.size}, test frames: {split.test_idx.size}")

    # ---- candidate comparison -----------------------------------------------------
    banner("3. Candidate comparison (held-out signers)")
    requested = training_cfg.get("algorithms") or []
    candidates = list(requested) if requested else exportable_keys()
    for key in requested:
        if key not in exportable_keys():
            warn(
                f"'{key}' is not exportable and cannot be shipped. It will be trained and "
                "reported for comparison, but the shipped model will come from the best "
                "exportable candidate."
            )

    trained: dict[str, Any] = {}
    comparison: list[dict[str, Any]] = []
    for key in candidates:
        info(f"Training {key} ...")
        try:
            estimator, report = train_one(
                key, bundle, split, seed=seed, decision=decision, negative_class=negative_class
            )
        except Exception as exc:  # noqa: BLE001 - one bad candidate must not kill the run
            warn(f"{key} failed: {exc}")
            comparison.append({"key": key, "error": str(exc)})
            continue
        trained[key] = estimator
        comparison.append({k: v for k, v in report.items() if k != "evaluation"})
        score = report["macroF1Positive"]
        info(
            f"  {key}: macro F1 (signs) = "
            f"{'n/a' if score is None else f'{score:.4f}'}, "
            f"accuracy = {report['accuracy']:.4f}, "
            f"latency = {'n/a' if report['inferenceLatencyMs'] is None else f'{report['inferenceLatencyMs']:.3f} ms'}"
        )

    scored = [
        entry
        for entry in comparison
        if "error" not in entry and entry.get("macroF1Positive") is not None
    ]
    if not scored:
        print()
        print("[train] Every candidate failed or produced no score. Nothing to export.")
        return 2

    scored.sort(key=lambda entry: entry["macroF1Positive"], reverse=True)
    info("Ranking by held-out-signer macro F1 (signs only):")
    for position, entry in enumerate(scored, start=1):
        info(f"  {position}. {entry['key']}: {entry['macroF1Positive']:.4f}")

    exportable_scored = [entry for entry in scored if entry["key"] in exportable_keys()]
    if not exportable_scored:
        print()
        print("[train] No exportable candidate produced a score. Nothing to ship.")
        return 2

    winner_entry = exportable_scored[0]
    winner_key = winner_entry["key"]
    substituted = winner_key != scored[0]["key"]
    if substituted:
        warn(
            f"The best-scoring candidate was '{scored[0]['key']}' but it cannot be exported to "
            f"ONNX. Shipping '{winner_key}' instead, which scored "
            f"{winner_entry['macroF1Positive']:.4f}."
        )
    info(f"Selected algorithm: {winner_key}")

    winner = trained[winner_key]

    # Evaluate the winning estimator once more, so the report, the confusion matrix and
    # the metrics written into the model card all come from the exact object being
    # exported — not from a re-fit that could differ.
    winner_result = evaluate(
        winner,
        bundle.x[split.test_idx],
        bundle.y[split.test_idx],
        class_order=bundle.classes,
        sample_ids=bundle.sample_ids[split.test_idx],
        confidence_threshold=decision.confidence_threshold,
        negative_class=negative_class,
        latency_sample=bundle.x[split.test_idx][:1] if split.test_idx.size else bundle.x[:1],
    )

    # ---- LOSO ---------------------------------------------------------------------
    banner("4. Leave-one-signer-out cross-validation")
    loso: dict[str, Any] = {"algorithm": winner_key, "foldCount": 0, "meanMacroF1": None, "folds": []}
    if bool(split_cfg.get("run_loso", True)):
        info(f"Running LOSO for {winner_key} ...")
        loso = run_loso(bundle, winner_key, seed=seed, decision=decision)
        if loso["meanMacroF1"] is None:
            warn("LOSO produced no score.")
        else:
            info(
                f"Mean macro F1 across {loso['scoredFoldCount']} fold(s): "
                f"{loso['meanMacroF1']:.4f} "
                f"(min {loso['minimum']:.4f}, max {loso['maximum']:.4f})"
            )
            if loso["maximum"] is not None and loso["minimum"] is not None:
                spread = loso["maximum"] - loso["minimum"]
                if spread > 0.25:
                    warn(
                        f"The spread across signers is {spread:.2f}, which means the model "
                        "performs very differently for different people. Report this."
                    )
    else:
        info("LOSO disabled in the config.")

    # ---- metrics ------------------------------------------------------------------
    metrics = winner_result.to_metrics_json()
    metrics["losoMeanMacroF1"] = loso["meanMacroF1"]
    metrics["losoFoldCount"] = loso["scoredFoldCount"]
    metrics["losoStandardDeviation"] = loso.get("standardDeviation")
    metrics["losoMinimum"] = loso.get("minimum")
    metrics["losoMaximum"] = loso.get("maximum")
    metrics["splitKind"] = split.kind
    metrics["splitNote"] = split.note
    metrics["heldOutSigners"] = split.held_out_signers
    metrics["optimistic"] = split.kind != "held-out-signer"
    metrics["synthetic"] = is_synthetic

    # ---- export -------------------------------------------------------------------
    banner("5. ONNX export")
    onnx_path = artifact_dir / f"{model_version}.onnx"
    try:
        export_to_onnx(winner, onnx_path)
        info(f"Wrote {onnx_path.relative_to(REPO_ROOT)}")
    except Exception as exc:  # noqa: BLE001
        print()
        print(f"[train] EXPORT FAILED: {exc}")
        return 3

    try:
        verification = verify_onnx_agreement(winner, onnx_path, bundle.x[split.test_idx])
    except Exception as exc:  # noqa: BLE001
        print()
        print(f"[train] EXPORT VERIFICATION FAILED: {exc}")
        print("[train] The .onnx file has been left in place for inspection but must not be shipped.")
        return 4

    info(
        f"Verified against scikit-learn on {verification.checked_rows} row(s): "
        f"max absolute difference {verification.max_absolute_difference:.3e} "
        f"(tolerance {EXPORT_TOLERANCE:g})"
    )

    # ---- model card ---------------------------------------------------------------
    labels = {gloss: gloss for gloss in bundle.classes}
    if not is_synthetic:
        try:
            for entry in load_phrases_vocabulary(REPO_ROOT):
                gloss = str(entry.get("gloss", "")).upper().replace(" ", "_")
                if gloss in labels:
                    labels[gloss] = str(entry.get("label") or gloss)
        except Exception:  # noqa: BLE001 - labels are cosmetic
            pass

    trained_on = str(run_cfg.get("trained_on") or __import__("datetime").date.today().isoformat())
    card = build_model_card(
        model_version=model_version,
        algorithm=winner_key,
        vocabulary=bundle.classes,
        labels=labels,
        negative_class=negative_class if negative_class in bundle.classes else None,
        training_source="synthetic_smoke_test" if is_synthetic else "collected_consented_dataset",
        not_for_real_use=not_for_real_use,
        dataset=DatasetSummary(
            name=provenance.get("label", "collected") if is_synthetic else "signspeak-collected",
            version=str(provenance.get("seed", "1")) if is_synthetic else FEATURE_VERSION,
            signer_count=bundle.signer_count,
            sample_count=bundle.sample_count,
            per_class_counts=bundle.per_class_samples,
            manifest_hash=bundle.manifest_hash,
        ),
        metrics=metrics,
        decision=decision,
        limitations=default_limitations(
            not_for_real_use=not_for_real_use,
            classes=bundle.classes,
            negative_class=negative_class if negative_class in bundle.classes else None,
            signer_count=bundle.signer_count,
            window_accuracy=winner_result.window_accuracy,
        ),
        disclaimer=(
            "Smoke-test model trained on procedurally generated landmarks. It does not "
            "recognise sign language. It exists only to prove the pipeline works end to end."
            if is_synthetic
            else None
        ),
        trained_on=trained_on,
    )

    card_json = card.to_json()
    write_json(artifact_dir / "model-card.json", card_json)
    info(f"Wrote {(artifact_dir / 'model-card.json').relative_to(REPO_ROOT)}")

    # ---- reports ------------------------------------------------------------------
    banner("6. Results")
    report_text = summarise(winner_result, title=f"Held-out-signer evaluation — {winner_key}")
    print()
    print(report_text)

    print()
    print()
    for line in target_table(metrics):
        print(line)

    if loso["folds"]:
        print()
        print("Leave-one-signer-out folds")
        print("-" * 78)
        print(f"  {'held-out signer':<28} {'frames':>7} {'macroF1':>9} {'windowAcc':>10}")
        for fold in loso["folds"]:
            if "error" in fold:
                print(f"  {fold['heldOutSigner']:<28} {'-':>7} {'FAILED':>9} {'-':>10}  {fold['error']}")
                continue
            score = fold.get("macroF1Positive")
            window = fold.get("windowAccuracy")
            print(
                f"  {fold['heldOutSigner']:<28} {fold.get('testFrames', 0):>7} "
                f"{'n/a' if score is None else f'{score:>9.4f}'} "
                f"{'n/a' if window is None else f'{window:>10.4f}'}"
            )

    evaluation_path = artifact_dir / "evaluation.txt"
    evaluation_lines = [
        f"SignSpeak evaluation — {model_version}",
        f"Algorithm: {winner_key}",
        f"Config: {args.config}",
        f"Trained on: {trained_on}",
        f"notForRealUse: {not_for_real_use}",
        "",
        report_text,
        "",
        *target_table(metrics),
        "",
        "Candidate comparison",
        "-" * 78,
    ]
    for entry in comparison:
        if "error" in entry:
            evaluation_lines.append(f"  {entry['key']:<20} FAILED: {entry['error']}")
            continue
        score = entry.get("macroF1Positive")
        evaluation_lines.append(
            f"  {entry['key']:<20} macroF1={('n/a' if score is None else f'{score:.4f}')} "
            f"accuracy={entry.get('accuracy', 0):.4f} "
            f"latency={entry.get('inferenceLatencyMs')}"
        )
    evaluation_lines.append("")
    if split.kind != "held-out-signer":
        evaluation_lines.append(
            "!! METRICS ARE OPTIMISTIC: the split was not by signer. See the note below."
        )
        evaluation_lines.append(f"!! {split.note}")
        evaluation_lines.append("")
    evaluation_path.write_text("\n".join(evaluation_lines) + "\n", encoding="utf-8")
    info(f"Wrote {evaluation_path.relative_to(REPO_ROOT)}")

    run_report = {
        "modelVersion": model_version,
        "trainedOn": trained_on,
        "configFile": str(args.config),
        "config": config,
        "provenance": provenance,
        "synthetic": is_synthetic,
        "notForRealUse": not_for_real_use,
        "dataset": summary,
        "datasetFindings": [
            {"code": finding.code, "severity": finding.severity, "message": finding.message}
            for finding in findings
        ],
        "datasetWarnings": bundle.warnings,
        "split": {
            "kind": split.kind,
            "note": split.note,
            "heldOutSigners": split.held_out_signers,
            "trainFrames": int(split.train_idx.size),
            "testFrames": int(split.test_idx.size),
        },
        "candidateComparison": comparison,
        "selectedAlgorithm": winner_key,
        "substitutedForNonExportable": substituted,
        "topScoringAlgorithm": scored[0]["key"],
        "metrics": metrics,
        "loso": loso,
        "export": {
            "path": str(onnx_path),
            "maxAbsoluteDifference": verification.max_absolute_difference,
            "checkedRows": verification.checked_rows,
            "tolerance": EXPORT_TOLERANCE,
        },
        "modelCard": card_json,
    }
    if bool(reporting_cfg.get("write_json_report", True)):
        write_json(artifact_dir / "run-report.json", run_report)
        info(f"Wrote {(artifact_dir / 'run-report.json').relative_to(REPO_ROOT)}")

    # ---- staging ------------------------------------------------------------------
    stage = bool(run_cfg.get("stage_for_browser", False))
    if args.stage_for_browser:
        stage = True
    if args.no_stage_for_browser:
        stage = False

    if stage and not_for_real_use:
        warn(
            "Refusing to copy a notForRealUse model into public/models. That directory is "
            "what the app loads, and a smoke-test model must never be served as recognition. "
            "Pass --stage-for-browser to override deliberately."
        )
        stage = False

    if stage:
        staged_model, staged_card = stage_for_browser(
            onnx_path, card_json, public_model_dir=PUBLIC_MODEL_DIR, model_filename=f"{model_version}.onnx"
        )
        info(f"Staged {staged_model.relative_to(REPO_ROOT)}")
        info(f"Staged {staged_card.relative_to(REPO_ROOT)}")
        info("Point NEXT_PUBLIC_MODEL_URL at the staged .onnx file to use it in the app.")
    else:
        info("Not staged into public/models (see the run config).")

    banner("Done")
    if not_for_real_use:
        print(
            "This artefact is explicitly NOT for real use. It is recorded as such in "
            "model-card.json, and the application shows a banner when it loads it."
        )
    else:
        print("Remember: report the held-out-signer numbers, not the training numbers.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
