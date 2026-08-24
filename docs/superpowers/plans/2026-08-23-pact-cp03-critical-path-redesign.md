# PACT CP03 Critical-Path Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the serial model-authored full-draft step with five parallel typed council shards, one minimal Case Conductor commit, and a deterministic fail-closed assembler that can produce an approval-ready CP03 draft within the existing 2.5/8/12-second contract.

**Architecture:** Preserve the historical eight-probe runner and its Live Run 01–03 evidence unchanged. Add a separate council-v2 path that reuses the existing DSH foundation, provider dispatch ledger, durability barriers, `SubmissionRegistry`, viewer approval, Capability Gate, and Ruby runtime. The new path accepts typed agent shards, projects an honest durable trace, evaluates Guardian constraints, assembles locally, and promotes only a complete hash-bound draft.

**Tech Stack:** Node.js 22.19+; TypeScript 6; JavaScript ESM; Vitest 4; JSON Schema 2020-12 with Ajv 8; DSH `0.1.0-rc.6`; JSONL session persistence; existing Scene Builder/Ruby JavaScript runtime.

**Spec:** `/Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/docs/superpowers/specs/2026-08-22-pact-cp03-critical-path-redesign-design.md`

**Plan status:** `local_scripted_verified_remote_synced`

**Local verification boundary (2026-08-23):** Tasks 1–7 and Task 8 local
steps are implemented. A final fetch found Ruby's remote tip `b334db0`
diverged from local council-evidence tip `3ddd70e`; the resolved collaboration
merge preserves both parents. On that combined worktree, contracts passed
`25/25`, Agent Host passed `346/346` plus typecheck/build, and Scene Builder
passed `217/217` plus build. Ruby's CP03 audience, 4.446 MB autosave recovery,
and rig-editor browser smokes also passed. The two-parent integration merge
`fef3a99` was pushed normally and `git ls-remote` matched its full local SHA.
Provider calls remained `0`; Live Run 04, formal checkpoint capture, human
decisions, deployment, and public release remain unperformed.

## Global Constraints

- Make zero Gemini or DeepSeek requests during implementation and local verification.
- Do not execute or add an automatically executable Live Run 04 path.
- Keep the historical `provider-real-runner.ts`, `provider-run-evidence.ts`, eight-probe contract, and three archived live failures semantically intact.
- Keep `first durable public trace <= 2.5s` and `complete accepted draft <= 8s` as design targets; admit a complete draft only when assembly finishes strictly before `12s`.
- The twelve-second deadline closes agent synthesis, not later viewer deliberation.
- Use one immutable turn snapshot and one monotonic deadline for every shard, commit, and assembly decision.
- The representative path uses Gemini and DeepSeek, `6 planned` dispatches, and `8 maximum` with one global pre-side-effect transport retry slot per provider.
- No model-authored full `AgentActionDraft`, raw stream token, fixed poetic template, arbitrary code, unknown URL, invented licence, or live asset download may enter the council-v2 path.
- Preserve explicit viewer approval, draft/scene hash checks, deterministic Capability Gate validation, Ruby execution/rollback receipt, and durable CaseSession transition.
- Do not implement CP04 retrieval, the audience UI, five final visual effects, formal encounters, or checkpoint video/stills in this plan.
- Add no dependencies. Follow the existing package-local npm installs and test commands.
- Stage explicit task files only; never use `git add .` or `git add -A`.
- Each task ends in one small commit after its focused tests pass. Before any push, fetch the collaboration branch, require a fast-forward, and verify the remote SHA with `git ls-remote`.

## File Structure

### Preserve as historical compatibility paths

- `apps/pact-agent-host/src/provider-real-runner.ts`: Live Run 01–03 eight-probe runner; do not convert it into council-v2.
- `apps/pact-agent-host/src/provider-run-evidence.ts`: verifier for the historical provider-run archive schema.
- `apps/pact-agent-host/src/probe-plan.ts`: historical eight-probe plan; only extend its tool-name type if the shared ledger requires it.
- `apps/pact-agent-host/test/provider-real-runner.test.ts`: regression proof that the old archived path still behaves identically.

### Create for council-v2

- `packages/pact-cp03-contracts/schemas/council/council-shard.schema.json`: provider-authored role-shard contract.
- `packages/pact-cp03-contracts/schemas/council/conductor-draft-commit.schema.json`: minimal Conductor decision contract.
- `packages/pact-cp03-contracts/schemas/council/provider-routing-manifest.schema.json`: fixed dual-provider routing manifest.
- `apps/pact-agent-host/src/council-turn.ts`: immutable snapshot, required-role policy, monotonic timing boundaries.
- `apps/pact-agent-host/src/council-registry.ts`: shard/commit admission, acceptance sequence, idempotency, selection barrier, and local proposal set.
- `apps/pact-agent-host/src/council-tools.ts`: only `pact_submit_council_shard` and `pact_submit_conductor_commit`.
- `apps/pact-agent-host/src/council-durability.ts`: append/flush/inspect proof for shard, projected trace, and commit events.
- `apps/pact-agent-host/src/guardian-conflict.ts`: typed Guardian/Rewriter/Archivist/Witness conflict evaluation.
- `apps/pact-agent-host/src/draft-assembler.ts`: deterministic field-copying assembler and canonical draft hash.
- `apps/pact-agent-host/src/council-routing.ts`: manifest validation and role lookup without runtime fallback.
- `apps/pact-agent-host/src/council-runtime.ts`: five-parallel-plus-one DSH orchestration.
- `apps/pact-agent-host/src/council-run-evidence.ts`: council-v2 scripted/live evidence shape and verifier, separate from historical evidence.
- `apps/pact-agent-host/test/council-fixtures.ts`: canonical full-turn typed fixtures reused by focused tests.
- Focused tests named after each module and one new `council-to-ruby.integration.test.js` vertical slice.

---

### Task 1: Freeze Council Shard, Commit, and Routing Contracts

**Files:**
- Create: `packages/pact-cp03-contracts/schemas/council/council-shard.schema.json`
- Create: `packages/pact-cp03-contracts/schemas/council/conductor-draft-commit.schema.json`
- Create: `packages/pact-cp03-contracts/schemas/council/provider-routing-manifest.schema.json`
- Modify: `packages/pact-cp03-contracts/src/index.js`
- Modify: `packages/pact-cp03-contracts/test/fixtures.js`
- Modify: `packages/pact-cp03-contracts/test/contracts.test.js`
- Modify: `apps/pact-agent-host/src/contract-types.ts`
- Modify: `apps/pact-agent-host/src/pact-contracts.d.ts`

**Interfaces:**
- Consumes: existing `canonicalJson`, `sha256Canonical`, stable-ref/hash patterns, action-sequence rules, and registered-interaction argument shape.
- Produces: `CouncilShard`, `ConductorDraftCommit`, `ProviderRoutingManifest`, their JSON schemas, and `validateCouncilShard`, `validateConductorDraftCommit`, `validateProviderRoutingManifest`.

- [x] **Step 1: Add red contract tests and complete fixtures**

Add frozen fixtures for all five shard kinds, one minimal commit, and one dual-provider manifest. Use these exact kind/role pairs:

```js
const kindByRole = Object.freeze({
  CaseConductor: "CONDUCTOR_INTENT",
  Witness: "WITNESS",
  Archivist: "ARCHIVIST",
  Rewriter: "REWRITER",
  Guardian: "GUARDIAN",
});
```

Add assertions that each fixture validates and that the validators reject:

```js
expect(() => validateCouncilShard({
  ...validCouncilShards.Rewriter,
  role: "Guardian",
})).toThrow(/validation failed/);

expect(() => validateConductorDraftCommit({
  ...validConductorDraftCommit,
  creative: { publicPoeticText: "not allowed in a commit" },
})).toThrow(/additionalProperties/);

expect(() => validateProviderRoutingManifest({
  ...validProviderRoutingManifest,
  assignments: {
    ...validProviderRoutingManifest.assignments,
    CaseConductor: {
      ...validProviderRoutingManifest.assignments.CaseConductor,
      provider: "unapproved-provider",
    },
  },
})).toThrow(/validation failed/);
```

- [x] **Step 2: Run the red shared-contract suite**

Run:

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/packages/pact-cp03-contracts
npx vitest run test/contracts.test.js
```

Expected: FAIL because the council schema imports and validator exports do not exist.

- [x] **Step 3: Add the council schema version and exact TypeScript contracts**

Export `CP03_COUNCIL_SCHEMA_VERSION = "cp03-council/0.2"`. Add these discriminated contracts to `contract-types.ts` and expose them through `pact-contracts.d.ts`:

```ts
export type CouncilRole =
  | 'CaseConductor'
  | 'Witness'
  | 'Archivist'
  | 'Rewriter'
  | 'Guardian';

export type CouncilShardKind =
  | 'CONDUCTOR_INTENT'
  | 'WITNESS'
  | 'ARCHIVIST'
  | 'REWRITER'
  | 'GUARDIAN';

export interface CouncilShardBase {
  readonly schemaVersion: 'cp03-council/0.2';
  readonly shardId: string;
  readonly kind: CouncilShardKind;
  readonly role: CouncilRole;
  readonly childSessionId: string;
  readonly caseSessionId: string;
  readonly turnId: string;
  readonly snapshotHash: string;
  readonly parentSceneHash: string;
  readonly registryVersion: string;
  readonly routingManifestVersion: string;
  readonly deadlineId: string;
  readonly publicTrace: string;
  readonly uncertainties: readonly string[];
  readonly evidenceAnchors: readonly string[];
}

export interface ConductorDraftCommit {
  readonly schemaVersion: 'cp03-council/0.2';
  readonly turnId: string;
  readonly status: 'NEEDS_CLARIFICATION' | 'PROPOSED' | 'WITHHELD';
  readonly actionSequence: readonly string[];
  readonly selectedShardHashes: readonly string[];
  readonly selectedDissentIds: readonly string[];
  readonly terminalIntent: 'Continue' | 'KeepOpaque' | null;
}

export interface ProviderRoutingManifest {
  readonly schemaVersion: 'cp03-council-routing/0.1';
  readonly manifestVersion: string;
  readonly plannedDispatches: 6;
  readonly maximumDispatches: 8;
  readonly assignments: Readonly<Record<CouncilRole, {
    readonly provider: 'deepseek' | 'gemini';
    readonly route: string;
    readonly model: string;
    readonly adapterPackage: string;
    readonly adapterVersion: string;
    readonly promptHash: string;
    readonly toolProfile: 'council-v2';
    readonly maximumConcurrency: number;
    readonly inputClasses: readonly ('text' | 'image' | 'audio')[];
    readonly inputLimitTokens: number;
    readonly outputLimitTokens: number;
    readonly timeoutMs: number;
  }>>;
}
```

Define the five `content` variants exactly as approved:

- Conductor: `initialInterpretation`, `candidateActionSequence`, `roleRelevance`, `terminalIntent`.
- Witness: observation records with stable `observationId`, `text`, and `inputRefIds`.
- Archivist: `requestedAssetIds`, `requestedSpatialBridgeIds`, `provenanceAnchors`, `rightsRequirements`, `unavailableRefs`.
- Rewriter: all existing creative draft fields plus registered semantic capability calls and `expectedChanges`.
- Guardian: `disposition`, forbidden capability IDs, required source locks/rights/rollback capabilities, contested evidence IDs, required dissent records, and `guardianChallenge`.

The JSON schemas must use `additionalProperties: false`, bind each role to its matching content kind, reuse the existing terminal-action ordering, and permit only `performRegisteredInteraction` capability arguments. Do not add generic JSON creative blobs.

- [x] **Step 4: Register the three Ajv validators**

In `packages/pact-cp03-contracts/src/index.js`, import, export, compile, and wrap all three schemas using the existing `checked()` error path:

```js
export const validateCouncilShard = checked("CouncilShard", validators.councilShard);
export const validateConductorDraftCommit = checked(
  "ConductorDraftCommit",
  validators.conductorDraftCommit,
);
export const validateProviderRoutingManifest = checked(
  "ProviderRoutingManifest",
  validators.providerRoutingManifest,
);
```

- [x] **Step 5: Run contract tests and both dependent typechecks**

Run:

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/packages/pact-cp03-contracts
npm test
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npm run typecheck
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/scene-builder
npx vitest run src/cp03/capability-gate.test.js
```

Expected: all existing contracts remain valid; new variants pass; malformed role/kind, creative commit, raw control, and invalid provider values fail.

- [x] **Step 6: Commit Task 1**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- packages/pact-cp03-contracts/schemas/council/council-shard.schema.json packages/pact-cp03-contracts/schemas/council/conductor-draft-commit.schema.json packages/pact-cp03-contracts/schemas/council/provider-routing-manifest.schema.json packages/pact-cp03-contracts/src/index.js packages/pact-cp03-contracts/test/fixtures.js packages/pact-cp03-contracts/test/contracts.test.js apps/pact-agent-host/src/contract-types.ts apps/pact-agent-host/src/pact-contracts.d.ts
git commit -m "feat(cp03): define typed council contracts"
```

---

### Task 2: Freeze the Turn Snapshot and Required-Role Policy

**Files:**
- Create: `apps/pact-agent-host/src/council-turn.ts`
- Create: `apps/pact-agent-host/test/council-turn.test.ts`
- Create: `apps/pact-agent-host/test/council-fixtures.ts`
- Modify: `apps/pact-agent-host/src/index.ts`

**Interfaces:**
- Consumes: `CouncilRole`, `ProviderRoutingManifest`, `sha256Canonical`, existing CaseSession action state, and a caller-supplied monotonic `now()`.
- Produces: `COUNCIL_TIMING_LIMITS`, `CouncilTurnSnapshot`, `FrozenCouncilTurn`, `freezeCouncilTurn()`, `requiredRolesForTurn()`, and `isBeforeCouncilDeadline()`.

- [x] **Step 1: Write red snapshot, policy, and strict-deadline tests**

Use a full representative fixture with image input, scene observation claims, scene mutation, asset/spatial change, and rights sensitivity. Assert:

```ts
expect(requiredRolesForTurn(fullTurnScope)).toEqual([
  'CaseConductor',
  'Witness',
  'Archivist',
  'Rewriter',
  'Guardian',
]);
expect(isBeforeCouncilDeadline(11_999, 12_000)).toBe(true);
expect(isBeforeCouncilDeadline(12_000, 12_000)).toBe(false);
expect(isBeforeCouncilDeadline(12_001, 12_000)).toBe(false);
```

Also prove that a text-only non-mutating turn requires only CaseConductor, and that identical JSON inputs produce identical snapshot hashes while a different scene hash or routing version changes the hash.

- [x] **Step 2: Run the red test**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/council-turn.test.ts
```

Expected: FAIL because `council-turn.ts` does not exist.

- [x] **Step 3: Implement immutable snapshot and timing constants**

Use these exact boundaries:

```ts
export interface CouncilTurnScope {
  readonly usesImageOrAudioClaims: boolean;
  readonly usesSceneObservationClaims: boolean;
  readonly allowsSceneMutation: boolean;
  readonly allowsAssetOrSpatialChange: boolean;
  readonly requiresProvenanceOrRights: boolean;
}

export interface CouncilTurnSnapshot {
  readonly schemaVersion: 'cp03-council-turn/0.1';
  readonly caseSessionId: string;
  readonly turnId: string;
  readonly parentSceneHash: string;
  readonly sourceLockIds: readonly string[];
  readonly inputRefs: readonly {
    readonly refId: string;
    readonly inputClass: 'text' | 'image' | 'audio';
  }[];
  readonly registryVersion: string;
  readonly registeredAssetIds: readonly string[];
  readonly registeredSpatialBridgeIds: readonly string[];
  readonly registeredRightsIds: readonly string[];
  readonly supportedRollbackCapabilityIds: readonly string[];
  readonly allowedSemanticCapabilityIds: readonly string[];
  readonly caseActionState: CaseSessionStateSummary;
  readonly turnScope: CouncilTurnScope;
  readonly requiredRoles: readonly CouncilRole[];
  readonly routingManifestVersion: string;
  readonly deadlineId: string;
  readonly deadlineMs: 12_000;
}

export const COUNCIL_TIMING_LIMITS = Object.freeze({
  systemStatusTargetMs: 150,
  firstPublicTraceTargetMs: 2_500,
  requiredShardsTargetMs: 5_500,
  conductorCommitTargetMs: 7_800,
  draftTargetMs: 8_000,
  hardDeadlineMs: 12_000,
  assemblyTargetMs: 100,
});

export interface FrozenCouncilTurn {
  readonly snapshot: CouncilTurnSnapshot;
  readonly snapshotHash: string;
  readonly requiredRoles: readonly CouncilRole[];
  readonly startedAtMonotonicMs: number;
  readonly deadlineAtMonotonicMs: number;
}

export const isBeforeCouncilDeadline = (
  nowMs: number,
  deadlineAtMs: number,
): boolean => nowMs < deadlineAtMs;
```

`CouncilTurnSnapshot` must contain case/turn IDs, parent scene hash, source-lock state, input references/classes, registry version, allowed semantic capability IDs, current action-state snapshot, explicit turn scope, its locally derived `requiredRoles`, routing-manifest version, deadline ID, and `deadlineMs: 12_000`. It must also freeze the bounded registry facts required by later deterministic checks: `registeredAssetIds`, `registeredSpatialBridgeIds`, `registeredRightsIds`, `sourceLockIds`, and `supportedRollbackCapabilityIds`. Derive required roles before hashing, require `FrozenCouncilTurn.requiredRoles` to equal the hashed snapshot field, and deep-freeze the snapshot, registry arrays, and required-role array before returning.

- [x] **Step 4: Implement the local required-role matrix**

Use deterministic insertion order and no model classification:

```ts
export const requiredRolesForTurn = (
  scope: CouncilTurnScope,
): readonly CouncilRole[] => {
  const roles: CouncilRole[] = ['CaseConductor'];
  if (scope.usesImageOrAudioClaims || scope.usesSceneObservationClaims) {
    roles.push('Witness');
  }
  if (
    scope.allowsAssetOrSpatialChange ||
    scope.requiresProvenanceOrRights
  ) {
    roles.push('Archivist');
  }
  if (scope.allowsSceneMutation) roles.push('Rewriter', 'Guardian');
  return Object.freeze(roles);
};
```

If a later commit requests a capability that requires an omitted role, Task 4 must return `NEEDS_CLARIFICATION`; Task 2 must not spawn that role dynamically.

- [x] **Step 5: Add canonical reusable fixtures and run tests**

`council-fixtures.ts` must export complete frozen fixtures for one snapshot, all five role shards, one `PROPOSED` commit, one `WITHHELD` Guardian variant, and one scripted dual-provider manifest. Do not include private content or real artwork assets.

Run:

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/council-turn.test.ts
npm run typecheck
```

- [x] **Step 6: Commit Task 2**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- apps/pact-agent-host/src/council-turn.ts apps/pact-agent-host/test/council-turn.test.ts apps/pact-agent-host/test/council-fixtures.ts apps/pact-agent-host/src/index.ts
git commit -m "feat(cp03): freeze council turn authority"
```

---

### Task 3: Admit Durable Shards and Project an Honest Public Trace

**Files:**
- Create: `apps/pact-agent-host/src/council-registry.ts`
- Create: `apps/pact-agent-host/src/council-tools.ts`
- Create: `apps/pact-agent-host/src/council-durability.ts`
- Create: `apps/pact-agent-host/test/council-registry.test.ts`
- Modify: `apps/pact-agent-host/src/events.ts`
- Modify: `apps/pact-agent-host/src/index.ts`
- Modify: `apps/pact-agent-host/src/pact-contracts.d.ts`

**Interfaces:**
- Consumes: `FrozenCouncilTurn`, base `SubmissionRegistry` role bindings, council validators, DSH `Session`, `Context`, and canonical hashes.
- Produces: `CouncilRegistry`, `CouncilShardReceipt`, `CouncilCommitReceipt`, `registerCouncilTools()`, `durableCouncilShard()`, and `durableConductorCommit()`.

- [x] **Step 1: Write red registry tests for identity, order, projection, duplicate, barrier, and deadline behavior**

Assert this exact accepted event order for the first eligible Rewriter/Witness shard:

```ts
expect(session.events.filter((event) => event.type.startsWith('pact/'))
  .map((event) => event.type)).toEqual([
  'pact/council-shard',
  'pact/public-trace',
]);
```

Assert the projected trace copies the shard text exactly and carries:

```ts
expect(traceEvent?.data).toMatchObject({
  caseSessionId: fullTurn.snapshot.caseSessionId,
  turnId: fullTurn.snapshot.turnId,
  role: 'Rewriter',
  text: rewriter.publicTrace,
  sourceContributionHash: receipt.payloadHash,
  acceptanceSequence: 1,
  phase: 'COUNCIL',
  provisional: true,
  projectedAtMonotonicMs: 1_250,
});
```

Also prove:

- CaseConductor, Archivist, and Guardian cannot become the first projected trace;
- the first later Witness/Rewriter receives no second first-trace event;
- identical `shardId + hash` is idempotent without a second append;
- identical `shardId` with a different hash is quarantined;
- wrong case/turn/snapshot/scene/registry/manifest/deadline/session/role is rejected;
- `now === deadlineAt` is quarantined;
- a shard arriving after the commit selection barrier cannot alter the proposal set.
- a crash state containing the durable shard but no trace projection is repaired once, uses the actual recovery monotonic time, and a second repair appends nothing.

- [x] **Step 2: Run the red registry test**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/council-registry.test.ts
```

Expected: FAIL because the registry, event vocabulary, and tools do not exist.

- [x] **Step 3: Extend the append-only event vocabulary without invalidating historical events**

Add:

```ts
'pact/council-shard'
'pact/conductor-commit'
'pact/council-state'
```

Define the council-state payload exactly as:

```ts
{
  caseSessionId: string;
  turnId: string;
  state:
    | 'COUNCIL_RUNNING'
    | 'COMMIT_READY'
    | 'DRAFT_ASSEMBLED'
    | 'NEEDS_CLARIFICATION'
    | 'WITHHELD'
    | 'FAILED_NO_MUTATION'
    | 'LATE_QUARANTINED';
  reasonCodes: string[];
  observedAtMonotonicMs: number;
}
```

Extend `pact/public-trace` so historical `{turnId, role, text}` events remain readable while council-v2 events additionally carry `caseSessionId`, `sourceContributionHash`, `acceptanceSequence`, `phase: 'COUNCIL'`, `provisional: true`, and the locally measured `projectedAtMonotonicMs`. Do not rewrite archived JSONL.

- [x] **Step 4: Implement CouncilRegistry admission and selection barrier**

Expose these exact constructor options and methods:

```ts
export interface CouncilRegistryOptions {
  readonly submissions: SubmissionRegistry;
  readonly now?: () => number;
}

export class CouncilRegistry {
  constructor(options: CouncilRegistryOptions);
  openTurn(turn: FrozenCouncilTurn): void;
  acceptShard(session: Session, shard: CouncilShard): Promise<CouncilShardReceipt>;
  markShardDurable(receipt: DurableCouncilShardReceipt): void;
  acceptCommit(session: Session, commit: ConductorDraftCommit): Promise<CouncilCommitReceipt>;
  markCommitDurable(receipt: DurableConductorCommitReceipt): void;
  closeSelectionBarrier(turnId: string): void;
  durableProposal(turnId: string): CouncilProposalSnapshot;
  closeTurn(turnId: string): void;
}
```

Use these receipt/proposal shapes consistently in tools, durability checks, assembler input, and tests:

```ts
export interface AcceptedCouncilShardReceipt {
  readonly accepted: true;
  readonly turnId: string;
  readonly shardId: string;
  readonly payloadHash: string;
  readonly acceptanceSequence: number;
  readonly projectedTrace: boolean;
  readonly acceptedAtMonotonicMs: number;
  readonly shardEventSeq: number;
  readonly traceEventSeq: number | null;
}

export interface RejectedCouncilShardReceipt {
  readonly accepted: false;
  readonly turnId: string;
  readonly shardId: string;
  readonly payloadHash: string;
  readonly reasonCode: string;
  readonly acceptanceSequence: null;
  readonly projectedTrace: false;
  readonly acceptedAtMonotonicMs: null;
  readonly shardEventSeq: null;
  readonly traceEventSeq: null;
}

export type CouncilShardReceipt =
  | AcceptedCouncilShardReceipt
  | RejectedCouncilShardReceipt;

export interface DurableCouncilShardReceipt
  extends AcceptedCouncilShardReceipt {
  readonly accepted: true;
  readonly status: 'DURABLE';
  readonly sessionId: string;
  readonly lastSeq: number;
}

export interface AcceptedCouncilCommitReceipt {
  readonly accepted: true;
  readonly turnId: string;
  readonly payloadHash: string;
  readonly commitEventSeq: number;
}

export interface RejectedCouncilCommitReceipt {
  readonly accepted: false;
  readonly turnId: string;
  readonly payloadHash: string;
  readonly reasonCode: string;
  readonly commitEventSeq: null;
}

export type CouncilCommitReceipt =
  | AcceptedCouncilCommitReceipt
  | RejectedCouncilCommitReceipt;

export interface DurableConductorCommitReceipt
  extends AcceptedCouncilCommitReceipt {
  readonly accepted: true;
  readonly status: 'DURABLE';
  readonly sessionId: string;
  readonly lastSeq: number;
}

export interface CouncilProposalSnapshot {
  readonly turn: FrozenCouncilTurn;
  readonly selectionBarrierClosed: boolean;
  readonly durableShards: readonly {
    readonly shard: CouncilShard;
    readonly payloadHash: string;
    readonly acceptanceSequence: number;
  }[];
  readonly durableCommit: null | {
    readonly commit: ConductorDraftCommit;
    readonly payloadHash: string;
  };
}
```

Use one per-turn monotonic acceptance counter. Registry acceptance may append events, but only `markShardDurable()` and `markCommitDurable()` may expose inputs to the assembler. Required non-durable shards keep the turn out of `COMMIT_READY`.

- [x] **Step 5: Register only two council-v2 model tools**

`council-tools.ts` must define:

```ts
export const COUNCIL_ROOT_TOOLS = [
  'pact_submit_council_shard',
  'pact_submit_conductor_commit',
] as const;

export const COUNCIL_ROLE_TOOLS = [
  'pact_submit_council_shard',
] as const;
```

The shard tool validates schema plus runtime-bound role/session. The commit tool requires CaseConductor. Neither tool accepts or generates a complete `AgentActionDraft`; neither exposes `pact_publish_trace`, `pact_route_turn`, or `pact_submit_draft` in the council-v2 tool filter.

- [x] **Step 6: Implement flush/inspect durability receipts**

`durableCouncilShard()` must prove the accepted `pact/council-shard` event exists at the expected sequence/hash and, when `projectedTrace === true`, prove the linked `pact/public-trace` event exists with the same source hash. `durableConductorCommit()` must prove the commit event/hash. Both fail with `PactDurabilityError` and never mark the registry durable if flush or cold inspection fails.

Also expose:

```ts
export const recoverCouncilTraceProjection = async (input: {
  readonly session: Session;
  readonly turn: FrozenCouncilTurn;
  readonly shard: CouncilShard;
  readonly shardPayloadHash: string;
  readonly acceptanceSequence: number;
  readonly now: () => number;
}): Promise<{ readonly appended: boolean; readonly traceEventSeq: number }> => {};
```

Recovery must cold-inspect the durable shard first, append only a missing eligible Witness/Rewriter projection, use the actual recovery monotonic time, flush/inspect it, and remain idempotent. It may not backdate trace latency or make the `2.5s` target pass retroactively.

- [x] **Step 7: Run focused and historical durability tests**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/council-registry.test.ts test/dsh-foundation.test.ts test/provider-foundation-harness.test.ts
npm run typecheck
```

Expected: council events survive flush/inspect; historical contribution/draft behavior remains unchanged.

- [x] **Step 8: Commit Task 3**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- apps/pact-agent-host/src/council-registry.ts apps/pact-agent-host/src/council-tools.ts apps/pact-agent-host/src/council-durability.ts apps/pact-agent-host/test/council-registry.test.ts apps/pact-agent-host/src/events.ts apps/pact-agent-host/src/index.ts apps/pact-agent-host/src/pact-contracts.d.ts
git commit -m "feat(cp03): persist honest council shards"
```

---

### Task 4: Evaluate Guardian Constraints and Assemble the Draft Deterministically

**Files:**
- Create: `apps/pact-agent-host/src/guardian-conflict.ts`
- Create: `apps/pact-agent-host/src/draft-assembler.ts`
- Create: `apps/pact-agent-host/test/guardian-conflict.test.ts`
- Create: `apps/pact-agent-host/test/draft-assembler.test.ts`
- Modify: `apps/pact-agent-host/src/index.ts`

**Interfaces:**
- Consumes: one `FrozenCouncilTurn`, `CouncilProposalSnapshot`, all required durable shard payloads/hashes, and one durable `ConductorDraftCommit`.
- Produces: `evaluateGuardianConflict()` and `assembleCouncilDraft()` returning a discriminated result with no model call.

- [x] **Step 1: Write red Guardian conflict tests**

Use this exact result boundary:

```ts
export type GuardianConflictResult =
  | { readonly status: 'ALLOW'; readonly reasonCodes: readonly [] }
  | {
      readonly status: 'NEEDS_CLARIFICATION' | 'WITHHELD';
      readonly reasonCodes: readonly string[];
    };

export interface GuardianConflictInput {
  readonly turn: FrozenCouncilTurn;
  readonly proposal: CouncilProposalSnapshot;
}

export const evaluateGuardianConflict = (
  input: GuardianConflictInput,
): GuardianConflictResult => {};
```

Prove:

- `WITHHOLD` always yields `WITHHELD`;
- `NEEDS_CLARIFICATION` always yields that status;
- an intersection between Rewriter capability IDs and Guardian forbidden capability IDs yields clarification;
- absent Archivist rights/source-lock evidence yields clarification;
- a contested Witness evidence ID yields clarification;
- missing required rollback support yields clarification;
- fully matching typed constraints yield `ALLOW`;
- prose is never heuristically compared or rewritten.

- [x] **Step 2: Write red assembler tests**

Use this exact public result:

```ts
export type AssembleCouncilDraftResult =
  | {
      readonly status: 'ASSEMBLED';
      readonly draft: AgentActionDraft;
      readonly draftHash: string;
      readonly assemblyLatencyMs: number;
    }
  | {
      readonly status:
        | 'NEEDS_CLARIFICATION'
        | 'WITHHELD'
        | 'FAILED_NO_MUTATION';
      readonly reasonCodes: readonly string[];
      readonly assemblyLatencyMs: number;
    };

export interface AssembleCouncilDraftInput {
  readonly turn: FrozenCouncilTurn;
  readonly proposal: CouncilProposalSnapshot;
  readonly now: () => number;
}

export const assembleCouncilDraft = async (
  input: AssembleCouncilDraftInput,
): Promise<AssembleCouncilDraftResult> => {};
```

Assert identical inputs produce byte-identical canonical JSON and the same draft hash. Reject missing required roles, an unselected required shard, stale snapshot/hash, omitted required dissent ID, unknown asset/capability reference, terminal-action mismatch, and assembly finishing at the hard deadline.

- [x] **Step 3: Run the red conflict and assembler tests**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/guardian-conflict.test.ts test/draft-assembler.test.ts
```

Expected: FAIL because both modules do not exist.

- [x] **Step 4: Implement typed Guardian evaluation**

`evaluateGuardianConflict()` must compare only stable IDs and exact sets from the typed shard fields and snapshot capability/registry facts. Return sorted, stable reason codes such as:

```ts
const reasonCodes = [
  'GUARDIAN_FORBIDDEN_CAPABILITY',
  'GUARDIAN_RIGHTS_REQUIREMENT_UNSATISFIED',
  'GUARDIAN_CONTESTED_EVIDENCE',
  'GUARDIAN_ROLLBACK_REQUIREMENT_UNSATISFIED',
] as const;
```

Do not call a model and do not infer that two prose strings agree.

- [x] **Step 5: Implement field-copying assembly**

`assembleCouncilDraft()` must:

1. validate all selected hashes and required roles;
2. require every Guardian dissent record marked `required: true` in `selectedDissentIds`;
3. run Guardian conflict evaluation;
4. create a deterministic runtime-owned `draftId` from `{snapshotHash, commitHash}`;
5. map Conductor decision, Witness evidence, Archivist material/provenance, Rewriter creative/capability fields, Guardian restrictions/rollback/dissent, and runtime agency references exactly as the spec states;
6. validate the assembled object with `validateAgentActionDraft()`;
7. compute `draftHash` with `sha256Canonical()`;
8. return failure without storing a draft if the local monotonic clock is at or beyond the deadline.

The assembler must contain no fallback creative strings. Every non-empty creative field must be copied from a named shard.

- [x] **Step 6: Run focused contracts and assembler tests**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/guardian-conflict.test.ts test/draft-assembler.test.ts
npm run typecheck
npm run build
```

- [x] **Step 7: Commit Task 4**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- apps/pact-agent-host/src/guardian-conflict.ts apps/pact-agent-host/src/draft-assembler.ts apps/pact-agent-host/test/guardian-conflict.test.ts apps/pact-agent-host/test/draft-assembler.test.ts apps/pact-agent-host/src/index.ts
git commit -m "feat(cp03): assemble council drafts deterministically"
```

---

### Task 5: Orchestrate Five Parallel Shards and One Minimal Commit in DSH

**Files:**
- Create: `apps/pact-agent-host/src/council-runtime.ts`
- Create: `apps/pact-agent-host/test/council-runtime.test.ts`
- Modify: `apps/pact-agent-host/src/create-foundation-harness.ts`
- Modify: `apps/pact-agent-host/src/provider-stream-ledger.ts`
- Modify: `apps/pact-agent-host/src/probe-plan.ts`
- Modify: `apps/pact-agent-host/src/index.ts`
- Modify: `apps/pact-agent-host/test/provider-foundation-harness.test.ts`
- Test unchanged: `apps/pact-agent-host/test/provider-real-runner.test.ts`

**Interfaces:**
- Consumes: `FrozenCouncilTurn`, `ProviderRoutingManifest`, council registries/tools/durability, `assembleCouncilDraft()`, DSH adapter mounting, and the existing provider ledger.
- Produces: `runCouncilRuntime()` with complete/failed typed results and six-to-eight attempt records.

- [x] **Step 1: Write red six-dispatch, concurrency, retry, and no-hidden-stream tests**

Expose:

```ts
export interface CouncilPublicTrace {
  readonly caseSessionId: string;
  readonly turnId: string;
  readonly text: string;
  readonly role: 'Witness' | 'Rewriter';
  readonly sourceContributionHash: string;
  readonly acceptanceSequence: number;
  readonly projectedAtMonotonicMs: number;
  readonly durableAtMonotonicMs: number;
}

export type CouncilDispatchPhase = 'SHARD' | 'CONDUCTOR_COMMIT';

export interface CouncilAttemptRecord extends ProviderAttemptRecord {
  readonly council: {
    readonly role: CouncilRole;
    readonly phase: CouncilDispatchPhase;
    readonly snapshotHash: string;
    readonly promptHash: string;
    readonly declaredDispatchOrdinal: number;
  };
}

export interface CouncilRuntimeTiming {
  readonly startedAtMonotonicMs: number;
  readonly systemStatusAtMonotonicMs: number | null;
  readonly firstPublicTraceAtMonotonicMs: number | null;
  readonly requiredShardsAtMonotonicMs: number | null;
  readonly conductorCommitAtMonotonicMs: number | null;
  readonly assemblyStartedAtMonotonicMs: number | null;
  readonly assemblyEndedAtMonotonicMs: number | null;
  readonly draftAcceptedAtMonotonicMs: number | null;
  readonly systemStatusTargetMet: boolean;
  readonly firstPublicTraceTargetMet: boolean;
  readonly requiredShardsTargetMet: boolean;
  readonly conductorCommitTargetMet: boolean;
  readonly draftTargetMet: boolean;
  readonly hardDeadlineMet: boolean;
}

export interface CouncilRuntimeOrchestration {
  readonly activeConductorTurns: number;
  readonly settlementSinkTurns: number;
  readonly blockedSettlementSinkTurns: number;
  readonly undeclaredProviderStreams: number;
}

export type CouncilRuntimeResult =
  | {
      readonly status: 'COMPLETED';
      readonly draft: AgentActionDraft;
      readonly draftHash: string;
      readonly firstPublicTrace: CouncilPublicTrace | null;
      readonly providerRequestsMade: number;
      readonly attemptRecords: readonly CouncilAttemptRecord[];
      readonly durableShardReceipts: readonly DurableCouncilShardReceipt[];
      readonly durableConductorCommitReceipt: DurableConductorCommitReceipt;
      readonly selectionBarrierClosed: true;
      readonly timing: CouncilRuntimeTiming;
      readonly orchestration: CouncilRuntimeOrchestration;
    }
  | {
      readonly status:
        | 'NEEDS_CLARIFICATION'
        | 'WITHHELD'
        | 'FAILED_NO_MUTATION'
        | 'LATE_QUARANTINED';
      readonly draft: null;
      readonly draftHash: null;
      readonly firstPublicTrace: CouncilPublicTrace | null;
      readonly reasonCodes: readonly string[];
      readonly providerRequestsMade: number;
      readonly attemptRecords: readonly CouncilAttemptRecord[];
      readonly durableShardReceipts: readonly DurableCouncilShardReceipt[];
      readonly durableConductorCommitReceipt: DurableConductorCommitReceipt | null;
      readonly selectionBarrierClosed: boolean;
      readonly timing: CouncilRuntimeTiming;
      readonly orchestration: CouncilRuntimeOrchestration;
    };

export interface CouncilRuntimeOptions {
  readonly runId: string;
  readonly turn: FrozenCouncilTurn;
  readonly routingManifest: ProviderRoutingManifest;
  readonly persistenceRoot: string;
  readonly providerKind: 'real' | 'scripted';
  readonly now?: () => number;
  readonly mountAdapters: (ctx: Context) => void | Promise<void>;
}

export const runCouncilRuntime = async (
  options: CouncilRuntimeOptions,
): Promise<CouncilRuntimeResult> => {};
```

The scripted test must hold all five initial provider streams at one barrier and fail with `COUNCIL_WAVE_SERIALIZED` unless CaseConductor, Witness, Archivist, Rewriter, and Guardian are all in flight before release.

Assert:

- normal full turn: exactly six dispatches;
- one transport retry on DeepSeek: seven;
- one retry on each provider: eight;
- a second same-provider failure is not retried;
- if two same-provider streams fail concurrently in reverse completion order, the lower declared dispatch ordinal receives the provider's sole retry slot;
- active Conductor has exactly two explicit turns;
- four settlement sinks each end one local blocked turn and open zero streams;
- no council-v2 stream exposes or calls `pact_submit_draft`;
- every attempt record binds role, phase, frozen snapshot hash, prompt hash, and declared dispatch ordinal;
- commit starts only after all five required shards are durable;
- Conductor commit uses the same route/model/session as ConductorIntent;
- optional output after the selection barrier cannot alter the draft;
- malformed/late/missing required shard stops before commit and records no draft;
- Guardian WITHHOLD may record a withheld result but no current executable draft.

- [x] **Step 2: Run the red runtime suite**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/council-runtime.test.ts test/provider-real-runner.test.ts test/provider-foundation-harness.test.ts
```

Expected: the new runtime tests fail; all historical tests still pass.

- [x] **Step 3: Add an opt-in council tool profile to the existing harness**

Keep the current profile as default. Add:

```ts
export type PactToolProfile = 'foundation-v1' | 'council-v2';
```

For `council-v2`, instantiate `CouncilRegistry`, register council tools, restrict the root to `COUNCIL_ROOT_TOOLS`, and let child requests allow only `COUNCIL_ROLE_TOOLS`. Do not change the historical profile's tools or test expectations.

- [x] **Step 4: Generalise only the provider-ledger tool vocabulary**

Extend the shared tool-name union with:

```ts
| 'pact_submit_council_shard'
| 'pact_submit_conductor_commit'
```

Teach the ledger that `pact/council-shard` accepts the shard tool and `pact/conductor-commit` accepts the commit tool. A `pact/public-trace` with `phase: 'COUNCIL'` records trace timing but must not impersonate the historical `pact_publish_trace` or `pact_route_turn` side effects.

Preserve historical eight-probe counts and assertions unchanged.

- [x] **Step 5: Implement the representative council wave**

At `turn.startedAtMonotonicMs`:

1. open the shared council registry turn;
2. assign the ConductorIntent stream and four continuable child streams from the fixed manifest;
3. create one parked settlement sink per child role;
4. start all five provider requests before awaiting any result;
5. cancel each stream only after its one expected council tool result is accepted;
6. wait for turn end, flush/inspect, and mark every shard durable;
7. publish the first trace to runtime observers only after its durability receipt;
8. fail with no mutation if any required shard is missing, invalid, or late;
9. close the selection barrier;
10. send deterministic typed field projections plus exact hashes to the same Case Conductor session;
11. accept and durably verify one minimal commit;
12. run local assembly and promote the resulting draft through `SubmissionRegistry.acceptDraft()` only if complete strictly before the hard deadline.

After that admission decision, the runtime closes synthesis and opens no more provider stream. Viewer deliberation may continue after `12s`; only the accepted draft hash and unchanged parent-scene preconditions can cross the later approval and Capability Gate boundary.

The Conductor commit prompt must contain no raw repository file, artwork asset, private input, or application-authored creative summary.

- [x] **Step 6: Implement controlled timing outcomes**

Record local monotonic milestones for system status, first durable trace, all-required-shards durability, commit durability, assembly start/end, and draft acceptance. Tests must cover:

```ts
expect(result.timing).toMatchObject({
  firstPublicTraceTargetMet: true,
  requiredShardsTargetMet: true,
  conductorCommitTargetMet: true,
  draftTargetMet: true,
  hardDeadlineMet: true,
});
```

Also cover a draft accepted at `8_001ms` but before `12_000ms` as completed with `draftTargetMet: false`, and assembly at exactly `12_000ms` as `LATE_QUARANTINED` with no draft promotion.

- [x] **Step 7: Run runtime and historical regression suites**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/council-runtime.test.ts test/provider-real-runner.test.ts test/provider-foundation-harness.test.ts test/dsh-foundation.test.ts
npm run typecheck
npm run build
```

- [x] **Step 8: Commit Task 5**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- apps/pact-agent-host/src/council-runtime.ts apps/pact-agent-host/test/council-runtime.test.ts apps/pact-agent-host/src/create-foundation-harness.ts apps/pact-agent-host/src/provider-stream-ledger.ts apps/pact-agent-host/src/probe-plan.ts apps/pact-agent-host/src/index.ts apps/pact-agent-host/test/provider-foundation-harness.test.ts
git commit -m "feat(cp03): run parallel council critical path"
```

---

### Task 6: Freeze Routing and Verify Council Evidence Without Enabling Live Run 04

**Files:**
- Create: `apps/pact-agent-host/src/council-routing.ts`
- Create: `apps/pact-agent-host/src/council-run-evidence.ts`
- Create: `apps/pact-agent-host/test/council-routing.test.ts`
- Create: `apps/pact-agent-host/test/council-run-evidence.test.ts`
- Modify: `apps/pact-agent-host/src/index.ts`

**Interfaces:**
- Consumes: validated `ProviderRoutingManifest`, `CouncilRuntimeResult`, `CouncilAttemptRecord`, and `COUNCIL_TIMING_LIMITS`.
- Produces: `requireCouncilRoutingManifest()`, `selectionForCouncilRole()`, `CouncilRunArchive`, `CouncilRunEvidenceReport`, and `verifyCouncilRunEvidence()`.

- [x] **Step 1: Write red routing-manifest tests**

Reject a manifest unless:

- the provider set is exactly `{deepseek, gemini}`;
- all five roles are assigned;
- planned/maximum dispatches equal `6/8`;
- CaseConductor is one fixed route/model for both its turns;
- every role supports every input class assigned to it by the frozen snapshot; the representative local fixture requires Witness text+image support, while audio remains outside this implementation plan;
- Rewriter supports image input;
- every prompt hash is 64 lowercase hex characters;
- every assignment fixes `toolProfile: 'council-v2'`, positive input/output token limits, and a positive timeout bounded by the shared turn deadline;
- every declared maximum concurrency is sufficient for the manifest's simultaneous role count;
- no provider or model fallback list exists.

- [x] **Step 2: Write red evidence-verifier tests**

Define a separate archive version:

```ts
export interface CouncilRunArchive {
  readonly schemaVersion: 'cp03-council-run/0.1';
  readonly runId: string;
  readonly snapshotHash: string;
  readonly routingManifest: ProviderRoutingManifest;
  readonly result: CouncilRuntimeResult;
}

export type CouncilEvidenceCheck =
  | 'archive'
  | 'completion'
  | 'dispatchLedger'
  | 'roleCoverage'
  | 'selection'
  | 'providerKind'
  | 'contracts'
  | 'timing'
  | 'orchestration'
  | 'draftAuthority'
  | 'usageEstimate'
  | 'secretScan';

export interface CouncilRunEvidenceFinding {
  readonly code: string;
  readonly path: string;
}

export interface CouncilRunEvidenceReport {
  readonly schemaVersion: 'cp03-council-evidence-report/0.1';
  readonly status: 'PASS' | 'FAIL';
  readonly runId: string;
  readonly counts: {
    readonly plannedDispatches: 6;
    readonly maximumDispatches: 8;
    readonly sentDispatches: number;
    readonly attemptRecords: number;
    readonly durableRequiredShards: number;
  };
  readonly usageEstimate: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
    readonly estimatedCostUsd: number | null;
    readonly billingConfirmed: false;
  };
  readonly checks: Readonly<Record<CouncilEvidenceCheck, 'PASS' | 'FAIL'>>;
  readonly findings: readonly CouncilRunEvidenceFinding[];
}

export const verifyCouncilRunEvidence = (
  serialized: string,
  secretValues: readonly string[] = [],
): CouncilRunEvidenceReport => {};
```

The verifier must reject:

- fewer than six or more than eight attempt records for a completed full turn;
- missing role coverage or missing commit dispatch;
- a Conductor model mismatch between intent and commit;
- a hidden settlement stream;
- a first trace not linked to a durable Witness/Rewriter shard hash;
- inconsistent 2.5/5.5/7.8/8/12 timing booleans;
- a completed result with `hardDeadlineMet !== true`;
- a promoted draft after `WITHHELD`, clarification, failure, or quarantine;
- missing/inconsistent token usage or recorded cost-estimate aggregation, while never treating the estimate as billing confirmation;
- secret-shaped fields or any supplied exact secret value.

- [x] **Step 3: Run the red routing/evidence tests**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/council-routing.test.ts test/council-run-evidence.test.ts
```

- [x] **Step 4: Implement fixed role lookup and fail-closed manifest checks**

`selectionForCouncilRole(manifest, role)` returns the frozen assignment for that role or throws `COUNCIL_ROUTING_ROLE_MISSING`. It never consults environment variables, model catalogs, or fallback routes at turn time.

The implementation may validate scripted fixture manifests. It must not add a CLI mode, Keychain read, network adapter mount, preflight authorization record, or real-run command.

- [x] **Step 5: Implement the independent council evidence verifier**

Return checks for archive, completion, dispatch ledger, role coverage, selection, provider kind, contracts, timing, orchestration, draft authority, usage estimate, and secret scan. Aggregate token counts and nullable cost estimates only from complete provider envelopes; keep `billingConfirmed: false`. Preserve partial failure archives as `FAIL`; never rewrite them to completed evidence.

- [x] **Step 6: Run evidence plus historical evidence regressions**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/council-routing.test.ts test/council-run-evidence.test.ts test/provider-run-evidence.test.ts test/provider-real-command.test.ts
npm run typecheck
```

- [x] **Step 7: Commit Task 6**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- apps/pact-agent-host/src/council-routing.ts apps/pact-agent-host/src/council-run-evidence.ts apps/pact-agent-host/test/council-routing.test.ts apps/pact-agent-host/test/council-run-evidence.test.ts apps/pact-agent-host/src/index.ts
git commit -m "feat(cp03): verify fixed council routing evidence"
```

---

### Task 7: Carry the Assembled Draft Through Viewer Approval and Ruby

**Files:**
- Create: `apps/pact-agent-host/test/council-to-ruby.integration.test.js`
- Modify: `apps/pact-agent-host/src/index.ts`
- Test unchanged: `apps/scene-builder/src/cp03/capability-gate.test.js`
- Test unchanged: `apps/pact-agent-host/test/dsh-to-ruby.integration.test.js`

**Interfaces:**
- Consumes: `assembleCouncilDraft()`, `SubmissionRegistry.draftPayload()`, existing approval schema, `compileGuardedInteractionPlan()`, `applyGuardedInteractionPlan()`, `CaseSessionLedger`, and `persistCaseSessionTransition()`.
- Produces: one zero-network proof that five agent shards and one commit reach the existing Ruby runtime without a provider-authored full draft.

- [x] **Step 1: Write the red assembled-draft vertical slice**

The new integration test must:

1. create the existing interaction-demo project and its parent scene hash;
2. open a full frozen council turn using only synthetic fixtures;
3. admit and mark all five fixture shards durable;
4. admit the fixture minimal commit;
5. call `assembleCouncilDraft()`;
6. store only the assembled draft in `SubmissionRegistry`;
7. create an explicit viewer approval of that exact draft hash;
8. compile and apply the existing guarded interaction plan;
9. persist the existing `APPROVED_EXECUTION` CaseSession transition;
10. assert the Ruby receipt, changed object IDs, result scene hash, ownership state, and rollback record.

Assert separately that Guardian `WITHHOLD`, omitted required dissent, stale parent scene hash, and viewer rejection each leave the original project hash unchanged and create no approved execution transition. `WITHHELD` and `NEEDS_CLARIFICATION` append only their council-state events and leave the CaseSession available for a later viewer turn; a true provider/durability/assembly failure records the existing `FAILED_NO_MUTATION` transition with its exact provider request count.

Also prove the deadline boundary explicitly: a draft durably accepted at `11_999ms` may receive viewer approval after `12_000ms` and execute only while its approval hash and parent scene hash still match; the same delayed approval must fail closed after parent-scene drift. No provider turn reopens during either viewer path.

- [x] **Step 2: Run the red integration test**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/council-to-ruby.integration.test.js
```

Expected: FAIL until the Task 3–5 exports and assembled-draft storage seam are complete.

- [x] **Step 3: Export only the approved council-v2 public interfaces**

Update `src/index.ts` to export snapshot, registry, assembler, runtime, routing, and evidence functions. Do not export internal prompt builders, mutable maps, or a bypass around viewer approval/Capability Gate.

- [x] **Step 4: Run both new and historical Ruby seams**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/council-to-ruby.integration.test.js test/dsh-to-ruby.integration.test.js
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/scene-builder
npx vitest run src/cp03/capability-gate.test.js src/interaction-runtime.test.js src/navigation-runtime.test.js
```

Expected: both old and new DSH-to-Ruby paths pass; no source-locked object or unregistered capability changes.

- [x] **Step 5: Commit Task 7**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- apps/pact-agent-host/test/council-to-ruby.integration.test.js apps/pact-agent-host/src/index.ts
git commit -m "test(cp03): prove assembled council draft reaches Ruby"
```

---

### Task 8: Run the Zero-Network Release Gate and Record Honest Progress

**Files:**
- Create: `checkpoints/cp03/critical-path/2026-08-23-local-scripted-evidence.md`
- Modify: `docs/pact-cp03-progress.md`
- Modify: `docs/superpowers/plans/2026-08-23-pact-cp03-critical-path-redesign.md`

**Interfaces:**
- Consumes: all Task 1–7 tests, Git commit evidence, and the approved evidence ceiling.
- Produces: a local engineering record labelled as scripted/local only; no checkpoint visual claim and no provider authorization.

- [x] **Step 1: Run the shared contract suite**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/packages/pact-cp03-contracts
npm test
```

Expected: all contract tests pass.

- [x] **Step 2: Run the complete Agent Host gate**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npm test
npm run typecheck
npm run build
```

Expected: full suite, typecheck, and build pass with zero provider requests.

- [x] **Step 3: Run the Ruby/Scene Builder regression gate**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/scene-builder
npm test
npm run build
```

Expected: all existing Ruby/Scene Builder unit and integration tests and the build pass. Do not run the headful checkpoint capture or create video/stills in this task.

- [x] **Step 4: Prove the historical provider path did not drift**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/provider-compatibility.test.ts test/provider-real-runner.test.ts test/provider-real-command.test.ts test/provider-run-evidence.test.ts
```

Expected: the eight-probe historical contract remains green and still reports Live Run 03 as archived failure evidence.

- [x] **Step 5: Write the local engineering evidence record**

Record exact test counts, commands, local commit SHA, `6 planned / 8 maximum`, controlled timing outcomes, no-hidden-stream result, deterministic draft hash result, Ruby receipt result, and secret scan result. State explicitly:

```text
Evidence status: LOCAL_SCRIPTED_ONLY
Provider calls: 0
Live Run 04: NOT_AUTHORIZED / NOT_RUN
CP03 visual checkpoint: NOT_CAPTURED
Human technical decision: PENDING
Human artistic KEEP: PENDING
Public release: NOT_AUTHORIZED
```

Include the approved five-class checkpoint matrix without pretending to satisfy it: `interaction proof = PARTIAL_LOCAL_SCRIPTED`, `visual proof = NOT_CAPTURED`, `engineering proof = LOCAL_SCRIPTED`, `provenance proof = MANIFEST_FIXTURE_ONLY`, and `artistic/curatorial proof = PENDING_HUMAN`. These labels are archival boundaries, not checkpoint acceptance.

- [x] **Step 6: Update progress without upgrading the checkpoint**

Change the CP03 engineering row only after the tests pass. Use `CRITICAL_PATH_IMPLEMENTED_LOCAL_SCRIPTED` or a more conservative failure state supported by the evidence. Keep real-provider compatibility, audience UI, five visual effects, formal encounters, five-class archive, and artistic `KEEP` pending.

- [x] **Step 7: Mark this plan's completed checkboxes and commit the evidence milestone**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- checkpoints/cp03/critical-path/2026-08-23-local-scripted-evidence.md docs/pact-cp03-progress.md docs/superpowers/plans/2026-08-23-pact-cp03-critical-path-redesign.md
git commit -m "docs(cp03): record local council critical-path evidence"
```

- [x] **Step 8: Synchronize and push only after all verification remains green**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git fetch origin codex/pact-cp03-agent-native
git merge-base --is-ancestor origin/codex/pact-cp03-agent-native HEAD
git push origin codex/pact-cp03-agent-native
git ls-remote --heads origin codex/pact-cp03-agent-native
```

Expected: fetch confirms a fast-forward push; the final `ls-remote` SHA equals local `HEAD`. If the ancestor check fails, stop and reconcile collaborator changes before pushing. Never force push.

## Completion Boundary

Implementation is complete only when Tasks 1–8 are checked, all zero-network suites pass, each task has a coherent commit, the collaboration branch is verified at the same SHA, and the evidence record preserves its claim ceiling.

Even then, the result may be described only as a locally scripted implementation of the approved council critical path plus Ruby's locally engineered audience/effect runtime. Browser smokes do not establish real-provider compatibility, model selection, a captured CP03 checkpoint, human artistic `KEEP`, deployment, or public release. Any fixed-input model bake-off or Live Run 04 requires a new preflight and exact approval specifying models, inputs, planned/maximum dispatches, data exposure, Keychain routes, and USD ceiling.
