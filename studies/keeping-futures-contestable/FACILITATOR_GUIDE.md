# Facilitator guide

## Before the session

1. Confirm the participant has an assigned pseudonymous ID.
   - Cognitive pilot: `PILOT-*` only.
   - Main collection: never `DEMO-*` or `PILOT-*`.
2. Confirm the app version and ethics badge match the approved archive.
3. Confirm the stage-specific readiness report passed and was researcher-confirmed before the server was started.
4. Open the correct mode and check that no prior participant session is visible.
5. Do not reveal the condition name, seeded assumptions, directional hypotheses, or expected result.

## Neutral introduction

> You will inspect and respond to several self-contained future artefacts. The editing system uses fixed pre-generated candidates so that participants encounter comparable behaviour; it does not send your text to an external model. We are interested in how you reason with the interface, not whether you find a predetermined answer. Please do not enter names or contact details.

Use the institutionally approved translation if the session language differs.

## Permitted prompts

- “Please say what you are noticing.”
- “Please use the interface in the way that makes sense to you.”
- “Could you point to the feature that informed that judgement?”
- “The system allows up to three candidates.”

## Prohibited coaching

- naming a seeded assumption;
- suggesting which semantic layer to select;
- describing one interpretation as more critical, ethical, creative, or correct;
- encouraging a participant to prefer ALPHA/BETA or PASS/FAIL;
- repairing a response so it fits the codebook.

## Incident handling

Stop the session and record a non-response incident code if:

- the participant withdraws;
- personal data are entered;
- the app version/config does not match the approved archive;
- the browser loses state and cannot restore it;
- a candidate or artefact fails to render;
- the facilitator accidentally reveals the hypothesis or condition.

Do not alter the raw return. Place incident metadata in a separate coordinator log.

## End of session

1. Ask the participant to download the JSON return.
2. Verify the filename and visible SHA-256 prefix.
3. Transfer the file using the approved mechanism.
4. Give the approved debrief, including the making/evaluation comparison and use of fixed candidates.
5. Clear browser progress before the next participant.
