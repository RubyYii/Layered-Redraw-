"""Pilot-informed power simulation for the crossed Study B count design.

Pilot estimates supply nuisance parameters (mean, dispersion, participant and
artefact variation). The protocol effect scenarios must be smallest effects of
interest chosen on substantive grounds, not the observed pilot contrast.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy.stats import norm
from statsmodels.formula.api import glm
from statsmodels.stats.sandwich_covariance import cov_cluster_2groups


BLOCK = [
    (0, [0, 1, 0]),
    (1, [0, 1, 0]),
    (0, [1, 0, 1]),
    (1, [1, 0, 1]),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inputs", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--simulations", type=int, default=None)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument(
        "--allow-template",
        action="store_true",
        help="Run a pipeline check on non-pilot template inputs; output cannot justify a sample target.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    raw = args.inputs.read_bytes()
    inputs = json.loads(raw)
    validate_inputs(inputs, allow_template=args.allow_template)
    simulations = args.simulations or int(inputs["simulations"])
    seed = args.seed if args.seed is not None else int(inputs["seed"])
    if simulations < 10:
        raise ValueError("simulations must be at least 10")

    template_run = inputs["inputStatus"] != "PILOT_NUISANCE_ESTIMATES_FROZEN"
    rng = np.random.default_rng(seed)
    results: list[dict[str, Any]] = []
    for scenario in inputs["smallestEffectScenarios"]:
        for analyzable_n in inputs["candidateAnalyzableN"]:
            results.append(
                simulate_cell(
                    inputs=inputs,
                    scenario=scenario,
                    analyzable_n=int(analyzable_n),
                    simulations=simulations,
                    rng=rng,
                )
            )

    required_power = float(inputs["requiredPower"])
    recommended = recommend_target(results, inputs["smallestEffectScenarios"], required_power)
    exclusion_rate = float(inputs["expectedParticipantExclusionRate"])
    recruit_maximum = None
    if recommended is not None:
        recruit_maximum = int(math.ceil((recommended / (1 - exclusion_rate)) / 4) * 4)

    status = "PLANNING_PIPELINE_CHECK_NOT_SAMPLE_JUSTIFICATION" if template_run else "PILOT_INFORMED_SAMPLE_PLANNING"
    report = {
        "schemaVersion": "kfc-study-b-power-report/0.1",
        "status": status,
        "generatedAt": pd.Timestamp.now(tz="UTC").isoformat(),
        "inputPath": str(args.inputs.resolve()),
        "inputSha256": hashlib.sha256(raw).hexdigest(),
        "seed": seed,
        "simulationsPerCell": simulations,
        "estimand": "average log protocol rate ratio across the two equally weighted source workflows",
        "model": "negative-binomial GLM with protocol × source workflow, brief, and order; participant × artefact two-way clustered covariance",
        "requiredPower": required_power,
        "candidateResults": results,
        "recommendedAnalyzableN": None if template_run else recommended,
        "recommendedRecruitMaximum": None if template_run else recruit_maximum,
        "selectionRule": "smallest complete four-participant block meeting required power in every frozen smallest-effect scenario",
        "warnings": [
            "Power is conditional on frozen nuisance parameters and smallest effects of interest.",
            "Pilot outcome differences must not be reused as confirmatory evidence.",
            "A template run verifies code only and cannot justify a sample size.",
            "If no feasible candidate meets the rule, predeclare a formative mechanism study or revise the design before outcome inspection.",
        ],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "status": status,
        "recommendedAnalyzableN": report["recommendedAnalyzableN"],
        "recommendedRecruitMaximum": report["recommendedRecruitMaximum"],
        "out": str(args.out.resolve()),
    }, indent=2))


def validate_inputs(inputs: dict[str, Any], allow_template: bool) -> None:
    if inputs.get("schemaVersion") != "kfc-study-b-power-input/0.1":
        raise ValueError("unsupported schemaVersion")
    status = inputs.get("inputStatus")
    if status != "PILOT_NUISANCE_ESTIMATES_FROZEN" and not allow_template:
        raise ValueError("refusing non-frozen/template inputs; pass --allow-template only for a labelled pipeline check")
    if status == "PILOT_NUISANCE_ESTIMATES_FROZEN":
        for field in ("pilotSummarySha256", "frozenBy", "frozenAt"):
            if not completed(inputs.get(field)):
                raise ValueError(f"{field} must be completed for frozen pilot inputs")
    candidates = [int(value) for value in inputs.get("candidateAnalyzableN", [])]
    if not candidates or any(value < 8 or value % 4 for value in candidates):
        raise ValueError("candidateAnalyzableN values must be complete four-participant blocks")
    if sorted(set(candidates)) != candidates:
        raise ValueError("candidateAnalyzableN must be unique and increasing")
    if not 0 < float(inputs.get("requiredPower", 0)) < 1:
        raise ValueError("requiredPower must be between 0 and 1")
    if not 0 < float(inputs.get("alpha", 0)) < 1:
        raise ValueError("alpha must be between 0 and 1")
    if not 0 <= float(inputs.get("expectedParticipantExclusionRate", -1)) < 0.5:
        raise ValueError("expectedParticipantExclusionRate must be between 0 and 0.5")
    nuisance = inputs.get("pilotNuisanceParameters", {})
    if float(nuisance.get("closedMean", 0)) <= 0:
        raise ValueError("closedMean must be positive")
    if float(nuisance.get("dispersionAlpha", -1)) < 0:
        raise ValueError("dispersionAlpha cannot be negative")
    if int(nuisance.get("artefactsPerBriefWorkflowCell", 0)) < 2:
        raise ValueError("artefactsPerBriefWorkflowCell must be at least 2")
    for field in ("participantLogSd", "artefactLogSd"):
        if float(nuisance.get(field, -1)) < 0:
            raise ValueError(f"{field} cannot be negative")
    for field in ("briefRateRatios", "orderRateRatios"):
        values = nuisance.get(field, [])
        if len(values) != 3 or any(float(value) <= 0 for value in values):
            raise ValueError(f"{field} must contain three positive values")
    scenarios = inputs.get("smallestEffectScenarios", [])
    if not scenarios:
        raise ValueError("at least one smallestEffectScenario is required")
    for scenario in scenarios:
        if not completed(scenario.get("name")):
            raise ValueError("every effect scenario needs a name")
        if float(scenario.get("averageProtocolRateRatio", 0)) <= 0:
            raise ValueError("averageProtocolRateRatio must be positive")
        if float(scenario.get("protocolWorkflowInteractionRateRatio", 0)) <= 0:
            raise ValueError("protocolWorkflowInteractionRateRatio must be positive")


def simulate_cell(
    *,
    inputs: dict[str, Any],
    scenario: dict[str, Any],
    analyzable_n: int,
    simulations: int,
    rng: np.random.Generator,
) -> dict[str, Any]:
    significant = 0
    valid = 0
    estimates: list[float] = []
    nuisance = inputs["pilotNuisanceParameters"]
    alpha = float(inputs["alpha"])
    for _ in range(simulations):
        data = simulate_dataset(analyzable_n, nuisance, scenario, rng)
        try:
            fitted = glm(
                "grounded_count ~ protocol_open * source_layered + C(brief) + C(order)",
                data=data,
                family=sm.families.NegativeBinomial(alpha=float(nuisance["dispersionAlpha"])),
            ).fit(maxiter=100, disp=0)
            covariance = cov_cluster_2groups(
                fitted,
                data["participant_id"].to_numpy(),
                data["artefact_id"].to_numpy(),
            )[0]
            names = list(fitted.params.index)
            contrast = np.zeros(len(names))
            contrast[names.index("protocol_open")] = 1.0
            contrast[names.index("protocol_open:source_layered")] = 0.5
            estimate = float(contrast @ fitted.params.to_numpy())
            variance = float(contrast @ covariance @ contrast)
            if not math.isfinite(variance) or variance <= 0:
                continue
            standard_error = math.sqrt(variance)
            p_value = float(2 * norm.sf(abs(estimate / standard_error)))
            valid += 1
            estimates.append(estimate)
            significant += int(p_value < alpha)
        except (ValueError, np.linalg.LinAlgError, FloatingPointError):
            continue

    power = significant / simulations
    lower, upper = wilson_interval(significant, simulations)
    return {
        "scenario": scenario["name"],
        "analyzableN": analyzable_n,
        "power": power,
        "monteCarlo95": [lower, upper],
        "significant": significant,
        "validFits": valid,
        "totalSimulations": simulations,
        "fitFailureRate": 1 - valid / simulations,
        "medianEstimatedAverageLogRateRatio": None if not estimates else float(np.median(estimates)),
        "targetAverageRateRatio": float(scenario["averageProtocolRateRatio"]),
    }


def simulate_dataset(
    analyzable_n: int,
    nuisance: dict[str, Any],
    scenario: dict[str, Any],
    rng: np.random.Generator,
) -> pd.DataFrame:
    cell_size = int(nuisance["artefactsPerBriefWorkflowCell"])
    participant_effect = rng.normal(0, float(nuisance["participantLogSd"]), analyzable_n)
    artefact_effect = rng.normal(0, float(nuisance["artefactLogSd"]), 3 * 2 * cell_size)
    interaction = math.log(float(scenario["protocolWorkflowInteractionRateRatio"]))
    average_protocol = math.log(float(scenario["averageProtocolRateRatio"]))
    protocol_main = average_protocol - 0.5 * interaction
    workflow_effect = math.log(float(nuisance["sourceWorkflowRateRatio"]))
    brief_effects = np.log(np.asarray(nuisance["briefRateRatios"], dtype=float))
    order_effects = np.log(np.asarray(nuisance["orderRateRatios"], dtype=float))
    closed_intercept = (
        math.log(float(nuisance["closedMean"]))
        - 0.5 * float(nuisance["participantLogSd"]) ** 2
        - 0.5 * float(nuisance["artefactLogSd"]) ** 2
    )
    dispersion = float(nuisance["dispersionAlpha"])
    rows: list[dict[str, Any]] = []

    for participant in range(analyzable_n):
        protocol, workflow_pattern = BLOCK[participant % 4]
        cycle = (participant // 4) % cell_size
        brief_order = rng.permutation(3)
        for order_index, brief in enumerate(brief_order):
            workflow = workflow_pattern[int(brief)]
            artefact_id = int(brief) * 2 * cell_size + workflow * cell_size + cycle
            linear = (
                closed_intercept
                + protocol * protocol_main
                + workflow * workflow_effect
                + protocol * workflow * interaction
                + brief_effects[int(brief)]
                + order_effects[order_index]
                + participant_effect[participant]
                + artefact_effect[artefact_id]
            )
            mean = math.exp(linear)
            if dispersion == 0:
                outcome = int(rng.poisson(mean))
            else:
                shape = 1 / dispersion
                probability = shape / (shape + mean)
                outcome = int(rng.negative_binomial(shape, probability))
            rows.append({
                "grounded_count": outcome,
                "protocol_open": protocol,
                "source_layered": workflow,
                "brief": int(brief),
                "order": order_index + 1,
                "participant_id": participant,
                "artefact_id": artefact_id,
            })
    return pd.DataFrame(rows)


def recommend_target(
    results: list[dict[str, Any]], scenarios: list[dict[str, Any]], required_power: float
) -> int | None:
    names = {scenario["name"] for scenario in scenarios}
    candidates = sorted({int(result["analyzableN"]) for result in results})
    for candidate in candidates:
        subset = [result for result in results if result["analyzableN"] == candidate]
        if {result["scenario"] for result in subset} == names and all(
            result["power"] >= required_power and result["fitFailureRate"] <= 0.05 for result in subset
        ):
            return candidate
    return None


def wilson_interval(successes: int, total: int, z: float = 1.96) -> tuple[float, float]:
    proportion = successes / total
    denominator = 1 + z**2 / total
    centre = (proportion + z**2 / (2 * total)) / denominator
    spread = z * math.sqrt((proportion * (1 - proportion) + z**2 / (4 * total)) / total) / denominator
    return max(0.0, centre - spread), min(1.0, centre + spread)


def completed(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip()) and "TO_BE_COMPLETED" not in value


if __name__ == "__main__":
    main()
