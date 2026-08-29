# Preregistration draft — freeze before recruitment

This document is a protocol draft, not a registered record. Replace `DRAFT` with the registry identifier and immutable file hashes before formal recruitment.

## Registered questions

### Study A — mechanism estimation

Within the scoped simulator, how does semantically addressable local editing change assumption-level revision activity relative to prompt-mediated whole-output editing, when both provide candidate history and undo?

- `A-Q1`: estimate the paired difference in contestatory revision action and use interaction traces to explain when the difference appears or fails to appear. This is not a population-level superiority test.
- `A-M1` manipulation check: the layered condition must preserve unselected semantic and visual fields, while whole-output candidates may introduce one logged, mild collateral change per generated candidate. Exposure is summed per candidate, including rejections, and is enforced apparatus behaviour rather than a human-effect hypothesis.
- `A-G1`: a difference is not interpreted as contestability if it reflects only task time, candidate count, perceived ease, surface polish, or a failure to offer the same intended semantic alternative conditional on target and attempt.
- `A-V1` visual equivalence: each brief's fixed vector scene is identical across ALPHA/BETA and downstream evaluation. The three scenes use a shared frame and visual grammar, contain no embedded instruction text, and are not outcome measures. Pilot interviews must test whether a scene disproportionately cues one seeded challenge or preferred revision.

### Study B

Does an ambiguity-preserving evaluation protocol alter subsequent interpretation of the same artefacts relative to a closed defect/compliance protocol?

- `B-H1`: the open protocol increases grounded interpretive breadth in the common neutral probe.
- `B-H2`: the open protocol increases noticed assumptions and proposed alternatives.
- `B-H3`: an increase is interpreted as productive only when basic comprehension is retained and the effect is not reducible to response length or dwell time.

### Cross-stage audit

- `X-Q1`: which artefacts receive technical `PASS` but expert `REVISE` or `REJECT`, and why?
- `X-Q2`: which technically valid artefacts generate interpretive closure, confusion, or grounded plurality among audiences?
- `X-Q3`: do making traces explain any of these discordances?

These are case-oriented questions. No universal five-factor scale or aggregate quality score will be estimated.

## Sample plan

- Study A: `N=18` analysable in complete six-ID blocks; one additional full block is permitted only to repair predeclared integrity/exclusion loss, giving `N=24` maximum.
- Study B: planning floor `N=128` analysable, approximately `N=144` recruited, with final target/maximum frozen from pilot-informed crossed-data simulation. Recruitment stops only at four-ID block boundaries.
- Expert audit: six analysable experts for the planned 36-item manifest, plus one reserve. Each sees 12 items (two per brief × workflow cell). If the eligible cell size exceeds six, expand the analysable expert target to at least the largest cell size or narrow the audit before collection.

No target is changed in response to an observed condition effect.

## Primary outcomes

- Study A: `contestatory_revision_0_2`, coded from pre/post response, candidate decisions, final state diff, and rationale by label-blinded coders. A prewritten candidate or state change alone never earns a positive code.
- Study B: `grounded_interpretation_count`, coded only from the common neutral probe by protocol-blinded coders.

## Secondary outcomes

- Study A: new assumption count; rationale specificity; undo/rejection episodes; time; perceived control. Candidate-level off-target exposure is reported separately as an apparatus manipulation check.
- Study B: assumptions noticed; stakeholder/power notice; alternatives count; comprehension correctness; perceived closure; word count; dwell time.
- Cross-stage: technical × curatorial decision table and qualitative warrant-conflict types.

## Analysis populations

- `intention_to_observe`: every consented, started session, retained for flow reporting.
- `complete_case_primary`: sessions meeting the predeclared completion and data-integrity rules.
- `sensitivity`: complete cases excluding failed comprehension/attention checks.

The exclusion log is generated before condition labels are joined to coded outcomes.

## Models

- Study A: participant-stratified paired estimate with bootstrap confidence intervals, accompanied by trace-linked case analysis. Order and brief are reported as scoped sensitivity descriptions; no dichotomous population-superiority decision is made.
- Study B primary: count or overdispersed count model with protocol, artefact source workflow and their interaction, brief, and presentation order. The primary estimand is the average protocol contrast across the two equally weighted source workflows; participant and artefact are clustering units.
- Study B diagnostic: fit a separately labelled model adding response length and common-probe time. These post-assignment variables diagnose verbosity/exposure but are not treated as pre-treatment confounders or used to replace the primary effect estimate.
- Study B comprehension: report protocol-specific proportions and uncertainty; use it as a falsification check, not as a covariate that silently rescues a failed manipulation.
- Cross-stage: contingency tables plus trace-linked qualitative cases. Association does not establish substitutability.

Exact model family and power target must be frozen after the pilot nuisance-parameter check and crossed participant × artefact simulation, before confirmatory outcomes are inspected. The smallest effect of interest must be justified substantively rather than chosen from the observed pilot condition contrast. Report null and negative findings.

## Multiplicity

Each study has one primary outcome. Secondary outcomes are labelled secondary; interaction and brief-specific effects are exploratory unless separately powered. Do not choose the headline result after seeing which measure is significant.

## Missing data

Do not impute missing free-text judgements. Report missingness by stage and condition. A session missing the primary common probe is not a complete primary case.

## Blinding

- Study A coders do not receive workflow labels; because final-state diffs may reveal locality, they record a condition guess and confidence only after coding each unit.
- Study B coders do not receive protocol or source-workflow labels; they likewise record a post-code protocol-orientation guess and confidence.
- Experts do not receive source workflow, technical status, audience results, or provider identity.
- Condition labels are joined only after codebook reliability and the exclusion log are frozen.

## Evidence boundary

Synthetic demo records, cognitive-pilot returns, developer smoke tests, system logs without human participation, and earlier CAC annotations are excluded from all confirmatory analyses. Pilot records use `PILOT-*` IDs and are stored outside the main corpus.
