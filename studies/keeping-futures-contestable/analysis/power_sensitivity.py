"""Simplified planning sensitivity; not the final clustered-study power model."""

from __future__ import annotations

import json

from statsmodels.stats.power import TTestIndPower, TTestPower


def main() -> None:
    paired = TTestPower()
    independent = TTestIndPower()
    report = {
        "status": "PLANNING_SENSITIVITY_ONLY",
        "warning": "Normal independent/paired approximations ignore count dispersion, crossed artefacts, and coding error; values are optimistic.",
        "study_a_paired_power": {
            str(n): {str(effect): paired.power(effect_size=effect, nobs=n, alpha=0.05, alternative="two-sided") for effect in (0.4, 0.5, 0.6, 0.8)}
            for n in (12, 18, 24)
        },
        "study_b_two_group_power": {
            str(total_n): {
                str(effect): independent.power(effect_size=effect, nobs1=total_n / 2, ratio=1, alpha=0.05, alternative="two-sided")
                for effect in (0.3, 0.4, 0.5, 0.6)
            }
            for total_n in (48, 60, 72, 96, 128, 144, 160, 192)
        },
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
