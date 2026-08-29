# Coordinator runbook

## 1. Development verification

```powershell
cd F:\drawforfun\layered-redraw\studies\keeping-futures-contestable
npm test
npm run test:ui
npm run analyze:demo
```

Every demo output must remain labelled `synthetic: true` and `SYNTHETIC_PIPELINE_CHECK_NOT_EVIDENCE`.

## 2. Ethics-approved cognitive pilot

1. Complete the templates under `materials/`, obtain the applicable approval or written exemption determination, and archive the approved copies under `data/frozen/governance/`.
2. Generate the deterministic synthetic corpus and freeze a synthetic artefact manifest for the audience/expert cognitive pilot. Those artefacts are apparatus material only and never become main-study evidence.
3. Keep the study server stopped while setting `data_mode: human_research`, `collection_phase: cognitive_pilot`, both manifest paths to `../data/frozen/pilot-study-b-manifest.json`, `launch_record` to `../data/frozen/pilot-launch-record.json`, the review record, all governance fields, and `recruitment_open: true`.
4. Generate coordinator-only pilot sheets. Six makers gives the best sequence coverage; four is the minimum cognitive-pilot floor.

```powershell
npm run demo:generate
node scripts/build-study-b-manifest.mjs data/demo/returns data/frozen/pilot-study-b-manifest.json
node scripts/generate-participant-ids.mjs pilot-study-a 1 6 data/frozen/pilot-study-a-ids.csv
node scripts/generate-participant-ids.mjs pilot-study-b 1 12 data/frozen/pilot-study-b-ids.csv
node scripts/generate-participant-ids.mjs pilot-expert 1 2 data/frozen/pilot-expert-ids.csv
node scripts/freeze-package.mjs --stage cognitive-pilot --out data/frozen/pilot-package-freeze.json
npm run readiness:pilot
```

Start the server only after readiness returns `MECHANICALLY_READY_RESEARCHER_CONFIRMATION_REQUIRED` and an authorised researcher confirms the authoritative approval scope. Store all pilot returns under `data/pilot/`, never `data/raw/`.

## 3. Freeze main Study A

1. Resolve every pilot failure gate and complete `data/frozen/pilot-summary.json` from the template.
2. Freeze the pilot-informed power input/report, `data/frozen/study-b-model-config.json`, and `data/frozen/sample-plan.json`; if the audience target is infeasible, set `claimMode` to `formative_mechanism` and prohibit a population-effect claim.
3. Change `collection_phase` to `main`, set `launch_record` to `../data/frozen/study-a-launch-record.json`, confirm the approved governance scope includes the main study, and keep the server stopped while preparing the active config.
4. Generate the Study A allocation sheet and stage freeze, then run readiness.

```powershell
node scripts/generate-participant-ids.mjs study-a 1 18 data/frozen/study-a-ids.csv
node scripts/freeze-package.mjs --stage study-a --out data/frozen/study-a-package-freeze.json
npm run readiness:study-a
```

Study A does not yet have a Study B artefact manifest; the stage-specific freeze intentionally does not require one. The allocation sheet exposes internal assignments and must not be shown to participants or coders.

## 4. Study A collection

- Run `?mode=study-a` with assigned IDs.
- Preserve every original JSON return under `data/raw/study-a/`.
- Validate the corpus before building Study B:

```powershell
node scripts/validate-returns.mjs data/raw/study-a
node scripts/build-study-b-manifest.mjs data/raw/study-a data/frozen/study-b-manifest.json
```

Do not select outputs based on whether the assumption revision looks successful.

## 5. Freeze and collect Study B and the expert audit

After validating all Study A returns and building the unbiased manifest, update both manifest paths in the approved config to `../data/frozen/study-b-manifest.json`. Set `launch_record` to the Study B record, generate the frozen ID sheets using the pilot-informed maximum, then create the Study B freeze and readiness record. Stop the server before switching `launch_record` to the expert record and creating the separate expert freeze/readiness record.

```powershell
node scripts/generate-participant-ids.mjs study-b 1 144 data/frozen/study-b-ids.csv
node scripts/generate-participant-ids.mjs expert 1 7 data/frozen/expert-ids.csv
node scripts/freeze-package.mjs --stage study-b --manifest data/frozen/study-b-manifest.json --out data/frozen/study-b-package-freeze.json
npm run readiness:study-b
```

After Study B collection, stop the server and set `launch_record` to `../data/frozen/expert-launch-record.json`. Then create and verify the expert-stage freeze:

```powershell
node scripts/freeze-package.mjs --stage expert --manifest data/frozen/study-b-manifest.json --out data/frozen/expert-package-freeze.json
npm run readiness:expert
```

Replace `144` only with the frozen recruitment maximum, preserving a complete four-ID block.

- Update the approved configuration to the frozen Study B manifest.
- Run the audience and expert modes with separate ID namespaces.
- Each Study B participant should receive exactly three artefacts, one per brief; stop if the assignment does not match the frozen block record.
- Open and close Study B recruitment only at a complete four-ID block boundary. Do not add one participant to repair a favourable or unfavourable cell.
- Keep returns under `data/raw/study-b/` and `data/raw/expert/`.
- Do not show experts the coordinator manifest or technical report.

## 6. Blinded coding

```powershell
node scripts/prepare-coding.mjs data/raw data/coding/coder-template.csv data/frozen/condition-key.json
```

The explicitly separated key contains condition labels. Keep `data/frozen/condition-key.json` inaccessible to coders. Copy the CSV once per coder, fill `coder_id`, and retain original coder files. Freeze reliability, condition guesses, and adjudication before joining the key.

After coding is frozen, audit whether coders inferred condition:

```powershell
F:\drawforfun\.venv\Scripts\python.exe analysis\blinding_check.py `
  --coding data\coding\coder-1.csv `
  --coding data\coding\coder-2.csv `
  --key data\frozen\condition-key.json `
  --out data\coding\blinding-check.json
```

## 7. Analysis

```powershell
node scripts/analyze.mjs `
  --returns data/raw `
  --coding data/coding/adjudicated.csv `
  --key data/coding/adjudicated.key.json `
  --manifest data/frozen/study-b-manifest.json `
  --out data/analysis
```

Then run the Python analysis specified in `analysis/README.md`. Preserve null results, failed manipulation checks, missing data, and warrant conflicts.

## 8. Claim gate

No paper-facing claim is released until:

- human—not synthetic—returns validate;
- coder reliability and adjudication are frozen;
- exclusions are logged before condition unblinding;
- Study B sample target and model family match the frozen plan;
- comprehension and verbosity diagnostics are reported;
- technical and curatorial evidence remain separate;
- all results can be regenerated from the immutable corpus.
