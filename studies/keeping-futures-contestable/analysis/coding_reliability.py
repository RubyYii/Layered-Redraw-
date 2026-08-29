"""Condition-blind intercoder reliability for KFC coding files."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd


DEFAULT_FIELDS = [
    "contestatory_revision_0_2",
    "rationale_specificity_0_2",
    "new_assumption_count",
    "unresolved_issue_present",
    "grounded_interpretation_count",
    "assumption_count",
    "stakeholder_power_0_2",
    "alternative_future_count",
    "confusion_0_2",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--coding", action="append", required=True, type=Path, help="One blinded coding CSV per coder")
    parser.add_argument("--field", action="append", dest="fields")
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--synthetic", action="store_true", help="Mark a pipeline-only reliability run")
    return parser.parse_args()


def krippendorff_alpha_interval(ratings_by_unit: list[list[float]]) -> float | None:
    usable = [np.asarray(values, dtype=float) for values in ratings_by_unit if len(values) >= 2]
    if not usable:
        return None
    observed_numerator = 0.0
    observed_pairs = 0
    for values in usable:
        for left in range(len(values)):
            for right in range(left + 1, len(values)):
                observed_numerator += float((values[left] - values[right]) ** 2)
                observed_pairs += 1
    all_values = np.concatenate(usable)
    expected_numerator = 0.0
    expected_pairs = 0
    for left in range(len(all_values)):
        for right in range(left + 1, len(all_values)):
            expected_numerator += float((all_values[left] - all_values[right]) ** 2)
            expected_pairs += 1
    if observed_pairs == 0 or expected_pairs == 0:
        return None
    observed = observed_numerator / observed_pairs
    expected = expected_numerator / expected_pairs
    if expected == 0:
        return 1.0 if observed == 0 else None
    return 1.0 - observed / expected


def reliability_label(alpha: float | None) -> str:
    if alpha is None:
        return "NOT_ESTIMABLE"
    if alpha >= 0.8:
        return "ADEQUATE_FOR_MAIN_ANALYSIS"
    if alpha >= 0.67:
        return "TENTATIVE_REQUIRES_CAUTION"
    return "REVISE_CODEBOOK_AND_RECODE"


def main() -> None:
    args = parse_args()
    if len(args.coding) < 2:
        raise ValueError("At least two independent coding files are required")
    frames = []
    for coder_index, file_path in enumerate(args.coding, start=1):
        frame = pd.read_csv(file_path, dtype=str).fillna("")
        if frame.unit_id.duplicated().any():
            raise ValueError(f"Duplicate unit_id within {file_path}")
        frame["_source_coder_file"] = f"coder-{coder_index}"
        frames.append(frame)
    fields = args.fields or DEFAULT_FIELDS
    all_units = sorted(set().union(*(set(frame.unit_id) for frame in frames)))
    results = []
    for field in fields:
        if any(field not in frame.columns for frame in frames):
            raise ValueError(f"Missing field: {field}")
        ratings_by_unit = []
        units_with_pairs = 0
        for unit_id in all_units:
            ratings = []
            for frame in frames:
                matches = frame.loc[frame.unit_id == unit_id, field]
                if len(matches) and matches.iloc[0] != "":
                    ratings.append(float(matches.iloc[0]))
            if len(ratings) >= 2:
                units_with_pairs += 1
            ratings_by_unit.append(ratings)
        alpha = krippendorff_alpha_interval(ratings_by_unit)
        results.append({
            "field": field,
            "units_with_at_least_two_ratings": units_with_pairs,
            "alpha_interval": alpha,
            "decision": reliability_label(alpha),
        })
    report = {
        "schema_version": "kfc-coding-reliability/0.1",
        "evidence_status": "SYNTHETIC_PIPELINE_CHECK_NOT_EVIDENCE" if args.synthetic else "CODING_RELIABILITY",
        "coder_files": [str(path) for path in args.coding],
        "unit_count_union": len(all_units),
        "results": results,
        "rule": "Primary-code instability requires codebook revision/recode or claim narrowing before condition unblinding.",
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ok": True, "out": str(args.out), "fields": len(results)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
