#!/usr/bin/env python
"""Convert an exported landmark-correction log into training samples.

Where the data comes from
-------------------------
The app has an opt-in setting ("Save corrected signs on this device"). When it is on, every
time the user *corrects* a wrong prediction, SignSpeak stores the 159-float feature vector
that produced it plus the label the user chose. That is genuinely useful supervision: it is
exactly the case the model got wrong.

What the log contains — and does not
------------------------------------
Only feature vectors. No images, no video, no audio, no conversation text. The log lives in
the user's own browser storage, is never transmitted, and the user can delete it in one tap.
See `lib/state/landmark-log.ts` and `docs/privacy-and-safety.md` §3.

Why this script asks for a signer id
------------------------------------
The log has no idea who was signing. Group-aware splitting is the only honest way to
evaluate this model, so an unknown signer id would poison the split. The script refuses to
run without `--signer-id`, and it is deliberately a pseudonym ("signer-04"), not a name.

Usage
-----
    python ml/scripts/import_corrections.py \\
        --input ~/Downloads/signspeak-landmark-log.json \\
        --signer-id signer-04 \\
        --consent-confirmed \\
        --out ml/data/corrections-signer-04.json

Then train as usual; the file is picked up automatically because it lives under `ml/data`.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "ml"))

from signdata.constants import FEATURE_VECTOR_LENGTH, FEATURE_VERSION  # noqa: E402
from signdata.io import load_phrases_vocabulary, read_json, write_json  # noqa: E402

CONSENT_NOTICE = """\
Before importing, confirm all of the following:

  1. Every person whose corrections are in this file gave informed consent for their
     landmark data to be used to train a sign-recognition model.
  2. The consent covered training use, not just local storage.
  3. You are using a pseudonymous signer id, not a real name, and not any identifier that
     could be used to look the person up.
  4. You understand this data must not be published, shared outside the team, or combined
     with any other dataset that could re-identify the signer.

Pass --consent-confirmed to acknowledge, or --dry-run to inspect the file without writing.
"""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Convert a SignSpeak landmark-correction log into training samples.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=CONSENT_NOTICE,
    )
    parser.add_argument("--input", type=Path, required=True, help="The exported log JSON.")
    parser.add_argument(
        "--signer-id",
        type=str,
        help="Pseudonymous signer id, e.g. signer-04. Required unless --dry-run.",
    )
    parser.add_argument(
        "--signer-type",
        choices=["fluent", "learner"],
        default="fluent",
        help="fluent = an ISL user. learner = a hearing team member; excluded from training by default.",
    )
    parser.add_argument(
        "--label-field",
        choices=["corrected", "predicted"],
        default="corrected",
        help=(
            "corrected (default) uses the label the user chose, which is the useful signal. "
            "predicted uses what the model said — only meaningful for a positive-only experiment."
        ),
    )
    parser.add_argument(
        "--min-probability",
        type=float,
        default=0.0,
        help="Drop entries the model scored below this. 0 keeps everything.",
    )
    parser.add_argument(
        "--allow-unknown-labels",
        action="store_true",
        help="Keep labels that are not in data/sign-vocabulary.json. Off by default.",
    )
    parser.add_argument("--session", type=str, default="", help="Session tag for the samples.")
    parser.add_argument("--out", type=Path, help="Where to write the samples. Required unless --dry-run.")
    parser.add_argument("--consent-confirmed", action="store_true", help="Acknowledge the consent notice.")
    parser.add_argument("--dry-run", action="store_true", help="Inspect only; write nothing.")
    args = parser.parse_args(argv)

    input_path = args.input if args.input.is_absolute() else Path.cwd() / args.input
    if not input_path.exists():
        print(f"[import] {input_path} does not exist.")
        return 2

    if not args.dry_run and not args.consent_confirmed:
        print(CONSENT_NOTICE)
        print("[import] Refusing to convert without --consent-confirmed.")
        return 2

    if not args.dry_run and not args.signer_id:
        print("[import] --signer-id is required. A pseudonym such as 'signer-04' is fine.")
        return 2

    if not args.dry_run and not args.out:
        print("[import] --out is required.")
        return 2

    payload = read_json(input_path)
    if not isinstance(payload, dict):
        print("[import] The log file is not a JSON object.")
        return 2

    log_version = payload.get("featureVersion")
    if log_version != FEATURE_VERSION:
        print(
            f"[import] The log was written with feature version {log_version!r} but this "
            f"pipeline uses {FEATURE_VERSION!r}. Regenerating is required: feature vectors "
            "from a different layout would train the model on meaningless numbers."
        )
        return 2

    raw_samples = payload.get("samples")
    if not isinstance(raw_samples, list):
        print("[import] The log file has no 'samples' array.")
        return 2

    print(f"[import] Log exported at: {payload.get('exportedAt')}")
    print(f"[import] Log declares {payload.get('sampleCount', len(raw_samples))} sample(s)")
    print(f"[import] Notice in file: {payload.get('notice', '(none)')}")

    vocabulary: set[str] = set()
    try:
        for entry in load_phrases_vocabulary(REPO_ROOT):
            gloss = str(entry.get("gloss", "")).strip().upper().replace(" ", "_")
            if gloss:
                vocabulary.add(gloss)
    except Exception as exc:  # noqa: BLE001
        print(f"[import] WARNING: could not read the vocabulary file ({exc}).")
    # The negative class is always allowed even though it is not a "sign".
    vocabulary.add("OTHER")

    signer_id = args.signer_id or "unknown"
    session = args.session or f"corrections-{signer_id}"
    converted: list[dict[str, Any]] = []
    skipped: dict[str, int] = {}

    def skip(reason: str) -> None:
        skipped[reason] = skipped.get(reason, 0) + 1

    for index, raw in enumerate(raw_samples):
        if not isinstance(raw, dict):
            skip("not-an-object")
            continue

        features = raw.get("features")
        if not isinstance(features, list) or len(features) != FEATURE_VECTOR_LENGTH:
            skip("bad-feature-length")
            continue
        if not all(isinstance(value, (int, float)) for value in features):
            skip("non-numeric-feature")
            continue

        probability = raw.get("probability")
        if isinstance(probability, (int, float)) and float(probability) < args.min_probability:
            skip("below-min-probability")
            continue

        if args.label_field == "corrected":
            label = str(raw.get("correctedLabel") or "").strip()
        else:
            label = str(raw.get("predictedLabel") or "").strip()

        if not label:
            skip("empty-label")
            continue

        normalised = label.upper().replace(" ", "_")
        if normalised not in vocabulary and not args.allow_unknown_labels:
            skip(f"label-not-in-vocabulary:{normalised}")
            continue

        converted.append(
            {
                "id": f"correction-{signer_id}-{index:05d}",
                "signerId": signer_id,
                "signerType": args.signer_type,
                "label": normalised,
                "session": session,
                "capturedAt": str(raw.get("createdAt") or ""),
                "conditions": {
                    # The log records nothing about the conditions, and inventing them would
                    # be worse than admitting we do not know. "unknown" is honest and is
                    # excluded from any per-condition robustness slice downstream.
                    "lighting": "unknown",
                    "background": "unknown",
                    "distance": "unknown",
                    "pose": "unknown",
                    "handedness": "unknown",
                },
                "toolVersion": str(raw.get("toolVersion") or ""),
                "frameCount": 1,
                # A correction log entry is a single frame — the one that produced the
                # accepted prediction. It is a valid training row but not a full window, so
                # window-level metrics will treat it as a window of one.
                "features": [[float(value) for value in features]],
            }
        )

    print()
    print(f"[import] Converted {len(converted)} sample(s)")
    if skipped:
        print("[import] Skipped:")
        for reason, count in sorted(skipped.items(), key=lambda item: -item[1]):
            print(f"           {count:>6}  {reason}")

    if not converted:
        print("[import] Nothing to write.")
        return 0

    label_counts: dict[str, int] = {}
    for sample in converted:
        label_counts[sample["label"]] = label_counts.get(sample["label"], 0) + 1
    print("[import] Per label:")
    for label, count in sorted(label_counts.items(), key=lambda item: -item[1]):
        print(f"           {count:>6}  {label}")

    if args.dry_run:
        print("[import] Dry run: nothing written.")
        return 0

    out_path = args.out if args.out.is_absolute() else REPO_ROOT / args.out
    write_json(
        out_path,
        {
            "schemaVersion": 1,
            "source": "landmark-correction-log",
            "sourceFile": input_path.name,
            "importedAt": _dt.datetime.now().isoformat(timespec="seconds"),
            "featureVersion": FEATURE_VERSION,
            "signerId": signer_id,
            "signerType": args.signer_type,
            "labelField": args.label_field,
            "notice": (
                "Derived from the opt-in local landmark correction log. Feature vectors only; "
                "no images, video, audio or conversation text. Pseudonymous signer id."
            ),
            "samples": converted,
        },
    )
    print(f"[import] Wrote {len(converted)} sample(s) to {out_path}")
    print("[import] These are single-frame correction samples. They add supervision for the")
    print("[import] cases the model got wrong; they are not a substitute for a balanced,")
    print("[import] multi-signer collection. Check the class counts above before training.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
