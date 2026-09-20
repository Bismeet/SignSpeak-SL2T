#!/usr/bin/env python
"""Download and filter the isolated-ISL subset used to train ``sign-clf-v1``.

Source: Hugging Face dataset ``vidit031/isl-isolated-40words`` — 642 clips, 40 glosses,
196 MB, an aggregate of four upstream ISL corpora (ISL500, INCLUDE, CISLR, ISLRTC).

This script downloads the clips and writes a manifest. It does **not** touch MediaPipe or
scikit-learn, so it runs in the training environment (``ml/.venv``).

What it does
------------
1. Reads ``metadata.csv`` from the dataset repository.
2. Discards every clip flagged ``review_status == "Needs Manual Review"``.
3. Selects the target vocabulary plus a sample of out-of-vocabulary clips for the
   negative/OTHER class.
4. Downloads the MP4s and writes ``manifest.json`` next to them.

Two things this script deliberately reports rather than hides
-------------------------------------------------------------
**The ``signer`` column is not a signer identity for three of the four sources.** ISL500
carries real signer IDs (``User001``–``User015``); INCLUDE carries per-video identifiers
(``include_MVI_3315``); CISLR carries *word names* (``abstract``, ``action``); ISLRTC has a
single label for all 13 rows. A leave-one-signer-out split built on that column would put the
same person on both sides of the split and inflate the score. The manifest therefore records
both ``signer_label`` (verbatim from the source) and ``group_key`` (a source-qualified key
that is safe to group on), and the trainer labels the resulting metric as optimistic.

**``stop`` is not trainable from this dataset.** It has 4 clips, one of which is flagged, from
two sources with no signer identity, and its source is a dictionary-style recording — a
different domain from the rest. It is excluded, and the exclusion is written into the manifest
so the model card can state it.

Usage
-----
    ml/.venv/Scripts/python ml/download_data.py                    # defaults
    ml/.venv/Scripts/python ml/download_data.py --negatives 300
    ml/.venv/Scripts/python ml/download_data.py --no-negatives     # signs only
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import sys
from collections import Counter, defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = REPO_ROOT / "ml" / "data" / "isl-subset"

DATASET_ID = "vidit031/isl-isolated-40words"
METADATA_FILENAME = "metadata.csv"

#: The vocabulary this model is trained on. `food` and `hospital` were removed because
#: they are not in `data/sign-vocabulary.json`. `stop` was removed due to lack of clips.
TARGET_WORDS: tuple[str, ...] = ("help", "water", "yes", "no")

#: Recorded for the model card so the exclusion is visible, not silently missing.
EXCLUDED_WORDS: dict[str, str] = {
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

#: Sources whose `signer` column holds a genuine signer identity. Everything else is
#: qualified by the video/word label so the group key at least prevents clip leakage.
SOURCES_WITH_REAL_SIGNER_IDS = frozenset({"ISL500"})

#: Matches the `UserNNN` identifiers ISL500 uses.
_REAL_SIGNER_PATTERN = re.compile(r"^User\d+$")

ACCEPTED = "accepted"
REJECTED = "Needs Manual Review"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download the isolated-ISL subset for sign-clf-v1.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output directory")
    parser.add_argument(
        "--words",
        default=",".join(TARGET_WORDS),
        help="comma-separated target vocabulary (default: %(default)s)",
    )
    parser.add_argument(
        "--negatives",
        type=int,
        default=200,
        help="how many out-of-vocabulary clips to download for the OTHER class (0 = none)",
    )
    parser.add_argument(
        "--all-negatives",
        action="store_true",
        help="download every accepted out-of-vocabulary clip (ignores --negatives)",
    )
    parser.add_argument("--seed", type=int, default=20260101, help="sampling seed for negatives")
    parser.add_argument("--workers", type=int, default=8, help="parallel downloads")
    parser.add_argument(
        "--metadata-only",
        action="store_true",
        help="write the manifest without downloading any video (fast dry run)",
    )
    return parser.parse_args(argv)


def require_huggingface_hub():
    try:
        from huggingface_hub import hf_hub_download  # noqa: PLC0415
    except ImportError:  # pragma: no cover - environment guard
        sys.exit(
            "huggingface_hub is not installed in this environment.\n"
            "  ml/.venv/Scripts/python -m pip install huggingface_hub\n"
            "or re-run:  npm run ml:setup"
        )
    return hf_hub_download


def fetch_metadata(hf_hub_download) -> tuple[Path, list[dict[str, str]]]:
    """Download metadata.csv and return it parsed."""
    path = Path(
        hf_hub_download(repo_id=DATASET_ID, filename=METADATA_FILENAME, repo_type="dataset")
    )
    with path.open(encoding="utf-8", newline="") as handle:
        rows = [dict(row) for row in csv.DictReader(handle)]
    return path, rows


def normalise_word(value: str) -> str:
    return value.strip().lower()


def group_key_for(row: dict[str, str]) -> str:
    """A key that is safe to group on for a held-out split.

    Always qualified by source, so two different corpora can never collide on a bare label.
    For ISL500 the qualifier is a real signer id; for the others it is the source's own
    per-clip label, which prevents clip leakage even though it does not identify a person.
    """
    source = row.get("dataset", "unknown")
    label = (row.get("signer") or "").strip() or "unlabelled"
    return f"{source}:{label}"


def is_real_signer(row: dict[str, str]) -> bool:
    if row.get("dataset") not in SOURCES_WITH_REAL_SIGNER_IDS:
        return False
    return bool(_REAL_SIGNER_PATTERN.match((row.get("signer") or "").strip()))


def select_rows(
    rows: list[dict[str, str]],
    targets: tuple[str, ...],
    *,
    negative_count: int,
    all_negatives: bool,
    seed: int,
) -> tuple[list[dict[str, str]], list[dict[str, str]], list[dict[str, str]], Counter]:
    """Split the metadata into (positives, negatives, discarded, rejection reasons)."""
    discarded = [row for row in rows if row.get("review_status") == REJECTED]
    accepted = [row for row in rows if row.get("review_status") == ACCEPTED]

    positives = [row for row in accepted if normalise_word(row.get("normalized_word", "")) in targets]
    negatives = [
        row for row in accepted if normalise_word(row.get("normalized_word", "")) not in targets
    ]

    if not all_negatives and negative_count < len(negatives):
        import random  # noqa: PLC0415

        rng = random.Random(seed)
        # Sort first so the sample is deterministic regardless of metadata row order.
        negatives = sorted(negatives, key=lambda row: row.get("video_path", ""))
        negatives = rng.sample(negatives, negative_count)
        negatives.sort(key=lambda row: row.get("video_path", ""))

    reasons: Counter = Counter()
    for row in discarded:
        reasons[f"{normalise_word(row.get('normalized_word', ''))}"] += 1

    return positives, negatives, discarded, reasons


def build_record(row: dict[str, str], *, label: str, role: str) -> dict[str, object]:
    """One manifest entry. Carries enough provenance to audit the training set later."""
    return {
        "clip_id": row.get("video_path", ""),
        "label": label,
        "role": role,  # "positive" | "negative"
        "video_path": row.get("video_path", ""),
        "source_dataset": row.get("dataset", ""),
        "original_label": row.get("original_label", ""),
        "original_filename": row.get("original_filename", ""),
        "signer_label": row.get("signer", ""),
        "signer_is_real_id": is_real_signer(row),
        "group_key": group_key_for(row),
        "duration": row.get("duration", ""),
        "resolution": row.get("resolution", ""),
        "fps": row.get("fps", ""),
        "quality_score": row.get("quality_score", ""),
        "duplicate_status": row.get("duplicate_status", ""),
        "sha256": row.get("sha256", ""),
        "license": row.get("license", ""),
        "paper": row.get("paper", ""),
        "repository": row.get("repository", ""),
    }


def download_clips(
    records: list[dict[str, object]],
    clips_dir: Path,
    *,
    workers: int = 8,
) -> list[dict[str, str]]:
    """Fetch every clip over plain HTTP, in parallel.

    Deliberately not ``huggingface_hub.snapshot_download``. That path stages each file as a
    temp blob and then deletes it, and this sandbox counts every file a single command
    deletes and aborts once the total passes 50 — so the snapshot died partway through a
    272-file run. A direct GET writes the final file once, with nothing to clean up, and
    needs no cache locking. It is also faster here: ~1.8 s per clip, and the pool makes the
    whole set about a minute.
    """
    import urllib.parse  # noqa: PLC0415
    import urllib.request  # noqa: PLC0415
    from concurrent.futures import ThreadPoolExecutor, as_completed  # noqa: PLC0415

    base = f"https://huggingface.co/datasets/{DATASET_ID}/resolve/main"

    def fetch(record: dict[str, object]) -> tuple[dict[str, object], str | None]:
        remote = str(record["video_path"])
        target = clips_dir / remote
        if target.exists() and target.stat().st_size > 0:
            return record, None
        url = f"{base}/{urllib.parse.quote(remote)}"
        target.parent.mkdir(parents=True, exist_ok=True)
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "SignSpeak/1.0"})
            with urllib.request.urlopen(request, timeout=180) as response:  # noqa: S310
                payload = response.read()
            if not payload:
                raise ValueError("empty response body")
            target.write_bytes(payload)
            return record, None
        except Exception as error:  # noqa: BLE001 - one bad clip must not stop the run
            # Never leave a truncated file behind: a half-written clip would silently become
            # an unreadable sample later, which is worse than a recorded failure.
            target.unlink(missing_ok=True)
            return record, f"{type(error).__name__}: {error}"

    failures: list[dict[str, str]] = []
    completed = 0
    total = len(records)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(fetch, record) for record in records]
        for future in as_completed(futures):
            record, error = future.result()
            completed += 1
            if error:
                record["downloadFailed"] = True
                failures.append({"clip_id": str(record.get("clip_id", "")), "error": error})
            if completed % 40 == 0 or completed == total:
                print(f"[download] {completed}/{total} clips", flush=True)
    return failures


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    targets = tuple(normalise_word(part) for part in args.words.split(",") if part.strip())
    out_dir = args.out.resolve()
    clips_dir = out_dir / "clips"
    out_dir.mkdir(parents=True, exist_ok=True)

    hf_hub_download = require_huggingface_hub()

    print(f"[download] reading {METADATA_FILENAME} from {DATASET_ID}")
    metadata_path, rows = fetch_metadata(hf_hub_download)
    print(f"[download] metadata: {metadata_path}  ({len(rows)} rows)")

    positives, negatives, discarded, _ = select_rows(
        rows,
        targets,
        negative_count=args.negatives,
        all_negatives=args.all_negatives,
        seed=args.seed,
    )

    # ---------------------------------------------------------------- data-quality report
    print()
    print("[download] data-quality findings")
    print(f"  discarded (review_status == {REJECTED!r}): {len(discarded)}")
    by_word: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in positives:
        by_word[normalise_word(row.get("normalized_word", ""))].append(row)
    print(f"  {'word':10s} {'clips':>5s} {'sources':>7s} {'real-signer clips':>17s} {'groups':>6s}")
    for word in targets:
        group = by_word.get(word, [])
        real = [row for row in group if is_real_signer(row)]
        groups = {group_key_for(row) for row in group}
        print(
            f"  {word:10s} {len(group):5d} {len({r.get('dataset') for r in group}):7d} "
            f"{len(real):17d} {len(groups):6d}"
        )
    if "stop" in targets:
        print()
        print("  WARNING: 'stop' was requested but is not trainable from this dataset:")
        print(f"    {EXCLUDED_WORDS['stop']}")
    print()
    print("  NOTE: only ISL500 carries real signer ids. INCLUDE uses per-video ids, CISLR uses")
    print("        word names, ISLRTC has one label. The trainer groups on `group_key` and")
    print("        labels the metric optimistic — this is NOT a signer-independent score.")
    print()

    # ------------------------------------------------------------------------- manifest
    records: list[dict[str, object]] = []
    for row in positives:
        word = normalise_word(row.get("normalized_word", ""))
        records.append(build_record(row, label=word, role="positive"))
    for row in negatives:
        records.append(build_record(row, label="OTHER", role="negative"))

    manifest = {
        "dataset": {
            "id": DATASET_ID,
            "metadataFile": METADATA_FILENAME,
            "license": "other (aggregate; per-source terms apply)",
            "note": (
                "Aggregate of ISL500 (research/academic), INCLUDE (CC-BY-4.0), CISLR (AFL-3.0) "
                "and ISLRTC re-encodes. Per-subset terms apply; see the upstream cards."
            ),
        },
        "vocabulary": list(targets),
        "negativeClass": "OTHER",
        "excludedWords": EXCLUDED_WORDS,
        "filter": {"discardedReviewStatus": REJECTED, "discardedCount": len(discarded)},
        "splitWarning": (
            "NOT signer-independent. Only ISL500 has real signer ids. `group_key` prevents "
            "clip leakage; it does not prevent the same person appearing in two groups."
        ),
        "counts": {
            "positives": len(positives),
            "negatives": len(negatives),
            "total": len(records),
        },
        "clips": records,
    }

    if args.metadata_only:
        print("[download] --metadata-only: writing manifest without fetching video")
    else:
        clips_dir.mkdir(parents=True, exist_ok=True)
        print(f"[download] fetching {len(records)} clip(s) with {args.workers} workers…")
        failures = download_clips(records, clips_dir, workers=args.workers)
        if failures:
            print()
            print(f"[download] {len(failures)} clip(s) could not be fetched:")
            for failure in failures[:10]:
                print(f"    {failure['clip_id']}: {failure['error']}")
            manifest["downloadFailures"] = failures

    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    print()
    print(f"[download] manifest: {manifest_path}")
    print(f"[download] clips:    {clips_dir}")
    print(f"[download] counts:   {manifest['counts']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
