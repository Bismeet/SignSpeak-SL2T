"""Candidate classifiers and the honest-selection rule.

The choice of algorithm is *not* the interesting part of this project. What matters is
that we report what actually happened: the registry below lists every candidate with
whether it can be exported to ONNX, and `train.py` only ever ships an exportable winner.

`svm_rbf` is included because it is a strong baseline and worth reporting, but it is
marked non-exportable. scikit-learn's probability calibration for SVC is implemented
outside the fitted estimator's arithmetic, and skl2onnx does not reproduce it reliably.
Rather than ship an ONNX graph whose outputs differ from the model we measured, we keep
SVM as an offline comparison and refuse to export it. That is a deliberate trade of
convenience for integrity (`docs/ai-ml-and-dataset-plan.md` §5).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from sklearn.base import BaseEstimator
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC


@dataclass
class Candidate:
    key: str
    description: str
    exportable: bool
    build: Callable[[int, int], BaseEstimator]
    #: Rough guidance for the run report, not a promise.
    notes: str = ""


def _knn(seed: int, _classes: int) -> BaseEstimator:
    # Distance weighting matters here: without it, a class with more recorded frames
    # dominates its neighbours. StandardScaler is required because kNN is scale-sensitive
    # and our features mix radians (0..3.14) with normalised distances (0..~3).
    return Pipeline(
        [
            ("scale", StandardScaler()),
            ("clf", KNeighborsClassifier(n_neighbors=7, weights="distance", metric="euclidean")),
        ]
    )


def _random_forest(seed: int, _classes: int) -> BaseEstimator:
    return RandomForestClassifier(
        n_estimators=400,
        max_depth=None,
        min_samples_leaf=2,
        class_weight="balanced_subsample",
        n_jobs=-1,
        random_state=seed,
    )


def _mlp(seed: int, _classes: int) -> BaseEstimator:
    return Pipeline(
        [
            ("scale", StandardScaler()),
            (
                "clf",
                MLPClassifier(
                    hidden_layer_sizes=(256, 128),
                    activation="relu",
                    solver="adam",
                    alpha=1e-4,
                    learning_rate_init=1e-3,
                    batch_size=128,
                    max_iter=400,
                    early_stopping=True,
                    n_iter_no_change=20,
                    validation_fraction=0.15,
                    random_state=seed,
                ),
            ),
        ]
    )


def _logistic(seed: int, _classes: int) -> BaseEstimator:
    return Pipeline(
        [
            ("scale", StandardScaler()),
            (
                "clf",
                LogisticRegression(
                    max_iter=2000,
                    C=1.0,
                    class_weight="balanced",
                    multi_class="multinomial",
                    random_state=seed,
                ),
            ),
        ]
    )


def _svm_rbf(seed: int, _classes: int) -> BaseEstimator:
    return Pipeline(
        [
            ("scale", StandardScaler()),
            ("clf", SVC(C=10.0, gamma="scale", kernel="rbf", class_weight="balanced", random_state=seed)),
        ]
    )


#: Registry order is the order candidates are tried. The first exportable candidate with
#: the best held-out-signer macro F1 wins.
CANDIDATES: tuple[Candidate, ...] = (
    Candidate(
        key="knn",
        description="k-nearest neighbours (k=7, distance-weighted) on standardised features",
        exportable=True,
        build=_knn,
        notes="Cheap, no training, and a good sanity check. Weak when signers vary a lot.",
    ),
    Candidate(
        key="random_forest",
        description="Random forest, 400 trees, balanced subsample weights",
        exportable=True,
        build=_random_forest,
        notes="Handles mixed feature scales without preprocessing and exports as an ONNX tree ensemble.",
    ),
    Candidate(
        key="logistic_regression",
        description="Multinomial logistic regression on standardised features",
        exportable=True,
        build=_logistic,
        notes="A linear model: if this matches the forest, the task is easier than expected.",
    ),
    Candidate(
        key="mlp",
        description="Multi-layer perceptron (256, 128), Adam, early stopping",
        exportable=True,
        build=_mlp,
        notes="Usually the strongest option for landmark features, and exports as plain matmuls.",
    ),
    Candidate(
        key="svm_rbf",
        description="RBF-kernel SVM (offline comparison only)",
        exportable=False,
        build=_svm_rbf,
        notes=(
            "NOT EXPORTABLE. Reported for comparison; train.py will never ship it, because "
            "its calibrated probabilities are not faithfully reproduced in ONNX."
        ),
    ),
)

CANDIDATE_INDEX: dict[str, Candidate] = {candidate.key: candidate for candidate in CANDIDATES}


def build_candidate(key: str, *, seed: int, class_count: int) -> BaseEstimator:
    candidate = CANDIDATE_INDEX.get(key)
    if candidate is None:
        known = ", ".join(CANDIDATE_INDEX)
        raise KeyError(f"Unknown algorithm '{key}'. Known algorithms: {known}.")
    return candidate.build(seed, class_count)


def exportable_keys() -> list[str]:
    return [candidate.key for candidate in CANDIDATES if candidate.exportable]


def describe_registry() -> list[dict[str, Any]]:
    """Used by `train.py --list-algorithms` and printed in the run report."""
    return [
        {
            "key": candidate.key,
            "description": candidate.description,
            "exportable": candidate.exportable,
            "notes": candidate.notes,
        }
        for candidate in CANDIDATES
    ]


__all__ = [
    "CANDIDATES",
    "CANDIDATE_INDEX",
    "Candidate",
    "build_candidate",
    "describe_registry",
    "exportable_keys",
]
