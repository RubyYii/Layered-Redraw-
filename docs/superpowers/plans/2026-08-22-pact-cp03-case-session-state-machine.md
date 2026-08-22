# PACT CP03 CaseSession State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-independent, DSH-durable `CaseSession` ledger that preserves cumulative `Translate` / `Reframe` / `Merge` turns, makes `Continue` / `KeepOpaque` terminal, and records execution or failure facts without inventing creative content or mutating Ruby's scene runtime.

**Architecture:** Keep the state machine inside `pact-agent-host`, downstream of agent-authored drafts and viewer approval but upstream of checkpoint export. A pure ledger validates case identity, scene preconditions, action order, unique turns, terminal state and operator reset; a separate persistence adapter appends one bounded `pact/case-transition` event to the real DSH root session and crosses the existing flush/inspect durability barrier. Ruby's Capability Gate and Scene Builder remain the only execution authority; the ledger consumes their receipt facts and never compiles camera, path, collision, ownership or visual presets.

**Tech Stack:** Node.js; TypeScript 6; Vitest 4; DSH `0.1.0-rc.6`; JSONL session persistence; existing `@layered-redraw/pact-cp03-contracts` canonical SHA-256 helper; existing Ruby Scene Builder Capability Gate receipt.

**Spec:** `/Users/yhryzy/Documents/ChatGPT/艺术驻地项目/.worktrees/pact-cp00-cp01a-evidence/docs/superpowers/specs/2026-08-22-pact-cp03-agent-native-five-actions-design.md`

**Plan status:** `draft_ready_for_execution`

## Global Constraints

- This is a local, no-network slice. It must make zero Gemini and DeepSeek requests and must not be described as real-provider evidence.
- Agents retain creative authority over `actionSequence`; this ledger enforces only identity, ordering, scene-hash, durability, terminal and reset mechanics.
- The exact cumulative actions are `Translate`, `Reframe`, and `Merge`. The exact terminal actions are `Continue` and `KeepOpaque`.
- `Continue` and `KeepOpaque` must be last. Once terminal, no later approved mutation may enter the same `CaseSession`.
- The explicit local `KeepOpaque` path records `providerRequestsMade: 0`, changes no scene hash, and contains no model-authored text.
- A `FAILED_NO_MUTATION` transition requires the observed scene hash to equal the current scene hash. It may move only to explicit local `KeepOpaque`, never back to an executable turn.
- Operator checkpoint reset may restore the initial scene hash after a terminal encounter, but it must preserve the terminal action and may not reopen the session.
- Store stable IDs, hashes, bounded reason codes and receipt references only. Do not store viewer free text, hidden reasoning, provider credentials or arbitrary error payloads in a case transition.
- Do not modify Ruby's navigation, interaction, collision, ownership, animation, camera, rendering or delivery-package implementation.
- Do not add HTTP/SSE, audience UI, new dependencies, asset retrieval, downloads, participant data, checkpoint media or public-release state in this plan.
- Preserve the current shared branch ancestry through `b9cd314f8c13b30e311d4f969ebefb354b5f42aa` and inspect Ruby's remote tips again before push.

---

### Task 1: Implement the Pure CaseSession Ledger

**Files:**
- Create: `apps/pact-agent-host/src/case-session.ts`
- Create: `apps/pact-agent-host/test/case-session.test.ts`
- Modify: `apps/pact-agent-host/src/index.ts`

**Interfaces:**
- Produces: `CaseAction`, `CaseSessionMode`, `CaseSessionStatus`, `CaseSessionSnapshot`, and `CaseSessionTransition`.
- Produces: `new CaseSessionLedger(initial)`.
- Produces: `ledger.snapshot()` returning a deep-cloned, deeply frozen `CaseSessionSnapshot`.
- Produces: `ledger.recordApprovedExecution(input)`, `ledger.recordFailureNoMutation(input)`, `ledger.recordLocalKeepOpaque(input)`, and `ledger.recordCheckpointReset(input)`.
- Consumes only receipt/evidence facts; it never consumes viewer prose or model output beyond the already validated `actionSequence`.

- [ ] **Step 1: Write failing construction and accumulation tests**

Create `test/case-session.test.ts` with fixed 64-character hashes and assert the initial state plus three approved turns:

```ts
const ledger = new CaseSessionLedger({
  caseSessionId: 'case_accumulation01',
  mode: 'checkpoint',
  rootDshSessionId: 'case_accumulation01',
  initialSceneHash: 'a'.repeat(64),
});

expect(ledger.snapshot()).toMatchObject({
  status: 'OPEN',
  currentSceneHash: 'a'.repeat(64),
  accumulatedActions: [],
  terminalAction: null,
  transitions: [],
});

ledger.recordApprovedExecution({
  caseSessionId: 'case_accumulation01',
  turnId: 'turn_translate01',
  draftHash: 'b'.repeat(64),
  approvalId: 'approval_translate01',
  receiptId: 'receipt_translate01',
  parentSceneHash: 'a'.repeat(64),
  resultSceneHash: 'c'.repeat(64),
  actionSequence: ['Translate'],
  settledAt: '2026-08-22T20:00:01.000Z',
});

ledger.recordApprovedExecution({
  caseSessionId: 'case_accumulation01',
  turnId: 'turn_reframe01',
  draftHash: 'd'.repeat(64),
  approvalId: 'approval_reframe01',
  receiptId: 'receipt_reframe01',
  parentSceneHash: 'c'.repeat(64),
  resultSceneHash: 'e'.repeat(64),
  actionSequence: ['Reframe'],
  settledAt: '2026-08-22T20:00:02.000Z',
});

ledger.recordApprovedExecution({
  caseSessionId: 'case_accumulation01',
  turnId: 'turn_merge01',
  draftHash: 'f'.repeat(64),
  approvalId: 'approval_merge01',
  receiptId: 'receipt_merge01',
  parentSceneHash: 'e'.repeat(64),
  resultSceneHash: '1'.repeat(64),
  actionSequence: ['Merge'],
  settledAt: '2026-08-22T20:00:03.000Z',
});

expect(ledger.snapshot()).toMatchObject({
  status: 'OPEN',
  currentSceneHash: '1'.repeat(64),
  accumulatedActions: ['Translate', 'Reframe', 'Merge'],
  terminalAction: null,
});
expect(ledger.snapshot().transitions).toHaveLength(3);
```

- [ ] **Step 2: Write failing authority and ordering tests**

Require exact errors for:

```ts
expect(() => ledger.recordApprovedExecution({
  ...nextTurn,
  caseSessionId: 'case_other01',
})).toThrow(/CASE_SESSION_IDENTITY_MISMATCH/);

expect(() => ledger.recordApprovedExecution({
  ...nextTurn,
  parentSceneHash: '9'.repeat(64),
})).toThrow(/CASE_SESSION_SCENE_PRECONDITION_STALE/);

expect(() => ledger.recordApprovedExecution({
  ...nextTurn,
  actionSequence: ['Continue', 'Reframe'],
})).toThrow(/CASE_SESSION_ACTION_SEQUENCE_INVALID/);

expect(() => ledger.recordApprovedExecution({
  ...nextTurn,
  turnId: 'turn_translate01',
})).toThrow(/CASE_SESSION_TURN_DUPLICATE/);
```

Also reject blank IDs, non-lowercase/non-64-character hashes, unknown actions, an empty action sequence, and more than five actions in one transition. Test mutation of a returned snapshot and transition: neither may change the ledger's stored state.

- [ ] **Step 3: Write failing terminal, failure and reset tests**

Test all four mechanical paths:

```ts
const terminal = ledger.recordApprovedExecution({
  ...continueTurn,
  actionSequence: ['Continue'],
});
expect(terminal.postState).toMatchObject({
  status: 'TERMINAL',
  terminalAction: 'Continue',
});
expect(() => ledger.recordApprovedExecution(laterTurn))
  .toThrow(/CASE_SESSION_TERMINAL/);

const stopped = freshLedger.recordLocalKeepOpaque({
  caseSessionId: 'case_stop01',
  turnId: 'turn_stop01',
  decidedAt: '2026-08-22T20:01:00.000Z',
});
expect(stopped).toMatchObject({
  kind: 'LOCAL_KEEP_OPAQUE',
  providerRequestsMade: 0,
  parentSceneHash: 'a'.repeat(64),
  resultSceneHash: 'a'.repeat(64),
});

failedLedger.recordFailureNoMutation({
  caseSessionId: 'case_failure01',
  turnId: 'turn_failure01',
  observedSceneHash: 'a'.repeat(64),
  reasonCode: 'CONDUCTOR_UNAVAILABLE',
  providerRequestsMade: 1,
  recordedAt: '2026-08-22T20:02:00.000Z',
});
expect(failedLedger.snapshot().status).toBe('FAILED_NO_MUTATION');
expect(() => failedLedger.recordApprovedExecution(laterTurn))
  .toThrow(/CASE_SESSION_FAILED_NO_MUTATION/);
expect(failedLedger.recordLocalKeepOpaque(localStop).postState.status)
  .toBe('TERMINAL');

const reset = terminalLedger.recordCheckpointReset({
  caseSessionId: 'case_terminal01',
  resetId: 'reset_terminal01',
  restoredSceneHash: terminalLedger.snapshot().initialSceneHash,
  resetAt: '2026-08-22T20:03:00.000Z',
});
expect(reset.postState).toMatchObject({
  status: 'TERMINAL',
  terminalAction: 'Continue',
  currentSceneHash: 'a'.repeat(64),
});
```

Reject failure records whose observed scene hash differs from current state, local stop after an already terminal encounter, reset before terminal, reset to a non-initial hash, and duplicate `resetId`.

- [ ] **Step 4: Run the focused tests and confirm the red state**

Run:

```bash
cd apps/pact-agent-host
npx vitest run test/case-session.test.ts
```

Expected: FAIL because `CaseSessionLedger` and its exported types do not exist.

- [ ] **Step 5: Implement the minimal immutable ledger**

Create `src/case-session.ts` with these exact public signatures:

```ts
export type CaseAction =
  | 'Translate'
  | 'Reframe'
  | 'Merge'
  | 'Continue'
  | 'KeepOpaque';

export type CaseSessionMode =
  | 'checkpoint'
  | 'public_ephemeral'
  | 'consented_archive';

export type CaseSessionStatus =
  | 'OPEN'
  | 'TERMINAL'
  | 'FAILED_NO_MUTATION';

export class CaseSessionLedger {
  constructor(initial: CaseSessionInitialState);
  snapshot(): CaseSessionSnapshot;
  recordApprovedExecution(input: ApprovedExecutionInput): CaseSessionTransition;
  recordFailureNoMutation(input: FailureNoMutationInput): CaseSessionTransition;
  recordLocalKeepOpaque(input: LocalKeepOpaqueInput): CaseSessionTransition;
  recordCheckpointReset(input: CheckpointResetInput): CaseSessionTransition;
}
```

Define the neighboring public contracts exactly once in the same file:

```ts
export interface CaseSessionInitialState {
  readonly caseSessionId: string;
  readonly mode: CaseSessionMode;
  readonly rootDshSessionId: string;
  readonly initialSceneHash: string;
}

export interface CaseSessionStateSummary {
  readonly status: CaseSessionStatus;
  readonly currentSceneHash: string;
  readonly accumulatedActions: readonly ('Translate' | 'Reframe' | 'Merge')[];
  readonly terminalAction: 'Continue' | 'KeepOpaque' | null;
}

export interface CaseSessionTransitionRecord {
  readonly kind:
    | 'APPROVED_EXECUTION'
    | 'FAILED_NO_MUTATION'
    | 'LOCAL_KEEP_OPAQUE'
    | 'CHECKPOINT_RESET';
  readonly caseSessionId: string;
  readonly rootDshSessionId: string;
  readonly turnId: string | null;
  readonly resetId: string | null;
  readonly actionSequence: readonly CaseAction[];
  readonly draftHash: string | null;
  readonly approvalId: string | null;
  readonly receiptId: string | null;
  readonly parentSceneHash: string;
  readonly resultSceneHash: string;
  readonly providerRequestsMade: number | null;
  readonly reasonCode: string | null;
  readonly recordedAt: string;
}

export interface CaseSessionTransition extends CaseSessionTransitionRecord {
  readonly postState: CaseSessionStateSummary;
}

export interface CaseSessionSnapshot extends CaseSessionStateSummary {
  readonly schemaVersion: 'cp03-case-session/0.1';
  readonly caseSessionId: string;
  readonly mode: CaseSessionMode;
  readonly rootDshSessionId: string;
  readonly initialSceneHash: string;
  readonly transitions: readonly CaseSessionTransitionRecord[];
}

export interface ApprovedExecutionInput {
  readonly caseSessionId: string;
  readonly turnId: string;
  readonly draftHash: string;
  readonly approvalId: string;
  readonly receiptId: string;
  readonly parentSceneHash: string;
  readonly resultSceneHash: string;
  readonly actionSequence: readonly CaseAction[];
  readonly settledAt: string;
}

export interface FailureNoMutationInput {
  readonly caseSessionId: string;
  readonly turnId: string;
  readonly observedSceneHash: string;
  readonly reasonCode: string;
  readonly providerRequestsMade: number;
  readonly recordedAt: string;
}

export interface LocalKeepOpaqueInput {
  readonly caseSessionId: string;
  readonly turnId: string;
  readonly decidedAt: string;
}

export interface CheckpointResetInput {
  readonly caseSessionId: string;
  readonly resetId: string;
  readonly restoredSceneHash: string;
  readonly resetAt: string;
}
```

`APPROVED_EXECUTION` records `providerRequestsMade: null` because authoritative
provider counts remain in provider envelopes; `LOCAL_KEEP_OPAQUE` and
`CHECKPOINT_RESET` record `0`; `FAILED_NO_MUTATION` records the outer runtime's
bounded integer count. `CaseSessionSnapshot.transitions` stores transition
records without `postState`, avoiding recursive snapshots; the value returned
by each record method adds the current `postState` summary for the caller.

Use a private mutable JSON state and return `structuredClone` plus recursive `Object.freeze` from every public method. Validate identifiers with `^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$`, hashes with `^[a-f0-9]{64}$`, timestamps as parseable UTC ISO strings, non-negative integer `providerRequestsMade`, exact action vocabulary, maximum five actions per transition, and terminal-last ordering. Preserve duplicate cumulative action labels because the approved spec does not forbid repeated artistic actions across turns.

- [ ] **Step 6: Export and verify Task 1**

Export the ledger and all public types from `src/index.ts`, then run:

```bash
npx vitest run test/case-session.test.ts
npm run typecheck
npm run build
```

Expected: focused tests, typecheck and build all PASS.

- [ ] **Step 7: Commit Task 1**

Stage only:

```bash
git add apps/pact-agent-host/src/case-session.ts \
  apps/pact-agent-host/test/case-session.test.ts \
  apps/pact-agent-host/src/index.ts
git commit -m "feat(cp03): add case session state machine"
```

---

### Task 2: Persist Case Transitions Through the DSH Flush Barrier

**Files:**
- Create: `apps/pact-agent-host/src/case-session-persistence.ts`
- Create: `apps/pact-agent-host/test/case-session-persistence.test.ts`
- Modify: `apps/pact-agent-host/src/events.ts`
- Modify: `apps/pact-agent-host/src/index.ts`

**Interfaces:**
- Consumes: immutable `CaseSessionTransition` from Task 1.
- Produces: `persistCaseSessionTransition({ ctx, session, transition })`.
- Produces: `CaseSessionTransitionDurabilityReceipt` with `status: "DURABLE"`, root session ID, transition hash and last JSONL sequence.
- Adds: bounded DSH event `pact/case-transition`.

- [ ] **Step 1: Write the failing event-catalog and durability test**

Use `createFoundationHarness` with `ScriptedAdapter([])`, create one parked conductor, build a ledger whose `rootDshSessionId` equals the conductor session ID, record one approved `Translate` transition, then call:

```ts
const receipt = await persistCaseSessionTransition({
  ctx: harness.ctx,
  session: conductor.agent.session,
  transition,
});

expect(receipt).toMatchObject({
  status: 'DURABLE',
  sessionId: conductor.agent.id,
  transitionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
});

const inspected = await coldInspect(persistenceRoot, conductor.agent.id);
expect(inspected.events).toEqual(expect.arrayContaining([
  expect.objectContaining({
    type: 'pact/case-transition',
    data: expect.objectContaining({
      caseSessionId: String(conductor.agent.id),
      turnId: 'turn_durable_translate01',
      kind: 'APPROVED_EXECUTION',
      transitionHash: receipt.transitionHash,
    }),
  }),
]));
```

Also assert that the event payload contains no `viewerText`, `prompt`, `chainOfThought`, `apiKey`, `authorization`, `credential` or `secret` key at any depth.

- [ ] **Step 2: Write failing root-identity and flush-failure tests**

Require:

```ts
await expect(persistCaseSessionTransition({
  ctx: harness.ctx,
  session: otherSession,
  transition,
})).rejects.toThrow(/CASE_TRANSITION_ROOT_SESSION_MISMATCH/);
```

Inject a minimal context whose `sessions.flush()` returns `false` and require `CASE_TRANSITION_FLUSH_FAILED`. Inject an inspection result without the transition hash and require `CASE_TRANSITION_DURABILITY_INCOMPLETE`. Error messages may include stable IDs and hashes but never serialized transition content.

- [ ] **Step 3: Run the focused tests and confirm the red state**

Run:

```bash
npx vitest run test/case-session-persistence.test.ts
```

Expected: FAIL because the persistence module and `pact/case-transition` event do not exist.

- [ ] **Step 4: Register the bounded DSH event**

Add `pact/case-transition` to `PACT_SESSION_EVENT_TYPES` and the DSH declaration merge:

```ts
'pact/case-transition': {
  caseSessionId: string;
  turnId: string | null;
  kind:
    | 'APPROVED_EXECUTION'
    | 'FAILED_NO_MUTATION'
    | 'LOCAL_KEEP_OPAQUE'
    | 'CHECKPOINT_RESET';
  payload: JsonValue;
  transitionHash: string;
};
```

The event payload is the immutable transition from Task 1 converted through the same lossless JSON check used by `SubmissionRegistry`.

- [ ] **Step 5: Implement append, flush and cold verification**

Create `src/case-session-persistence.ts` with:

```ts
export async function persistCaseSessionTransition(input: {
  readonly ctx: Context;
  readonly session: Session;
  readonly transition: CaseSessionTransition;
}): Promise<CaseSessionTransitionDurabilityReceipt>;
```

Implementation order is fixed:

1. verify `String(session.id) === transition.rootDshSessionId`;
2. compute `sha256Canonical(transition)`;
3. append one `pact/case-transition` event;
4. call `ctx.sessions.flush(session)` and require participation;
5. call `ctx.sessionPersistence.inspect(session.id)`;
6. require the exact transition hash in the inspected event and return its sequence;
7. return a deeply frozen receipt without embedding the transition payload.

Do not retry append or flush automatically. A failed durability barrier leaves the caller with an explicit failure and must not be reported as settled checkpoint evidence.

- [ ] **Step 6: Verify and commit Task 2**

Run:

```bash
npx vitest run test/case-session-persistence.test.ts
npm run typecheck
npm run build
npm test
```

Stage only the four Task 2 files and commit:

```bash
git add apps/pact-agent-host/src/case-session-persistence.ts \
  apps/pact-agent-host/test/case-session-persistence.test.ts \
  apps/pact-agent-host/src/events.ts \
  apps/pact-agent-host/src/index.ts
git commit -m "feat(cp03): persist case session transitions"
```

---

### Task 3: Bind the Existing DSH-to-Ruby Receipt Into the CaseSession

**Files:**
- Modify: `apps/pact-agent-host/test/dsh-to-ruby.integration.test.js`
- Modify: `docs/pact-cp03-progress.md`
- Modify: `docs/3d-scene-builder.md`
- Modify: `docs/superpowers/plans/2026-08-22-pact-cp03-case-session-state-machine.md`

**Interfaces:**
- Consumes: current scripted DSH draft, viewer approval, `compileGuardedInteractionPlan`, `applyGuardedInteractionPlan`, the returned Ruby `receiptId` / scene hashes, and Task 2 persistence.
- Proves: one exact approved `Reframe` result becomes a durable root-session transition without changing Ruby's runtime or claiming real provider execution.

- [ ] **Step 1: Extend the local integration test before changing documentation**

After the existing `applyGuardedInteractionPlan` call, create the ledger from current runtime facts:

```js
const cases = new CaseSessionLedger({
  caseSessionId: storedDraft.identity.caseSessionId,
  mode: 'checkpoint',
  rootDshSessionId: String(conductor.agent.id),
  initialSceneHash: parentSceneHash,
});
const transition = cases.recordApprovedExecution({
  caseSessionId: storedDraft.identity.caseSessionId,
  turnId: storedDraft.identity.turnId,
  draftHash,
  approvalId: approval.approvalId,
  receiptId: result.receipt.receiptId,
  parentSceneHash: result.receipt.preconditionHash,
  resultSceneHash: result.receipt.resultSceneHash,
  actionSequence: storedDraft.decision.actionSequence,
  settledAt: result.receipt.appliedAt,
});
const durable = await persistCaseSessionTransition({
  ctx: harness.ctx,
  session: conductor.agent.session,
  transition,
});
```

Assert `currentSceneHash === result.receipt.resultSceneHash`, accumulated actions equal `['Reframe']`, status remains `OPEN`, the DSH event is durable, and every provider request still uses `pact-fake`.

- [ ] **Step 2: Run the exact integration test**

Run:

```bash
npx vitest run test/dsh-to-ruby.integration.test.js
```

Expected: PASS only if the real DSH root, exact stored draft, viewer approval, Ruby execution receipt and durable CaseSession transition remain linked.

- [ ] **Step 3: Update the evidence boundary in both documents**

Record these exact claims:

- local scripted DSH → approval → Ruby execution → CaseSession durability is tested;
- cumulative and terminal mechanics are unit-tested but five visually distinct runtime effects are not implemented;
- real provider compatibility remains `0/8 ELIGIBLE`, `0 SENT` until local configuration plus fresh exact approval;
- no audience UI, real multimodal interpretation, formal encounter suite or CP03 checkpoint archive exists;
- this plan adds no parallel Ruby execution backend.

Set this plan's status to `verified_local_no_network` only after every command in Step 4 passes.

- [ ] **Step 4: Run the full proportional verification matrix**

Run:

```bash
cd packages/pact-cp03-contracts
npm test
cd ../../apps/pact-agent-host
npm run typecheck
npm run build
npm test
cd ../scene-builder
npm test
npm run build
cd ../..
git diff --check
git status --short --branch
```

Expected: shared contracts, Agent Host and Scene Builder all PASS; provider requests remain zero; only Task 3 files differ before commit.

- [ ] **Step 5: Inspect Ruby remote truth and commit Task 3**

Run `git ls-remote` for the shared CP03 branch and Ruby's four named collaborator refs. If a ref moved, fetch and review that range before claiming conflict-free integration.

Stage only:

```bash
git add apps/pact-agent-host/test/dsh-to-ruby.integration.test.js \
  docs/pact-cp03-progress.md \
  docs/3d-scene-builder.md \
  docs/superpowers/plans/2026-08-22-pact-cp03-case-session-state-machine.md
git commit -m "test(cp03): bind case session to Ruby receipt"
```

- [ ] **Step 6: Stop at the provider and visual-effect boundaries**

Report the branch, exact commits, test counts and remote truth. Do not run Gemini/DeepSeek, expand the semantic capability catalog, build the public UI, generate checkpoint media, or mark CP03 complete in this plan.

## Self-Review

- **Spec coverage:** This plan covers spec sections 6, 12.1, 12.2, 17.2, 17.4 and the CaseSession-related parts of 20.1–20.3. It deliberately does not cover real-provider section 15/20.4, visual/sound differentiation in 12.3, public UI, the four formal encounters, archive media or human decisions.
- **Scope split:** The approved spec spans provider compatibility, five-action effects, UI, privacy and checkpoint production. This plan isolates only the provider-independent CaseSession state/durability subsystem; later plans must separately cover semantic effect capabilities and the audience loopback/UI.
- **Placeholder scan:** Every task names exact files, interfaces, commands, expected failures and commit boundaries. The plan contains no unspecified implementation step.
- **Type consistency:** `CaseSessionLedger`, `CaseSessionTransition`, `recordApprovedExecution`, `recordFailureNoMutation`, `recordLocalKeepOpaque`, `recordCheckpointReset` and `persistCaseSessionTransition` are named consistently across all tasks.
- **Authority check:** The ledger records agent/Gate/Ruby facts but cannot propose actions, approve drafts, mutate scenes, repair invalid proposals or replace the Capability Gate.
- **Evidence check:** Passing this plan proves local state and DSH durability only. It cannot satisfy real-provider, five-effect visual, browser encounter, checkpoint archive, technical PASS, artistic KEEP or public-release gates.
