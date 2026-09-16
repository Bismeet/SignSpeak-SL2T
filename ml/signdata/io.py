"""File IO helpers for the training pipeline.

Kept in one module so every script reads and writes JSON the same way, and so the
"where does the dataset live" question has exactly one answer.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any, Iterable, Mapping

from .schema import CollectedSample

#: Repository root, derived from this file's location (ml/signdata/io.py -> repo root).
REPO_ROOT = Path(__file__).resolve().parents[2]

#: Default location for collected data. Everything in here is landmarks only.
DEFAULT_DATA_DIR = REPO_ROOT / "ml" / "data"

#: Default location for trained artefacts (model + card + reports).
DEFAULT_ARTIFACT_DIR = REPO_ROOT / "ml" / "artifacts"

#: Where the browser expects to find the exported model, relative to the site root.
PUBLIC_MODEL_DIR = REPO_ROOT / "public" / "models"


def read_json(path: Path) -> Any:
    """Read a JSON file, raising a readable error rather than a bare decode failure."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"{path} does not exist") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path} is not valid JSON: {exc}") from exc


def _find_non_finite(payload: Any, path: str = "$") -> tuple[str, float] | None:
    """Locate the first non-finite float in a JSON-shaped structure.

    Python's `json` module happily writes bare `NaN` and `Infinity`, which are **not valid
    JSON** and which `JSON.parse` in the browser rejects outright. Silently producing an
    unparseable file is worse than failing, so `write_json` refuses.
    """
    if isinstance(payload, float):
        return (path, payload) if not math.isfinite(payload) else None
    if isinstance(payload, Mapping):
        for key, value in payload.items():
            found = _find_non_finite(value, f"{path}.{key}")
            if found:
                return found
        return None
    if isinstance(payload, (list, tuple)):
        for index, value in enumerate(payload):
            found = _find_non_finite(value, f"{path}[{index}]")
            if found:
                return found
        return None
    return None


def write_json(path: Path, payload: Any, *, indent: int = 2) -> None:
    """Write JSON with a trailing newline and stable key order for reviewable diffs.

    Raises ``ValueError`` if the payload contains NaN or Infinity, naming the offending key
    path. Encode non-finite values as strings first (see `build_fixtures.py`) if the file
    genuinely needs to represent them.
    """
    found = _find_non_finite(payload)
    if found is not None:
        location, value = found
        raise ValueError(
            f"{path}: refusing to write invalid JSON — {location} is {value!r}. "
            "JSON has no representation for NaN or Infinity, and browsers reject a file "
            "that contains them. Encode the value as a string (\"NaN\", \"Infinity\", "
            "\"-Infinity\") or drop it."
        )

    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, indent=indent, ensure_ascii=False, allow_nan=False, sort_keys=False)
    path.write_text(f"{text}\n", encoding="utf-8")


def sha256_of_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_of_json(payload: Any) -> str:
    """Stable hash of a JSON structure, used as the dataset manifest hash."""
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def find_sample_files(data_dir: Path) -> list[Path]:
    """Every ``*.json`` file under ``data_dir`` that looks like a sample collection.

    Two accepted shapes, because both are natural for a human to produce:
      * a single object with a ``samples`` array (what the collection tool exports)
      * a bare array of sample objects
    """
    if not data_dir.exists():
        return []
    return sorted(path for path in data_dir.rglob("*.json") if path.is_file())


def load_samples(paths: Iterable[Path]) -> tuple[list[CollectedSample], list[str]]:
    """Load every sample from every file. Returns ``(samples, warnings)``.

    Bad individual records are skipped with a warning rather than aborting the run,
    because a single malformed window should not cost a whole collection session. The
    warning list is printed by the caller and recorded in the run report.
    """
    samples: list[CollectedSample] = []
    warnings: list[str] = []

    for path in paths:
        try:
            payload = read_json(path)
        except (FileNotFoundError, ValueError) as exc:
            warnings.append(f"{path.name}: {exc}")
            continue

        raw_samples: Any
        if isinstance(payload, Mapping):
            raw_samples = payload.get("samples")
        elif isinstance(payload, list):
            raw_samples = payload
        else:
            raw_samples = None

        if not isinstance(raw_samples, list):
            # Not a sample file at all (e.g. a config). Skip quietly.
            continue

        for index, raw in enumerate(raw_samples):
            try:
                samples.append(CollectedSample.from_json(raw))
            except ValueError as exc:
                warnings.append(f"{path.name}[{index}]: {exc}")

    return samples, warnings


def load_phrases_vocabulary(repo_root: Path | None = None) -> list[dict[str, Any]]:
    """Read ``data/sign-vocabulary.json`` so training can refuse unknown glosses."""
    root = repo_root or REPO_ROOT
    payload = read_json(root / "data" / "sign-vocabulary.json")
    signs = payload.get("signs") if isinstance(payload, Mapping) else None
    return list(signs) if isinstance(signs, list) else []


__all__ = [
    "DEFAULT_ARTIFACT_DIR",
    "DEFAULT_DATA_DIR",
    "PUBLIC_MODEL_DIR",
    "REPO_ROOT",
    "find_sample_files",
    "load_phrases_vocabulary",
    "load_samples",
    "read_json",
    "sha256_of_file",
    "sha256_of_json",
    "write_json",
]
