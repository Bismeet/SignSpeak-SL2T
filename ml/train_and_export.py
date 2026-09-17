#!/usr/bin/env python
"""Train, evaluate and export ``sign-clf-v1`` from the extracted landmark samples.

Runs in the **training environment** (``ml/.venv``) — numpy<2, scikit-learn 1.4.2,
skl2onnx 1.17.0, protobuf 4.25.3. It reads the JSON samples produced by
``ml/extract_features.py``, so it never needs MediaPipe or numpy 2.

This is a thin driver over ``ml/signdata``. The feature contract, the ONNX export, the model
card and the browser staging all already exist and are tested there; reimplementing any of
them here would be the fastest way to make the shipped model disagree with the browser.

What it does
------------
1. Loads every sample under ``ml/data/isl-subset/samples``.
2. Builds a frame-level bundle: 4 signs plus the ``OTHER`` negative class.
3. Splits by **group** (source + clip label) and labels the result honestly.
4. Fits ``RandomForestClassifier(n_estimators=400, class_weight="balanced_subsample")``.
5. Evaluates on the held-out groups, then runs group-wise cross-validation for a spread.
6. Exports ONNX, verifies it agrees with scikit-learn row by row, and writes the model card.
7. Copies ``sign-clf-v1.onnx`` and ``model-card.json`` into ``public/models/``.

The honesty constraints this script enforces
--------------------------------------------
**The split is not signer-independent, and the card says so.** Only the ISL500 portion of the
source dataset carries real signer ids; INCLUDE uses per-video ids, CISLR uses word names and
ISLRTC has a single label. Grouping on source+clip stops a clip appearing on both sides, but
it cannot stop the same *person* doing so. ``split.kind`` is therefore recorded as
``held-out-group`` rather than ``held-out-signer``, which makes the pipeline mark every metric
``optimistic: true`` automatically (see ``lib/…`` and ``ml/scripts/train.py``).

**``notForRealUse`` stays true.** The card gate in ``lib/model/card.ts`` only clears a model
when ``trainingSource === "collected_consented_dataset"``. These clips are public research
data, not recordings collected under this project's own consent process, so the flag is set
and the app will show the model as not a real recogniser.

Usage
-----
    ml/.venv/Scripts/python ml/train_and_export.py
    ml/.venv/Scripts/python ml/train_and_export.py --no-loso        # skip cross-validation
    ml/.venv/Scripts/python ml/train_and_export.py --no-stage       # keep out of public/models
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from ml.signdata.constants import (  # noqa: E402
    FEATURE_VERSION,
    MIN_SIGNERS,
    MIN_STATIC_REPS_PER_CLASS,
    NEGATIVE_CLASS_GLOSS,
    TARGET_MACRO_F1,
    TARGET_PER_CLASS_RECALL,
)
from ml.signdata.dataset import (  # noqa: E402
    Split,
    assess_quality,
    blockers,
    build_bundle,
    describe,
    split_held_out_signers,
)
from ml.signdata.evaluation import evaluate, summarise  # noqa: E402
from ml.signdata.export import (  # noqa: E402
    build_model_card,
    default_limitations,
    export_to_onnx,
    stage_for_browser,
    verify_onnx_agreement,
)
from ml.signdata.io import find_sample_files, load_samples, sha256_of_json  # noqa: E402
from ml.signdata.models import build_candidate  # noqa: E402
from ml.signdata.schema import DatasetSummary, DecisionConfig  # noqa: E402

DEFAULT_DATA_DIR = REPO_ROOT / "ml" / "data" / "isl-subset"
DEFAULT_ARTIFACT_DIR = REPO_ROOT / "ml" / "artifacts" / "v1"
PUBLIC_MODEL_DIR = REPO_ROOT / "public" / "models"

#: The default vocabulary, chosen because it is the intersection of two lists that must agree:
#:
#:   * the words this dataset actually contains, and
#:   * the glosses in `data/sign-vocabulary.json`, which the app enforces.
#:
#: Only four of the app's sixteen published glosses exist in this dataset at all — WATER,
#: HELP, YES and NO. Everything else (PAIN, HEAD, STOMACH, CHEST, TOILET, MEDICINE, DOCTOR,
#: UNDERSTAND, FEVER, VOMIT, BREATHE, CALL_FAMILY) has zero clips. And the dataset's FOOD and
#: HOSPITAL are not published glosses, so a model using them is rejected by the browser as
#: incompatible before it can predict anything — correctly, since the app could not label or
#: explain the word.
DEFAULT_WORDS: tuple[str, ...] = ("help", "water", "yes", "no")

#: Human-facing labels for the words above. Falls back to the tidied gloss.
WORD_LABELS: dict[str, str] = {
    "help": "help",
    "water": "water",
    "yes": "yes",
    "no": "no",
}

#: Words a caller might reasonably ask for that cannot be trained, and why. Written into the
#: manifest and the model card so the gap is visible rather than silent.
UNAVAILABLE_WORDS: dict[str, str] = {
    "stop": (
        "Excluded: 4 clips total, 1 flagged 'Needs Manual Review', leaving 3 usable clips "
        "from 2 sources with no signer identity (CISLR hash, ISLRTC dictionary). Too few to "
        "train, and the source is dictionary-style rather than in-the-wild signing."
    ),
    "food": (
        "Excluded: the dataset has 17 'food' clips, but FOOD is not a gloss in "
        "data/sign-vocabulary.json. A model predicting it is rejected by the browser as "
        "incompatible, because the app has no label or phrase for the word."
    ),
    "hospital": (
        "Excluded: the dataset has 21 'hospital' clips (all from INCLUDE), but HOSPITAL is "
        "not a published gloss. Same incompatibility as FOOD."
    ),
}

MODEL_VERSION = "sign-clf-v1"
ALGORITHM = "random_forest"
#: Must match the `ModelTrainingSource` union in lib/types.ts. `public_dataset` exists there
#: precisely so this case can be stated without claiming the data is synthetic.
TRAINING_SOURCE = "public_dataset"
DATASET_ID = "vidit031/isl-isolated-40words"

#: Filled in from --words in main().
VOCABULARY: tuple[str, ...] = ()
LABELS: dict[str, str] = {}

DISCLAIMER = (
    "Trained on public Indian Sign Language research clips (ISL500, INCLUDE, CISLR, ISLRTC) "
    "for a 4-sign vocabulary. It is not a clinical device, has not been reviewed by a "
    "qualified ISL signer, and its evaluation is not signer-independent."
)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train and export sign-clf-v1.")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--artifacts", type=Path, default=DEFAULT_ARTIFACT_DIR)
    parser.add_argument(
        "--words",
        default=",".join(DEFAULT_WORDS),
        help="comma-separated signs to train (default: %(default)s)",
    )
    parser.add_argument("--seed", type=int, default=20260101)
    parser.add_argument(
        "--test-groups", type=int, default=8, help="groups held out for the test split"
    )
    parser.add_argument("--no-loso", action="store_true", help="skip group-wise cross-validation")
    parser.add_argument("--no-stage", action="store_true", help="do not copy into public/models")
    return parser.parse_args(argv)


def banner(text: str) -> None:
    print()
    print("=" * 78)
    print(text)
    print("=" * 78)


def honest_group_split(bundle, *, test_group_count: int, seed: int) -> Split:
    """Hold out whole groups — and make sure every class is actually tested.

    Two things this fixes over a plain group split.

    **Class coverage.** Picking groups by "what keeps training healthy" alone held out only
    ISL500 signers, because those cover the most classes. But `hospital` exists solely in the
    INCLUDE portion, so it appeared in *no* test frame and dropped silently out of the
    headline metric — a class excluded from evaluation without anything saying so. Selection
    here starts from the classes that need covering and picks a group for each.

    **Honest labelling.** The selection is still not a signer split. Only ISL500 carries real
    signer ids; INCLUDE uses per-video ids, CISLR uses word names and ISLRTC has one label.
    The kind is recorded as `held-out-group`, which makes every downstream metric optimistic.
    """
    groups = sorted({str(g) for g in bundle.groups})
    classes = list(bundle.classes)

    def classes_in(group: str) -> set[int]:
        return set(bundle.y[bundle.groups == group].tolist())

    chosen: list[str] = []

    # 1. Cover every class at least once in the test half.
    uncovered = set(range(len(classes)))
    while uncovered and len(chosen) < test_group_count:
        best_group = None
        best_gain = 0
        for group in groups:
            if group in chosen:
                continue
            gain = len(classes_in(group) & uncovered)
            if gain > best_gain:
                best_gain, best_group = gain, group
        if best_group is None or best_gain == 0:
            break
        chosen.append(best_group)
        uncovered -= classes_in(best_group)

    # 2. Top up to the requested count, preferring groups whose removal leaves training with
    #    the most classes intact.
    remaining = [group for group in groups if group not in chosen]
    while len(chosen) < test_group_count and remaining:
        best_group = None
        best_score = -1.0
        for group in remaining:
            trial = set(chosen) | {group}
            train_mask = ~np.isin(bundle.groups, list(trial))
            score = len(set(bundle.y[train_mask].tolist())) / max(1, len(classes))
            if score > best_score:
                best_score, best_group = score, group
        if best_group is None:
            break
        chosen.append(best_group)
        remaining.remove(best_group)

    test_mask = np.isin(bundle.groups, chosen)
    train_idx = np.flatnonzero(~test_mask)
    test_idx = np.flatnonzero(test_mask)

    if train_idx.size == 0 or test_idx.size == 0:
        # Fall back rather than report a metric computed on nothing.
        base = split_held_out_signers(bundle, test_signer_count=test_group_count, seed=seed)
        return Split(
            train_idx=base.train_idx,
            test_idx=base.test_idx,
            held_out_signers=base.held_out_signers,
            kind="held-out-group",
            note="Fallback split: too few groups to hold out. Treat every metric as optimistic.",
        )

    # Report any class that ended up in only one half — the caller must not have to guess.
    train_classes = set(bundle.y[train_idx].tolist())
    test_classes = set(bundle.y[test_idx].tolist())
    notes = [
        f"Held out {len(chosen)} group(s) keyed on source + clip label "
        f"({', '.join(sorted(chosen)[:6])}{'…' if len(chosen) > 6 else ''}).",
        "NOT signer-independent: only ISL500 carries real signer ids, so the same person may "
        "appear in both halves. Every metric here is optimistic.",
    ]
    missing_from_test = [classes[i] for i in sorted(set(range(len(classes))) - test_classes)]
    missing_from_train = [classes[i] for i in sorted(set(range(len(classes))) - train_classes)]
    if missing_from_test:
        notes.append(f"NOT EVALUATED (no test frames): {', '.join(missing_from_test)}.")
    if missing_from_train:
        notes.append(f"NOT TRAINED (no training frames): {', '.join(missing_from_train)}.")

    return Split(
        train_idx=train_idx,
        test_idx=test_idx,
        held_out_signers=sorted(chosen),
        kind="held-out-group",
        note=" ".join(notes),
    )


def run_group_folds(bundle, algorithm: str, *, seed: int, decision: DecisionConfig) -> dict:
    """Leave-one-group-out cross-validation, for a spread rather than a single number."""
    groups = sorted({str(g) for g in bundle.groups})
    folds = []
    scores = []
    for index, group in enumerate(groups):
        test_mask = bundle.groups == group
        train_idx = np.flatnonzero(~test_mask)
        test_idx = np.flatnonzero(test_mask)
        if train_idx.size == 0 or test_idx.size == 0:
            continue
        train_classes = set(bundle.y[train_idx].tolist())
        if len(train_classes) < 2:
            continue
        estimator = build_candidate(algorithm, seed=seed + index, class_count=len(bundle.classes))
        estimator.fit(bundle.x[train_idx], bundle.y[train_idx])
        result = evaluate(
            estimator,
            bundle.x[test_idx],
            bundle.y[test_idx],
            class_order=bundle.classes,
            sample_ids=bundle.sample_ids[test_idx],
            confidence_threshold=decision.confidence_threshold,
            negative_class=NEGATIVE_CLASS_GLOSS,
        )
        if result.macro_f1_all is not None:
            folds.append({"group": group, "macroF1": float(result.macro_f1_all), "frames": int(test_idx.size)})
            scores.append(float(result.macro_f1_all))

    if not scores:
        return {"foldCount": 0, "meanMacroF1": None, "folds": []}
    return {
        "foldCount": len(scores),
        "meanMacroF1": float(np.mean(scores)),
        "standardDeviation": float(np.std(scores)),
        "minimum": float(np.min(scores)),
        "maximum": float(np.max(scores)),
        "folds": folds,
    }


def published_vocabulary() -> set[str]:
    """The glosses the app will accept, from `data/sign-vocabulary.json`.

    The browser checks a model's classes against this list and marks the model
    `incompatible` if any is missing (see `lib/signs/vocabulary.ts`). Training a vocabulary
    outside it produces an ONNX file the app silently refuses to use, so it is checked here
    rather than discovered after a twenty-minute run.
    """
    path = REPO_ROOT / "data" / "sign-vocabulary.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return set()
    signs = payload.get("signs") or []
    return {str(entry.get("gloss", "")).strip().upper() for entry in signs if entry.get("gloss")}


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    words = tuple(w.strip().lower() for w in args.words.split(",") if w.strip())
    if not words:
        print("[train] --words selected no signs")
        return 2

    global VOCABULARY, LABELS
    VOCABULARY = (*words, NEGATIVE_CLASS_GLOSS)
    LABELS = {w: WORD_LABELS.get(w, w.upper()) for w in words}
    LABELS[NEGATIVE_CLASS_GLOSS] = "not one of these signs"

    # Refuse a vocabulary the browser would reject. The negative class is exempt: it is not a
    # sign, and the app excludes it from the same check.
    published = published_vocabulary()
    if published:
        unpublished = [w for w in words if w.upper() not in published]
        if unpublished:
            print()
            print(f"[train] REFUSING: {', '.join(unpublished).upper()} are not in the published")
            print("        SignSpeak vocabulary (data/sign-vocabulary.json), so the browser")
            print("        would mark the exported model 'incompatible' and never use it.")
            print()
            print(f"        published: {', '.join(sorted(published))}")
            print()
            print("        Choose signs from that list, or add the gloss after ISL expert review.")
            for word in unpublished:
                if word in UNAVAILABLE_WORDS:
                    print(f"        {word}: {UNAVAILABLE_WORDS[word]}")
            return 2
        for word in words:
            if word in UNAVAILABLE_WORDS:
                print(f"[train] note: {UNAVAILABLE_WORDS[word]}")

    data_dir = args.data_dir.resolve()
    samples_dir = data_dir / "samples"
    artifact_dir = args.artifacts.resolve()
    artifact_dir.mkdir(parents=True, exist_ok=True)

    banner("1. Load samples")
    paths = find_sample_files(samples_dir)
    if not paths:
        print(f"[train] no sample files under {samples_dir}")
        print("[train] run: npm run ml:download && npm run ml:extract")
        return 2
    samples, warnings = load_samples(paths)
    print(f"[train] {len(samples)} sample file(s), {len(warnings)} warning(s)")
    for warning in warnings[:10]:
        print(f"    {warning}")

    banner("2. Build the frame-level bundle")
    bundle = build_bundle(samples, vocabulary=VOCABULARY, negatives_from=(NEGATIVE_CLASS_GLOSS,))
    summary = describe(bundle)
    print(json.dumps(summary, indent=2, default=str))
    for warning in bundle.warnings[:10]:
        print(f"    {warning}")

    if bundle.frame_count == 0:
        print("[train] bundle is empty; nothing to train")
        return 2

    findings = assess_quality(bundle)
    hard_blockers = blockers(findings)
    print()
    print(f"[train] quality findings: {len(findings)} ({len(hard_blockers)} blocking)")
    for finding in findings:
        mark = "BLOCK" if finding in hard_blockers else "note "
        print(f"    [{mark}] {finding.message}")

    banner("3. Split")
    split = honest_group_split(bundle, test_group_count=args.test_groups, seed=args.seed)
    print(f"[train] kind: {split.kind}")
    print(f"[train] note: {split.note}")
    print(f"[train] train frames: {split.train_idx.size} | test frames: {split.test_idx.size}")
    if split.test_idx.size == 0:
        print("[train] the split produced no test frames; refusing to report a metric")
        return 2

    decision = DecisionConfig()
    banner("4. Train")
    estimator = build_candidate(ALGORITHM, seed=args.seed, class_count=len(bundle.classes))
    print(f"[train] {type(estimator).__name__} {estimator.get_params()}")
    started = time.time()
    estimator.fit(bundle.x[split.train_idx], bundle.y[split.train_idx])
    print(f"[train] fitted in {time.time() - started:.1f}s")

    banner("5. Held-out evaluation")
    result = evaluate(
        estimator,
        bundle.x[split.test_idx],
        bundle.y[split.test_idx],
        class_order=bundle.classes,
        sample_ids=bundle.sample_ids[split.test_idx],
        confidence_threshold=decision.confidence_threshold,
        negative_class=NEGATIVE_CLASS_GLOSS,
        latency_sample=bundle.x[split.test_idx][:1],
    )
    print(summarise(result, title="Held-out groups (optimistic)"))

    loso: dict = {"foldCount": 0, "meanMacroF1": None}
    if not args.no_loso:
        banner("6. Group-wise cross-validation")
        loso = run_group_folds(bundle, ALGORITHM, seed=args.seed, decision=decision)
        if loso["meanMacroF1"] is None:
            print("[train] no scored folds")
        else:
            print(
                f"[train] mean macro F1 over {loso['foldCount']} fold(s): "
                f"{loso['meanMacroF1']:.4f} "
                f"(min {loso['minimum']:.4f}, max {loso['maximum']:.4f})"
            )
            spread = loso["maximum"] - loso["minimum"]
            if spread > 0.25:
                print(
                    f"[train] WARNING: spread across groups is {spread:.2f}. The model behaves "
                    "very differently depending on who is signing. Report this."
                )

    banner("7. ONNX export")
    onnx_path = artifact_dir / f"{MODEL_VERSION}.onnx"
    try:
        export_to_onnx(estimator, onnx_path)
    except Exception as error:  # noqa: BLE001
        print(f"[train] EXPORT FAILED: {error}")
        return 3
    print(f"[train] wrote {onnx_path.relative_to(REPO_ROOT)}")

    try:
        verification = verify_onnx_agreement(estimator, onnx_path, bundle.x[split.test_idx])
    except Exception as error:  # noqa: BLE001
        print(f"[train] EXPORT VERIFICATION FAILED: {error}")
        print("[train] the .onnx file is left in place for inspection but must not be shipped")
        return 4
    print(
        f"[train] verified against scikit-learn on {verification.checked_rows} row(s), "
        f"max delta {verification.max_absolute_difference:.3e}"
    )

    banner("8. Model card")
    metrics = result.to_metrics_json()
    metrics["losoMeanMacroF1"] = loso.get("meanMacroF1")
    metrics["losoFoldCount"] = loso.get("foldCount")
    metrics["losoStandardDeviation"] = loso.get("standardDeviation")
    metrics["losoMinimum"] = loso.get("minimum")
    metrics["losoMaximum"] = loso.get("maximum")
    metrics["splitKind"] = split.kind
    metrics["splitNote"] = split.note
    metrics["heldOutSigners"] = split.held_out_signers
    # Derived, not asserted: a non-signer split makes every number optimistic.
    metrics["optimistic"] = split.kind != "held-out-signer"
    metrics["synthetic"] = False

    per_class_frames = Counter()
    for label, count in bundle.per_class_frames.items():
        per_class_frames[label] = count

    dataset_summary = DatasetSummary(
        name=DATASET_ID,
        version=manifest_version(data_dir),
        signer_count=int(bundle.signer_count),
        sample_count=int(bundle.sample_count),
        per_class_counts={k: int(v) for k, v in bundle.per_class_samples.items()},
        manifest_hash=sha256_of_json(summary),
    )

    card = build_model_card(
        model_version=MODEL_VERSION,
        algorithm=ALGORITHM,
        vocabulary=list(VOCABULARY),
        labels=dict(LABELS),
        negative_class=NEGATIVE_CLASS_GLOSS,
        training_source=TRAINING_SOURCE,
        # Cannot be cleared: the gate in lib/model/card.ts requires
        # trainingSource === 'collected_consented_dataset', and this is public research data.
        not_for_real_use=True,
        dataset=dataset_summary,
        metrics=metrics,
        decision=decision,
        limitations=build_limitations(bundle, metrics, result),
        disclaimer=DISCLAIMER,
    )
    card_json = card.to_json()
    card_path = artifact_dir / "model-card.json"
    card_path.write_text(json.dumps(card_json, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[train] wrote {card_path.relative_to(REPO_ROOT)}")

    run_report = {
        "modelVersion": MODEL_VERSION,
        "trainedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "featureVersion": FEATURE_VERSION,
        "algorithm": ALGORITHM,
        "trainingSource": TRAINING_SOURCE,
        "notForRealUse": True,
        "vocabulary": list(VOCABULARY),
        "bundle": summary,
        "qualityFindings": [f.message for f in findings],
        "blockingFindings": [f.message for f in hard_blockers],
        "split": {
            "kind": split.kind,
            "note": split.note,
            "trainFrames": int(split.train_idx.size),
            "testFrames": int(split.test_idx.size),
            "heldOutGroups": split.held_out_signers,
        },
        "metrics": metrics,
        "loso": loso,
        "onnxVerification": {
            "checkedRows": verification.checked_rows,
            "maxAbsoluteDifference": verification.max_absolute_difference,
        },
        "thresholds": {
            "minSigners": MIN_SIGNERS,
            "minStaticRepsPerClass": MIN_STATIC_REPS_PER_CLASS,
            "targetMacroF1": TARGET_MACRO_F1,
            "targetPerClassRecall": TARGET_PER_CLASS_RECALL,
            "signerCount": int(bundle.signer_count),
        },
        "loadWarnings": warnings,
    }
    report_path = artifact_dir / "run-report.json"
    report_path.write_text(json.dumps(run_report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[train] wrote {report_path.relative_to(REPO_ROOT)}")

    banner("9. Acceptance targets (reported, never asserted)")
    print_targets(metrics, bundle)

    if args.no_stage:
        print()
        print("[train] --no-stage: leaving public/models untouched")
        return 0

    banner("10. Stage for the browser")
    staged_model, staged_card = stage_for_browser(
        onnx_path, card_json, public_model_dir=PUBLIC_MODEL_DIR, model_filename=f"{MODEL_VERSION}.onnx"
    )
    print(f"[train] {staged_model.relative_to(REPO_ROOT)}")
    print(f"[train] {staged_card.relative_to(REPO_ROOT)}")
    print()
    print("[train] NOTE: the card sets notForRealUse=true, so the app will load this model but")
    print("        label it as not a real recogniser. That is the intended, honest outcome.")
    return 0


def manifest_version(data_dir: Path) -> str:
    """A stable version string for the dataset, from the manifest's own content."""
    manifest_path = data_dir / "manifest.json"
    if not manifest_path.exists():
        return "unknown"
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return "unknown"
    counts = payload.get("counts", {})
    return f"{counts.get('positives', '?')}pos-{counts.get('negatives', '?')}neg"


def build_limitations(bundle, metrics: dict, result) -> list[str]:
    """The generated limitation list, plus the ones specific to this dataset.

    ``default_limitations`` is used for the shared, model-derived entries. It is called with
    the training source so its ``notForRealUse`` sentence describes this model accurately —
    the default wording assumes a synthetic smoke test, which would be false here.
    """
    limitations = default_limitations(
        not_for_real_use=True,
        classes=bundle.classes,
        negative_class=NEGATIVE_CLASS_GLOSS,
        signer_count=int(bundle.signer_count),
        window_accuracy=metrics.get("windowAccuracy"),
        # The card's own `trainingSource` field must stay the bare `public_dataset` value,
        # because that is the union member lib/types.ts declares. The limitation sentence
        # wants the dataset named, so it is given the qualified form.
        training_source=f"{TRAINING_SOURCE}:{DATASET_ID}",
    )
    limitations.extend(
        [
            "The evaluation is NOT signer-independent. Only the ISL500 portion of the source "
            "data carries real signer identifiers; INCLUDE uses per-video ids, CISLR uses word "
            "names and ISLRTC has a single label. Clips are grouped so none spans the split, "
            "but the same person may appear on both sides. Treat every metric as optimistic.",
            "The 'stop' sign is not supported by this model. It was excluded because the source "
            "dataset holds only 4 clips for it, one of them flagged for manual review, from two "
            "sources with no signer identity — too few to train, and a different recording "
            "domain from the rest.",
            "Training clips come from four different corpora with different cameras, framing and "
            "recording conditions. The 'hospital' sign comes from INCLUDE and the others mostly "
            "from ISL500, so the model may be picking up source-specific cues rather than the "
            "sign itself.",
            "No qualified ISL signer has reviewed this model's vocabulary or its predictions. "
            "The signs it claims to know have not been checked against ISL by a fluent signer.",
        ]
    )
    return limitations


def print_targets(metrics: dict, bundle) -> None:
    """Print the acceptance targets from the testing plan against what was measured."""
    macro = metrics.get("heldOutSignerMacroF1") or metrics.get("macroF1AllClasses")
    per_class = metrics.get("perClassRecall") or {}
    weakest = min(per_class.values()) if per_class else None

    def line(name: str, value, target, higher_is_better: bool = True) -> None:
        if value is None:
            print(f"  {name:34s} {target:>14s}  NOT MEASURED")
            return
        met = value >= target if higher_is_better else value <= target
        print(f"  {name:34s} {target:>14.4f}  {value:.4f}  {'MET' if met else 'NOT MET'}")

    print(f"  {'metric':34s} {'target':>14s}  measured")
    line("held-out macro F1", macro, TARGET_MACRO_F1)
    line("weakest per-class recall", weakest, TARGET_PER_CLASS_RECALL)
    print(f"  {'signer/group count':34s} {MIN_SIGNERS:>14d}  {bundle.signer_count:4d}"
          f"  {'MET' if bundle.signer_count >= MIN_SIGNERS else 'NOT MET'}")
    print()
    print("  These targets were written for signer-independent evaluation on collected data.")
    print("  This model meets neither condition, so the comparison above is informational only.")


if __name__ == "__main__":
    raise SystemExit(main())
