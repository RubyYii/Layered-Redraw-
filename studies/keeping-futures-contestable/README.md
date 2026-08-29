# Keeping Futures Contestable

Local-first experiment package for the HCI study:

> How do representational affordances during making and evaluative protocols during judgement jointly shape whether sociotechnical assumptions remain contestable?

## Current status

**`IMPLEMENTED_FOR_SYNTHETIC_PILOT / NOT APPROVED FOR HUMAN RECRUITMENT`**

The package contains the apparatus, fixed stimuli with deterministic inline vector scenes, counterbalancing, local audit trail, return validators, blinded coding preparation, descriptive analysis, an ethics/pilot handoff packet, stage-specific freezes, and a synthetic end-to-end test. It contains **no human results**. The default configuration rejects non-demo participant IDs. Cognitive-pilot and main-study IDs are also kept in separate namespaces.

## One research spine

1. **Study A — making:** compare prompt-mediated whole-output revision with semantically addressable local revision; both retain candidate history and undo.
2. **Study B — evaluation:** compare a closed defect/compliance protocol with an ambiguity-preserving open protocol, followed by an identical neutral probe.
3. **Cross-stage audit:** keep technical integrity, provenance, maker contestation, audience interpretation, and expert curatorial `KEEP` separate. No composite quality score is produced.

Layered Redraw is an enabling apparatus, not the paper's primary contribution. The study tests a scoped claim about three visual micro-speculations, not a universal claim about speculative design.

## Run locally

Requirements: Node.js 22 or newer. No API key, package install, network connection, or external model is required.

```powershell
cd F:\drawforfun\layered-redraw\studies\keeping-futures-contestable
npm test
npm run demo:generate
npm run start
```

The launcher opens `http://127.0.0.1:4177/`. Available modes:

- `/web/index.html?mode=study-a`
- `/web/index.html?mode=study-b`
- `/web/index.html?mode=expert`
- `/web/index.html?mode=coordinator`

Use IDs beginning with `DEMO-` while the ethics gate is closed. Data remain in the browser until the participant downloads a JSON return. The app makes no non-local request.

## Before any real participant session

1. Obtain the required institutional ethics approval or written exemption.
2. Replace all `TO_BE_COMPLETED_BY_RESEARCHER` fields in the ethics materials.
3. Complete a cognitive pilot with 4–6 makers and 8–12 audience participants.
4. Confirm that the manipulation changes workflow framing without making one condition visibly broken.
5. Freeze the protocol, stimuli, codebook, app version, and analysis plan.
6. Change the ethics gate only through an explicit, recorded researcher decision.
7. Generate coordinator-controlled numeric-suffix IDs in complete allocation blocks; do not let participants choose identifiers.
8. Run the stage-specific readiness command and require `MECHANICALLY_READY_RESEARCHER_CONFIRMATION_REQUIRED` before starting the server.

See [PROTOCOL.md](PROTOCOL.md), [PREREGISTRATION.md](PREREGISTRATION.md), [CODEBOOK.md](CODEBOOK.md), [ETHICS_HANDOFF.md](ETHICS_HANDOFF.md), and the editable packet in [materials/README.md](materials/README.md).

The latest verification and remaining human-only gates are recorded in [STATUS.md](STATUS.md).

## Data boundary

- Use assigned pseudonymous IDs only; do not enter names, email addresses, or contact details.
- Raw returns belong under `data/raw/` and are ignored by Git.
- Cognitive-pilot returns belong under `data/pilot/`, are ignored by Git, and never enter the main corpus.
- Synthetic examples live under `data/demo/` and carry `synthetic: true`.
- A result can be reported only when its source returns, coding version, exclusion log, and analysis command are traceable.
- Model or mock outputs are never treated as human evidence.

## Repository boundary

This study is isolated under `studies/keeping-futures-contestable/`. It does not modify the currently dirty Scene Builder source tree.
