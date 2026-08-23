# PACT CP03 Critical-Path Redesign

**Status:** `verified`

**Decision date:** 2026-08-22

**Implementation status:** `critical_path_verified_local_scripted`

**Live Run 04 status:** `not_authorized`

**Verification boundary (2026-08-23):** The approved council critical path is
implemented and passes local scripted contracts, timing/failure cases, real
local JSONL durability, evidence verification, exact viewer approval, and the
existing Ruby interaction seam. This status does not claim final provider/model
selection, Live Run 04, audience UI, five visual effects, checkpoint media,
human technical acceptance, artistic `KEEP`, deployment, or public release.

**Supersession boundary:** This document supersedes the future CP03
interaction architecture in
`2026-08-22-pact-cp03-12s-provider-graph-design.md`. It does not alter that
older document's `verified` status as historical evidence for the locally
implemented eight-dispatch compatibility graph. Live Run 03 subsequently
showed that the verified local graph did not meet the real-provider critical
path.

**Approval evidence:** The author explicitly approved the design in three
parts:

1. `批准第 1 节：并行 council + minimal Conductor commit + non-creative deterministic assembler`
2. `批准第 2 节：诚实 shard trace + 并行 Guardian 约束 + 2.5/8/12 秒边界`
3. `批准第 3 节：fail-closed + 固定模型清单 + 6/8 调用预算 + 五类 checkpoint 证据；写入 spec`

Those approvals authorize this written design. They do not authorize
implementation, a provider call, Live Run 04, 3D mutation, checkpoint
acceptance, push, deployment, or public release.

## Context and Failure Evidence

Live Run 03 preserved the replacement graph's orchestration improvements but
failed the representative provider chain:

- the first accepted public trace arrived at `5.762s`, missing the `2.5s`
  design target;
- the sequential full-draft dispatch began at `5.789s`;
- that DeepSeek draft stream then required `8.426s`;
- the draft completed at `14.215s`, `2.215s` beyond the `12s` hard deadline;
- the draft tool result was rejected and quarantined;
- no draft was accepted, no viewer approval was requested, and no Ruby scene
  mutation ran;
- orchestration isolation passed, so undisclosed settlement streams were not
  the remaining cause.

The run is archived as `FAILED_ARCHIVED`, not as partial compatibility success.
Repeating the same graph would measure variance without repairing its serial
critical path.

## Problem

The existing provider graph asks the Case Conductor to generate a complete
`AgentActionDraft` only after role contributions are available. That final
creative synthesis is too large and too serial to fit reliably after the role
wave while preserving all of these approved constraints:

- agent-authored interpretation rather than a preset classifier;
- distinct Witness, Archivist, Rewriter, Guardian, and Conductor authority;
- honest disagreement and provenance;
- a complete schema-valid draft rather than partial streaming text;
- viewer approval and deterministic capability validation before execution;
- a first public trace target of `2.5s`, a complete-draft target of `8s`, and
  a non-negotiable hard cutoff of `12s`.

The repair must remove the serial full-draft generation step without moving
creative authorship into deterministic application code.

## Goals

- Start the required role council against one immutable turn snapshot in
  bounded parallel.
- Keep interpretation, observation, creative composition, provenance, and
  dissent agent-authored in typed role shards.
- Reduce the final Case Conductor provider turn to a minimal authoritative
  commit over durable shard hashes.
- Assemble the complete draft deterministically without generating, rewriting,
  or silently repairing creative content.
- Publish an honest, complete, role-attributed agent trace as early as a valid
  shard permits.
- Preserve `first durable public trace <= 2.5s` and
  `complete accepted draft <= 8s` as design targets.
- Preserve `12s` as a hard deadline measured by the local monotonic runtime
  clock.
- Fail without scene mutation on missing, malformed, stale, conflicting,
  unauthorized, duplicate, or late inputs.
- Preserve the DSH `CaseSession`, viewer approval, Capability Gate, Ruby
  runtime, receipts, replay, cost accounting, and checkpoint evidence
  boundaries.

## Non-goals

- Do not execute Live Run 04 or any Gemini/DeepSeek call while designing,
  planning, or locally implementing this architecture.
- Do not select final provider/model assignments from the tiny Live Run 03
  sample.
- Do not relax the `8s` design target or `12s` hard deadline.
- Do not implement CP04's cleared-asset vector database; this design defines
  only the stable registry interface CP03 may consume.
- Do not generate or download assets during a live audience turn.
- Do not duplicate Ruby's navigation, collision, ownership, interaction,
  camera, animation, rendering, or rollback runtime.
- Do not build the audience UI, five final visual effects, formal encounter
  suite, or checkpoint media as part of the critical-path repair itself.
- Do not treat a scripted timing pass, configured credential, accepted tool
  call, or committed spec as real-provider reliability or artistic success.

## Authority and Data Flow

### 1. Immutable turn snapshot

At `t=0`, the local runtime freezes one `CouncilTurnSnapshot` containing:

- CaseSession ID and turn ID;
- viewer input references and declared input classes;
- parent scene hash and source-lock state;
- cleared asset-registry version;
- allowed semantic capability envelope;
- current action-state snapshot;
- role requirement policy;
- routing-manifest version;
- one shared monotonic deadline.

Every shard, the minimal Conductor commit, the assembler, viewer approval, and
the Capability Gate must bind to that same snapshot. A different case, turn,
scene, registry, capability envelope, routing version, or deadline makes the
payload stale and inadmissible.

### 2. Parallel typed council shards

The representative multimodal asset-changing CP03 turn starts all five shard
calls in parallel:

- `ConductorIntentShard`: initial interpretation, candidate action sequence,
  role relevance, terminal intent, and bounded public language. It is not a
  complete draft.
- `WitnessShard`: role-attributed public observation, multimodal observations,
  uncertainties, and evidence anchors.
- `ArchivistShard`: stable asset/spatial references, provenance, rights facts,
  and unavailable references.
- `RewriterShard`: spatial, visual, camera, light, sound, poetic-text, semantic
  capability, and expected-change fields. It cannot emit raw runtime controls.
- `GuardianShard`: independent challenge, dissent, forbidden changes,
  required safeguards, rollback requirements, contested claims, and one of
  `ALLOW | NEEDS_CLARIFICATION | WITHHOLD`.

Each shard is schema-bound and includes its role, child session, case/turn,
scene, registry, routing, deadline, and payload identity. Accepted shards are
hashed, appended to the DSH evidence chain, flushed, and then considered
durable. Malformed, role-mismatched, stale, duplicate, unauthorized, or late
shards never enter the current proposal set.

The council topology is fixed before dispatch. The Case Conductor later decides
which admissible optional shards to include; it does not serially decide which
roles to start.

### 3. Required-role policy

Role requirements are determined locally from the declared input classes and
the turn's allowed capability envelope, not from an unvalidated model route:

- `ConductorIntentShard` is always required;
- `RewriterShard` and `GuardianShard` are required for any scene mutation;
- `WitnessShard` is required when image, audio, or scene observations support
  a claim;
- `ArchivistShard` is required for any asset, spatial-reference, provenance,
  or rights-sensitive change.

The representative CP03 interaction includes multimodal interpretation and
asset/scene change, so all five shards are required. A narrower future turn may
omit only a role that the pre-dispatch policy marks optional. If a later
Conductor decision requires an omitted role, the turn becomes
`NEEDS_CLARIFICATION`; it may not open a new serial role call inside the same
critical path.

### 4. Minimal Case Conductor commit

After every required shard is durable, the same persistent Case Conductor
session opens one explicit second provider turn. The provider-authored output
is intentionally small:

```text
ConductorDraftCommit
  turnId
  status
  actionSequence[]
  selectedShardHashes[]
  selectedDissentIds[]
  terminalIntent
```

The runtime, not the model, binds the commit to the CaseSession, parent scene,
registry, routing manifest, and deadline. The Case Conductor receives bounded
shard summaries plus exact hashes. Those summaries are deterministic
projections of typed fields, not application-written or model-generated
paraphrases. Opening the commit establishes the council selection barrier:
optional shards that are not durable at that point are cancelled or
quarantined and cannot later alter the draft. The Case Conductor may select
among admissible shards and choose the action sequence, but it may not:

- rewrite or paraphrase shard content;
- invent assets, evidence, licences, capabilities, or scene references;
- omit a required role;
- remove required Guardian dissent;
- override `WITHHOLD`;
- approve its own draft;
- execute Ruby or issue raw runtime controls.

The ConductorIntent and commit turns use the same DSH Case Conductor session and
the same model declared in the active routing manifest, preserving role
continuity. Automatic child settlement may not open either turn or any hidden
provider stream.

### 5. Non-creative deterministic assembler

The local assembler consumes the frozen snapshot, required durable shards, and
the minimal commit. It validates hashes, bindings, role completeness, action
state, Guardian disposition, stable references, cross-field consistency,
deadline, and dissent preservation, then copies fields into the existing
`AgentActionDraft` boundary:

- identity and hashes: local runtime;
- decision status and action sequence: Conductor commit;
- overall interpretation and terminal intent: ConductorIntent shard;
- observations, uncertainties, and evidence: Witness shard;
- spatial, visual, camera, light, sound, poetic text, semantic capabilities,
  and expected changes: Rewriter shard;
- materials, provenance, rights, and stable registry references: Archivist
  shard;
- restrictions, challenges, rollback requirements, and dissent: Guardian
  shard;
- agency and session references: local runtime.

The assembler is prohibited from generating creative prose, choosing an
artistic interpretation, fixing a missing shard, inventing a reference,
silently resolving prose conflict, dropping dissent, changing the action
sequence, overriding Guardian, or substituting stale content. The same frozen
inputs must produce the same canonical draft hash.

An unresolved conflict yields `NEEDS_CLARIFICATION` or
`FAILED_NO_MUTATION`. A Guardian `WITHHOLD` may produce a durable `WITHHELD`
record for the viewer, but never an executable proposal.

### 6. Downstream authority remains unchanged

Only a complete frozen `PROPOSED` draft proceeds:

```text
AgentActionDraft
  -> canonical draft hash
  -> Proposal Viewer
  -> explicit viewer approval of that hash
  -> deterministic Capability Gate
  -> GuardedActionPlan
  -> Ruby runtime
  -> execution/rollback receipt
  -> durable CaseSession transition
```

The viewer supplies text, cleared image, or cleared audio and approves or
rejects the proposal; the Agent council decides the interpretation and bounded
semantic action. The viewer does not directly operate the 3D character in the
artwork's principal mode. Operator setup, diagnostics, reset, and emergency
stop controls remain separate.

## Honest Public Trace

### Trace source

A fixed local status such as `council started` may appear within `150ms`, but it
must be labelled as system state and never counted as agent output.

The first agent public trace is selected from the earliest schema-valid,
on-time `WitnessShard` or `RewriterShard` contribution assigned a monotonic
sequence by the authoritative local acceptance ledger. Selection therefore
does not depend on provider timestamps or wall-clock ties.

The registry mechanically copies the shard's exact `publicTrace` into a
`pact/public-trace` event carrying:

- case and turn IDs;
- role;
- exact text;
- source contribution hash;
- acceptance sequence;
- `phase: COUNCIL`;
- `provisional: true`.

No template, paraphrase, raw stream token, partial JSON, incomplete tool call,
or application-written poetic text may satisfy the agent-trace target.

The registry appends that contribution and its projected trace in deterministic
order, then flushes both before the UI may publish the now-durable trace. If a
crash leaves a durable contribution without its projection, recovery may
append the missing event
idempotently, but it must record the actual recovery time and may not backdate
the `2.5s` metric.

### Trace disagreement

The UI labels a shard trace as one role's provisional observation, not as a
final system decision. A later Guardian challenge or Conductor rejection does
not delete or rewrite the earlier trace; the disagreement is appended and
remains visible in the archive. This preserves agent process without confusing
it with approval.

If no eligible durable trace exists by `2.5s`, the runtime records
`public_trace_target_missed` and continues within the hard deadline. It never
fabricates a trace to make the metric pass.

## Guardian Semantics and Conflict Handling

Guardian runs in parallel against the same immutable snapshot. It is an
independent ex ante critic, not a second post-hoc model review of the completed
Rewriter shard. Its enforceable output is typed:

- disposition: `ALLOW | NEEDS_CLARIFICATION | WITHHOLD`;
- forbidden semantic capability IDs;
- required source-lock and rights conditions;
- required rollback capabilities;
- contested observation/evidence IDs;
- dissent IDs and public challenge text.

The assembler and Capability Gate compare those fields with Rewriter
capabilities, Archivist references, Witness claims, and the local scene state:

- `WITHHOLD` always blocks an executable proposal;
- `NEEDS_CLARIFICATION` creates a non-executable viewer question;
- `ALLOW` permits assembly only when every typed condition is satisfied and
  does not replace the later deterministic Capability Gate;
- a conflict that cannot be decided from typed fields becomes
  `NEEDS_CLARIFICATION`, not a guessed merge.

An exact proposal-specific Guardian model review would add another serial call
and is outside this critical path. It may become a subsequent council turn if
the artist later requires it, but it may never retroactively authorize a scene
already executed.

## Timing Contract

All measurements use the local runtime's monotonic clock from the frozen turn
epoch. Provider-supplied timestamps are evidence only and cannot decide
admission.

| Milestone | Boundary | Meaning |
|---|---:|---|
| local system state visible | `<=150ms` target | deterministic status, not agent trace |
| first durable eligible agent trace | `<=2.5s` target | exact Witness/Rewriter shard text |
| all required shards durable | `<=5.5s` soft target | opens minimal Conductor commit |
| minimal commit durable | `<=7.8s` soft target | leaves local assembly margin |
| deterministic assembly | `<=100ms` target | includes validation and draft hash |
| complete accepted draft | `<=8s` design target | interaction target met |
| hard deadline | `<12s` admission requirement | at or after deadline is late |

A trace or draft target miss is reported, not hidden. A complete draft accepted
after `8s` but strictly before `12s` may still be shown for viewer approval, but
the run cannot claim to meet the interaction target. At or after `12s`, all
unfinished synthesis calls are cancelled and their returned payloads are
rejected or quarantined. If no complete draft was accepted before the deadline,
no draft promotion, approval, capability execution, or scene mutation may
follow from that turn.

The hard deadline closes agent synthesis; it does not require the viewer to
decide within twelve seconds. A draft accepted strictly before the deadline may
remain awaiting viewer review after the deadline. It is executable only if its
approval and parent-scene preconditions still match when the later Capability
Gate runs.

The evidence ledger records, per shard and commit:

- dispatch start;
- first provider chunk;
- schema/tool acceptance;
- event append;
- durability completion;
- cancellation, retry, rejection, or quarantine.

It also records trace source/hash, commit start/acceptance, assembler start/end,
draft hash time, target booleans, and the hard-deadline result.

## Failure State Machine

The success path is:

```text
COUNCIL_RUNNING
  -> COMMIT_READY
  -> DRAFT_ASSEMBLED
  -> AWAITING_VIEWER_APPROVAL
  -> GATE_PASSED
  -> RUBY_EXECUTING
  -> RECEIPTED
```

Every stage may terminate as one of:

- `NEEDS_CLARIFICATION`: the council requires a new viewer input;
- `WITHHELD`: Guardian blocks the proposal;
- `FAILED_NO_MUTATION`: no admissible proposal exists;
- `LATE_QUARANTINED`: a required result missed the hard deadline;
- `APPROVED_EXECUTION`: a hash-approved, Gate-validated Ruby action has a
  durable receipt.

Failure never substitutes a prior shard, prior scene, default animation,
prewritten draft, different provider, fuzzy asset match, or unapproved
capability. Draft hash, parent scene hash, approval hash, guarded-plan hash,
receipt, and CaseSession transition must form one continuous authority chain.

## Dispatch, Retry, and Idempotency Budget

The representative full CP03 turn has:

- five parallel council dispatches;
- one minimal Conductor commit dispatch;
- `6 planned` provider dispatches;
- `8 maximum` dispatches when both approved providers are active.

This approved budget assumes a dual-provider manifest containing both Gemini
and DeepSeek, although their final role assignments and model IDs remain gated.
Moving the representative route to one provider would change the retry ceiling
and requires a spec amendment rather than silently inheriting the `6/8`
contract.

Each active provider receives one global pre-side-effect transport-retry slot.
Retry slots are not transferable and do not create extra creative turns. The
eligible failed dispatch with the lowest declared dispatch ordinal on that
provider may claim the slot only if:

- no PACT tool side effect from that dispatch was accepted;
- the failure is classified as transport-level;
- the same role, snapshot, prompt hash, model, and idempotency key are reused;
- the shared `12s` deadline and total dispatch budget still permit it.

Schema invalidity, refusal, disagreement, Guardian disposition, missing rights,
content failure, or deadline expiry is not transport failure and is not retried
inside the turn. A dispatch that has accepted a contribution or commit is never
continued or retried to consume a receipt. Duplicate submissions are
deduplicated by identity/hash or quarantined if inconsistent.

All provider streams must be declared in the dispatch ledger before opening.
DSH children flush before settlement. Parked settlement sinks may receive local
blocked turns but may not open an LLM stream. The active Conductor has exactly
its explicit intent and commit turns and no settlement-triggered provider work.

## Provider and Model Selection Gate

The Live Run 03 sample suggests that its Gemini contribution calls were faster
than its DeepSeek contribution and draft calls, but the sample is too small to
establish stability or artistic quality. It justifies redesigning the serial
graph, not silently changing the model map.

Role contracts remain provider-neutral. Before any new live compatibility run,
a separately approved fixed-input bake-off must assess candidate assignments
per role using:

- schema/tool acceptance rate;
- attachment and multimodal compatibility where required;
- complete-output latency distribution, not first-token latency alone;
- public-trace latency;
- prompt and output token use;
- recorded cost estimate, clearly separated from billing;
- refusal and transport failure modes;
- human artistic review of interpretation, visual/spatial intent, dissent, and
  provenance quality.

The bake-off's models, repetitions, fictional/synthetic inputs, maximum
dispatches, data exposure, and USD ceiling require fresh explicit approval. No
repository content, artwork asset, real audience input, search, grounding, or
external tool is implied.

After evidence and human selection, assignments are frozen in a versioned
`ProviderRoutingManifest` containing role, provider route, model ID, adapter and
version, prompt hash, capability declarations, input/output limits, timeout,
and concurrency ceiling. ConductorIntent and minimal commit share one pinned
Conductor model. Runtime opportunistic model switching and silent provider
fallback are forbidden; failure remains visible unless a new manifest is
approved and versioned.

## Asset, Retrieval, and Audience-Data Boundary

Archivist may emit only stable IDs and facts from a pre-cleared local asset
registry. A future local vector index may help retrieve those records, but its
construction belongs to CP04. CP03 may consume a versioned read-only interface;
it may not crawl, download, generate, licence, or admit a new asset during the
audience turn.

Unknown URLs, fuzzy unregistered matches, invented provenance, absent licence
facts, or unavailable geometry produce `NEEDS_CLARIFICATION` or
`FAILED_NO_MUTATION`. Agents request registered semantic capabilities and
stable assets; they never emit arbitrary JavaScript, shell, raw Three.js,
filesystem paths, or permission grants.

Provider tests remain fictional/synthetic. Before real audience image, voice,
face, identity, or personal text can reach an external API, the project needs a
separately approved consent, disclosure, minimisation, retention, deletion, and
incident policy. Raw audience media is not archived or sent merely because an
API key is configured.

## Verification Strategy

Implementation must first pass zero-network scripted verification:

1. all five shard schemas, role bindings, snapshot bindings, and durability;
2. exact contribution-to-trace projection with source hash, acceptance order,
   idempotent recovery, and no partial-token/template substitution;
3. required-role policy for text, multimodal, mutation, asset, provenance, and
   rights-sensitive turns;
4. Guardian `ALLOW | NEEDS_CLARIFICATION | WITHHOLD` conflict matrices;
5. rejection of omitted dissent, missing/duplicate/stale/late shards, invalid
   hashes, and cross-scene references;
6. minimal commit authority and prohibition on invented references or
   self-approval;
7. deterministic assembler repeatability: identical frozen inputs produce the
   same canonical draft hash;
8. controlled `2.5/5.5/7.8/8/12s` timing paths, including at-deadline rejection;
9. `6 planned / 8 maximum` dispatch, retry, deduplication, and idempotency
   accounting;
10. DSH flush/inspect durability, settlement isolation, and zero hidden
    provider streams;
11. viewer approval hash, Capability Gate, Ruby execution, rollback, receipt,
    and CaseSession transition integration;
12. proof that every failure path leaves the scene unchanged;
13. focused tests, full Agent Host tests, typecheck, build, and the relevant
    Ruby integration suite.

Scripted timing can verify orchestration and failure semantics, but it cannot
prove real-provider latency or model quality. Any later live test remains a new
approval gate and must archive complete provider envelopes, dispatch/cost
ledger, timing facts, secret scan, and failure evidence.

## CP03 Checkpoint Evidence Contract

Critical-path implementation is not CP03 checkpoint completion. A candidate
CP03 checkpoint archive must contain all five evidence classes:

1. **Interaction proof:** viewer text/image/audio input, honest role trace,
   Agent proposal, dissent, and approval/rejection sequence.
2. **Visual proof:** before/after stills and a continuous capture of the actual
   3D scene showing governed asset/spatial change and rollback. A 2D mood image
   is not a substitute.
3. **Engineering proof:** DSH ledger, `2.5/8/12s` timeline, draft/scene hashes,
   Capability Gate result, Ruby receipt, and replay/rollback evidence.
4. **Provenance proof:** provider/model manifest, prompt/schema versions, asset
   IDs, sources, licences, registry version, and hashes.
5. **Discourse proof:** checkpoint copy, script correspondence, cited
   literature/artworks, and an account of how those references disturbed the
   interaction or visual form.

Checkpoint acceptance also requires separate evidence for local scripted
verification, a later explicitly authorized passing representative
real-provider result, actual Ruby execution and rollback, human technical
review, human artistic `KEEP`, archive integrity, commit,
collaboration-branch push, and any public-release approval. None may be inferred
from another.

The critical-path repair therefore produces engineering evidence first. It
must not manufacture a checkpoint video or still when no accepted draft and
Ruby mutation occurred.

## Acceptance Criteria for This Design's Implementation

1. The runtime starts every required shard against one immutable snapshot and
   shared monotonic deadline.
2. The representative full turn starts all five shard provider streams in
   parallel before any is allowed to complete.
3. The first agent trace is an exact, durable Witness/Rewriter shard projection
   with a source hash; fixed status and raw first tokens cannot satisfy it.
4. Guardian constraints and dissent cannot be removed or overridden by the
   Conductor or assembler.
5. The minimal Conductor commit selects durable hashes and action state without
   producing a second full creative draft.
6. The assembler is deterministic, non-creative, fail-closed, and produces a
   stable canonical draft hash.
7. A full representative turn records exactly six planned provider dispatches
   and never exceeds eight, including the two fixed retry slots.
8. The active Conductor receives only its two explicit turns; settlement opens
   no provider stream.
9. Controlled tests prove trace/draft target reporting, strict at-deadline
   rejection, late quarantine, and no mutation on every failure path.
10. The existing viewer approval, Capability Gate, Ruby runtime, rollback,
    receipt, and durable CaseSession boundary remains intact.
11. All relevant local tests, typecheck, build, and integration checks pass
    without network access.
12. Progress and checkpoint documents preserve the distinction between
    design, implementation, local verification, live-provider evidence, 3D
    execution, checkpoint archive, human judgment, push, and public release.

## Risks and Explicit Trade-offs

- **Parallel load:** five simultaneous shards may expose provider concurrency
  limits. The routing bake-off must validate declared concurrency; the runtime
  may not hide queuing that breaks the shared deadline.
- **Guardian precision:** an ex ante Guardian cannot critique every exact phrase
  in the later Rewriter output. Typed conflict checking and clarification are
  accepted in exchange for removing a serial post-hoc call.
- **Provisional trace disagreement:** the first visible role may later be
  challenged. Role/phase labelling and append-only dissent make that process
  explicit rather than erasing it.
- **Model quality versus latency:** a faster structured output may be less
  artistically useful. Final routing requires both measured technical evidence
  and human artistic review.
- **External API privacy:** live audience media creates a new data-governance
  boundary. Fictional/synthetic testing does not authorize real visitor data.

## Evidence Ceiling and Next Gate

At this commit, the strongest permitted statement is:

> The author approved a CP03 critical-path redesign based on parallel typed
> role shards, a minimal Case Conductor commit, a non-creative deterministic
> assembler, honest shard-derived public trace, parallel Guardian constraints,
> fail-closed execution, a six-planned/eight-maximum dispatch budget, and
> explicit checkpoint evidence gates.

This document does not prove implementation, local tests, real-provider
latency, model quality, Ruby scene integration, visual completion, checkpoint
acceptance, push, deployment, or public release.

After the author reviews this written spec, the next permitted step is a
detailed implementation plan. Live Run 04 remains unauthorized and must not be
included as an automatic plan step.
