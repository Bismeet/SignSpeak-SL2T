"""Evaluation: metrics that mean something, computed the way the app behaves.

Three things in here are deliberate and worth reading before you quote any number:

1. **Macro F1 is reported twice.** Once over all classes and once over the *positive*
   (non-negative) classes. The positive-only figure is the headline, because a model can
   get a flattering overall score purely by being good at the `OTHER` class while being
   mediocre at the signs a patient actually needs.

2. **False accept / false reject are computed through the real decision rule**, not from
   raw argmax. The browser accepts a prediction only when the top class is not `OTHER`
   *and* its probability clears the confidence threshold (`lib/vision/decision.ts`). FAR
   and FRR are only comparable to `docs/testing-and-evaluation.md` §2.2 if they are
   measured after that gate.

3. **Window accuracy is reported alongside frame accuracy.** A patient holds a sign for
   roughly a second; the app shows one word per stable hold. Frame accuracy flatters a
   model that flickers between correct labels, so the number that matches the user
   experience is the per-window majority vote.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Sequence

import numpy as np
from sklearn.metrics import confusion_matrix, f1_score, precision_recall_fscore_support

from .constants import NEGATIVE_CLASS_GLOSS


@dataclass
class EvaluationResult:
    class_order: list[str]
    confusion: np.ndarray
    macro_f1_all: float
    macro_f1_positive: float | None
    per_class_recall: dict[str, float]
    per_class_precision: dict[str, float]
    per_class_f1: dict[str, float]
    support: dict[str, int]
    accuracy: float
    false_accept_rate: float | None
    false_reject_rate: float | None
    window_accuracy: float | None
    window_count: int
    inference_latency_ms: float | None
    confidence_threshold: float
    negative_class: str | None
    notes: list[str] = field(default_factory=list)

    def to_metrics_json(self) -> dict[str, Any]:
        """Shape expected by ``ModelMetrics`` in lib/types.ts, plus extras."""
        return {
            # --- fields the browser reads ---
            "heldOutSignerMacroF1": self.macro_f1_positive,
            "losoMeanMacroF1": None,  # filled in by train.py from the LOSO run
            "perClassRecall": self.per_class_recall,
            "falseAcceptRate": self.false_accept_rate,
            "falseRejectRate": self.false_reject_rate,
            "seenSignerAccuracy": self.accuracy,
            "confusionMatrix": self.confusion.astype(int).tolist(),
            "classOrder": self.class_order,
            "inferenceLatencyMs": self.inference_latency_ms,
            # --- extra context, preserved by parseModelCard ---
            "macroF1AllClasses": self.macro_f1_all,
            "macroF1PositiveClasses": self.macro_f1_positive,
            "perClassPrecision": self.per_class_precision,
            "perClassF1": self.per_class_f1,
            "support": self.support,
            "windowAccuracy": self.window_accuracy,
            "windowCount": self.window_count,
            "confidenceThresholdUsed": self.confidence_threshold,
            "negativeClass": self.negative_class,
            "metricNotes": self.notes,
        }


def _positive_mask(class_order: Sequence[str], negative_class: str | None) -> np.ndarray:
    return np.asarray([label != negative_class for label in class_order], dtype=bool)


def measure_inference_latency(
    estimator: Any,
    sample: np.ndarray,
    *,
    repeats: int = 200,
) -> float | None:
    """Median single-row latency in milliseconds, measured the way the app calls it.

    One row at a time, because that is what the browser does per frame. Warm-up runs are
    discarded so the first-call cost (lazy allocation, JIT) does not distort the figure.
    """
    if sample.size == 0:
        return None
    row = sample[:1]

    def _predict() -> None:
        if hasattr(estimator, "predict_proba"):
            estimator.predict_proba(row)
        else:
            estimator.predict(row)

    for _ in range(5):
        _predict()

    timings: list[float] = []
    for _ in range(repeats):
        start = time.perf_counter()
        _predict()
        timings.append((time.perf_counter() - start) * 1000.0)

    if not timings:
        return None
    return float(np.median(timings))


def evaluate(
    estimator: Any,
    x: np.ndarray,
    y: np.ndarray,
    *,
    class_order: Sequence[str],
    sample_ids: np.ndarray | None = None,
    confidence_threshold: float = 0.7,
    negative_class: str | None = NEGATIVE_CLASS_GLOSS,
    latency_sample: np.ndarray | None = None,
) -> EvaluationResult:
    """Full evaluation of a fitted estimator on a labelled set."""
    notes: list[str] = []
    classes = list(class_order)
    labels = np.arange(len(classes), dtype=np.int64)

    if x.shape[0] == 0:
        empty = np.zeros((len(classes), len(classes)), dtype=np.int64)
        return EvaluationResult(
            class_order=classes,
            confusion=empty,
            macro_f1_all=0.0,
            macro_f1_positive=None,
            per_class_recall={},
            per_class_precision={},
            per_class_f1={},
            support={},
            accuracy=0.0,
            false_accept_rate=None,
            false_reject_rate=None,
            window_accuracy=None,
            window_count=0,
            inference_latency_ms=None,
            confidence_threshold=confidence_threshold,
            negative_class=negative_class,
            notes=["No test rows; nothing was evaluated."],
        )

    probabilities = _probabilities(estimator, x)
    predictions = np.argmax(probabilities, axis=1)

    # Restrict to classes that actually occur, but keep the declared order for the matrix.
    present = sorted(set(y.tolist()) | set(predictions.tolist()))
    present_labels = [label for label in labels if label in present]
    present_names = [classes[label] for label in present_labels]

    if len(present_labels) < len(labels):
        missing = [classes[label] for label in labels if label not in present]
        notes.append(
            "These declared classes had no test rows and were excluded from the confusion "
            f"matrix: {', '.join(missing)}. Their per-class metrics are 0 by definition."
        )

    confusion = confusion_matrix(y, predictions, labels=present_labels)

    macro_f1_all = float(
        f1_score(y, predictions, labels=present_labels, average="macro", zero_division=0)
    )
    precision, recall, f1, support = precision_recall_fscore_support(
        y, predictions, labels=present_labels, zero_division=0
    )

    per_class_recall: dict[str, float] = {}
    per_class_precision: dict[str, float] = {}
    per_class_f1: dict[str, float] = {}
    support_map: dict[str, int] = {}
    for position, name in enumerate(present_names):
        per_class_recall[name] = float(recall[position])
        per_class_precision[name] = float(precision[position])
        per_class_f1[name] = float(f1[position])
        support_map[name] = int(support[position])
    # Declared but absent classes: record 0.0 rather than omitting, so the UI can show
    # "never tested" as an explicit zero instead of an unexplained gap.
    for label, name in enumerate(classes):
        if name not in per_class_recall:
            per_class_recall[name] = 0.0
            per_class_precision[name] = 0.0
            per_class_f1[name] = 0.0
            support_map[name] = 0

    positive = _positive_mask(classes, negative_class)
    positive_present = [label for label in present_labels if positive[label]]
    if positive_present:
        macro_f1_positive = float(
            f1_score(y, predictions, labels=positive_present, average="macro", zero_division=0)
        )
    else:
        macro_f1_positive = None
        notes.append("No positive (non-negative) classes in the test set; macro F1 is undefined.")

    accuracy = float((predictions == y).mean())

    false_accept_rate, false_reject_rate = _acceptance_rates(
        y, probabilities, predictions, classes, confidence_threshold, negative_class
    )

    window_accuracy, window_count = _window_accuracy(
        predictions, y, sample_ids, negative_class=negative_class
    )

    latency = measure_inference_latency(estimator, latency_sample if latency_sample is not None else x)

    return EvaluationResult(
        class_order=classes,
        confusion=confusion,
        macro_f1_all=macro_f1_all,
        macro_f1_positive=macro_f1_positive,
        per_class_recall=per_class_recall,
        per_class_precision=per_class_precision,
        per_class_f1=per_class_f1,
        support=support_map,
        accuracy=accuracy,
        false_accept_rate=false_accept_rate,
        false_reject_rate=false_reject_rate,
        window_accuracy=window_accuracy,
        window_count=window_count,
        inference_latency_ms=latency,
        confidence_threshold=confidence_threshold,
        negative_class=negative_class,
        notes=notes,
    )


def _probabilities(estimator: Any, x: np.ndarray) -> np.ndarray:
    if hasattr(estimator, "predict_proba"):
        return np.asarray(estimator.predict_proba(x), dtype=np.float64)
    # SVC without probability=True: fall back to one-hot of the decision. Marked in notes
    # by the caller, because a one-hot probability makes FAR/FRR meaningless.
    predictions = np.asarray(estimator.predict(x)).astype(np.int64)
    class_count = int(predictions.max()) + 1 if predictions.size else 1
    out = np.zeros((predictions.shape[0], class_count), dtype=np.float64)
    out[np.arange(predictions.shape[0]), predictions] = 1.0
    return out


def _acceptance_rates(
    y: np.ndarray,
    probabilities: np.ndarray,
    predictions: np.ndarray,
    classes: Sequence[str],
    confidence_threshold: float,
    negative_class: str | None,
) -> tuple[float | None, float | None]:
    """FAR and FRR after the browser's accept/reject gate.

    ``accepted`` mirrors ``decide()`` in lib/vision/decision.ts: the top class must not be
    the negative class, and its probability must clear the confidence threshold.
    """
    if probabilities.shape[0] == 0:
        return None, None

    top_probability = probabilities[np.arange(probabilities.shape[0]), predictions]
    is_negative_prediction = np.asarray(
        [classes[index] == negative_class for index in predictions], dtype=bool
    )
    accepted = (~is_negative_prediction) & (top_probability >= confidence_threshold)

    if negative_class is None:
        # Without a negative class we cannot measure false accepts at all. Say so.
        false_accept_rate = None
    else:
        negative_index = classes.index(negative_class) if negative_class in classes else None
        if negative_index is None:
            false_accept_rate = None
        else:
            truly_negative = y == negative_index
            denominator = int(truly_negative.sum())
            false_accept_rate = (
                float(accepted[truly_negative].sum()) / denominator if denominator > 0 else None
            )

    truly_positive = np.asarray(
        [classes[index] != negative_class for index in y], dtype=bool
    )
    positive_denominator = int(truly_positive.sum())
    false_reject_rate = (
        float((~accepted[truly_positive]).sum()) / positive_denominator
        if positive_denominator > 0
        else None
    )

    return false_accept_rate, false_reject_rate


def _window_accuracy(
    predictions: np.ndarray,
    y: np.ndarray,
    sample_ids: np.ndarray | None,
    *,
    negative_class: str | None,
) -> tuple[float | None, int]:
    """Majority vote per recording window, then compare to the window's true label."""
    if sample_ids is None or len(sample_ids) == 0:
        return None, 0

    correct = 0
    total = 0
    for sample_id in dict.fromkeys(str(value) for value in sample_ids):
        mask = sample_ids == sample_id
        if not mask.any():
            continue
        window_predictions = predictions[mask]
        window_truth = y[mask]
        if window_truth.size == 0:
            continue
        counts = np.bincount(window_predictions)
        majority = int(np.argmax(counts))
        # The window's true label is the modal ground truth (a window has one label by
        # construction; this is defensive against a malformed export).
        truth_counts = np.bincount(window_truth)
        truth = int(np.argmax(truth_counts))
        total += 1
        if majority == truth:
            correct += 1

    if total == 0:
        return None, 0
    return correct / total, total


def summarise(result: EvaluationResult, *, title: str = "Evaluation") -> str:
    """A plain-text report, printed to stdout and saved next to the model."""
    lines: list[str] = []
    lines.append(title)
    lines.append("=" * len(title))
    lines.append(f"Classes ({len(result.class_order)}): {', '.join(result.class_order)}")
    lines.append(f"Negative class: {result.negative_class or '(none)'}")
    lines.append(f"Confidence threshold used for accept/reject: {result.confidence_threshold}")
    lines.append("")
    lines.append(f"Frame accuracy            : {result.accuracy:.4f}")
    if result.window_accuracy is not None:
        lines.append(
            f"Window accuracy (majority) : {result.window_accuracy:.4f}  "
            f"over {result.window_count} recording(s)"
        )
    lines.append(f"Macro F1 (all classes)     : {result.macro_f1_all:.4f}")
    if result.macro_f1_positive is not None:
        lines.append(f"Macro F1 (signs only)      : {result.macro_f1_positive:.4f}   <- headline")
    else:
        lines.append("Macro F1 (signs only)      : n/a")
    if result.false_accept_rate is not None:
        lines.append(f"False accept rate          : {result.false_accept_rate:.4f}")
    else:
        lines.append("False accept rate          : n/a (no negative class)")
    if result.false_reject_rate is not None:
        lines.append(f"False reject rate          : {result.false_reject_rate:.4f}")
    else:
        lines.append("False reject rate          : n/a")
    if result.inference_latency_ms is not None:
        lines.append(f"Median per-frame latency   : {result.inference_latency_ms:.3f} ms")
    lines.append("")
    lines.append("Per class:")
    header = f"  {'class':<16} {'precision':>10} {'recall':>10} {'f1':>10} {'support':>8}"
    lines.append(header)
    for name in result.class_order:
        lines.append(
            f"  {name:<16} {result.per_class_precision.get(name, 0.0):>10.4f} "
            f"{result.per_class_recall.get(name, 0.0):>10.4f} "
            f"{result.per_class_f1.get(name, 0.0):>10.4f} "
            f"{result.support.get(name, 0):>8}"
        )
    lines.append("")
    lines.append("Confusion matrix (rows = true, columns = predicted):")
    present = [index for index in range(len(result.class_order))]
    column_names = [result.class_order[index] for index in present]
    lines.append("  " + " " * 16 + " ".join(f"{name[:6]:>7}" for name in column_names))
    for row_index, row in enumerate(result.confusion):
        true_name = result.class_order[row_index] if row_index < len(result.class_order) else "?"
        lines.append("  " + f"{true_name:<16}" + " ".join(f"{int(value):>7}" for value in row))
    if result.notes:
        lines.append("")
        lines.append("Notes:")
        for note in result.notes:
            lines.append(f"  - {note}")
    return "\n".join(lines)


__all__ = ["EvaluationResult", "evaluate", "measure_inference_latency", "summarise"]
