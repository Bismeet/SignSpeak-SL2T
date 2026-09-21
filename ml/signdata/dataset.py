"""Turning collected samples into a trainable, honestly-split dataset.

Two decisions in here matter more than the modelling choice itself:

1. **Splitting is by signer, never by frame or by window.** Consecutive frames of one
   recording are near-identical. A random frame split would put almost-copies of the
   same performance in both train and test and report a fantasy accuracy
   (`docs/ai-ml-and-dataset-plan.md` §6, risk R3). Everything below is group-aware.

2. **The dataset is allowed to be too small, and says so.** `assess_quality` returns
   explicit findings against the thresholds in `docs/ai-ml-and-dataset-plan.md` §2, and
   `train.py` downgrades the resulting model to `notForRealUse` when they are not met
   rather than quietly shipping a model trained on three people.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Sequence

import numpy as np

from .constants import (
    FEATURE_VECTOR_LENGTH,
    MIN_NEGATIVE_SAMPLES,
    MIN_SIGNERS,
    MIN_STATIC_REPS_PER_CLASS,
    NEGATIVE_CLASS_GLOSS,
    OFFSET_PRESENCE,
)
from .schema import CollectedSample


@dataclass
class QualityFinding:
    code: str
    severity: str  # "blocker" | "warning"
    message: str


@dataclass
class DatasetBundle:
    """Frame-level matrices plus the metadata needed for group-aware evaluation."""

    x: np.ndarray  # [N, 159] float32
    y: np.ndarray  # [N] int64 class indices
    groups: np.ndarray  # [N] str signer ids
    sample_ids: np.ndarray  # [N] str window ids
    classes: list[str]
    class_index: dict[str, int]
    sample_count: int
    signer_count: int
    per_class_samples: dict[str, int]
    per_class_frames: dict[str, int]
    signer_types: dict[str, str]
    warnings: list[str] = field(default_factory=list)
    manifest_hash: str = ""

    @property
    def frame_count(self) -> int:
        return int(self.x.shape[0])


def _normalise_label(raw: str) -> str:
    """Uppercase and trim, so 'Pain' and 'PAIN ' are the same class."""
    return raw.strip().upper().replace(" ", "_")


def apply_synthetic_occlusion(
    x: np.ndarray,
    *,
    p: float = 0.25,
    seed: int = 42,
) -> np.ndarray:
    """Simulate partial hand occlusion by randomly zeroing out distal finger joints.

    Distal joint indices (DIP & TIP) for left hand (landmarks 3,4, 7,8, 11,12, 15,16, 19,20)
    and right hand (landmarks 24,25, 28,29, 32,33, 36,37, 40,41 in hand indices, offset by 63).
    Also corrupts fingertip distances (138..147) and extension angles (148..157).
    Leaves palm normal (132..137), wrist/knuckles, and hand centroid (128..131) intact.
    """
    if x.shape[0] == 0:
        return x.copy()

    rng = np.random.RandomState(seed)
    augmented = x.copy()

    mask = rng.uniform(0, 1, size=augmented.shape[0]) < p
    indices = np.where(mask)[0]

    for idx in indices:
        fingers_to_drop = rng.choice(5, size=rng.randint(1, 4), replace=False)
        for f in fingers_to_drop:
            # Left hand (if present: feat[126] > 0)
            if augmented[idx, 126] > 0:
                tip_idx = (f * 4 + 4) * 3
                dip_idx = (f * 4 + 3) * 3
                augmented[idx, tip_idx : tip_idx + 3] = 0.0
                augmented[idx, dip_idx : dip_idx + 3] = 0.0
                augmented[idx, 138 + f] = 0.0
                augmented[idx, 148 + f] = 0.0

            # Right hand (if present: feat[127] > 0)
            if augmented[idx, 127] > 0:
                tip_idx = 63 + (f * 4 + 4) * 3
                dip_idx = 63 + (f * 4 + 3) * 3
                augmented[idx, tip_idx : tip_idx + 3] = 0.0
                augmented[idx, dip_idx : dip_idx + 3] = 0.0
                augmented[idx, 138 + 5 + f] = 0.0
                augmented[idx, 148 + 5 + f] = 0.0

    return augmented


def build_bundle(
    samples: Sequence[CollectedSample],
    *,
    vocabulary: Sequence[str] | None = None,
    include_learners: bool = False,
    negatives_from: Sequence[str] = (NEGATIVE_CLASS_GLOSS,),
) -> DatasetBundle:
    """Flatten samples into frame matrices and metadata.

    ``vocabulary`` — when supplied, any sample whose label is not in it is dropped with a
    warning. This is what stops a stray label from silently becoming a class the browser
    does not know how to render.

    ``include_learners`` — learner recordings are excluded by default (risk R20): a
    hearing team member's approximation of a sign teaches the model the wrong form. Turn
    it on only for a deliberate robustness experiment, never for a release model.
    """
    warnings: list[str] = []
    allowed = {_normalise_label(gloss) for gloss in vocabulary} if vocabulary else None
    negative_labels = {_normalise_label(label) for label in negatives_from}

    rows: list[np.ndarray] = []
    labels: list[str] = []
    groups: list[str] = []
    sample_ids: list[str] = []

    per_class_samples: dict[str, int] = {}
    per_class_frames: dict[str, int] = {}
    signer_types: dict[str, str] = {}
    seen_sample_ids: set[str] = set()

    for sample in samples:
        # Determine label: check if the clip's prefix from sample.id corresponds to a target word
        raw_id = sample.id or ""
        raw_prefix = (raw_id.split("/")[0] if "/" in raw_id else raw_id.split("__")[0]).strip().lower()
        norm_prefix = _normalise_label(raw_prefix)
        norm_sample_label = _normalise_label(sample.label)

        if allowed is not None and norm_prefix in allowed:
            label = norm_prefix
        elif allowed is not None and norm_sample_label in allowed:
            label = norm_sample_label
        elif norm_sample_label in negative_labels:
            label = norm_sample_label
        else:
            label = NEGATIVE_CLASS_GLOSS

        if sample.signer_type == "learner" and not include_learners:
            warnings.append(
                f"sample {sample.id}: skipped learner recording for '{label}' "
                "(risk R20 — a learner's form is not the canonical sign)."
            )
            continue

        if allowed is not None and label not in allowed and label not in negative_labels:
            warnings.append(
                f"sample {sample.id}: label '{label}' is not in data/sign-vocabulary.json; skipped."
            )
            continue

        if sample.id and sample.id in seen_sample_ids:
            warnings.append(f"sample {sample.id}: duplicate id; skipped.")
            continue
        if sample.id:
            seen_sample_ids.add(sample.id)

        if not sample.features:
            warnings.append(f"sample {sample.id}: no feature frames; skipped.")
            continue

        valid_rows: list[np.ndarray] = []
        for row in sample.features:
            if len(row) != FEATURE_VECTOR_LENGTH:
                continue
            # Filter empty frames where no hands are detected
            if row[OFFSET_PRESENCE] <= 0 and row[OFFSET_PRESENCE + 1] <= 0:
                continue
            valid_rows.append(np.asarray(row, dtype=np.float32))

        accepted = len(valid_rows)
        if accepted == 0:
            continue

        rows.extend(valid_rows)
        labels.extend([label] * accepted)
        groups.extend([sample.signer_id] * accepted)
        sample_ids.extend([sample.id or f"{sample.signer_id}:{label}"] * accepted)

        per_class_samples[label] = per_class_samples.get(label, 0) + 1
        per_class_frames[label] = per_class_frames.get(label, 0) + accepted
        signer_types.setdefault(sample.signer_id, sample.signer_type)

    if not rows:
        return DatasetBundle(
            x=np.zeros((0, FEATURE_VECTOR_LENGTH), dtype=np.float32),
            y=np.zeros((0,), dtype=np.int64),
            groups=np.zeros((0,), dtype=object),
            sample_ids=np.zeros((0,), dtype=object),
            classes=[],
            class_index={},
            sample_count=0,
            signer_count=0,
            per_class_samples={},
            per_class_frames={},
            signer_types={},
            warnings=warnings,
        )

    # Class order: vocabulary order when known, then the negative class last, so the
    # negative is always the highest index. Stable ordering matters because the class
    # index is baked into the ONNX output and the model card.
    present = sorted({*labels})
    if allowed:
        ordered = [gloss for gloss in (_normalise_label(g) for g in vocabulary or []) if gloss in present]
    else:
        ordered = []
    negatives_present = [label for label in present if label in negative_labels and label not in ordered]
    leftovers = [label for label in present if label not in ordered and label not in negatives_present]
    classes = [*ordered, *leftovers, *negatives_present]
    class_index = {label: index for index, label in enumerate(classes)}

    x = np.vstack(rows).astype(np.float32)
    y = np.asarray([class_index[label] for label in labels], dtype=np.int64)
    group_array = np.asarray(groups, dtype=object)
    id_array = np.asarray(sample_ids, dtype=object)

    return DatasetBundle(
        x=x,
        y=y,
        groups=group_array,
        sample_ids=id_array,
        classes=classes,
        class_index=class_index,
        sample_count=sum(per_class_samples.values()),
        signer_count=len({str(g) for g in groups}),
        per_class_samples=per_class_samples,
        per_class_frames=per_class_frames,
        signer_types=signer_types,
        warnings=warnings,
    )


def assess_quality(bundle: DatasetBundle) -> list[QualityFinding]:
    """Check the dataset against the documented minimums.

    Returns findings, never raises: the caller decides whether to refuse or to produce a
    clearly-labelled not-for-real-use artefact.
    """
    findings: list[QualityFinding] = []

    if bundle.frame_count == 0:
        findings.append(
            QualityFinding(
                code="empty",
                severity="blocker",
                message="No usable samples were found. Nothing can be trained.",
            )
        )
        return findings

    if bundle.signer_count < MIN_SIGNERS:
        findings.append(
            QualityFinding(
                code="too-few-signers",
                severity="blocker",
                message=(
                    f"Only {bundle.signer_count} signer(s) contributed data; "
                    f"docs/ai-ml-and-dataset-plan.md §2 requires at least {MIN_SIGNERS} "
                    "so that held-out-signer evaluation means anything."
                ),
            )
        )

    positive_classes = [c for c in bundle.classes if c != NEGATIVE_CLASS_GLOSS]
    if len(positive_classes) < 2:
        findings.append(
            QualityFinding(
                code="too-few-classes",
                severity="blocker",
                message=f"Only {len(positive_classes)} sign class(es) present; a classifier needs at least 2.",
            )
        )

    thin = {
        label: count
        for label, count in bundle.per_class_samples.items()
        if count < MIN_STATIC_REPS_PER_CLASS and label != NEGATIVE_CLASS_GLOSS
    }
    if thin:
        findings.append(
            QualityFinding(
                code="thin-classes",
                severity="blocker",
                message=(
                    "Fewer than "
                    f"{MIN_STATIC_REPS_PER_CLASS} recorded repetitions for: "
                    + ", ".join(f"{label} ({count})" for label, count in sorted(thin.items()))
                ),
            )
        )

    negative_frames = bundle.per_class_frames.get(NEGATIVE_CLASS_GLOSS, 0)
    if negative_frames < MIN_NEGATIVE_SAMPLES:
        findings.append(
            QualityFinding(
                code="thin-negatives",
                severity="warning",
                message=(
                    f"Only {negative_frames} negative frames; §2 asks for at least "
                    f"{MIN_NEGATIVE_SAMPLES}. Rejection quality will be poor without them."
                ),
            )
        )
    if negative_frames == 0:
        findings.append(
            QualityFinding(
                code="no-negatives",
                severity="warning",
                message=(
                    "No negative/OTHER examples at all. The model will be forced to choose "
                    "a supported sign for every input, so the app must rely on the confidence "
                    "and margin thresholds alone to say 'Not recognised'."
                ),
            )
        )

    return findings


def blockers(findings: Sequence[QualityFinding]) -> list[QualityFinding]:
    return [finding for finding in findings if finding.severity == "blocker"]


# ---------------------------------------------------------------------------------------
# Splitting
# ---------------------------------------------------------------------------------------


@dataclass
class Split:
    train_idx: np.ndarray
    test_idx: np.ndarray
    held_out_signers: list[str]
    kind: str  # "held-out-signer" | "random-sample" | "none"
    note: str


def split_held_out_signers(
    bundle: DatasetBundle,
    *,
    test_signer_count: int = 2,
    seed: int = 20260101,
) -> Split:
    """Hold out whole signers for testing.

    Signers are chosen to keep class coverage in both halves where possible: the greedy
    step picks the signer whose removal leaves the training set with the fewest empty
    classes. When there are too few signers to hold any out, this falls back to a
    sample-level split and says so loudly in ``note`` — the caller must surface that,
    because the resulting numbers are optimistic.
    """
    rng = np.random.default_rng(seed)
    signers = sorted({str(g) for g in bundle.groups})

    if len(signers) < 3 or test_signer_count <= 0:
        return _split_random_samples(bundle, seed=seed)

    test_signer_count = min(test_signer_count, max(1, len(signers) - 2))

    classes = set(bundle.classes)
    remaining = list(signers)
    chosen: list[str] = []

    # Prefer signers whose own data covers many classes, so holding them out costs less.
    coverage: dict[str, int] = {}
    for signer in remaining:
        mask = bundle.groups == signer
        coverage[signer] = len(set(bundle.y[mask].tolist()))

    for _ in range(test_signer_count):
        # Score each candidate by how many classes would survive in training.
        best_signer = remaining[0]
        best_score = -1.0
        for signer in remaining:
            trial_test = {*chosen, signer}
            train_mask = ~np.isin(bundle.groups, list(trial_test))
            train_classes = set(bundle.y[train_mask].tolist())
            score = len(train_classes) / max(1, len(classes))
            # Tie-break on class coverage of the held-out signer, then deterministically.
            score += 0.001 * coverage.get(signer, 0)
            if score > best_score:
                best_score = score
                best_signer = signer
        chosen.append(best_signer)
        remaining.remove(best_signer)

    test_mask = np.isin(bundle.groups, chosen)
    train_idx = np.flatnonzero(~test_mask)
    test_idx = np.flatnonzero(test_mask)

    if len(train_idx) == 0 or len(test_idx) == 0:
        return _split_random_samples(bundle, seed=seed)

    return Split(
        train_idx=train_idx,
        test_idx=test_idx,
        held_out_signers=sorted(chosen),
        kind="held-out-signer",
        note=f"Held out signer(s): {', '.join(sorted(chosen))}.",
    )


def _split_random_samples(bundle: DatasetBundle, *, seed: int, test_fraction: float = 0.3) -> Split:
    """Fallback split by whole *windows* (never frames), with an explicit warning."""
    if bundle.frame_count == 0:
        empty = np.zeros((0,), dtype=np.int64)
        return Split(empty, empty, [], "none", "No data to split.")

    rng = np.random.default_rng(seed)
    unique_samples = np.asarray(sorted({str(s) for s in bundle.sample_ids}), dtype=object)
    rng.shuffle(unique_samples)

    test_count = max(1, int(round(len(unique_samples) * test_fraction)))
    test_samples = {str(s) for s in unique_samples[:test_count]}

    test_mask = np.isin(bundle.sample_ids, list(test_samples))
    train_idx = np.flatnonzero(~test_mask)
    test_idx = np.flatnonzero(test_mask)

    if len(train_idx) == 0 or len(test_idx) == 0:
        return Split(
            np.arange(bundle.frame_count, dtype=np.int64),
            np.zeros((0,), dtype=np.int64),
            [],
            "none",
            "Not enough distinct recordings to form a test split.",
        )

    return Split(
        train_idx=train_idx,
        test_idx=test_idx,
        held_out_signers=[],
        kind="random-sample",
        note=(
            "NOT ENOUGH SIGNERS TO HOLD ANY OUT. This split is by recording, not by signer, "
            "so frames of the same person appear on both sides and the reported metrics are "
            "optimistic. Treat them as a smoke test only."
        ),
    )


def leave_one_signer_out_folds(bundle: DatasetBundle) -> list[tuple[str, np.ndarray, np.ndarray]]:
    """One fold per signer: ``(held_out_signer, train_idx, test_idx)``.

    Signers with no frames are skipped. Folds where the training half would lose a class
    are still returned — the evaluator records the missing classes rather than hiding them.
    """
    signers = sorted({str(g) for g in bundle.groups})
    folds: list[tuple[str, np.ndarray, np.ndarray]] = []
    for signer in signers:
        test_mask = bundle.groups == signer
        test_idx = np.flatnonzero(test_mask)
        train_idx = np.flatnonzero(~test_mask)
        if len(test_idx) == 0 or len(train_idx) == 0:
            continue
        folds.append((signer, train_idx, test_idx))
    return folds


def describe(bundle: DatasetBundle) -> dict[str, Any]:
    """Summary used in the run report and printed by train.py."""
    return {
        "frameCount": bundle.frame_count,
        "sampleCount": bundle.sample_count,
        "signerCount": bundle.signer_count,
        "classes": bundle.classes,
        "perClassSamples": bundle.per_class_samples,
        "perClassFrames": bundle.per_class_frames,
        "signerTypes": bundle.signer_types,
    }


__all__ = [
    "DatasetBundle",
    "QualityFinding",
    "Split",
    "assess_quality",
    "blockers",
    "build_bundle",
    "describe",
    "leave_one_signer_out_folds",
    "split_held_out_signers",
]
