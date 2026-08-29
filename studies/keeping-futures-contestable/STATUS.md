# Experiment completion status — 2026-08-28

## State

- `APPARATUS_COMPLETE`
- `SYNTHETIC_PIPELINE_VERIFIED`
- `HUMAN_EVIDENCE_NOT_COLLECTED`
- `ETHICS_GATE_CLOSED`
- `PROTOCOL_REQUIRES_COGNITIVE_PILOT_BEFORE_FREEZE`
- `HUMAN_HANDOFF_PACKET_COMPLETE`
- `STAGE_READINESS_CHECK_IMPLEMENTED`
- `STIMULUS_VISUAL_SET_SPECIMEN_ART_V2`

This is the maximum scientifically valid completion state without institutional approval, recruited participants, and independent coders. Synthetic records verify execution only; they are not evidence for any HCI claim.

The human-study packet now includes editable ethics, information-sheet, consent, recruitment, debrief, and data-management templates; pilot/flow/deviation/freeze record templates; pilot-versus-main ID separation; stage-specific package freezes; and a fail-closed readiness command. These materials reduce operational risk but do not satisfy any human-evidence deficit.

## Implemented study

- Study A: paired making tasks using six-sequence blocked counterbalancing; target `N=18` analysable, with at most one complete six-person replacement block (`N=24` maximum) if exclusions break balance.
- Study B: protocol between participants; three artefacts per participant under a four-ID balanced incomplete block; planning target at least `N=128` analysable and approximately `N=144` recruited, subject to pilot-based clustered simulation.
- Expert audit: six analysable blinded reviewers for the planned 36-item manifest (plus one reserve), using a cyclic cell-balanced assignment that gives each artefact two judgements; target expands if the eligible manifest expands.
- Cross-stage synthesis: technical, provenance, maker, audience, and curatorial warrants remain separate; no composite quality score.

## Latest verification

- Node unit/integration tests: `24/24 PASS`, including a complete synthetic governance fixture, deterministic visual coverage for all three briefs, and a fail-closed check against unreviewed motifs.
- Browser smoke test: all three fixed inline vector scenes and both Study B protocols exercised; expert visible-UI leak check `PASS`; coordinator-only file access `BLOCKED_403`; `0` non-local requests; `0` console errors; seven desktop/mobile screenshots captured.
- Synthetic corpus: `27` immutable-checksum returns validated (`12` Study A, `12` Study B, `3` expert).
- Analysis-ready rows: `24` Study A trials, `36` Study B trials, `36` expert trials.
- Python confirmatory, reliability, blinding-diagnostic, syntax, and planning-sensitivity scripts executed successfully on explicitly synthetic inputs. The confirmatory Study B script now reports the same workflow-averaged protocol contrast used by the crossed power simulation and refuses human analysis without a frozen model configuration.
- Crossed participant × artefact Study B power simulation passed a labelled template pipeline check; it does not recommend a target until pilot nuisance parameters and substantively chosen smallest effects are frozen.
- CLI checks generated allocation sheets, a 24-artefact manifest, and 60 blinded coding units.
- Latest demo package freeze: package `kfc-0.2.0`, schema `kfc-package-freeze/0.2`, `71` files; the authoritative bundle SHA-256 is stored in `artifacts/pipeline-check/demo-package-freeze.json` to avoid a self-referential status hash.
- The current cognitive-pilot readiness check returns `BLOCKED` and writes no launch record, as required while ethics/governance fields and human pilot evidence are absent.
- Strict argument-governance profile parses cleanly; its remaining evidence deficits are intentionally unresolved until human data exist.

## Human work still required

1. Complete the institutional ethics packet and obtain approval/exemption.
2. Run cognitive pilots: 4–6 makers, 8–12 audience members, and 2 expert reviewers.
3. Freeze stimulus/app/config hashes, codebook, exclusions, final model family, and a pilot-informed sample simulation.
4. Recruit and run real sessions using coordinator-generated IDs.
5. Double-code pilot and at least 25% of main material, freeze reliability/adjudication, then open the condition key.
6. Run the release/claim gate before treating any result as paper evidence.

If the Study B target is infeasible, predeclare it as a formative mechanism study. Do not retain a population-level protocol-effect claim with an underpowered convenience sample.
