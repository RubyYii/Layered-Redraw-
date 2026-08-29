"""Frozen-table analysis for Keeping Futures Contestable.

This script does not read raw free text and does not perform coding. It consumes
the analysis-ready tables created by scripts/analyze.mjs.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
import scipy.stats as st
import statsmodels.api as sm
import statsmodels.formula.api as smf
from statsmodels.stats.sandwich_covariance import cov_cluster_2groups


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--study-a", required=True, type=Path)
    parser.add_argument("--study-b", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--study-b-model-config", type=Path)
    parser.add_argument("--allow-synthetic", action="store_true")
    parser.add_argument("--bootstrap-repetitions", type=int, default=5000)
    parser.add_argument("--seed", type=int, default=20260827)
    return parser.parse_args()


def require_columns(frame: pd.DataFrame, columns: set[str], label: str) -> None:
    missing = columns.difference(frame.columns)
    if missing:
        raise ValueError(f"{label} is missing columns: {sorted(missing)}")


def paired_bootstrap(
    frame: pd.DataFrame,
    outcome: str,
    positive_level: str,
    negative_level: str,
    repetitions: int,
    seed: int,
) -> dict:
    pivot = frame.pivot_table(index="participant_id", columns="condition", values=outcome, aggfunc="mean")
    paired = pivot.dropna(subset=[positive_level, negative_level])
    differences = (paired[positive_level] - paired[negative_level]).to_numpy(float)
    if not len(differences):
        raise ValueError(f"No paired observations for {outcome}")
    rng = np.random.default_rng(seed)
    draws = np.empty(repetitions)
    for index in range(repetitions):
        draws[index] = rng.choice(differences, size=len(differences), replace=True).mean()
    return {
        "estimand": f"mean({positive_level} - {negative_level})",
        "outcome": outcome,
        "participants": int(len(differences)),
        "estimate": float(differences.mean()),
        "ci95_percentile": [float(np.quantile(draws, 0.025)), float(np.quantile(draws, 0.975))],
    }


def independent_participant_bootstrap(
    frame: pd.DataFrame,
    outcome: str,
    positive_level: str,
    negative_level: str,
    repetitions: int,
    seed: int,
) -> dict:
    participant_means = frame.groupby(["participant_id", "protocol"], as_index=False)[outcome].mean()
    positive = participant_means.loc[participant_means.protocol == positive_level, outcome].to_numpy(float)
    negative = participant_means.loc[participant_means.protocol == negative_level, outcome].to_numpy(float)
    if not len(positive) or not len(negative):
        raise ValueError(f"Missing protocol group for {outcome}")
    rng = np.random.default_rng(seed)
    draws = np.empty(repetitions)
    for index in range(repetitions):
        draws[index] = (
            rng.choice(positive, size=len(positive), replace=True).mean()
            - rng.choice(negative, size=len(negative), replace=True).mean()
        )
    return {
        "estimand": f"participant mean({positive_level} - {negative_level})",
        "outcome": outcome,
        "participants_positive": int(len(positive)),
        "participants_negative": int(len(negative)),
        "estimate": float(positive.mean() - negative.mean()),
        "ci95_percentile": [float(np.quantile(draws, 0.025)), float(np.quantile(draws, 0.975))],
    }


def two_way_clustered_negative_binomial(
    frame: pd.DataFrame,
    dispersion_alpha: float,
    diagnostic_adjustment: bool = False,
) -> dict:
    working = frame.copy()
    working["protocol_open"] = (working["protocol"] == "open").astype(int)
    working["source_layered"] = (working["source_workflow"] == "layered").astype(int)
    formula = (
        "grounded_interpretation_count ~ "
        "protocol_open * source_layered + C(brief_id) + C(presentation_order)"
    )
    if diagnostic_adjustment:
        formula += " + response_length_chars + common_probe_duration_seconds"
    model = smf.glm(
        formula=formula,
        data=working,
        family=sm.families.NegativeBinomial(alpha=dispersion_alpha),
    ).fit()
    covariance, _, _ = cov_cluster_2groups(
        model,
        working["participant_id"].astype("category").cat.codes,
        working["artefact_id"].astype("category").cat.codes,
    )
    standard_errors = np.sqrt(np.clip(np.diag(covariance), 0, np.inf))
    parameter_values = model.params.to_numpy()
    z_values = np.divide(
        parameter_values,
        standard_errors,
        out=np.full_like(parameter_values, np.nan, dtype=float),
        where=standard_errors > 0,
    )
    p_values = 2 * st.norm.sf(np.abs(z_values))
    coefficients = []
    for index, term in enumerate(model.params.index):
        coefficients.append({
            "term": term,
            "log_rate": float(model.params.iloc[index]),
            "rate_ratio": float(np.exp(model.params.iloc[index])),
            "two_way_cluster_se": float(standard_errors[index]),
            "z": float(z_values[index]),
            "p": float(p_values[index]),
        })
    names = list(model.params.index)
    contrast = np.zeros(len(names))
    contrast[names.index("protocol_open")] = 1.0
    contrast[names.index("protocol_open:source_layered")] = 0.5
    contrast_estimate = float(contrast @ parameter_values)
    contrast_variance = float(contrast @ covariance @ contrast)
    contrast_se = float(np.sqrt(contrast_variance)) if contrast_variance > 0 else float("nan")
    contrast_z = contrast_estimate / contrast_se if contrast_se > 0 else float("nan")
    contrast_p = float(2 * st.norm.sf(abs(contrast_z))) if np.isfinite(contrast_z) else float("nan")
    return {
        "model": "Negative-binomial GLM with participant × artefact two-way clustered covariance",
        "formula": formula,
        "dispersion_alpha_frozen": dispersion_alpha,
        "primary_average_protocol_contrast": {
            "estimand": "average log protocol rate ratio across flat and layered source workflows with equal 0.5 weights",
            "log_rate_ratio": contrast_estimate,
            "rate_ratio": float(np.exp(contrast_estimate)),
            "two_way_cluster_se": contrast_se,
            "ci95_rate_ratio": [
                float(np.exp(contrast_estimate - 1.96 * contrast_se)),
                float(np.exp(contrast_estimate + 1.96 * contrast_se)),
            ] if np.isfinite(contrast_se) else [None, None],
            "z": contrast_z,
            "p": contrast_p,
        },
        "coefficients": coefficients,
        "role": "post-treatment diagnostic, not a causal adjustment" if diagnostic_adjustment else "primary protocol-effect model",
        "warning": (
            "Response length and common-probe time are downstream of protocol; this diagnostic cannot replace the primary model."
            if diagnostic_adjustment
            else "The average protocol contrast is primary; component coefficients and interaction remain supporting unless separately powered."
        ),
    }


def load_model_config(path: Path | None, synthetic: bool) -> tuple[dict, str | None]:
    if path is None:
        if not synthetic:
            raise RuntimeError("Human analysis requires --study-b-model-config from the frozen planning packet")
        return {
            "schemaVersion": "kfc-study-b-model-config/0.1",
            "status": "SYNTHETIC_PIPELINE_DEFAULT_NOT_FROZEN",
            "family": "negative_binomial",
            "dispersionAlpha": 1.0,
            "orderEncoding": "categorical",
            "primaryContrast": "average_protocol_across_equally_weighted_workflows",
        }, None
    raw = path.read_bytes()
    config = json.loads(raw)
    if config.get("schemaVersion") != "kfc-study-b-model-config/0.1":
        raise ValueError("Study B model config schemaVersion is invalid")
    if not synthetic and config.get("status") != "FROZEN_AFTER_PILOT_BEFORE_MAIN_COLLECTION":
        raise ValueError("Human analysis requires a model config frozen after pilot and before main collection")
    if config.get("family") != "negative_binomial":
        raise ValueError("Only the preregistered negative_binomial model is implemented")
    if float(config.get("dispersionAlpha", 0)) <= 0:
        raise ValueError("dispersionAlpha must be positive")
    if config.get("orderEncoding") != "categorical":
        raise ValueError("orderEncoding must be categorical")
    if config.get("primaryContrast") != "average_protocol_across_equally_weighted_workflows":
        raise ValueError("primaryContrast is inconsistent with the preregistered estimand")
    return config, hashlib.sha256(raw).hexdigest()


def locality_manipulation_summary(frame: pd.DataFrame) -> dict:
    by_condition = frame.groupby("condition")["candidate_off_target_exposure_count"].agg(["count", "mean", "min", "max"])
    return {
        "status": "SYSTEM_ENFORCED_MANIPULATION_CHECK_NOT_A_HUMAN_EFFECT",
        "by_condition": by_condition.reset_index().to_dict("records"),
        "interpretation": "Use only to verify local preservation versus whole-output collateral change; do not test it as participant behaviour.",
    }


def main() -> None:
    args = parse_args()
    study_a = pd.read_csv(args.study_a)
    study_b = pd.read_csv(args.study_b)
    require_columns(
        study_a,
        {"synthetic", "participant_id", "condition", "brief_id", "task_order", "contestatory_revision_0_2", "candidate_off_target_exposure_count"},
        "Study A",
    )
    require_columns(
        study_b,
        {"synthetic", "participant_id", "artefact_id", "protocol", "source_workflow", "brief_id", "grounded_interpretation_count", "comprehension_correct", "response_length_chars", "common_probe_duration_seconds"},
        "Study B",
    )
    synthetic_values = set(pd.concat([study_a.synthetic, study_b.synthetic]).astype(str).str.lower())
    synthetic = synthetic_values == {"true"}
    if len(synthetic_values) != 1:
        raise ValueError("Synthetic and human rows are mixed")
    if synthetic and not args.allow_synthetic:
        raise RuntimeError("Synthetic inputs are not evidence. Re-run only for pipeline testing with --allow-synthetic.")
    model_config, model_config_sha256 = load_model_config(args.study_b_model_config, synthetic)
    dispersion_alpha = float(model_config["dispersionAlpha"])

    output = {
        "schema_version": "kfc-confirmatory-analysis/0.1",
        "evidence_status": "SYNTHETIC_PIPELINE_CHECK_NOT_EVIDENCE" if synthetic else "HUMAN_ANALYSIS_REQUIRES_FROZEN_PROTOCOL_AUDIT",
        "study_a": {
            "scope": "paired mechanism estimate; not powered as a population-level workflow-superiority test",
            "contestatory_revision": paired_bootstrap(
                study_a, "contestatory_revision_0_2", "layered", "flat", args.bootstrap_repetitions, args.seed
            ),
            "locality_manipulation_check": locality_manipulation_summary(study_a),
        },
        "study_b": {
            "grounded_breadth": independent_participant_bootstrap(
                study_b, "grounded_interpretation_count", "open", "closed", args.bootstrap_repetitions, args.seed + 2
            ),
            "comprehension_by_protocol": study_b.groupby("protocol")["comprehension_correct"].agg(["count", "mean"]).reset_index().to_dict("records"),
            "model_config": model_config,
            "model_config_sha256": model_config_sha256,
            "primary_model": two_way_clustered_negative_binomial(study_b, dispersion_alpha),
            "post_treatment_diagnostic_model": two_way_clustered_negative_binomial(study_b, dispersion_alpha, diagnostic_adjustment=True),
        },
        "claim_gate": {
            "productive_ambiguity": "Do not pass if breadth increases with materially worse comprehension or if the effect is explained only by response length/dwell time.",
            "non_substitution": "Requires repeated, interpretable technical/curatorial discordance; this model does not establish it.",
        },
    }
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "confirmatory-results.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    heading = "# SYNTHETIC PIPELINE CHECK — NOT EVIDENCE" if synthetic else "# Confirmatory analysis output — pending release audit"
    (args.out / "README.md").write_text(
        f"{heading}\n\nEvidence status: `{output['evidence_status']}`\n\n"
        "The JSON preserves separate Study A, Study B, comprehension, and claim-gate outputs. "
        "It does not create a composite speculative-quality score.\n",
        encoding="utf-8",
    )
    print(json.dumps({"ok": True, "synthetic": synthetic, "out": str(args.out)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
