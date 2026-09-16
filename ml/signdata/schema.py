"""Dataclasses mirroring the JSON contracts in ``lib/types.ts``.

These exist so the pipeline fails loudly on malformed input instead of silently training
on a partially-parsed record. Validation here is deliberately stricter than the browser's
(a browser must render *something*; an offline pipeline must refuse to produce a model
from bad data).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping

from .constants import FEATURE_VECTOR_LENGTH

# ---------------------------------------------------------------------------------------
# Collected samples (output of app/collect, input to training)
# ---------------------------------------------------------------------------------------


@dataclass
class SampleConditions:
    lighting: str = "bright"
    background: str = "plain"
    distance: str = "medium"
    pose: str = "sitting"
    handedness: str = "right"


@dataclass
class CollectedSample:
    """One recorded window of frames for one sign, from one signer.

    Mirrors ``CollectedSample`` in ``lib/types.ts``. ``features`` is ``[T][159]`` — landmarks
    only, never pixels. That is the whole point of the privacy design: the training set
    contains no images, so it cannot be used to identify anyone.
    """

    id: str
    signer_id: str
    signer_type: str
    label: str
    session: str
    captured_at: str
    conditions: SampleConditions
    tool_version: str
    frame_count: int
    features: list[list[float]]

    @staticmethod
    def from_json(raw: Any) -> "CollectedSample":
        if not isinstance(raw, Mapping):
            raise ValueError("sample must be a JSON object")

        features_raw = raw.get("features")
        if not isinstance(features_raw, list):
            raise ValueError(f"sample {raw.get('id')!r}: 'features' must be a list")

        features: list[list[float]] = []
        for index, row in enumerate(features_raw):
            if not isinstance(row, list):
                raise ValueError(f"sample {raw.get('id')!r}: features[{index}] is not a list")
            if len(row) != FEATURE_VECTOR_LENGTH:
                raise ValueError(
                    f"sample {raw.get('id')!r}: features[{index}] has {len(row)} values, "
                    f"expected {FEATURE_VECTOR_LENGTH}"
                )
            features.append([float(value) for value in row])

        conditions_raw = raw.get("conditions")
        conditions = SampleConditions()
        if isinstance(conditions_raw, Mapping):
            conditions = SampleConditions(
                lighting=str(conditions_raw.get("lighting", "bright")),
                background=str(conditions_raw.get("background", "plain")),
                distance=str(conditions_raw.get("distance", "medium")),
                pose=str(conditions_raw.get("pose", "sitting")),
                handedness=str(conditions_raw.get("handedness", "right")),
            )

        label = str(raw.get("label", "")).strip()
        if not label:
            raise ValueError(f"sample {raw.get('id')!r}: 'label' is empty")

        signer_id = str(raw.get("signerId", raw.get("signer_id", ""))).strip()
        if not signer_id:
            raise ValueError(f"sample {raw.get('id')!r}: 'signerId' is empty")

        signer_type = str(raw.get("signerType", raw.get("signer_type", "fluent"))).strip()
        if signer_type not in ("fluent", "learner"):
            signer_type = "fluent"

        return CollectedSample(
            id=str(raw.get("id", "")),
            signer_id=signer_id,
            signer_type=signer_type,
            label=label,
            session=str(raw.get("session", "")),
            captured_at=str(raw.get("capturedAt", raw.get("captured_at", ""))),
            conditions=conditions,
            tool_version=str(raw.get("toolVersion", raw.get("tool_version", ""))),
            frame_count=int(raw.get("frameCount", raw.get("frame_count", len(features)))),
            features=features,
        )


# ---------------------------------------------------------------------------------------
# Model card (written by train.py, read by the browser)
# ---------------------------------------------------------------------------------------


@dataclass
class DatasetSummary:
    name: str
    version: str
    signer_count: int
    sample_count: int
    per_class_counts: dict[str, int]
    manifest_hash: str

    def to_json(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "version": self.version,
            "signerCount": self.signer_count,
            "sampleCount": self.sample_count,
            "perClassCounts": self.per_class_counts,
            "manifestHash": self.manifest_hash,
        }


@dataclass
class DecisionConfig:
    confidence_threshold: float = 0.7
    margin_threshold: float = 0.2
    min_hand_score: float = 0.5
    window_size: int = 5
    required_votes: int = 3

    def to_json(self) -> dict[str, Any]:
        return {
            "confidenceThreshold": self.confidence_threshold,
            "marginThreshold": self.margin_threshold,
            "minHandScore": self.min_hand_score,
            "smoothing": {
                "windowSize": self.window_size,
                "requiredVotes": self.required_votes,
            },
        }


@dataclass
class ModelCard:
    """Mirrors ``ModelCard`` in ``lib/types.ts``. Field names are camelCase in JSON."""

    model_version: str
    trained_on: str
    algorithm: str
    feature_version: str
    vocabulary: list[str]
    labels: dict[str, str]
    negative_class: str | None
    training_source: str
    not_for_real_use: bool
    dataset: DatasetSummary
    metrics: dict[str, Any] | None
    decision: DecisionConfig
    limitations: list[str]
    disclaimer: str | None = None

    def to_json(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "schemaVersion": 1,
            "modelVersion": self.model_version,
            "trainedOn": self.trained_on,
            "algorithm": self.algorithm,
            "featureVersion": self.feature_version,
            "inputDim": FEATURE_VECTOR_LENGTH,
            "vocabulary": self.vocabulary,
            "labels": self.labels,
            "negativeClass": self.negative_class,
            "trainingSource": self.training_source,
            "notForRealUse": self.not_for_real_use,
            "dataset": self.dataset.to_json(),
            "metrics": self.metrics,
            "decision": self.decision.to_json(),
            "limitations": self.limitations,
        }
        if self.disclaimer is not None:
            payload["disclaimer"] = self.disclaimer
        return payload


# ---------------------------------------------------------------------------------------
# Fixture file (build_fixtures.py -> tests/features-parity.test.ts)
# ---------------------------------------------------------------------------------------


@dataclass
class ParityCase:
    name: str
    description: str
    frame: dict[str, Any]
    expected_vector: list[float]
    expected_hand_count: int
    expected_best_hand_score: float

    def to_json(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "frame": self.frame,
            "expectedVector": self.expected_vector,
            "expectedHandCount": self.expected_hand_count,
            "expectedBestHandScore": self.expected_best_hand_score,
        }


@dataclass
class ParityFixture:
    feature_version: str
    generator: str
    tolerance: float
    cases: list[ParityCase] = field(default_factory=list)

    def to_json(self) -> dict[str, Any]:
        return {
            "featureVersion": self.feature_version,
            "generator": self.generator,
            "tolerance": self.tolerance,
            "cases": [case.to_json() for case in self.cases],
        }


__all__ = [
    "CollectedSample",
    "DatasetSummary",
    "DecisionConfig",
    "ModelCard",
    "ParityCase",
    "ParityFixture",
    "SampleConditions",
]
