# CP03 Council Critical Path — Local Scripted Engineering Evidence

**Recorded:** 2026-08-23

**Branch:** `codex/pact-cp03-agent-native`

**Implementation source HEAD tested:** `90b7edd2c7135b8d8af67671b33e1442d8c8ff7e`

**Implementation range:** `888db07..90b7edd` (`22` commits)

## Claim ceiling

```text
Evidence status: LOCAL_SCRIPTED_ONLY
Provider calls: 0
Live Run 04: NOT_AUTHORIZED / NOT_RUN
CP03 visual checkpoint: NOT_CAPTURED
Human technical decision: PENDING
Human artistic KEEP: PENDING
Public release: NOT_AUTHORIZED
```

This record verifies a local engineering path. It is not a provider-compatibility result, model bake-off, audience encounter, visual checkpoint, human artistic decision, deployment, or public release. The historical Live Run 01–03 failures remain unchanged.

## What was implemented locally

The approved serial full-draft provider step is replaced by a separate council-v2 path:

1. freeze one immutable CaseSession/turn/scene/registry/routing/deadline snapshot;
2. open five typed role dispatches for CaseConductor intent, Witness, Archivist, Rewriter, and Guardian;
3. admit only schema-valid, identity-bound shards and require JSONL flush plus cold inspection before treating them as durable;
4. close the shard-selection barrier;
5. open one minimal CaseConductor commit over exact durable shard hashes and selected dissent IDs;
6. evaluate Guardian constraints in parallel authority, then deterministically copy typed fields into one `AgentActionDraft`;
7. admit the complete draft only strictly before the 12-second deadline;
8. require a viewer decision bound to the exact draft and parent-scene hashes;
9. reuse the existing Capability Gate and Ruby interaction runtime;
10. persist the Ruby receipt as the root CaseSession transition.

No model can submit a full draft on the council-v2 path. The provider-facing tool vocabulary is limited to `pact_submit_council_shard` and `pact_submit_conductor_commit`; viewer approval and Ruby execution remain local authority boundaries.

## Fixed local routing and dispatch boundary

| Field | Local scripted contract |
|---|---|
| Planned dispatches | `6` |
| Maximum dispatches | `8` |
| Initial wave | five typed role shards |
| Commit wave | one minimal CaseConductor commit |
| Retry budget | at most one pre-side-effect transport retry per provider |
| Runtime fallback | forbidden |
| Final model IDs | `pending-bakeoff` fixture identifiers only |
| Live adapters | not mounted or called in this gate |

The representative fixture declares DeepSeek concurrency `3` and Gemini concurrency `2`. These are local capacity assertions over fictional assignments, not final model selection.

## Zero-network release-gate commands and results

All commands were run with `npm_config_offline=true` from the local worktree.

### Shared contracts

```bash
cd packages/pact-cp03-contracts
npm_config_offline=true npm test
```

Result: `1/1` test file, `25/25` tests passed.

### Complete Agent Host

```bash
cd apps/pact-agent-host
npm_config_offline=true npm test
npm_config_offline=true npm run typecheck
npm_config_offline=true npm run build
```

Result: `19/19` test files, `332/332` tests passed; TypeScript typecheck and build passed.

### Complete Scene Builder / Ruby regression

```bash
cd apps/scene-builder
npm_config_offline=true npm test
npm_config_offline=true npm run build
```

Result: `23/23` test files, `170/170` tests passed; Vite build passed. The existing mixed static/dynamic import and large-chunk warnings remain; this critical-path implementation did not introduce them.

### Historical provider-path non-drift gate

```bash
cd apps/pact-agent-host
npm_config_offline=true npx vitest run \
  test/provider-compatibility.test.ts \
  test/provider-real-runner.test.ts \
  test/provider-real-command.test.ts \
  test/provider-run-evidence.test.ts
```

Result: `4/4` test files, `38/38` tests passed. This proves the archived eight-probe contract and its failure-evidence handling did not drift; it does not rerun or upgrade Live Run 03.

## Controlled local outcomes

### Timing and orchestration

- The normal scripted path reports the `2.5s` first-trace target, `8s` draft target, and strict `<12s` hard deadline as met from one monotonic epoch.
- A controlled draft at `8.001s` is accepted before the hard deadline while truthfully reporting `draftTargetMet: false` and `hardDeadlineMet: true`.
- Assembly at exactly `12.000s` is `LATE_QUARANTINED`; no draft or draft hash is promoted.
- A draft durably accepted at `11.999s` may be approved after the council deadline only when the approval hash and parent-scene hash remain exact. Parent-scene drift fails closed without reopening a synthetic provider turn.
- The normal scripted runtime records `activeConductorTurns: 2`, `settlementSinkTurns: 4`, `blockedSettlementSinkTurns: 4`, and `undeclaredProviderStreams: 0`.
- Same-provider retry arbitration gives the only retry to the lowest failed declared ordinal, independent of completion order.

These are controlled local timings, not measured DeepSeek/Gemini latency.

### Deterministic draft authority

- The assembler produces byte-identical canonical drafts and SHA-256 hashes for semantically identical insertion-order variants.
- Repeated scripted assembly preserves the same role-ordered creative/material/execution/agency view.
- The independent archive verifier recomputes the canonical draft hash and rejects a fabricated but well-formed replacement.
- `WITHHOLD`, omitted required dissent, missing/malformed/late required roles, stale bindings, duplicate selections, unsupported capabilities, and deadline failure cannot promote a draft.
- The manifest `promptHash` is a pinned prompt-profile identifier; it is not cryptographic proof of the exact rendered per-turn prompt text.

### Viewer approval and Ruby receipt

The Task 7 vertical slice uses five fictional typed role outputs and one fictional minimal commit, but crosses the real local DSH JSONL persistence and existing Ruby runtime:

- five shard durability receipts: `DURABLE` and cold-readable;
- one minimal commit receipt: `DURABLE` and cold-readable;
- exactly one deterministically assembled draft stored by canonical hash;
- exact viewer approval required before planning;
- Ruby changed-object IDs: `interaction-actor-a`, `interaction-cup`;
- source-locked/forbidden object IDs: `interaction-backdrop`, `interaction-floor`;
- final ownership: `interaction-cup` held by `interaction-actor-a`;
- result scene hash equals the returned overlay project hash;
- rollback receipt: `DISCARD_TRANSIENT_DIRECTOR_OVERLAY` bound to the parent scene hash;
- durable root transition: `APPROVED_EXECUTION` with the exact draft, approval, receipt, parent, and result hashes.

Guardian `WITHHELD` and omitted dissent remain council-state events and leave the CaseSession open. Viewer rejection and stale scene drift create no approved transition. A synthetic assembly failure records durable `FAILED_NO_MUTATION` with the exact six-dispatch fixture count.

### Archive integrity and secret scan

The council evidence verifier independently rejects malformed archives, non-contiguous dispatch identities, unauthorized tools, missing durable receipts, incorrect timing booleans, hidden streams, fabricated hashes, promoted failed drafts, invalid usage aggregation, secret-shaped fields, supplied exact values, escaped decoded values, and supplied values in decoded object keys. Findings use fixed paths and do not echo supplied secret values.

This is evidence/archive hygiene, not a network-security audit. Local scripted usage is not provider accounting: estimated cost remains nullable and `billingConfirmed` is always `false`.

## Five-class checkpoint matrix

| Required evidence class | Current label | What exists | What is still missing |
|---|---|---|---|
| Interaction proof | `PARTIAL_LOCAL_SCRIPTED` | typed council → deterministic draft → viewer hash approval → Capability Gate → Ruby receipt → durable CaseSession | real free-input encounter, audience UI, repeated six-turn interaction |
| Visual proof | `NOT_CAPTURED` | existing Ruby interaction demo is exercised by tests | CP03 stills, checkpoint video, five visually distinct effects, visual QA |
| Engineering proof | `LOCAL_SCRIPTED` | contracts, DSH lifecycle, real local JSONL durability, timing/failure tests, Ruby integration | final model bake-off, fresh preflight, real-provider pass, loopback host |
| Provenance proof | `MANIFEST_FIXTURE_ONLY` | fixed fictional routing/rights/asset references and fail-closed registries | cleared production manifests, retrieval records, audience-input provenance |
| Artistic/curatorial proof | `PENDING_HUMAN` | Guardian dissent and claim ceilings are preserved structurally | human technical decision, artistic KEEP/REPAIR/REJECT, curatorial text review |

These labels are archival boundaries. They do not accept CP03 as a checkpoint.

## Explicitly pending

- fixed-input model bake-off and final model IDs;
- a new zero-call preflight and separate exact authorization before any Live Run 04;
- successful real-provider completion within the approved timing/dispatch envelope;
- loopback host and audience text/image/audio proposal interface;
- all five action-specific visual effects;
- formal encounters, screenshot/video/copy/receipt package, and five-class archive;
- human technical ruling and human artistic `KEEP`;
- deployment, public release, or exhibition operation.

## Repository synchronization state

At the time this record was written, all implementation and release-gate checks were local. No final fetch, push, or remote-SHA verification had been performed for this evidence milestone. Remote synchronization remains a separate explicit gate; no force push is permitted.
