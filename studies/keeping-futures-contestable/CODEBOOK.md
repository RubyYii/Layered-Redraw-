# Coding manual — version 0.1

Coders work from blinded coding-unit files. They must not infer condition from formatting, file names, or event metadata. Pilot coding is used to revise definitions; the frozen main-study codebook receives a new version and hash.

After coding every unit, and before seeing any key, coders fill:

- `condition_guess`: Study A uses `WHOLE_OUTPUT`, `LOCAL_LAYERED`, or `UNSURE`; Study B uses `CLOSED_ORIENTED`, `OPEN_ORIENTED`, or `UNSURE`.
- `guess_confidence_0_2`: `0` guess/unsure, `1` some evidence, `2` strong evidence.

These fields diagnose possible unblinding. They are never used to discard inconvenient outcomes or to redefine the primary analysis.

## Study A codes

### `assumption_mentions`

Count distinct claims about who decides, who benefits or is excluded, what data count, what behaviour is treated as normal, who can appeal, and how responsibility is distributed. Paraphrases of the same claim count once.

### `contestatory_revision_0_2`

- `0`: no assumption-level action; the response is purely visual/preferential, accepts a candidate without identifying a relation, or cannot explain a rejection.
- `1`: an adopt, reject, or undo decision names an embedded assumption or affected stakeholder, but does not explain how authority, inclusion, evidence, appeal, risk, or responsibility changes.
- `2`: the participant connects the prior assumption, their adopt/reject/undo decision, an affected stakeholder or power relation, an expected consequence, and at least one new or still-unresolved trade-off.

Use the locked pre-edit response, participant prompt, candidate decisions, final state diff, and post-edit rationale together. A prewritten candidate, semantic state change, fluent explanation, or longer answer never earns a positive code by itself. A reasoned refusal can score `1` or `2` even when the final state returns to baseline.

### `rationale_specificity_0_2`

- `0`: preference without a reason.
- `1`: names a stakeholder or issue but not the changed relation.
- `2`: identifies the prior assumption, affected stakeholder, changed mechanism, and expected consequence.

### `new_assumption_count`

Number of assumption categories present after the editor is revealed but absent from the neutral pre-edit response. This is a descriptive mechanism measure; layer labels may legitimately cause the difference.

### `unresolved_issue_present`

Binary. The participant identifies a meaningful issue that remains open after revision. Mere incompleteness or a software defect does not count.

## Study B common-probe codes

### `grounded_interpretation_count`

Count distinct readings of what the artefact means or could institute. Each counted reading must cite or clearly refer to a visible feature, wording, relation, omission, or control in the artefact. Unsupported speculation does not count.

The blinded coding unit includes the artefact state and common-probe response so grounding can be checked. It omits protocol and source-workflow labels; coders record a post-code condition guess because the state or prose may nevertheless make a condition inferable.

### `assumption_count`

Count distinct embedded assumptions using the Study A categories.

### `stakeholder_power_0_2`

- `0`: no stakeholder or distributional relation.
- `1`: stakeholder is named, but authority, benefit, burden, or exclusion is not explained.
- `2`: at least one concrete authority, benefit, burden, exclusion, or accountability relation is explained.

### `alternative_future_count`

Count distinct alternative institutional or interaction arrangements. A colour, font, or layout preference is not an alternative future unless it changes participation or decision relations.

### `confusion_0_2`

- `0`: basic situation is understood.
- `1`: some uncertainty, but actor, resource/service, and decision remain identifiable.
- `2`: response cannot identify the basic situation or contradicts the fixed comprehension key.

### Productive-ambiguity case flag

For qualitative retrieval only, flag cases with at least two grounded interpretations, `confusion_0_2 <= 1`, and at least one relevant assumption or alternative. Do not analyse this flag as a universal quality score.

## Expert audit codes

Experts directly select:

- `KEEP`: retain for the stated speculative encounter without a material revision.
- `REVISE`: potentially valuable, but a named change is required before use.
- `REJECT`: unsuitable for the stated purpose/audience even if technically valid.

The rationale must identify artefact evidence and its relation to the stated purpose. Aesthetic taste without a purpose-linked reason is marked `insufficient_rationale` during quality control, not silently repaired.

## Reliability workflow

1. Double-code all pilot units.
2. Discuss ambiguities and revise the pilot codebook without examining condition effects.
3. Freeze the main codebook and coder training examples.
4. Double-code at least 25% of main-study units selected independently of condition.
5. Report agreement per code using the preregistered interval-distance Krippendorff alpha implemented in `coding_reliability.py` for ordered and count fields (binary `0/1` reduces to the same disagreement distance). Also report the number of double-coded units; add a count-ICC sensitivity analysis only if frozen before condition unblinding.
6. Freeze codes and condition guesses, then run the blinding diagnostic before opening condition-level outcome summaries.
7. If a primary code remains unstable, recode after revising its definition or narrow the claim. Do not select a more favourable coder post hoc.

Adjudicated values are stored separately from both original coder records.
