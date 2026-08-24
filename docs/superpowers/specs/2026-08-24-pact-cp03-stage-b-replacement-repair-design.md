# PACT CP03 Stage B Replacement Repair Design

**Status:** `author_approved`

**Draft authorization date:** 2026-08-24

**Author approval and local implementation authorization date:** 2026-08-24

**Implementation status:** `authorized_not_started`

**Zero-call verification status:** `not_run`

**Replacement preflight status:** `not_created`

**Replacement provider-run status:** `not_authorized`

**Keychain access in this design task:** `forbidden_and_not_used`

**Provider calls in this design task:** `forbidden_and_not_made`

**Historical Task 8 archive:** `immutable_failed_evidence`

**Local baseline:** This draft was prepared from a clean local checkout of
`codex/pact-cp03-agent-native` at
`577e6184740514ab97036d57c69bcb9e01c3f160`. No remote fetch was performed in
this drafting task, so this baseline is a local fact and not a fresh statement
about Ruby's remote branch.

**Approved implementation baseline:** Before implementation, the live checkout
was re-inspected at `86ad65dbf82521ce2fed8e143ce07284f1ee6307`, two local
commits ahead of the existing remote-tracking ref
`e27a693dfbf0359dc75e85922b33f002042136d7`. No fetch was performed, so this is
still a local comparison rather than a fresh remote claim. The two local
commits are retained as repair baseline evidence and must not be silently
reimplemented or reverted.

**Evidence boundary:** The author approved this written design and authorized
the local zero-call implementation plan. That approval does not authorize a
Keychain check, a replacement preflight, a provider smoke test, a replacement
run, model selection, production routing, Ruby mutation, CP03 checkpoint
acceptance, fetch, push, deployment, or public release. Local milestone commits
remain permitted by the approved plan.

## Context

The first real Stage B bake-off is permanently archived at:

`checkpoints/cp03/model-bakeoff/cp03-model-bakeoff-20260824T055034Z`

Its frozen result is `PARTIAL_FAILED_ARCHIVED / NO_TECHNICALLY_ELIGIBLE_PAIRS`:

- `28 planned / 30 maximum` dispatches;
- `24 sent / 2 accepted / 22 failed / 4 skipped`;
- `24` provider requests made;
- USD `0.1464567` estimated cost, explicitly not billing evidence;
- no retry slot used;
- no model selection or routing change.

The archive's top-level result classified `21` attempts as schema failures and
one as a late timeout. A deeper offline diagnosis separates the 24 sent
attempts more usefully:

| Observed terminal class | Count | Repair relevance |
| --- | ---: | --- |
| Gemini 3.7 request/configuration HTTP 400 before a tool call | 4 | local adapter request policy is not honest or compatible enough |
| output cap reached without a tool call | 6 | the model-facing contract is too large and the persistent Conductor uses the wrong phase cap |
| hard 12-second timeout | 1 | preserve as a deadline failure; do not disguise it as schema failure |
| one malformed tool call followed by an error/second stream | 11 | narrow the role contract and stop after the first expected tool result |
| accepted Archivist submission | 2 | schema acceptance alone is insufficient because runtime references still need validation |
| skipped ConductorCommit after failed ConductorIntent | 4 | dependency behavior is correct and remains fail-closed |

A diagnostic-only, in-memory exercise found that the 11 malformed argument
objects could be made canonical-schema-valid using representation corrections
such as removing a wrapper, changing an output schema version, or substituting
the expected rights/capability spelling. That observation is evidence that the
current model-facing contract exposes too much clerical runtime structure. It
does **not** retroactively validate those attempts and does **not** authorize a
production sanitizer.

The two accepted Archivist attempts also demonstrate a second gap. Their
archived review text includes rights references such as
`rights_synthetic-fixture-only`, while the frozen turn registers
`rights_synthetic_fixture`. The current tool accepts a canonical shard before
the deterministic assembler checks registry references. A replacement run
must not count an output as technically eligible merely because its JSON shape
was accepted.

## Problem

Stage B currently asks each model to author both the role's artistic judgment
and a large canonical runtime envelope: schema version, role and kind,
session/turn identities, scene hashes, registry and routing versions, deadline
identity, and role content. This mixes two different authorities.

The agent should own interpretation, uncertainty, evidence selection, poetic
language, spatial intent, dissent, and bounded semantic-capability proposals.
The host already knows the runtime identities and hashes. Requiring the agent
to copy them adds failure surface without adding agency.

The transport also loses important terminal information, allows a rejected
tool call to trigger an undeclared second model stream, assigns the persistent
Conductor the minimum of its intent and commit output caps, and labels Gemini's
adapter-generated thinking configuration as `provider-default`. Finally, the
technical verifier lets one failed case invalidate every otherwise complete
role/model pair.

The replacement repair must address these causes locally without manufacturing
provider success or consuming another real-run authorization.

## Goals

- Preserve an agent-native council in which models make the creative and
  interpretive decisions.
- Remove runtime-owned envelope fields from model-authored tool arguments.
- Bind canonical council shards and Conductor commits deterministically from
  the trusted DSH session, frozen turn, and validated role submission.
- Give every role the exact categorized registry IDs it may cite or request.
- Reject unknown references before a submission can count as technically
  accepted.
- Preserve the same canonical CouncilShard, durability, minimal Conductor
  commit, deterministic assembler, viewer approval, Capability Gate, Ruby
  mutation, receipt, replay, and rollback authority boundaries.
- Use phase-specific output caps on the same persistent Conductor session.
- Make the Stage B model/reasoning policy explicit and hashable.
- Capture terminal provider errors, max-token stops, tool rejection, timeout,
  and secondary-stream conditions honestly.
- Keep each bake-off attempt one-shot after its first expected tool result.
- Separate global archive/run status from pair-local technical eligibility.
- Preserve the historical Task 8 archive and its evidence result unchanged.
- Define a comprehensive zero-Keychain, zero-provider, zero-external-network
  repair gate before any new preflight may be proposed.
- Produce a local screenshot, short video, and checkpoint copy that clearly
  state the repair's limited evidence level.

## Non-goals

- Do not read, check, print, return, serialize, or persist either provider key
  while implementing or testing this repair.
- Do not call DeepSeek, Gemini, or any other provider.
- Do not create a replacement preflight, approval, run ID, run root, or result.
- Do not execute a one-call provider smoke test or the 28/30 replacement run.
- Do not retry, resume, amend, or reinterpret the historical Task 8 run.
- Do not automatically repair malformed model content after generation.
- Do not turn unregistered IDs into registered IDs, add rights prefixes,
  replace capabilities, resolve ambiguity, or invent evidence on a model's
  behalf.
- Do not edit files inside `node_modules` or vendor an unreviewed provider SDK.
- Do not upgrade the DSH `0.1.0-rc.6` family or pi-ai `0.84.2` in this repair.
- Do not alter the candidate model list or final production routing.
- Do not change Ruby's scene, camera, character, interaction, animation,
  mutation, receipt, replay, rollback, or rendering implementation.
- Do not use real visitor text, images, audio, artwork assets, collaborator
  files, repository source, or private content as model input.
- Do not claim that local serialization proves provider acceptance, latency,
  model quality, artistic suitability, or checkpoint completion.

## Decision 1: Agent-owned Role Submission, Host-owned Runtime Envelope

### Authority split

| Authority | Owns | Must not own |
| --- | --- | --- |
| Role agent | public trace, uncertainty, evidence-anchor selection, role-specific interpretation/content, bounded semantic-capability requests | session IDs, turn IDs, role/kind identity, schema version, scene hashes, registry/routing versions, deadline identity |
| Conductor agent | candidate action sequence, selected durable shard hashes, selected dissent IDs, terminal intent | turn identity, commit status, schema version, new creative evidence |
| Deterministic binder | canonical runtime envelope from trusted local state | creative rewriting, reference substitution, ambiguity resolution |
| Reference validator | membership and cross-field validity against the frozen turn | adding or changing a reference to make it pass |
| Deterministic assembler | non-creative composition of valid durable shards | artistic invention or silent repair |
| Viewer/Gate/Ruby | approval and registered execution | model-authored code, raw transforms, URLs, files, or permissions |

### Model-facing contracts

`pact_submit_council_shard` remains the public tool name, but its model-facing
input becomes `council-role-submission/0.1`. It contains only:

```ts
interface CouncilRoleSubmission {
  readonly publicTrace: string;
  readonly uncertainties: readonly string[];
  readonly evidenceAnchors: readonly string[];
  readonly content: RoleSpecificContent;
}
```

The role-specific content alternatives remain closed and retain the artistic
fields already defined by the canonical council schema. The role is not copied
from the submission. It is resolved from the DSH `SubmissionRegistry` binding
for the calling agent and checked against the active turn binding.

`pact_submit_conductor_commit` similarly accepts only:

```ts
interface ConductorCommitSubmission {
  readonly actionSequence: readonly CouncilAction[];
  readonly selectedShardHashes: readonly string[];
  readonly selectedDissentIds: readonly string[];
  readonly terminalIntent: 'Continue' | 'KeepOpaque' | null;
}
```

The host supplies `schemaVersion`, `turnId`, and `status: 'PROPOSED'`.

### Active turn binding

A local `CouncilToolBindingRegistry` binds one agent/session to one frozen turn
and expected phase before a prompt can be driven. The binding is released at
turn settlement. Tool execution fails closed when the binding is missing,
stale, for another role, or for another phase.

The production council runtime and the Stage B transport must use the same
binding and validation implementation. A bake-off-only shortcut is forbidden.

### Deterministic binding

The binder creates canonical fields from trusted inputs:

- `schemaVersion` from the installed CP03 contract constant;
- `role` from the session binding;
- `kind` from the closed role-to-kind map;
- `childSessionId` from the actual DSH agent identity;
- `caseSessionId`, `turnId`, scene hashes, versions, and deadline identity from
  the frozen turn;
- `shardId` from a deterministic hash over turn identity, role, session, and
  the already validated role submission.

The resulting canonical object is then passed through the existing
`validateCouncilShard` or `validateConductorDraftCommit` validator before
registry acceptance and durable projection.

This deterministic binding is not content sanitation. The implementation must
not unwrap a guessed wrapper, rename a creative field, prepend `rights_`, map
an unknown ID, replace a capability, reorder an action sequence, or add missing
evidence.

## Decision 2: Exact Registry Facts and Early Reference Validation

The prompt context advances to a new version containing an `allowedReferences`
object copied exactly from the frozen turn:

```ts
interface AllowedCouncilReferences {
  readonly registeredAssetIds: readonly string[];
  readonly registeredSpatialBridgeIds: readonly string[];
  readonly registeredRightsIds: readonly string[];
  readonly registeredSceneObjectIds: readonly string[];
  readonly registeredAffordanceIds: readonly string[];
  readonly supportedRollbackCapabilityIds: readonly string[];
  readonly allowedSemanticCapabilityIds: readonly string[];
  readonly sourceLockIds: readonly string[];
  readonly inputRefIds: readonly string[];
}
```

These are model-visible local facts, not permissions invented by the model.
The prompt contains no credential, local path, original filename, hidden
licence prose, repository content, or unregistered URL.

The synthetic fixture's rights values must use the exact registered IDs. Human
descriptions such as `synthetic-fixture-only` may remain explanatory text but
must not occupy a machine reference field.

Reference validation is extracted from the deterministic assembler into a
shared, pure module with two levels:

1. role-local validation before registry acceptance, covering input anchors,
   assets, spatial bridges, rights, source locks, scene objects, affordances,
   rollback capabilities, semantic capabilities, expected changes, and dissent
   evidence;
2. cross-shard validation during assembly, preserving the current checks for
   required roles, unavailable references, Guardian restrictions, and commit
   selection.

A canonical-schema-valid but reference-invalid submission receives a stable
reference/grounding failure and cannot produce an accepted domain event,
durable shard, review candidate, or pair-eligible repetition.

## Decision 3: Explicit DSH Request Policy

### Phase-specific output caps

The persistent Conductor remains one DSH session. An agent-scoped
`agent/request` waterfall supplies the cap for the active phase:

| Phase | Maximum output tokens |
| --- | ---: |
| ConductorIntent | 1,024 |
| ConductorCommit | 512 |
| Archivist | 1,024 |
| Guardian | 1,024 |
| Witness | 1,024 |
| Rewriter | 1,024 |

The current `Math.min(ConductorIntent, ConductorCommit)` initialization must no
longer force the intent phase to 512. Each effective request header and the
observed `llm/stream` request must agree with the active phase policy.

### Reasoning policy

The replacement policy is explicit rather than labelled
`provider-default`:

| Candidate | DSH reasoning effort | Local serialized expectation |
| --- | --- | --- |
| `deepseek-v4-pro` | `off` | thinking disabled, no hidden fallback |
| `deepseek-v4-flash` | `off` | thinking disabled, no hidden fallback |
| `gemini-3.5-flash` | `low` | Google `thinkingLevel: LOW` |
| `gemini-3.6-flash` | `low` | Google `thinkingLevel: LOW` |
| `gemini-3.7-flash` | `low` | Google `thinkingLevel: LOW`, never adapter-generated `MINIMAL` |

The policy and its SHA-256 become replacement-preflight inputs in a future,
separately authorized task. The local repair gate must intercept Gemini request
serialization before external I/O and verify the exact body. This proves only
what the installed adapter would emit locally. It does not prove that Google's
service accepts the request.

The current DSH `ToolSchema` does not carry pi-ai's
`constrainedSampling` metadata, and the locked DSH pi-ai adapter copies only
tool name, description, and parameters. This repair does not patch
`node_modules` or claim Google `VALIDATED` function-calling mode. The narrower
schema and host-side fail-closed validator are therefore required even when a
provider claims structured tool support.

Before a replacement 28/30 run is authorized, Gemini 3.7's `LOW` configuration
must either be confirmed by a separately approved, single synthetic
compatibility call or remain an explicitly accepted unresolved risk. That
future call is outside this design task and outside the implementation plan's
zero-call execution scope.

## Decision 4: Honest Terminal Capture and One-shot Attempts

The stream observer records terminal `finish.reason`, including adapter errors
that arrive as chunks rather than thrown exceptions. Classification priority
is deterministic:

| Primary observation | Attempt result |
| --- | --- |
| hard local deadline expires | `late / MODEL_BAKEOFF_ATTEMPT_TIMEOUT` |
| terminal `error` or `aborted` finish before accepted side effect | `provider_error` or `transport_failure` with the adapter failure code |
| terminal `max-tokens` without the expected tool | `content_failure / MODEL_BAKEOFF_MAX_TOKENS_NO_TOOL` |
| first expected tool arguments fail the role schema | `schema_failure` |
| canonical binding succeeds but a registry reference fails | `grounding_failure` |
| wrong or missing tool without another primary failure | `content_failure / MODEL_BAKEOFF_EXACT_TOOL_REQUIRED` |
| one canonical, reference-valid expected tool is durably accepted | `accepted` |

The first primary failure remains primary. An unexpected second stream is
recorded separately as an integrity/secondary condition and must not replace a
more informative first-tool schema or reference failure.

After the first expected tool result, the Stage B transport cancels the agent
whether the result is success or error. A rejected tool call cannot cause a
second provider stream inside the same attempt. The transport does not ask the
model to self-correct and does not call the model again to repair JSON.

The existing bounded pre-side-effect transport retry remains the only possible
extra dispatch. Schema, content, grounding, max-token, timeout after request,
and accepted-side-effect failures remain ineligible for that retry.

## Decision 5: Versioned Global Status and Pair-local Eligibility

The historical Task 8 technical archive and evidence report remain governed by
their existing `0.1` policy and hashes. The implementation must retain a legacy
verification path or a fixed regression fixture proving that the archived
status, `0 / 12` eligible-pair result, and evidence hash do not change.

A future replacement preflight binds a new execution/evidence policy version.
Under that version:

- the overall run report is `PASS` only when the exact run, all global checks,
  and all planned cases pass;
- a global run may therefore be `FAIL` while an unaffected role/model pair is
  still technically eligible;
- archive integrity, approval binding, plan identity, policy identity, and
  secret scan remain global prerequisites for every pair;
- exact-completion failure is reported globally but does not invalidate an
  unrelated pair that has both required repetitions;
- a pair is eligible only when both repetitions contain the exact phase set,
  canonical/reference-valid accepted output, valid usage/timing/trace evidence,
  and, for Conductor, one persistent session across intent and commit;
- any failed or missing repetition invalidates only that pair;
- no final routing can be approved unless every required role decision has at
  least one technically eligible pair and the author completes blinded
  artistic selection.

Pair-local salvage does not turn a partial run into a successful benchmark. It
only prevents an unrelated failure from erasing valid, fully repeated evidence.

## Decision 6: Zero-call Repair Gate and Local Checkpoint Evidence

The implementation gate is entirely local. It may use DSH sessions, scripted
adapters, generated synthetic fixtures, temporary directories, and an
in-process HTTP interception seam. It must not use Keychain, provider
credentials, provider endpoints, search, grounding, repository upload, or any
external tool.

The gate must cover at least:

1. direct valid role submission bound into a canonical shard;
2. wrapper/envelope-shaped input rejected without unwrapping;
3. wrong schema/version fields rejected rather than corrected;
4. unregistered rights, asset, bridge, source lock, object, affordance,
   rollback, semantic capability, and evidence IDs rejected;
5. known references accepted without modification;
6. same Conductor session using 1,024 tokens for intent and 512 for commit;
7. Gemini 3.7 local request serialization using `LOW`, with the HTTP seam
   intercepted before any network;
8. terminal provider error delivered as a finish chunk;
9. max-token finish without a tool;
10. hard timeout;
11. first invalid tool result ending the attempt without a second stream;
12. canonical but reference-invalid submission failing before durability;
13. an affected pair becoming ineligible while an unrelated complete pair
    remains eligible under the new policy;
14. the historical archive retaining its legacy result and hashes;
15. forbidden-content and exact-secret scans still passing on synthetic data;
16. explicit counters proving `providerRequestsMade: 0`, `keychainReads: 0`,
    `externalNetworkRequests: 0`, `preflightsCreated: 0`, and `runsStarted: 0`.

After all local gates pass, a non-run checkpoint packet may be produced under a
distinct repair path, never under a model-bakeoff run root. It contains:

- a deterministic JSON repair-gate report;
- a README/copy statement;
- one 1280x720 screenshot;
- one short 1280x720 WebM;
- capture evidence showing zero non-local browser requests.

Every visible surface must say:

`LOCAL SCRIPTED REPAIR — PROVIDER UNVERIFIED — NO PREFLIGHT — NO REPLACEMENT RUN`

The media may visualize contract ownership, failure classification, and the
zero-call counters. It must not show model scores, eligible candidates,
artistic selection, routing, or a Ruby mutation.

## Rejected Alternatives

### Prompt-only repair

Rejected. A better prompt cannot remove runtime-envelope forgery surface,
classify terminal errors, enforce references, or prevent a second stream.

### Post-generation JSON sanitizer

Rejected. Wrapper unwrapping, rights-prefix insertion, capability replacement,
and reference mapping would turn deterministic code into an unacknowledged
creative co-author and would inflate model quality evidence.

### Patch `node_modules` to force Gemini strict mode

Rejected for this repair. It would create an untracked provider adapter fork,
change a locked dependency surface, and still require provider verification.

### Upgrade the full DSH family before repairing the contract

Rejected. The observed failures are primarily authority, schema, prompt,
request-policy, and evidence-classification problems. A broad dependency
migration would add risk without proving those problems fixed.

### Automatically let the model repair a rejected tool call

Rejected for Stage B. It consumes an undeclared provider stream, confounds
one-attempt latency and cost, and rewards a model for a hidden extra attempt.

### Keep global all-or-nothing pair eligibility

Rejected for future replacement archives. It conflates run completeness with
the validity of an independently complete role/model pair. The historical
archive nevertheless keeps its original policy and result.

### Run the full replacement bake-off immediately after local tests

Rejected. Local tests cannot prove Gemini 3.7 provider acceptance, current
pricing, credential presence, budget authorization, or external transport.

## Risks and Residual Uncertainty

- A narrower contract can improve validity but may still expose genuine model
  failures. The bake-off must preserve those failures rather than hide them.
- Gemini 3.7 `LOW` is only a local serialization hypothesis until a separately
  authorized provider call confirms it.
- The current adapter path cannot claim Google `VALIDATED` tool mode.
- Explicit `low` reasoning can change latency, usage, and artistic output; new
  prices and worst-case cost must be calculated before any provider approval.
- Early reference validation changes where a bad shard fails, but it does not
  change the allowed reference set or grant new authority.
- Pair-local evidence can be order-sensitive in a partial run. Candidate order
  must remain precommitted and the global partial status must stay visible.
- A local screenshot/video proves only the diagnostic UI and archived local
  gate state, not provider quality or 3D interaction.

## Acceptance Criteria

This repair may be marked `implemented` only when:

- the two model-facing submission contracts exist and reject runtime-owned
  fields;
- production and bake-off paths use the same deterministic binder and
  reference validator;
- no content sanitizer or unknown-reference mapper exists;
- exact frozen reference lists are present in the prompt context;
- the persistent Conductor's effective request headers prove separate intent
  and commit caps;
- the explicit provider/reasoning policy is locally serialized and hashable;
- terminal finish chunks and first-tool rejection are classified as designed;
- adversarial zero-call tests cover every item in Decision 6;
- the legacy Task 8 evidence fixture remains unchanged;
- the new pair-local policy behaves independently of global run status;
- shared contracts, Agent Host tests, typecheck, build, and relevant Ruby
  regression checks pass;
- the local repair checkpoint screenshot, video, JSON, and copy are captured
  and hash-verified with zero non-local browser requests;
- a final scan finds no credential value, local user path, private material, or
  accidental provider endpoint call in the repair packet;
- the report states zero Keychain reads, zero provider calls, zero replacement
  preflights, and zero replacement runs.

The spec may be marked `verified` only after the implementation satisfies all
criteria above. Even then, provider compatibility, model quality, artistic
selection, production routing, Ruby interaction, and CP03 acceptance remain
separate future gates.

## Stop Boundary

This approved design authorizes only Tasks 1-8 of the associated local zero-call
implementation plan. That plan must stop before Keychain access, provider
access, replacement preflight creation, a compatibility smoke call, or a
replacement run. A later generic “continue” does not authorize those external
or cost-bearing gates; each needs fresh exact scope and approval.
