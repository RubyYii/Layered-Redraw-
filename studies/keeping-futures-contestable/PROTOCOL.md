# Study protocol — version 0.2

## Research question

How do representational affordances during AI-mediated making and evaluative protocols during judgement jointly shape whether sociotechnical assumptions remain contestable?

`Contestability` means that an assumption can be noticed, questioned, revised, compared with an alternative, and left open to further challenge. It is not agreement, controversy, novelty, satisfaction, or visual polish.

## Paper claim licence before data collection

1. **Broad problem:** generative interfaces and evaluation protocols can make embedded sociotechnical assumptions difficult to inspect or can prematurely reduce speculative quality to correctness.
2. **Exact paper contribution:** a sequential mixed-method study of contestability across three visual micro-speculations, two making workflows, and two evaluation protocols, accompanied by a traceable cross-stage warrant analysis.
3. **Primary empirical claim:** no human empirical claim exists before formal data collection and frozen analysis.
4. **Headline hypothesis:** speculative quality may depend on keeping assumptions contestable across making and evaluation rather than on technical correctness alone.
5. **Licensed scope:** recruited makers and intended audiences; the three included briefs; the implemented flat/layered workflows; the implemented closed/open protocols; the recorded measures and coding process.
6. **Explicitly unlicensed claims:** all speculative design benefits from semantic layers; open evaluation is always superior; ambiguity is inherently valuable; technical evidence never predicts curatorial value; the five warrant classes are universal.

Repair layer: **`research_design`** until participant evidence exists.

## Stimuli

The study uses three independent micro-speculative artefacts, not a narrative script:

1. `cooling-credit-2035`: a public cooling-credit interface.
2. `carelink-home-2032`: a domestic care-monitoring service card.
3. `common-ground-2040`: a community flood-adaptation allocation notice.

Each brief includes a purpose, intended audience, three seeded assumptions, one stakeholder challenge, one comprehension item, and one deliberately unresolved tension. The unresolved tension is not automatically labelled productive ambiguity.

Each artefact also uses a fixed, text-free inline vector scene: a heat-allocation field, a domestic-care rhythm, or an estuary contour. All three scenes share the same frame, grid, accent roles, line hierarchy, and approximate visual density. The scene is constant across making and evaluation conditions; only the predeclared `visual` state fields can change. These graphics make the artefacts legible as designed future services without encoding a preferred response to the stakeholder challenge.

## Study A — making

### Design

- Participants: target `N=18` analysable speculative/design practitioners or advanced design students in three complete six-person allocation blocks. If exclusions break the planned cell balance, issue one additional complete block, for a maximum of `N=24`; never stop or extend because the condition contrast looks favourable.
- Design: within participant; two tasks per participant; one `flat` and one `layered` condition.
- Counterbalancing: six deterministic sequences balance brief, condition, and position inside each complete six-person ID block. Coordinator-issued IDs must end in consecutive positive integers.
- Apparatus: a disclosed, deterministic, pre-generated editing simulator. It sends no prompt to a provider and eliminates model stochasticity from the condition comparison.

### Conditions

- `flat`: one whole-output canvas; the system infers a likely target from the participant's prompt and offers whole-output candidates that may include collateral changes.
- `layered`: named semantic regions can be selected; changes are limited to selected regions.

Both conditions use the same base artefacts, seeded semantic alternatives conditional on candidate target and attempt, number of attempts, candidate history, undo, time guidance, and final reflection questions. Condition names are not shown to participants. The contrast therefore concerns semantic addressability and locality, not the presence versus absence of reversibility.

### Procedure

1. Study information and consent gate.
2. Neutral inspection before condition-specific controls appear.
3. Initial description of purpose and embedded assumptions.
4. Stakeholder challenge is revealed.
5. Participant writes a revision instruction and explores up to three candidates.
6. Participant selects or rejects a final state.
7. Participant states what assumption changed, what remained unresolved, and what unintended changes occurred.
8. Short retrospective comparison after both tasks.

### Primary material

- Pre-edit and post-edit assumption responses.
- Final revision state and exact state diff.
- Event log: prompts, inferred/selected targets, candidate generation, apply, undo, reject, and timing.
- Revision rationale and unresolved issue.

### Outcomes

- Primary: independently coded contestatory revision action (`0`, `1`, `2`): whether the participant uses an adopt/reject/undo decision to identify and challenge an assumption, explain an affected relation, and retain a new or unresolved trade-off. A fixed candidate alone cannot satisfy the outcome.
- Mechanism outcomes: new assumptions noticed after controls appear; rationale specificity; revision/reversal episodes.
- Manipulation check: summed deterministic collateral-change exposure outside each generated candidate's target. It is calculated candidate by candidate, including rejected candidates, to verify locality without misclassifying later undo or target changes. It is not treated as a participant-effect finding.
- Secondary descriptive outcomes: time, candidate count, undo count, perceived control.

The study is not powered to establish population-level workflow superiority. Paired estimates describe the scoped mechanism; trace-based qualitative analysis explains when and how assumption-level revision occurs.

## Study B — evaluation

### Design

- Planning target: at least 128 analysable intended-audience participants (64 per protocol), with approximately 144 recruited to allow for predeclared exclusions and attrition. Recruitment and stopping occur only after complete four-ID blocks; if exclusions reduce balance, continue with full blocks rather than replacing a single condition cell. A pilot-based simulation must freeze the final target and maximum before confirmatory outcomes are inspected. If that target is infeasible, Study B is explicitly reclassified as a formative mechanism study and cannot support a population-level protocol-effect claim.
- Protocol is between participant: `closed` or `open`.
- Each participant sees three artefacts: one technically valid output from each brief. A four-ID balanced incomplete block crosses protocol with source workflow so that, within every four consecutive IDs, both protocols contain one `flat` and one `layered` observation for every brief. This avoids direct same-brief comparison and reduces fatigue.
- The frozen manifest retains technical failures, but they cannot enter audience or expert presentation. Every brief × workflow cell must contain a technical `PASS` before assignment opens.
- Protocol, source-workflow pattern, artefact selection, and order are deterministic from coordinator-issued numeric IDs and a frozen manifest.

### Protocol manipulation

- `closed`: defect, compliance, clarity, completeness, unmet requirement, minimum fix, rating, and `PASS`/`FAIL` judgement with an artefact-grounded rationale.
- `open`: plausible readings, unresolved tension, affected stakeholders, and alternative arrangements.

Both protocols contain four required free-text prompts before the common probe. Pilot timing must confirm that one condition is not merely receiving substantially more exposure or writing practice.

After the assigned protocol, every participant receives the identical neutral probe. Primary protocol comparisons use only this common probe, preventing the treatment questions themselves from being counted as outcomes.

### Outcomes from the common probe

- Primary: grounded interpretive breadth — number of distinct interpretations tied to visible artefact evidence.
- Secondary: assumptions noticed; stakeholder/power relations noticed; alternative futures proposed; perceived closure.
- Falsification/guard outcome: basic comprehension. More interpretations accompanied by loss of basic comprehension are not called productive ambiguity.
- Diagnostic: response length, protocol time, and common-probe time. Because these occur after assignment, they are reported in a separate diagnostic model and are not treated as baseline causal covariates.

## Expert curatorial audit

For the planned `N=18` Study A manifest, recruit six analysable speculative-design experts (issue a seventh ID as attrition reserve). Each expert receives two technical-`PASS` artefacts from every brief × workflow cell, 12 items total, under a cyclic balanced assignment. This yields two independent expert judgements per artefact when every cell contains six items. If an added Study A block or technical exclusions change cell sizes, set the analysable expert target to at least the largest eligible cell size or explicitly narrow the audit before opening expert sessions.

Experts do not see source workflow, technical status, or audience outcomes before deciding `KEEP`, `REVISE`, or `REJECT` for the stated speculative purpose and audience. They provide an artefact-grounded reason.

Technical `PASS` is produced separately by schema, completeness, state-diff, hash, and provenance checks. No expert is asked to merge technical and curatorial judgements.

## Cross-stage synthesis

For every artefact, retain separate warrants:

- technical integrity;
- provenance and traceability;
- maker contestation/revision;
- audience interpretation/discourse;
- expert curatorial decision.

Analyse discordant cases and their rationales. Do not average these warrants into a quality score. The internal five-class PACT vocabulary is used only as a sensitising lens after inductive coding.

## Exclusion and stopping rules

- Cognitive-pilot IDs use the `PILOT-*` namespace and their returns remain outside the main corpus. Main collection rejects both `DEMO-*` and `PILOT-*` IDs.
- Exclude duplicate IDs, missing consent, impossible timestamps, incomplete primary tasks, or a failed attention/comprehension check according to the frozen exclusion log.
- Do not exclude a response because it contradicts the hypothesis or is artistically disliked.
- Stop a session on participant request, distress, corrupted apparatus state, or accidental personal-data entry.
- Stop recruitment if the app version, stimulus hash, or assignment manifest changes unexpectedly.

## Construct-failure gates

- If `layered` mainly changes speed or surface polish but not assumption-level activity, narrow the claim to workflow mechanics.
- If the `open` protocol only increases word count, do not claim greater interpretive agency.
- If interpretive breadth rises while comprehension materially falls, describe confusion rather than productive ambiguity.
- If technical and curatorial decisions do not show repeated, interpretable discordance, do not claim non-substitution.
