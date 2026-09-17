"""ONNX export and model-card writing.

The export is not finished when the file is written. `verify_onnx_agreement` reloads the
exported graph and compares it against the fitted scikit-learn estimator on real rows. If
they disagree beyond a small tolerance the export is rejected, because shipping an ONNX
graph that behaves differently from the model we measured would make every metric in the
model card a lie.
"""

from __future__ import annotations

import datetime as _dt
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

import numpy as np

from .constants import (
    FEATURE_VECTOR_LENGTH,
    FEATURE_VERSION,
    NEGATIVE_CLASS_GLOSS,
)
from .schema import DatasetSummary, DecisionConfig, ModelCard

#: ONNX opset. 17 is comfortably supported by onnxruntime-web 1.20 and skl2onnx 1.17.
TARGET_OPSET = 17

#: Maximum acceptable absolute difference between the ONNX graph and scikit-learn.
#: Probabilities, so this is a percentage point of probability — 1e-4 is far below any
#: threshold we use (the smallest gap between decision thresholds is 0.05).
EXPORT_TOLERANCE = 1e-4


@dataclass
class ExportResult:
    onnx_path: Path
    max_absolute_difference: float
    checked_rows: int


def _build_options(estimator: Any) -> dict[int, dict[str, Any]]:
    """Turn off skl2onnx's ZipMap so the graph emits a plain probability tensor.

    ZipMap returns a list of dictionaries, which onnxruntime-web cannot consume as a
    numeric tensor. Both the pipeline and its final step are given the option because
    skl2onnx resolves options against whichever object it is converting.
    """
    options: dict[int, dict[str, Any]] = {id(estimator): {"zipmap": False}}
    steps = getattr(estimator, "steps", None)
    if steps:
        final_step = steps[-1][1]
        options[id(final_step)] = {"zipmap": False}
    return options


def _describe_export_failure(exc: BaseException) -> str:
    """Turn an exporter failure into something a human can act on.

    skl2onnx wraps the real reason in a message that dumps every node attribute — for a
    400-tree forest that runs to tens of thousands of lines, which buries the one line
    that matters. The underlying cause is short, so prefer it.
    """
    cause = exc.__cause__
    detail = (str(cause) if cause is not None else str(exc)).strip()
    if len(detail) > 600:
        detail = f"{detail[:600]} …(truncated)"

    combined = f"{detail} {exc}"
    if "Expected an int, got a boolean" in combined or "AttributeProto.ints" in combined:
        # Named explicitly because the symptom is cryptic and the fix is a dependency pin.
        return (
            f"Could not convert this estimator to ONNX: {detail}. This is the known "
            "skl2onnx/protobuf incompatibility: protobuf 5+ rejects the boolean attribute "
            "values that skl2onnx 1.17.0 emits for tree ensembles. Reinstall the pinned "
            "dependency set with `npm run ml:setup` (it pins protobuf==4.25.3)."
        )

    return (
        f"Could not convert this estimator to ONNX: {detail}. "
        "Only exportable algorithms listed by `train.py --list-algorithms` can be shipped; "
        "check ml/signdata/models.py."
    )


def export_to_onnx(
    estimator: Any,
    destination: Path,
    *,
    input_name: str = "features",
) -> Path:
    """Convert a fitted estimator to ONNX and write it to ``destination``."""
    from skl2onnx import convert_sklearn
    from skl2onnx.common.data_types import FloatTensorType

    initial_types = [(input_name, FloatTensorType([None, FEATURE_VECTOR_LENGTH]))]

    try:
        onnx_model = convert_sklearn(
            estimator,
            initial_types=initial_types,
            options=_build_options(estimator),
            target_opset=TARGET_OPSET,
        )
    except Exception as exc:  # noqa: BLE001 - re-raised with actionable context
        raise RuntimeError(_describe_export_failure(exc)) from exc

    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(onnx_model.SerializeToString())
    return destination


def _probability_output_name(session: Any) -> str:
    """Pick the probability tensor out of a classifier graph's outputs.

    A skl2onnx classifier exposes two outputs: the predicted label (rank 1, shape ``[N]``)
    and the class probabilities (rank 2, shape ``[N, C]``). Blindly taking
    ``get_outputs()[0]`` grabs the label tensor, and the verification then compares a vector
    of class indices against a probability matrix and fails for entirely the wrong reason.
    """
    outputs = list(session.get_outputs())
    if not outputs:
        raise RuntimeError("The exported ONNX graph has no outputs to verify.")
    # Highest rank wins: probabilities are [N, C], labels are [N].
    return max(outputs, key=lambda output: len(output.shape or [])).name


def verify_onnx_agreement(
    estimator: Any,
    onnx_path: Path,
    sample_rows: np.ndarray,
    *,
    tolerance: float = EXPORT_TOLERANCE,
) -> ExportResult:
    """Compare the exported graph against scikit-learn on real feature rows.

    Raises ``RuntimeError`` when the two disagree. A silent mismatch here would mean the
    browser runs a different model from the one whose metrics are in the model card.
    """
    import onnxruntime as ort

    if sample_rows.size == 0:
        raise RuntimeError("Cannot verify an ONNX export without sample rows.")

    rows = np.asarray(sample_rows, dtype=np.float32)[: min(256, sample_rows.shape[0])]
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    output_name = _probability_output_name(session)

    onnx_output = session.run([output_name], {input_name: rows})[0]
    onnx_probabilities = np.asarray(onnx_output, dtype=np.float64)
    if onnx_probabilities.ndim == 3:
        # Some exporters emit [N, C, 1]; squeeze the trailing axis.
        onnx_probabilities = onnx_probabilities.reshape(onnx_probabilities.shape[0], -1)

    if hasattr(estimator, "predict_proba"):
        sklearn_probabilities = np.asarray(estimator.predict_proba(rows), dtype=np.float64)
    else:
        raise RuntimeError(
            "The estimator has no predict_proba, so its ONNX output cannot be verified. "
            "Refusing to export a model whose probabilities are unverifiable."
        )

    if onnx_probabilities.shape != sklearn_probabilities.shape:
        raise RuntimeError(
            "The exported graph produces a different shape from scikit-learn: "
            f"{onnx_probabilities.shape} vs {sklearn_probabilities.shape} "
            f"(read from ONNX output {output_name!r}; available outputs: "
            f"{[output.name for output in session.get_outputs()]})."
        )

    max_difference = float(np.max(np.abs(onnx_probabilities - sklearn_probabilities)))
    if max_difference > tolerance:
        raise RuntimeError(
            "The exported ONNX graph disagrees with the fitted model "
            f"(max absolute difference {max_difference:.6g} > tolerance {tolerance:g}). "
            "The export has been rejected rather than shipped."
        )

    return ExportResult(
        onnx_path=onnx_path,
        max_absolute_difference=max_difference,
        checked_rows=int(rows.shape[0]),
    )


# ---------------------------------------------------------------------------------------
# Model card
# ---------------------------------------------------------------------------------------


def default_limitations(
    *,
    not_for_real_use: bool,
    classes: Sequence[str],
    negative_class: str | None,
    signer_count: int,
    window_accuracy: float | None,
    training_source: str = "",
) -> list[str]:
    """The limitation list written into every model card.

    This is generated rather than hand-written so it cannot drift from what the model
    actually is. The browser renders it verbatim on the Limitations screen.
    """
    limitations: list[str] = []

    if not_for_real_use:
        # Why a model is not for real use differs, and stating the wrong reason is itself a
        # false claim. A smoke test was never trained on sign language at all; a model trained
        # on a public research dataset *was* trained on real ISL recordings — it simply was not
        # collected under this project's own consent process, and nobody has signer-reviewed it.
        # The earlier wording asserted the synthetic case unconditionally, which would have
        # been untrue for the first model trained on real data.
        if training_source == "public_dataset" or training_source.startswith("public_dataset:"):
            dataset_id = training_source.split(":", 1)[1] if ":" in training_source else "a public research corpus"
            limitations.append(
                "This model is not for real use. It was trained on real Indian Sign Language "
                f"recordings from the public research dataset '{dataset_id}', but that data was "
                "not collected under this project's own consent process, no qualified ISL signer "
                "has reviewed its vocabulary or its predictions, and its evaluation is not "
                "signer-independent. It must never be used to communicate with a patient."
            )
        else:
            limitations.append(
                "This model is a pipeline smoke test. It was not trained on real ISL recordings "
                "and must never be used to communicate with a patient."
            )

    limitations.append(
        f"Trained on {len(classes)} classes only: {', '.join(classes)}. "
        "Any other sign is outside the model's knowledge and must be rejected, not guessed."
    )

    if negative_class is None:
        limitations.append(
            "No negative/OTHER class was trained, so the model is forced to choose a supported "
            "sign for every input. Rejection relies entirely on the confidence and margin "
            "thresholds, which is weaker than an explicit negative class."
        )

    limitations.append(
        "Recognition uses hand and shoulder landmarks only. ISL signs that depend on facial "
        "expression, mouth patterns, head movement or eye gaze cannot be recognised, because "
        "those non-manual markers are not in the feature vector."
    )
    limitations.append(
        "One-handed and two-handed signs are handled, but heavy occlusion (hands crossing or "
        "behind the body) degrades MediaPipe's hand detection and therefore the prediction."
    )
    limitations.append(
        "The classifier is frame-based. Signs that depend on the *path* of movement over time "
        "are only partially captured, through per-frame pose, and are expected to be weaker."
    )

    if signer_count < 6:
        limitations.append(
            f"Only {signer_count} signer(s) contributed to training. The model has not been "
            "shown enough variation in hand size, skin tone, signing speed or regional "
            "dialect to generalise. Held-out-signer results are not representative."
        )

    if window_accuracy is not None:
        limitations.append(
            f"Measured window accuracy was {window_accuracy:.2f} on the test split. "
            "This is not a clinical accuracy figure and does not transfer to unseen signers."
        )

    limitations.append(
        "This is not a medical device and has not been clinically validated. It does not "
        "replace a qualified ISL interpreter, and it must never be used for emergency "
        "communication without a human present."
    )

    return limitations


def build_model_card(
    *,
    model_version: str,
    algorithm: str,
    vocabulary: Sequence[str],
    labels: dict[str, str],
    negative_class: str | None,
    training_source: str,
    not_for_real_use: bool,
    dataset: DatasetSummary,
    metrics: dict[str, Any] | None,
    decision: DecisionConfig,
    limitations: Sequence[str],
    disclaimer: str | None = None,
    trained_on: str | None = None,
) -> ModelCard:
    return ModelCard(
        model_version=model_version,
        trained_on=trained_on or _dt.date.today().isoformat(),
        algorithm=algorithm,
        feature_version=FEATURE_VERSION,
        vocabulary=list(vocabulary),
        labels=dict(labels),
        negative_class=negative_class,
        training_source=training_source,
        not_for_real_use=not_for_real_use,
        dataset=dataset,
        metrics=metrics,
        decision=decision,
        limitations=list(limitations),
        disclaimer=disclaimer,
    )


def stage_for_browser(
    onnx_path: Path,
    card_json: dict[str, Any],
    *,
    public_model_dir: Path,
    model_filename: str = "sign-clf-v1.onnx",
    card_filename: str = "model-card.json",
) -> tuple[Path, Path]:
    """Copy the exported artefacts into ``public/models`` so the browser can load them.

    Deliberately a copy, not a move: the artefact directory is the record of what was
    trained, and the public directory is what gets deployed. They are allowed to diverge
    while you are experimenting.
    """
    import shutil

    from .io import write_json

    public_model_dir.mkdir(parents=True, exist_ok=True)
    staged_model = public_model_dir / model_filename
    shutil.copyfile(onnx_path, staged_model)

    staged_card = public_model_dir / card_filename
    write_json(staged_card, card_json)
    return staged_model, staged_card


__all__ = [
    "EXPORT_TOLERANCE",
    "TARGET_OPSET",
    "ExportResult",
    "build_model_card",
    "default_limitations",
    "export_to_onnx",
    "stage_for_browser",
    "verify_onnx_agreement",
]
