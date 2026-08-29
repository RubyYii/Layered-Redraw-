# Stimulus construct audit

This register prevents visual defects or topic familiarity from being relabelled as productive ambiguity.

| Brief | Fixed purpose | Seeded assumptions | Stakeholder challenge | Deliberately unresolved tension | Comprehension anchor |
|---|---|---|---|---|---|
| `cooling-credit-2035` | Discuss allocation of public cooling resources | smartphone-linked access; compliance-based ranking; no personal review | worker without a smartphone cannot access the service | predicted vulnerability versus resident-defined need | identifies public cooling resources |
| `carelink-home-2032` | Discuss consent and intervention in domestic care monitoring | persistent default consent; full family visibility; deviation equals risk | monitored person did not consent to continuous family access | emergency protection versus everyday autonomy | identifies home care monitoring |
| `common-ground-2040` | Discuss representation and evidence in flood adaptation | owners-only vote; asset value as sole loss measure; highest-value area first | long-term renters carry displacement risk without votes | existing assets versus vulnerable residents | identifies community flood resources |

## Equivalence requirements

- The same base state is used in ALPHA and BETA.
- The fixed inline vector scene for each brief is identical in ALPHA, BETA, Study B, and expert audit. The three scenes share one frame, grid, accent grammar, line hierarchy, and comparable visual density; they contain no instruction text or proposed solution.
- The same three semantic fields and three alternatives per field are available to both candidate generators.
- Candidate limits and time guidance are equal.
- BETA preserves unselected fields; each ALPHA candidate introduces exactly one mild, logged collateral semantic or visual change. Pilot participants must not experience ALPHA as visibly broken.
- The frozen Study B manifest retains every complete Study A output and its technical status. Each audience participant receives one item per brief under the four-ID balanced incomplete block; across the block, every protocol × brief × source-workflow cell is represented. A cell with no technical PASS blocks assignment rather than being silently replaced.
- Artefact IDs and presentation order are blinded. Source workflow remains in the coordinator manifest only.

## Pilot rejection criteria

Reject or revise a stimulus when:

- fewer than 80% of pilot audiences answer its basic comprehension item correctly;
- the seeded challenge has only one superficial visual response;
- participants need domain expertise to understand the service being depicted;
- one field contains an obviously moralised “correct” alternative;
- a typography, truncation, contrast, or interaction defect dominates interpretation;
- a scene graphic disproportionately reveals one seeded assumption, suggests a preferred revision, or attracts substantially more attention than the other two graphics;
- the unresolved tension cannot generate at least two evidence-grounded readings in pilot interviews.

## Visual stimulus version

- Current visual set: `specimen-art-v2` in package `kfc-0.2.0`.
- `cooling-field`: abstract district blocks, allocation route, and heat field; no access mechanism or appeal solution is pictured.
- `care-rhythm`: abstract domestic boundary and monitoring rhythm; no consent or sharing solution is pictured.
- `estuary-contours`: abstract parcels and water contours; no voting, evidence, or protection solution is pictured.
- All scenes are inline SVG rendered from `web/ui.mjs`; no external assets or requests are used.
