# Analysis workflow

The browser and Node pipeline create traceable, analysis-ready CSV files. Confirmatory modelling is separate so that data-quality and coding joins can be frozen before model fitting.

## Order

1. Validate all immutable returns.
2. Generate a Study B manifest from all complete Study A trials without outcome-based selection.
3. Generate blinded coding units and keep the condition key away from coders.
4. Freeze exclusions, codebook reliability, and adjudicated codes.
5. Run `blinding_check.py` on original coder files and the still-sequestered key.
6. Run `scripts/analyze.mjs` to create analysis-ready tables.
7. Run `confirmatory_analysis.py` on the frozen tables.

On this workspace the available Python is:

```powershell
F:\drawforfun\.venv\Scripts\python.exe analysis\confirmatory_analysis.py `
  --study-a data\analysis\study-a-analysis-ready.csv `
  --study-b data\analysis\study-b-analysis-ready.csv `
  --study-b-model-config data\frozen\study-b-model-config.json `
  --out data\analysis\confirmatory
```

Synthetic inputs are refused unless `--allow-synthetic` is supplied. Even with that flag, every output is headed `SYNTHETIC PIPELINE CHECK — NOT EVIDENCE`.

Run condition-blind coding reliability before opening the key:

```powershell
F:\drawforfun\.venv\Scripts\python.exe analysis\coding_reliability.py `
  --coding data\coding\coder-1.csv `
  --coding data\coding\coder-2.csv `
  --out data\coding\reliability.json
```

`power_sensitivity.py` reports planning sensitivity under simplified independent-normal assumptions. Those values are optimistic and cannot justify the formal target.

After the cognitive pilot, copy `templates/study-b-power-input.template.json` to the frozen data area and replace its nuisance parameters with pilot estimates. Choose the smallest effect scenarios on substantive grounds rather than copying the observed pilot contrast. Then run:

```powershell
F:\drawforfun\.venv\Scripts\python.exe analysis\study_b_power_simulation.py `
  --inputs data\frozen\study-b-power-input.json `
  --out data\frozen\study-b-power-report.json
```

The simulation follows the four-ID protocol/workflow block, three observations per participant, negative-binomial count outcome, participant and artefact variation, and the planned two-way clustered covariance. It tests the average protocol contrast across the two balanced source workflows. Non-frozen template inputs are refused unless `--allow-template` is supplied; such output is labelled `PLANNING_PIPELINE_CHECK_NOT_SAMPLE_JUSTIFICATION` and cannot populate the final sample plan.

Copy `templates/study-b-model-config.template.json` into the frozen data area after the pilot. Its dispersion parameter must match the frozen power input, and its primary contrast must remain the equally weighted average across flat and layered source workflows. Human confirmatory analysis refuses to run without this frozen model configuration.

The primary Study B model does not adjust for response length or common-probe time because both occur after protocol assignment. A separate diagnostic model includes them to assess verbosity/exposure without presenting that adjustment as the causal estimand.
