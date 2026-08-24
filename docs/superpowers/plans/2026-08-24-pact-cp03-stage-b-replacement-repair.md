# PACT CP03 Stage B Replacement Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the CP03 Stage B model-facing council contract, DSH request/terminal handling, reference validation, and evidence eligibility entirely through local scripted tests, then archive an honestly labelled zero-call repair checkpoint without reading Keychain, calling a provider, creating a replacement preflight, or starting a replacement run.

**Architecture:** Role agents submit only creative and interpretive role content. A shared deterministic binder combines that content with the trusted DSH role/session binding and frozen turn to produce the existing canonical CouncilShard or ConductorDraftCommit. A shared reference validator rejects unknown IDs before durability. The Stage B transport applies phase/model policy through the DSH `agent/request` waterfall, captures terminal finish chunks, and ends an attempt after its first expected tool result. Versioned evidence keeps the historical Task 8 policy immutable while allowing pair-local eligibility for a future replacement archive.

**Tech Stack:** Node.js 22.19+; TypeScript 6; JavaScript JSON-schema package; JSON Schema 2020-12; Ajv 8; DSH `0.1.0-rc.6`; locked pi-ai `0.84.2`; Vitest 4; Playwright Core 1.62; visible local Chrome; existing CP03 CouncilRegistry, durability, deterministic assembler, evidence verifier, and Scene Builder capture infrastructure.

**Spec:** `/Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/docs/superpowers/specs/2026-08-24-pact-cp03-stage-b-replacement-repair-design.md`

**Plan status:** `author_approved`

**Execution status:** `authorized_local_zero_call`

**Author approval and execution authorization date:** 2026-08-24

**Execution baseline:** `86ad65dbf82521ce2fed8e143ce07284f1ee6307`

**External-action status:** `keychain_forbidden_provider_forbidden_preflight_forbidden_run_forbidden`

## Global Constraints

- The author approved the written spec and authorized this local zero-call
  implementation on 2026-08-24. That authorization does not extend to any
  external or cost-bearing gate.
- Every executable step in Tasks 1-8 is local and zero-call. Do not invoke
  `security`, read Keychain, resolve a credential value, inspect provider-key
  environment variables, or open a real provider stream.
- Block all non-loopback network access during executable tests and media
  capture. A locally intercepted HTTP serialization seam is permitted only
  when no bytes can leave the process.
- Do not create `preflight.json`, an approval object, a replacement run ID, a
  model-bakeoff run directory, or a provider result.
- Do not run `npm run model-bakeoff`, a compatibility command that can dispatch,
  or any provider-real script.
- Do not modify anything under
  `checkpoints/cp03/model-bakeoff/cp03-model-bakeoff-20260824T055034Z/`.
- Preserve the historical Task 8 README, result, technical evidence, blind
  packet, media, and hashes byte-for-byte.
- Keep every direct DSH package at `0.1.0-rc.6` and pi-ai at `0.84.2`. Do not
  edit `node_modules`, add a provider SDK, or change dependency versions.
- Do not add a model-output sanitizer. Runtime binding may add only host-owned
  fields. It may not unwrap, rename, prefix, substitute, infer, reorder, or
  complete model-owned content.
- Keep the public council authority flow: agent submission -> canonical binder
  -> reference/schema validation -> CouncilRegistry -> durability -> minimal
  Conductor commit -> deterministic assembler -> viewer approval -> Capability
  Gate -> Ruby.
- Do not change the candidate model list, route list, 28/30 dispatch contract,
  viewer authority, Ruby runtime, or production routing.
- Use only fictional text, programmatic synthetic image bytes, synthetic scene
  facts, and temporary local persistence in tests.
- Test first for each behavioral task. Observe the expected failure before
  implementing the smallest production change that makes it pass.
- Stage only the explicit files listed in each task. Never use `git add .` or
  `git add -A`.
- Commit only after the task's focused checks pass. Do not push under this plan;
  remote reconciliation and push require a later exact authorization.
- A passing local gate may be described only as
  `LOCAL SCRIPTED REPAIR / PROVIDER UNVERIFIED`. It is not provider
  compatibility, a successful bake-off, artistic selection, routing approval,
  Ruby interaction, or CP03 acceptance.

## Interface and File Map

### Shared model-facing contracts

- Create
  `packages/pact-cp03-contracts/schemas/council/council-role-submission.schema.json`.
- Create
  `packages/pact-cp03-contracts/schemas/council/conductor-commit-submission.schema.json`.
- Modify `packages/pact-cp03-contracts/src/index.js`.
- Modify `packages/pact-cp03-contracts/test/fixtures.js`.
- Modify `packages/pact-cp03-contracts/test/contracts.test.js`.

### Shared host binding and reference authority

- Create `apps/pact-agent-host/src/council-tool-binding.ts`.
- Create `apps/pact-agent-host/src/council-submission-binding.ts`.
- Create `apps/pact-agent-host/src/council-reference-validation.ts`.
- Create matching focused tests.
- Modify `apps/pact-agent-host/src/council-tools.ts`.
- Modify `apps/pact-agent-host/src/create-foundation-harness.ts`.
- Modify `apps/pact-agent-host/src/draft-assembler.ts`.
- Modify `apps/pact-agent-host/src/council-runtime.ts`.
- Modify `apps/pact-agent-host/src/index.ts`.

### Stage B prompt, request, transport, and policy

- Create `apps/pact-agent-host/src/model-bakeoff-execution-policy.ts`.
- Create `apps/pact-agent-host/test/model-bakeoff-execution-policy.test.ts`.
- Modify `apps/pact-agent-host/src/model-bakeoff-fixtures.ts`.
- Modify `apps/pact-agent-host/src/model-bakeoff-dsh-transport.ts`.
- Modify `apps/pact-agent-host/src/model-bakeoff-preflight.ts`.
- Modify `apps/pact-agent-host/src/model-bakeoff-gate.ts`.
- Modify focused tests and test fixtures for those modules.

### Versioned technical evidence

- Modify `apps/pact-agent-host/src/model-bakeoff-runner.ts` only where the new
  diagnostic/policy binding requires it; preserve attempt authority and retry
  rules.
- Modify `apps/pact-agent-host/src/model-bakeoff-evidence.ts`.
- Modify `apps/pact-agent-host/src/model-bakeoff-blind-review.ts` only if needed
  to consume the versioned pair report without changing blinded selection
  authority.
- Modify matching tests.

### Zero-call repair checkpoint

- Create `apps/pact-agent-host/src/model-bakeoff-repair-gate.ts`.
- Create `apps/pact-agent-host/test/model-bakeoff-repair-gate.test.ts`.
- Create `apps/pact-agent-host/scripts/model-bakeoff-repair-gate.mts`.
- Create `apps/scene-builder/scripts/capture-cp03-stage-b-repair.mjs`.
- Create checkpoint files only under
  `checkpoints/cp03/stage-b-replacement-repair/`.
- Modify `docs/pact-cp03-progress.md` only after all local gates pass.

## Task 1: Add Minimal Model-facing Submission Contracts

**Files:**

- Create:
  `packages/pact-cp03-contracts/schemas/council/council-role-submission.schema.json`
- Create:
  `packages/pact-cp03-contracts/schemas/council/conductor-commit-submission.schema.json`
- Modify: `packages/pact-cp03-contracts/src/index.js`
- Modify: `packages/pact-cp03-contracts/test/fixtures.js`
- Modify: `packages/pact-cp03-contracts/test/contracts.test.js`

- [ ] Add failing contract tests for the authority boundary.

The tests must accept one valid submission for each role, accept one minimal
Conductor commit submission, and reject every runtime-owned field:

```js
for (const submission of Object.values(validCouncilRoleSubmissions)) {
  expect(validateCouncilRoleSubmission(submission)).toBe(submission);
}

expect(() => validateCouncilRoleSubmission({
  ...validCouncilRoleSubmissions.Witness,
  turnId: "turn_model_must_not_author",
})).toThrow(/additionalProperties/);

expect(() => validateCouncilRoleSubmission({
  ...validCouncilRoleSubmissions.Archivist,
  content: {
    ...validCouncilRoleSubmissions.Archivist.content,
    rightsRequirements: ["synthetic-fixture-only"],
  },
})).toThrow(/validation failed/);
```

Also reject `schemaVersion`, `shardId`, `kind`, `role`, `childSessionId`,
`caseSessionId`, all hashes/versions, `deadlineId`, wrapper objects, arbitrary
URLs/paths/code fields, and executable raw transforms.

- [ ] Run the focused test and confirm the expected failure.

Run from `packages/pact-cp03-contracts`:

```bash
npm test -- test/contracts.test.js
```

Expected: FAIL because the new schemas/validators are not exported.

- [ ] Implement the two closed schemas.

The role submission root must contain only:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["publicTrace", "uncertainties", "evidenceAnchors", "content"],
  "properties": {
    "publicTrace": { "$ref": "#/$defs/creativeString" },
    "uncertainties": { "$ref": "#/$defs/creativeArray" },
    "evidenceAnchors": { "$ref": "#/$defs/refArray" },
    "content": {
      "oneOf": [
        { "$ref": "#/$defs/conductorContent" },
        { "$ref": "#/$defs/witnessContent" },
        { "$ref": "#/$defs/archivistContent" },
        { "$ref": "#/$defs/rewriterContent" },
        { "$ref": "#/$defs/guardianContent" }
      ]
    }
  }
}
```

Copy the closed role-content restrictions from the canonical schema; do not
loosen creative string bounds, action ordering, rights/reference patterns, or
semantic-capability arguments.

The commit submission contains only `actionSequence`, `selectedShardHashes`,
`selectedDissentIds`, and `terminalIntent` with the same canonical constraints.

- [ ] Export schemas and validators without changing existing canonical
  validators.

```js
export const validateCouncilRoleSubmission = checked(
  "CouncilRoleSubmission",
  validators.councilRoleSubmission,
);
export const validateConductorCommitSubmission = checked(
  "ConductorCommitSubmission",
  validators.conductorCommitSubmission,
);
```

- [ ] Rerun the focused contract suite.

Expected: PASS, including explicit no-runtime-field and no-sanitization tests.

- [ ] Stage only the five Task 1 files and commit.

```bash
git add packages/pact-cp03-contracts/schemas/council/council-role-submission.schema.json packages/pact-cp03-contracts/schemas/council/conductor-commit-submission.schema.json packages/pact-cp03-contracts/src/index.js packages/pact-cp03-contracts/test/fixtures.js packages/pact-cp03-contracts/test/contracts.test.js
git commit -m "feat(cp03): add agent-owned council submission contracts"
```

## Task 2: Build the Deterministic Binder and Shared Reference Validator

**Files:**

- Create: `apps/pact-agent-host/src/council-tool-binding.ts`
- Create: `apps/pact-agent-host/src/council-submission-binding.ts`
- Create: `apps/pact-agent-host/src/council-reference-validation.ts`
- Create: `apps/pact-agent-host/test/council-submission-binding.test.ts`
- Create: `apps/pact-agent-host/test/council-reference-validation.test.ts`
- Modify: `apps/pact-agent-host/src/council-tools.ts`
- Modify: `apps/pact-agent-host/src/create-foundation-harness.ts`
- Modify: `apps/pact-agent-host/src/draft-assembler.ts`
- Modify: `apps/pact-agent-host/src/index.ts`
- Modify: `apps/pact-agent-host/test/draft-assembler.test.ts`

- [ ] Write failing binding tests before production code.

Cover exact deterministic output, session/role forgery, missing/stale binding,
wrong phase, wrapper input, unknown references, and byte-for-byte preservation
of all model-owned fields.

```ts
const first = bindCouncilRoleSubmission({ binding, turn, submission });
const second = bindCouncilRoleSubmission({ binding, turn, submission });

expect(first).toEqual(second);
expect(first).toMatchObject({
  schemaVersion: 'cp03-council/0.2',
  role: 'Witness',
  kind: 'WITNESS',
  childSessionId: String(binding.sessionId),
  turnId: turn.snapshot.turnId,
  snapshotHash: turn.snapshotHash,
});
expect(first.publicTrace).toBe(submission.publicTrace);
```

Prove that malformed content is rejected, not corrected:

```ts
expect(() => bindCouncilRoleSubmission({
  binding: archivistBinding,
  turn,
  submission: withRights('synthetic-fixture-only'),
})).toThrow(/REFERENCE_UNKNOWN|validation failed/);
```

- [ ] Run the two new tests and confirm the expected import/module failure.

Run from `apps/pact-agent-host`:

```bash
npm test -- test/council-submission-binding.test.ts test/council-reference-validation.test.ts
```

Expected: FAIL because the binder and validator do not exist.

- [ ] Implement `CouncilToolBindingRegistry`.

Its public surface is intentionally small:

```ts
export interface CouncilToolBinding {
  readonly sessionId: SessionId;
  readonly role: CouncilRole;
  readonly phase: 'SHARD' | 'CONDUCTOR_COMMIT';
  readonly turn: FrozenCouncilTurn;
}

export class CouncilToolBindingRegistry {
  bind(binding: CouncilToolBinding): () => void;
  require(sessionId: SessionId): CouncilToolBinding;
}
```

Reject overlapping conflicting leases. Snapshot/freeze the binding. Release it
at settlement. Do not infer a turn from model arguments.

- [ ] Implement pure canonical binders.

```ts
export const bindCouncilRoleSubmission = (input: BindRoleInput): CouncilShard =>
  validateCouncilShard({
    schemaVersion: CP03_COUNCIL_SCHEMA_VERSION,
    shardId: deterministicShardId(input),
    kind: KIND_BY_ROLE[input.binding.role],
    role: input.binding.role,
    childSessionId: String(input.binding.sessionId),
    caseSessionId: input.binding.turn.snapshot.caseSessionId,
    turnId: input.binding.turn.snapshot.turnId,
    snapshotHash: input.binding.turn.snapshotHash,
    parentSceneHash: input.binding.turn.snapshot.parentSceneHash,
    registryVersion: input.binding.turn.snapshot.registryVersion,
    routingManifestVersion:
      input.binding.turn.snapshot.routingManifestVersion,
    deadlineId: input.binding.turn.snapshot.deadlineId,
    ...validateCouncilRoleSubmission(input.submission),
  }) as CouncilShard;
```

Compute `shardId` from canonical JSON over the trusted turn/session/role and
validated submission. Never use random identity and never include a secret.

- [ ] Extract role-local and cross-shard reference validation from
  `draft-assembler.ts`.

Keep the assembler's existing outcome codes. Add stable role-local codes for
unknown and unavailable references. Do not map one ID to another.

- [ ] Change council tools to validate the minimal submission, resolve the
  trusted binding, bind the canonical object, validate references, and only
  then call `CouncilRegistry`.

Keep public tool names unchanged. The output receipt still refers to the
canonical accepted shard/commit hash.

- [ ] Expose the binding registry on `FoundationHarness` when
  `toolProfile: 'council-v2'` is active.

- [ ] Run focused host tests.

```bash
npm test -- test/council-submission-binding.test.ts test/council-reference-validation.test.ts test/draft-assembler.test.ts test/council-registry.test.ts
```

Expected: PASS. Existing assembler failures remain semantically identical;
new role-local failures occur before durability.

- [ ] Stage only Task 2 files and commit.

```bash
git add apps/pact-agent-host/src/council-tool-binding.ts apps/pact-agent-host/src/council-submission-binding.ts apps/pact-agent-host/src/council-reference-validation.ts apps/pact-agent-host/src/council-tools.ts apps/pact-agent-host/src/create-foundation-harness.ts apps/pact-agent-host/src/draft-assembler.ts apps/pact-agent-host/src/index.ts apps/pact-agent-host/test/council-submission-binding.test.ts apps/pact-agent-host/test/council-reference-validation.test.ts apps/pact-agent-host/test/draft-assembler.test.ts
git commit -m "feat(cp03): bind council runtime envelopes locally"
```

## Task 3: Wire the Same Contract into Production Council and Stage B Prompts

**Files:**

- Modify: `apps/pact-agent-host/src/council-runtime.ts`
- Modify: `apps/pact-agent-host/src/model-bakeoff-dsh-transport.ts`
- Modify: `apps/pact-agent-host/src/model-bakeoff-fixtures.ts`
- Modify: `apps/pact-agent-host/test/council-runtime.test.ts`
- Modify: `apps/pact-agent-host/test/critical-path-council.test.ts`
- Modify: `apps/pact-agent-host/test/model-bakeoff-fixtures.test.ts`
- Modify: `apps/pact-agent-host/test/model-bakeoff-dsh-transport.test.ts`
- Modify scripted council fixtures that currently manufacture a full canonical
  shard as model arguments.

- [ ] Add failing integration assertions for shared binder usage.

The scripted adapters must emit minimal submissions. The resulting durable
events must still contain canonical `cp03-council/0.2` shards, trusted session
identity, frozen turn hashes, and unchanged artistic content.

- [ ] Add a failing prompt-context assertion for categorized exact references.

```ts
expect(context.allowedReferences).toEqual({
  registeredAssetIds: turn.snapshot.registeredAssetIds,
  registeredSpatialBridgeIds: turn.snapshot.registeredSpatialBridgeIds,
  registeredRightsIds: turn.snapshot.registeredRightsIds,
  registeredSceneObjectIds: turn.snapshot.registeredSceneObjectIds,
  registeredAffordanceIds: turn.snapshot.registeredAffordanceIds,
  supportedRollbackCapabilityIds:
    turn.snapshot.supportedRollbackCapabilityIds,
  allowedSemanticCapabilityIds:
    turn.snapshot.allowedSemanticCapabilityIds,
  sourceLockIds: turn.snapshot.sourceLockIds,
  inputRefIds: turn.snapshot.inputRefs.map(({ refId }) => refId),
});
```

Expected initial result: FAIL because prompt context `0.1` lacks these facts and
the scripted adapter still submits canonical envelopes.

- [ ] Bind the active Conductor to the frozen turn before each follow-up.

For the persistent Conductor, replace the phase binding between intent and
commit while retaining the same DSH session. Release only after the phase
settles.

- [ ] Bind each child during continuable setup before its first model step.

In `council-runtime.ts`, the pending child assignment already identifies role;
bind `{ sessionId, role, phase: 'SHARD', turn: options.turn }` in that setup.
In the bake-off transport, bind from `scope.activeTurn` and the current case.

- [ ] Advance the Stage B prompt/fixture schema versions and exact facts.

Use exact machine rights IDs in machine fields:

```ts
rights: ['rights_synthetic_fixture'] as const
```

Keep explanatory licence caveats in fictional prose, not reference arrays.
Update the schema manifest to state the model-facing contract is
`council-role-submission/0.1` or `conductor-commit-submission/0.1`; keep
technical evidence clear that the accepted durable event remains canonical
CouncilShard/ConductorDraftCommit.

- [ ] Remove runtime-identity copying instructions from the model prompt.

The system may state the role but must not ask the model to reproduce session,
turn, hash, or version values. Preserve uncertainty, evidence, rights, and
capability constraints.

- [ ] Run focused production and bake-off tests.

```bash
npm test -- test/council-runtime.test.ts test/critical-path-council.test.ts test/model-bakeoff-fixtures.test.ts test/model-bakeoff-dsh-transport.test.ts
```

Expected: PASS with zero provider requests and canonical durable events.

- [ ] Run the Agent-to-Ruby integration regression.

```bash
npm test -- test/council-to-ruby.integration.test.js
```

Expected: PASS. No Ruby scene or runtime source file changes.

- [ ] Stage only Task 3 files and commit.

```bash
git add apps/pact-agent-host/src/council-runtime.ts apps/pact-agent-host/src/model-bakeoff-dsh-transport.ts apps/pact-agent-host/src/model-bakeoff-fixtures.ts apps/pact-agent-host/test/council-runtime.test.ts apps/pact-agent-host/test/critical-path-council.test.ts apps/pact-agent-host/test/model-bakeoff-fixtures.test.ts apps/pact-agent-host/test/model-bakeoff-dsh-transport.test.ts apps/pact-agent-host/test/council-fixtures.ts
git commit -m "refactor(cp03): share role submissions across council paths"
```

If additional scripted fixture files were actually changed, add their exact
paths explicitly after inspecting `git diff --name-only`; do not broaden the
stage command.

## Task 4: Add a Hash-bound Execution Policy and Phase-specific DSH Requests

**Files:**

- Create: `apps/pact-agent-host/src/model-bakeoff-execution-policy.ts`
- Create: `apps/pact-agent-host/test/model-bakeoff-execution-policy.test.ts`
- Modify: `apps/pact-agent-host/src/model-bakeoff-dsh-transport.ts`
- Modify: `apps/pact-agent-host/src/model-bakeoff-preflight.ts`
- Modify: `apps/pact-agent-host/src/model-bakeoff-gate.ts`
- Modify: `apps/pact-agent-host/src/index.ts`
- Modify matching preflight/gate/transport tests and test fixtures.

- [ ] Write failing policy tests.

Require the exact model map, role caps, contract versions, pair-eligibility
version, no-output-sanitizer declaration, and a canonical SHA-256.

```ts
expect(policy.reasoningByModel).toEqual({
  'deepseek-v4-pro': 'off',
  'deepseek-v4-flash': 'off',
  'gemini-3.5-flash': 'low',
  'gemini-3.6-flash': 'low',
  'gemini-3.7-flash': 'low',
});
expect(verifyModelBakeoffExecutionPolicy(policy).status).toBe('PASS');
```

Tampering any cap, model, reasoning effort, contract version, evidence policy,
or `outputSanitizer: 'forbidden'` must fail the hash check.

- [ ] Run the focused test and confirm expected module-not-found failure.

```bash
npm test -- test/model-bakeoff-execution-policy.test.ts
```

- [ ] Implement the immutable policy manifest and verifier.

The manifest must include:

```ts
{
  schemaVersion: 'cp03-model-bakeoff-execution-policy/0.1',
  roleCaps: {
    ConductorIntent: 1024,
    ConductorCommit: 512,
    Archivist: 1024,
    Guardian: 1024,
    Witness: 1024,
    Rewriter: 1024,
  },
  reasoningByModel: { /* exact table above */ },
  roleSubmissionContract: 'council-role-submission/0.1',
  commitSubmissionContract: 'conductor-commit-submission/0.1',
  canonicalShardContract: 'cp03-council/0.2',
  pairEligibilityPolicy: 'pair-local-two-repetition/0.1',
  outputSanitizer: 'forbidden',
}
```

- [ ] Add replacement-preflight support without creating a preflight file.

Introduce a new preflight version that requires
`executionPolicySha256`. Keep the existing `0.1` verifier path for historical
archives. Unit tests construct all inputs in memory; no Keychain resolver is
called.

- [ ] Install an `agent/request` waterfall in the Stage B candidate scope.

```ts
harness.ctx.on('agent/request', async ({ agent }, next) => {
  const proposed = await next();
  const active = scope?.active;
  if (active === null || active === undefined ||
      String(agent.id) !== active.capture.sessionId) return proposed;
  return {
    ...proposed,
    maxTokens: policy.roleCaps[active.phase],
    reasoningEffort: policy.reasoningByModel[active.model],
  };
});
```

Store phase/model explicitly in the active capture. Do not mutate the frozen
`GenerateOptions` object in `llm/stream`.

- [ ] Remove the Conductor `Math.min(...)` policy bug.

The initial Agent option may use the intent cap, but the effective request
header is authoritative and must switch to 512 only for ConductorCommit.

- [ ] Extend the existing scripted transport test to assert one session and two
  request headers with different caps.

Also assert DeepSeek requests use `off` and all Gemini requests use `low`.

- [ ] Add a local Gemini serialization test with intercepted HTTP.

Use a fixed synthetic API-key string in process memory only. Replace the HTTP
transport before invoking the installed adapter, capture the body, and return a
synthetic terminal response. Fail if the destination is reached through any
real network implementation.

Assertions for Gemini 3.7:

```ts
expect(body.config.thinkingConfig.thinkingLevel).toBe('LOW');
expect(body.config.thinkingConfig.thinkingLevel).not.toBe('MINIMAL');
expect(externalNetworkRequests).toBe(0);
```

This test must be labelled local serialization, not provider compatibility.

- [ ] Run focused tests.

```bash
npm test -- test/model-bakeoff-execution-policy.test.ts test/model-bakeoff-preflight.test.ts test/model-bakeoff-gate.test.ts test/model-bakeoff-dsh-transport.test.ts
```

Expected: PASS; provider requests `0`; Keychain reads `0`.

- [ ] Stage exact Task 4 files and commit.

```bash
git add apps/pact-agent-host/src/model-bakeoff-execution-policy.ts apps/pact-agent-host/src/model-bakeoff-dsh-transport.ts apps/pact-agent-host/src/model-bakeoff-preflight.ts apps/pact-agent-host/src/model-bakeoff-gate.ts apps/pact-agent-host/src/index.ts apps/pact-agent-host/test/model-bakeoff-execution-policy.test.ts apps/pact-agent-host/test/model-bakeoff-preflight.test.ts apps/pact-agent-host/test/model-bakeoff-gate.test.ts apps/pact-agent-host/test/model-bakeoff-dsh-transport.test.ts
git commit -m "fix(cp03): bind stage b request policy by phase"
```

## Task 5: Capture Terminal Finishes and Enforce One-shot Attempts

**Files:**

- Modify: `apps/pact-agent-host/src/model-bakeoff-dsh-transport.ts`
- Modify: `apps/pact-agent-host/src/model-bakeoff-runner.ts`
- Modify: `apps/pact-agent-host/test/model-bakeoff-dsh-transport.test.ts`
- Modify: `apps/pact-agent-host/test/model-bakeoff-runner.test.ts`

- [ ] Add scripted adapters for five adversarial terminal paths.

1. finish chunk `{ kind: 'error', failure: { code: 'HTTP_400', ... } }`;
2. finish chunk `{ kind: 'max-tokens' }` with no tool;
3. local hard timeout;
4. one expected tool call whose arguments fail validation;
5. one canonical-schema-valid submission with an unknown registered reference.

The invalid-tool adapter must be capable of emitting a second stream if not
cancelled. The assertion requires that the repaired transport prevents it.

- [ ] Run the focused tests and observe current misclassification.

```bash
npm test -- test/model-bakeoff-dsh-transport.test.ts test/model-bakeoff-runner.test.ts
```

Expected before implementation: at least terminal error is flattened into a
schema failure, max-token lacks a stable primary code, or the invalid tool path
records a second stream.

- [ ] Capture terminal finish reasons in `observeStream`.

```ts
if (chunk.type === 'finish') capture.terminalFinish = chunk.reason;
```

Preserve the first terminal finish. Capture adapter error code/message only as
redacted, bounded detail codes; never persist raw provider error text containing
credentials or local paths.

- [ ] Record the first expected tool result whether success or error.

On the first expected `tool/result`, cancel the Stage B agent after recording
the normalized result. Do not require an accepted domain event before
cancellation.

- [ ] Implement deterministic classification priority from the spec.

Do not let `acceptedEvent === null` default every failure to
`MODEL_BAKEOFF_SCHEMA_REJECTED`. Distinguish provider/config error, max-token,
deadline, schema, reference/grounding, and exact-tool content failures.

- [ ] Keep retry eligibility unchanged.

Only an exact pre-side-effect transport failure may consume the existing
provider retry slot. Provider HTTP 400, max-token, schema, grounding, timeout,
and content failures do not retry.

- [ ] Add diagnostic primary/secondary fields only under the replacement
  policy version.

Historical `0.1` diagnostics remain accepted without those fields. New
diagnostics record the primary outcome and any secondary stream/integrity
condition separately.

- [ ] Rerun focused tests.

Expected:

- HTTP 400 -> provider error;
- max-token/no-tool -> content failure with stable code;
- hard timer -> late;
- invalid arguments -> schema failure and exactly one stream;
- unknown reference -> grounding failure and no durable event;
- no automatic retry for any of these cases.

- [ ] Stage exact Task 5 files and commit.

```bash
git add apps/pact-agent-host/src/model-bakeoff-dsh-transport.ts apps/pact-agent-host/src/model-bakeoff-runner.ts apps/pact-agent-host/test/model-bakeoff-dsh-transport.test.ts apps/pact-agent-host/test/model-bakeoff-runner.test.ts
git commit -m "fix(cp03): preserve stage b terminal failure evidence"
```

## Task 6: Version Pair-local Eligibility Without Rewriting Task 8

**Files:**

- Modify: `apps/pact-agent-host/src/model-bakeoff-evidence.ts`
- Modify: `apps/pact-agent-host/src/model-bakeoff-blind-review.ts`
- Modify: `apps/pact-agent-host/test/model-bakeoff-evidence.test.ts`
- Modify: `apps/pact-agent-host/test/model-bakeoff-blind-review.test.ts`
- Modify: `apps/pact-agent-host/test/model-bakeoff-test-fixtures.ts`

- [ ] Add a legacy archive regression before changing the verifier.

Load the actual committed Task 8 `technical-archive.json` and
`technical-evidence.json` read-only. Assert:

```ts
expect(reverified.status).toBe('FAIL');
expect(reverified.pairs.filter(({ technicallyEligible }) => technicallyEligible))
  .toHaveLength(0);
expect(reverified.technicalEvidenceSha256)
  .toBe(archived.technicalEvidenceSha256);
```

Also hash every file in the Task 8 run root before and after this test command
and assert no change.

- [ ] Add a failing replacement-policy pair-local test.

Create an in-memory replacement archive where both repetitions of one Witness
pair are valid and an unrelated Guardian pair fails. Require overall report
`FAIL`, Witness pair eligible, Guardian pair ineligible.

- [ ] Run the focused test and observe that `baseEligible` currently erases the
  unaffected pair.

```bash
npm test -- test/model-bakeoff-evidence.test.ts
```

- [ ] Split legacy and replacement evidence policy explicitly.

Keep the old global base for historical preflight/archive versions. For the
replacement version, global pair prerequisites are limited to archive
integrity, approval, exact plan/policy binding, and secret scan. Exact run
completion remains a global report check but is not a pair prerequisite.

```ts
const pairBaseEligible = replacementPolicy
  ? [checks.archive, checks.approval, checks.plan, checks.policy, checks.secretScan]
      .every((value) => value === 'PASS')
  : legacyBaseEligible(checks);
```

- [ ] Require exactly two valid repetitions per role/model pair.

For Conductor, each repetition still requires both intent and commit on the
same session. Missing/skipped/failed cases invalidate that pair only.

- [ ] Keep global claims conservative.

The report status remains `FAIL` when dispatch completion or any other global
check fails. The blind packet may include only pair-eligible candidates and
must state when coverage is partial. Final routing remains impossible unless
every role decision has at least one eligible candidate.

- [ ] Rerun evidence and blind-review tests.

```bash
npm test -- test/model-bakeoff-evidence.test.ts test/model-bakeoff-blind-review.test.ts
```

Expected: replacement pair-local case passes; historical report and hash are
unchanged.

- [ ] Rehash the Task 8 archive and confirm byte identity.

Use a read-only hash command over the exact run root and compare with the
pre-task manifest. Any change is a stop condition; do not repair or amend the
archive in place.

- [ ] Stage only Task 6 source/tests and commit.

```bash
git add apps/pact-agent-host/src/model-bakeoff-evidence.ts apps/pact-agent-host/src/model-bakeoff-blind-review.ts apps/pact-agent-host/test/model-bakeoff-evidence.test.ts apps/pact-agent-host/test/model-bakeoff-blind-review.test.ts apps/pact-agent-host/test/model-bakeoff-test-fixtures.ts
git commit -m "fix(cp03): separate run status from pair eligibility"
```

## Task 7: Build and Execute the Comprehensive Zero-call Repair Gate

**Files:**

- Create: `apps/pact-agent-host/src/model-bakeoff-repair-gate.ts`
- Create: `apps/pact-agent-host/test/model-bakeoff-repair-gate.test.ts`
- Create: `apps/pact-agent-host/scripts/model-bakeoff-repair-gate.mts`
- Modify: `apps/pact-agent-host/src/index.ts`

- [ ] Write the gate test first.

The gate composes existing unit-level facts into one deterministic report. It
does not duplicate provider/preflight authorization code and accepts no
credential input.

```ts
expect(report).toMatchObject({
  schemaVersion: 'cp03-stage-b-replacement-repair-gate/0.1',
  status: 'PASS',
  providerRequestsMade: 0,
  keychainReads: 0,
  externalNetworkRequests: 0,
  preflightsCreated: 0,
  runsStarted: 0,
  providerCompatibilityProven: false,
});
```

The report includes named checks for all 16 cases in the spec's Decision 6 and
a canonical SHA-256 over the unsigned body.

- [ ] Run the new test and confirm expected module-not-found failure.

```bash
npm test -- test/model-bakeoff-repair-gate.test.ts
```

- [ ] Implement a fail-closed external-I/O guard.

During gate execution:

- replace `globalThis.fetch` with a loopback-only/intercepting implementation;
- fail on `http:` or `https:` destinations not explicitly consumed by the
  in-process serializer test;
- do not import the Keychain reader or real runner;
- set provider adapter kind to scripted;
- write only to an explicit temporary output directory supplied by the caller;
- reject output paths inside a model-bakeoff run root.

- [ ] Implement the gate script with no implicit output path.

The script requires `--output <temporary-or-repair-checkpoint-path>` and
`--mode local-scripted`. It refuses `--provider`, `--preflight`, `--run-id`, or
any credential option. It prints only the report path and hash, never raw
prompts or synthetic API-key strings.

- [ ] Run the focused gate into a fresh temporary directory.

```bash
tmp_root="$(mktemp -d)"
node --import tsx/esm scripts/model-bakeoff-repair-gate.mts --mode local-scripted --output "$tmp_root/repair-gate-report.json"
```

Expected: PASS and the five zero counters above. This command must not create
anything under `checkpoints/cp03/model-bakeoff/`.

- [ ] Run all focused repair tests together.

```bash
npm test -- test/council-submission-binding.test.ts test/council-reference-validation.test.ts test/model-bakeoff-execution-policy.test.ts test/model-bakeoff-dsh-transport.test.ts test/model-bakeoff-runner.test.ts test/model-bakeoff-evidence.test.ts test/model-bakeoff-repair-gate.test.ts
```

Expected: PASS, with every adapter scripted or locally intercepted.

- [ ] Stage exact Task 7 files and commit.

```bash
git add apps/pact-agent-host/src/model-bakeoff-repair-gate.ts apps/pact-agent-host/test/model-bakeoff-repair-gate.test.ts apps/pact-agent-host/scripts/model-bakeoff-repair-gate.mts apps/pact-agent-host/src/index.ts
git commit -m "test(cp03): add zero-call stage b repair gate"
```

## Task 8: Archive the Local Repair Checkpoint and Run Full Offline Gates

**Files:**

- Create: `apps/scene-builder/scripts/capture-cp03-stage-b-repair.mjs`
- Create: `checkpoints/cp03/stage-b-replacement-repair/README.md`
- Create:
  `checkpoints/cp03/stage-b-replacement-repair/repair-gate-report.json`
- Create:
  `checkpoints/cp03/stage-b-replacement-repair/capture-report.json`
- Create:
  `checkpoints/cp03/stage-b-replacement-repair/media/local-repair-summary.png`
- Create:
  `checkpoints/cp03/stage-b-replacement-repair/media/local-repair-summary.webm`
- Modify: `docs/pact-cp03-progress.md`

- [ ] Rerun the repair gate with the fixed non-run checkpoint destination.

The directory name contains no timestamp/run ID and is outside
`checkpoints/cp03/model-bakeoff/`. Refuse to overwrite an existing packet whose
report hash differs; inspect before replacing any generated media.

- [ ] Create a local diagnostic board from the report.

The 1280x720 board shows:

- deterministic binder vs agent-owned fields;
- exact reference validation;
- phase caps `1024 / 512`;
- terminal classifications;
- legacy archive unchanged;
- pair-local policy test;
- counters `0 / 0 / 0 / 0 / 0` for provider, Keychain, external network,
  preflight, and run;
- the exact banner
  `LOCAL SCRIPTED REPAIR — PROVIDER UNVERIFIED — NO PREFLIGHT — NO REPLACEMENT RUN`.

It shows no model score, candidate winner, routing assignment, visitor data, or
Ruby mutation.

- [ ] Capture one screenshot and one short visible-Chrome WebM.

The capture script must record console errors and all browser requests. It
fails unless non-local requests are zero, screenshot dimensions are 1280x720,
the WebM is decodable, and the banner is visible throughout.

- [ ] Verify media and report hashes.

Use `ffprobe` for dimensions, codec, frame rate, and duration. Hash PNG, WebM,
JSON, and README. Run the capture twice to a temporary destination and compare
the deterministic screenshot/report hashes. Video container bytes need not be
identical unless the existing capture harness guarantees deterministic
metadata; verify its decoded properties and content sequence instead.

- [ ] Update progress only with separated evidence states.

Record:

- written repair spec: author approval status;
- implementation: local status;
- zero-call gate: tested status;
- checkpoint media: captured/hash-verified status;
- provider compatibility: unverified;
- replacement preflight: not created;
- replacement run: not authorized/not started;
- human model selection: not available;
- routing/Ruby/checkpoint acceptance: unchanged.

- [ ] Run shared contracts full suite.

From `packages/pact-cp03-contracts`:

```bash
npm test
```

Expected: PASS.

- [ ] Run Agent Host full suite, typecheck, and build.

From `apps/pact-agent-host`:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all PASS. Report exact test/file counts rather than copying old
counts from Task 8.

- [ ] Run Scene Builder regression and build.

From `apps/scene-builder`:

```bash
npm test
npm run build
```

Expected: PASS with no Ruby scene/runtime source changes.

- [ ] Run source, credential, path, placeholder, and formatting scans.

From repository root:

```bash
rg -n "TBD|TODO|FIXME|implement later|placeholder" packages/pact-cp03-contracts apps/pact-agent-host checkpoints/cp03/stage-b-replacement-repair docs/pact-cp03-progress.md
rg -n "BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|Bearer [A-Za-z0-9._-]+|api[_-]?key[[:space:]]*[:=]|/Users/" checkpoints/cp03/stage-b-replacement-repair
git diff --check
git status --short
```

Expected: no placeholder in changed production/checkpoint files, no credential
or absolute-user-path match in the packet, clean diff formatting, and only
expected task files changed. If prose legitimately explains a forbidden token,
use a narrower structural scanner and document it; do not silently ignore a
match.

- [ ] Reconfirm Task 8 archive byte identity.

Compare the post-implementation hash manifest with the pre-Task-6 manifest.
Any difference blocks completion.

- [ ] Stage only the Task 8 files and commit.

```bash
git add apps/scene-builder/scripts/capture-cp03-stage-b-repair.mjs checkpoints/cp03/stage-b-replacement-repair/README.md checkpoints/cp03/stage-b-replacement-repair/repair-gate-report.json checkpoints/cp03/stage-b-replacement-repair/capture-report.json checkpoints/cp03/stage-b-replacement-repair/media/local-repair-summary.png checkpoints/cp03/stage-b-replacement-repair/media/local-repair-summary.webm docs/pact-cp03-progress.md
git commit -m "docs(cp03): archive local stage b repair checkpoint"
```

- [ ] Stop and report; do not fetch, push, create a preflight, or call a
  provider.

The handoff must state current branch/HEAD, local commits created, exact test
results, checkpoint paths/hashes, Task 8 archive identity, and all unproven
future gates. Ask for separate authorization before remote reconciliation or
push. A future provider step additionally requires fresh prices, exact Keychain
presence scope, a new preflight/run identity, budget ceiling, and explicit
one-run approval.

## Plan Self-review Checklist

Before presenting implementation as ready for author review:

- [ ] Every spec goal has at least one task and verification step.
- [ ] Every spec non-goal is preserved by a test, guard, or explicit stop
  boundary.
- [ ] No step reads Keychain, calls a provider, creates a replacement preflight,
  or starts a run.
- [ ] Agent-owned creative fields are never supplied by deterministic code.
- [ ] Runtime-owned envelope fields are never requested from the model.
- [ ] No output sanitizer, reference mapper, or hidden second stream exists.
- [ ] Production and bake-off use the same binder and validator.
- [ ] Gemini serialization evidence is labelled local-only.
- [ ] Historical and replacement evidence policies are version-separated.
- [ ] The actual Task 8 archive remains byte-identical.
- [ ] The local checkpoint has screenshot, video, JSON, copy, and zero-network
  evidence.
- [ ] All source snippets use existing DSH interfaces (`agent/request`,
  `llm/stream`, session events, tool execution context) rather than invented
  APIs.
- [ ] No `TBD`, `TODO`, fake hash, placeholder count, or unbound path remains.
- [ ] All commits stage explicit files only.
- [ ] Push, provider smoke, preflight, replacement run, human selection,
  routing, Ruby mutation, and CP03 acceptance remain unexecuted separate gates.

## Completion State of This Plan

Executing all tasks can establish only:

`REPAIR_IMPLEMENTED_AND_LOCALLY_VERIFIED / ZERO_PROVIDER_CALLS / PROVIDER_UNVERIFIED`

It cannot establish:

`REPLACEMENT_PREFLIGHT_ELIGIBLE`, `GEMINI_37_PROVIDER_COMPATIBLE`,
`MODEL_BAKEOFF_PASS`, `HUMAN_KEEP`, `ROUTING_APPROVED`, `RUBY_INTERACTION_PASS`,
or `CP03_ACCEPTED`.
