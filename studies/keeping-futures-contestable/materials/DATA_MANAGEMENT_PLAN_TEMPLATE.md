# Data management plan template

> Complete and obtain institutional approval before human collection. Do not place credentials, contact lists, signed consent forms, or identifiable incident narratives in the study repository.

## Record classes

| Record | Identifier | Location | Access | Retention/deletion |
|---|---|---|---|---|
| Recruitment contacts | `{{CONTACT_RECORD_ID}}` | `{{SEPARATE_CONTACT_SYSTEM}}` | `{{CONTACT_ACCESS}}` | `{{CONTACT_RETENTION}}` |
| Consent record | `{{CONSENT_RECORD_ID}}` | `{{SEPARATE_CONSENT_SYSTEM}}` | `{{CONSENT_ACCESS}}` | `{{CONSENT_RETENTION}}` |
| App response JSON | Assigned study ID only | `{{ENCRYPTED_RESPONSE_STORAGE}}` | `{{RESPONSE_ACCESS}}` | `{{RESPONSE_RETENTION}}` |
| Coordinator allocation/flow logs | Assigned study ID only | `{{COORDINATOR_STORAGE}}` | `{{COORDINATOR_ACCESS}}` | `{{COORDINATOR_RETENTION}}` |
| Coding files | Coding-unit IDs | `{{CODING_STORAGE}}` | `{{CODER_ACCESS}}` | `{{CODING_RETENTION}}` |
| Publication extracts | De-identified IDs | `{{PUBLICATION_STORAGE}}` | `{{PUBLICATION_ACCESS}}` | `{{PUBLICATION_RETENTION}}` |

## Pseudonymisation and linkage

The app accepts coordinator-issued IDs and does not ask for names or contact details. The contact-to-study-ID link, if one is required for compensation or withdrawal, is stored separately at `{{LINKAGE_LOCATION}}`, accessible only to `{{LINKAGE_CUSTODIANS}}`, and destroyed at `{{LINKAGE_DELETION_POINT}}`.

Pilot IDs begin `PILOT-` and are stored outside `data/raw/`; they never enter confirmatory analysis. Main IDs reject `DEMO-` and `PILOT-` prefixes. Synthetic records are marked `synthetic: true`.

## Collection and transfer

Responses remain in browser local storage until a participant downloads a JSON file. The approved transfer procedure is `{{APPROVED_TRANSFER_PROCEDURE}}`. The coordinator verifies the filename and displayed checksum prefix without opening responses in front of the participant. No raw return is sent to an external model provider.

## Integrity and derived data

Original JSON returns are immutable. Checksums are recomputed at import; changes are recorded in a separate amendment log, never written into the raw file. Condition keys are sequestered from coders. Exclusions, adjudication, and sample stopping are frozen before opening the condition key. Synthetic pipeline outputs remain labelled `SYNTHETIC_PIPELINE_CHECK_NOT_EVIDENCE`.

## Accidental personal information

If a participant enters potentially identifying information, the facilitator stops the session and applies `{{QUARANTINE_REVIEW_REDACTION_OR_DELETION_PROCEDURE}}`. The affected file is not placed in the ordinary corpus or uploaded to any model. Incident metadata use a non-response code and contain the minimum information authorised by the protocol.

## Withdrawal

Requests arrive through `{{WITHDRAWAL_CONTACT}}` using the assigned study ID. Before `{{WITHDRAWAL_DEADLINE}}`, the authorised custodian locates and deletes or quarantines `{{WITHDRAWAL_SCOPE}}`, records only the approved flow status, and confirms completion by `{{CONFIRMATION_METHOD}}`. Limits after irreversible anonymised aggregation are described consistently in every participant document.

## Access, backup, retention, and destruction

- Data controller: `{{DATA_CONTROLLER}}`
- Primary storage: `{{PRIMARY_STORAGE}}`
- Backup and recovery: `{{BACKUP_AND_RECOVERY}}`
- Role-based access: `{{ROLE_BASED_ACCESS}}`
- Review cadence: `{{ACCESS_REVIEW_CADENCE}}`
- Retention: `{{RETENTION_PERIOD_AND_BASIS}}`
- Destruction method and owner: `{{DESTRUCTION_METHOD_AND_OWNER}}`

## Publication and artefact reuse

Aggregate statistics may be released. A short quotation or artefact image is used only when the corresponding separate consent permits it and the investigator confirms that the content is not identifying. The release log records the source study ID, consent scope, redaction decision, and publication destination without exposing the identity link.

