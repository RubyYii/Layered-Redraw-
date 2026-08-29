# Ethics and recruitment handoff

The software is deliberately locked to `demo_only`. This document is not an ethics approval and does not replace institutional review.

Editable participant and application templates are indexed in `materials/README.md`. Every placeholder must be replaced in the institutionally approved copies, which belong under the ignored `data/frozen/governance/` directory.

Coordinator-issued human participant and expert IDs must end in consecutive positive integers (for example `A-001`, `B-001`, `E-001`). The numeric suffix drives blocked allocation; do not reuse, skip strategically, or let participants choose IDs. Record unused and withdrawn IDs in the flow log.

## Researcher must complete

- institution and responsible investigator;
- ethics application or exemption identifier;
- approved protocol version and date;
- participant population and jurisdiction;
- compensation;
- inclusion/exclusion criteria;
- recruitment channel;
- contact and complaints route;
- withdrawal mechanism and deadline;
- data controller, storage location, retention, and deletion policy;
- treatment of free text that accidentally contains personal information;
- accessibility and distress procedures;
- permission to reuse de-identified artefact outputs in publications or supplementary material.

## Minimum information-sheet content

Participants must be told:

- the study concerns how interfaces and evaluation prompts shape revision and interpretation;
- the editing system uses fixed, pre-generated candidates and does not contact an external AI provider;
- responses and interaction timestamps are recorded locally and exported as JSON;
- no names or contact details should be entered into the study app;
- participation is voluntary and can stop without giving a reason;
- whether quotations or generated artefacts may be published;
- how compensation, withdrawal, retention, and complaints work.

Avoid revealing directional hypotheses before task completion while describing the procedures truthfully.

## Activation gate

After approval or a written exemption determination, an authorised researcher must complete every governance field in `config/study-config.json`. For a cognitive pilot, the minimum stage fields include:

```json
{
  "data_mode": "human_research",
  "collection_phase": "cognitive_pilot",
  "review_route": "approval",
  "ethics_status": "APPROVED",
  "approved_protocol_id": "INSTITUTIONAL_ID",
  "approval_date": "YYYY-MM-DD",
  "protocol_version": "APPROVED_VERSION",
  "participant_documents_version": "APPROVED_VERSION",
  "launch_record": "../data/frozen/pilot-launch-record.json",
  "recruitment_open": true
}
```

Use `review_route: "exemption"` together with `ethics_status: "EXEMPTION_CONFIRMED"` only when an authoritative institutional determination says this route applies. The exact configuration, approved participant documents, application files, stimuli, allocation sheets, and hashes must be archived before the first participant. Keep the server stopped while preparing an active configuration; run the applicable readiness check before exposing the participant URL.

```powershell
npm run readiness:pilot
npm run readiness:study-a
npm run readiness:study-b
npm run readiness:expert
```

A passing report writes a stage-specific launch record and says `MECHANICALLY_READY_RESEARCHER_CONFIRMATION_REQUIRED`; it does not establish institutional approval. The browser rechecks the config, package-freeze bundle, and runtime file hashes against that record before accepting a human session. The current repository must return `BLOCKED` until real approvals, documents, pilots, and freezes exist.

## Session safety

- Use only assigned pseudonymous IDs.
- Use `PILOT-*` IDs only for the cognitive pilot and store those returns under `data/pilot/`; main collection rejects both `DEMO-*` and `PILOT-*` IDs.
- If personal information is entered, stop, quarantine the return, and follow the approved removal procedure.
- Do not upload raw returns to external model services.
- Do not coach a participant toward one seeded assumption.
- Preserve withdrawals and exclusions in a separate flow log without retaining withdrawn response content beyond the approved policy.
