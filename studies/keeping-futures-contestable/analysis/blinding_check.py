"""Audit whether label-blinded coders could infer experimental condition."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd


GUESS_FOR_TRUTH = {
    "flat": "WHOLE_OUTPUT",
    "layered": "LOCAL_LAYERED",
    "closed": "CLOSED_ORIENTED",
    "open": "OPEN_ORIENTED",
}
ALLOWED_BY_STUDY = {
    "study-a": {"WHOLE_OUTPUT", "LOCAL_LAYERED", "UNSURE"},
    "study-b": {"CLOSED_ORIENTED", "OPEN_ORIENTED", "UNSURE"},
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--coding", action="append", required=True, type=Path)
    parser.add_argument("--key", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--synthetic", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    key_document = json.loads(args.key.read_text(encoding="utf-8"))
    key_rows = {row["unitId"]: row for row in key_document["rows"] if row["study"] in ALLOWED_BY_STUDY}
    observations: list[dict] = []

    for file_index, coding_path in enumerate(args.coding, start=1):
        frame = pd.read_csv(coding_path, dtype=str).fillna("")
        required = {"unit_id", "condition_guess", "guess_confidence_0_2"}
        missing = required.difference(frame.columns)
        if missing:
            raise ValueError(f"{coding_path} is missing columns: {sorted(missing)}")
        if frame.unit_id.duplicated().any():
            raise ValueError(f"Duplicate unit_id within {coding_path}")
        for _, row in frame.iterrows():
            key = key_rows.get(row.unit_id)
            if not key:
                continue
            truth = key["condition"] if key["study"] == "study-a" else key["protocol"]
            guess = row.condition_guess.strip().upper()
            if not guess:
                continue
            if guess not in ALLOWED_BY_STUDY[key["study"]]:
                raise ValueError(f"Invalid {key['study']} condition guess {guess!r} for {row.unit_id}")
            confidence = row.guess_confidence_0_2.strip()
            if confidence not in {"0", "1", "2"}:
                raise ValueError(f"Invalid guess confidence for {row.unit_id}")
            observations.append({
                "coder_file": f"coder-{file_index}",
                "study": key["study"],
                "unit_id": row.unit_id,
                "guess": guess,
                "confidence_0_2": int(confidence),
                "scorable": guess != "UNSURE",
                "correct": guess == GUESS_FOR_TRUTH[truth] if guess != "UNSURE" else None,
            })

    summaries = []
    for coder_file in sorted({row["coder_file"] for row in observations}):
        for study in sorted(ALLOWED_BY_STUDY):
            subset = [row for row in observations if row["coder_file"] == coder_file and row["study"] == study]
            eligible = sum(1 for key in key_rows.values() if key["study"] == study)
            scored = [row for row in subset if row["scorable"]]
            summaries.append({
                "coder_file": coder_file,
                "study": study,
                "eligible_units": eligible,
                "guesses_recorded": len(subset),
                "guess_coverage": len(subset) / eligible if eligible else None,
                "scorable_guesses": len(scored),
                "accuracy_excluding_unsure": (
                    sum(bool(row["correct"]) for row in scored) / len(scored) if scored else None
                ),
                "mean_confidence": (
                    sum(row["confidence_0_2"] for row in subset) / len(subset) if subset else None
                ),
            })

    report = {
        "schema_version": "kfc-blinding-check/0.1",
        "evidence_status": "SYNTHETIC_PIPELINE_CHECK_NOT_EVIDENCE" if args.synthetic else "CODER_BLINDING_DIAGNOSTIC",
        "warning": "Condition guessing diagnoses possible coder unblinding; it neither proves absence of bias nor licenses outcome exclusion.",
        "summaries": summaries,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "out": str(args.out), "summaries": len(summaries)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
