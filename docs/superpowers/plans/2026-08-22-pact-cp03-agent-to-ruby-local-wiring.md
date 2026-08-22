# PACT CP03 Agent-to-Ruby Local Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove one local, no-network vertical slice in which a real DSH root session submits an executable semantic character-interaction draft, a viewer approval is bound to its canonical hash, a deterministic Capability Gate validates it, and Ruby's existing Scene Builder navigation/interaction/simulation runtime executes the resulting role action.

**Architecture:** Keep creative authority in the DSH draft and execution authority in Layered Redraw. Promote the existing compatibility-only `AgentActionDraft` contract without weakening its provider-gate mode, add a hash-bound viewer approval record, compile only registered semantic affordances, and delegate navigation, contact, ownership, collision, animation, and frame evaluation to Ruby's existing runtime. This package deliberately stops before HTTP/SSE, the public encounter UI, real Gemini/DeepSeek calls, formal CP03 capture, or CP04 retrieval.

**Tech Stack:** Node.js; TypeScript; JavaScript ES modules; DSH `0.1.0-rc.6`; Ajv 8; Vitest 4; Three.js 0.185.1; existing Scene Builder `agent-runtime`, `director`, navigation, collision, and deterministic 60 Hz simulation.

**Spec:** `/Users/yhryzy/Documents/ChatGPT/艺术驻地项目/.worktrees/pact-cp00-cp01a-evidence/docs/superpowers/specs/2026-08-22-pact-cp03-agent-native-five-actions-design.md`

**Plan status:** `verified_local_no_network`

**Authorisation evidence:** On 2026-08-22 the user clarified that viewers should provide text/image/audio while agents interpret and operate the characters, and instructed the project to connect and integrate the user's and Ruby's completed work before reporting. This authorises local implementation and proportionate tests. It does not authorise real provider calls, new downloads, push, PR, merge to `main`, deploy, publish, public release, or participant data.

## Global Constraints

- Preserve Ruby ancestry and all merged code through `1691e8eda8f7030f6817aa678120715d4a1935b7`.
- Do not reimplement character paths, interaction phases, ownership, collision, or animation outside Ruby's Scene Builder runtime.
- Viewer input carries no action label, object coordinate, transform, script, URL, provider credential, or execution authority.
- The first executable capability is `performRegisteredInteraction`; it accepts only stable scene IDs and an affordance already declared on the target object.
- The compatibility execution mode remains non-executable and must continue to reject capability calls.
- The local vertical slice uses `providerKind: scripted` and must never be reported as a real Gemini/DeepSeek result.
- No mutation occurs before an approval whose `draftHash` and `parentSceneHash` match current truth.
- The source project remains immutable during playback; execution produces a cloned transient director overlay and a receipt.
- This package does not establish CP03's five-action visual grammar, public UI, provider compatibility, multimodal quality, checkpoint archive, human technical PASS, artistic KEEP, or public release.
- Stage only files named by the current task. Push remains a separate permission.

---

### Task 1: Promote the Shared Draft Contract and Add Viewer Approval

**Files:**
- Modify: `packages/pact-cp03-contracts/schemas/gate/agent-action-draft.schema.json`
- Create: `packages/pact-cp03-contracts/schemas/runtime/approval-record.schema.json`
- Modify: `packages/pact-cp03-contracts/src/index.js`
- Modify: `packages/pact-cp03-contracts/test/fixtures.js`
- Modify: `packages/pact-cp03-contracts/test/contracts.test.js`

**Interfaces:**
- Produces: `CP03_RUNTIME_SCHEMA_VERSION = "cp03-runtime/0.1"`.
- Produces: `validateApprovalRecord(value)`.
- Extends: `validateAgentActionDraft(value)` to accept either the existing `NON_EXECUTABLE_COMPATIBILITY` branch or the executable `EXECUTABLE_PROPOSAL` branch.
- Executable capability shape:

```js
{
  capability: "performRegisteredInteraction",
  arguments: {
    actorId: "interaction-actor-a",
    targetId: "interaction-cup",
    affordance: "pickup"
  }
}
```

- [x] **Step 1: Add failing contract tests**

Add tests that require:

```js
expect(validateAgentActionDraft(validRuntimeAgentActionDraft))
  .toBe(validRuntimeAgentActionDraft);
expect(validateApprovalRecord(validApprovalRecord)).toBe(validApprovalRecord);
expect(() => validateAgentActionDraft({
  ...validAgentActionDraft,
  execution: {
    ...validAgentActionDraft.execution,
    semanticCapabilityCalls: [{
      capability: "performRegisteredInteraction",
      arguments: { actorId: "a", targetId: "b", affordance: "pickup" },
    }],
  },
})).toThrow(/validation failed/);
```

Also reject raw `position`, `path`, `url`, `script`, undeclared capability arguments, a non-`PROPOSED` executable draft, and an approval with mismatched case/turn identifiers.

- [x] **Step 2: Run the focused red test**

Run:

```bash
cd packages/pact-cp03-contracts
npx vitest run test/contracts.test.js
```

Expected: FAIL because the runtime schema version and approval validator do not exist.

- [x] **Step 3: Implement the dual execution schema**

Keep the current compatibility branch byte-compatible. Add an executable branch that requires:

```text
executionMode = EXECUTABLE_PROPOSAL
1..8 semanticCapabilityCalls
1..16 expectedChanges stable refs
1..32 forbiddenChanges stable refs
1..16 rollbackRequirements bounded strings
```

For this package, the only executable capability name is `performRegisteredInteraction`, and its arguments contain only `actorId`, `targetId`, `affordance`, plus optional `recipientId` or `placementTargetId` stable refs. No free-form coordinates or provider-authored runtime fields are representable.

- [x] **Step 4: Implement the approval record**

The schema is authority-specific and exact:

```js
{
  schemaVersion: "cp03-runtime/0.1",
  approvalId: "approval_example01",
  caseSessionId: "case_example01",
  turnId: "turn_example01",
  draftHash: "<64 lowercase hex>",
  parentSceneHash: "<64 lowercase hex>",
  decision: "APPROVE",
  approvedBy: "viewer",
  decidedAt: "2026-08-22T00:00:00.000Z"
}
```

- [x] **Step 5: Run contracts and commit the slice**

Run `npm test` in `packages/pact-cp03-contracts`. Stage only the five files above and commit:

```bash
git commit -m "feat(cp03): add executable interaction draft contract"
```

---

### Task 2: Carry an Executable Draft Through the Real DSH Root Session

**Files:**
- Modify: `apps/pact-agent-host/src/contract-types.ts`
- Modify: `apps/pact-agent-host/src/submission-registry.ts`
- Modify: `apps/pact-agent-host/test/dsh-foundation.test.ts`

**Interfaces:**
- Consumes: executable `AgentActionDraft` from Task 1.
- Produces: `SubmissionRegistry.draftPayload(payloadHash): AgentActionDraft | undefined`.
- Preserves: `pact_submit_draft` as the only root draft-submission tool.

- [x] **Step 1: Add a failing scripted-root test**

Create a real DSH root with `parked: false`. The scripted adapter must emit one `pact_submit_draft` tool call carrying `validRuntimeAgentActionDraft`, then consume the tool result. Assert:

```ts
expect(eventsOfType(session.events, 'pact/draft')).toHaveLength(1);
expect(harness.registry.currentDraft(turnId)).toBe(draftHash);
expect(harness.registry.draftPayload(draftHash)).toEqual(validRuntimeAgentActionDraft);
expect(adapter.requests.every((request) => request.provider === 'pact-fake')).toBe(true);
```

Mutating the returned value must not alter the stored payload.

- [x] **Step 2: Run the focused red test**

Run:

```bash
cd apps/pact-agent-host
npx vitest run test/dsh-foundation.test.ts
```

Expected: FAIL because `draftPayload` does not exist and the TypeScript contract only admits the compatibility schema version.

- [x] **Step 3: Store an immutable JSON draft by canonical hash**

On accepted, in-budget draft submission:

1. validate before registry entry through the existing tool;
2. compute the canonical SHA-256;
3. append the DSH `pact/draft` event;
4. store a deep-cloned JSON payload by hash;
5. return only a fresh deep clone from `draftPayload`.

Late/quarantined drafts must never enter the payload map.

- [x] **Step 4: Run typecheck, build, tests, and commit**

Run:

```bash
npm run typecheck
npm run build
npm test
```

Stage only the three files above and commit:

```bash
git commit -m "feat(cp03): carry executable draft through DSH"
```

---

### Task 3: Compile Viewer-Approved Drafts Into Ruby Character Interaction

**Files:**
- Modify: `apps/scene-builder/package.json`
- Modify: `apps/scene-builder/package-lock.json`
- Modify: `apps/scene-builder/src/agent-runtime.js`
- Modify: `apps/scene-builder/src/agent-runtime.test.js`
- Create: `apps/scene-builder/src/cp03/capability-gate.js`
- Create: `apps/scene-builder/src/cp03/capability-gate.test.js`

**Interfaces:**
- Consumes: runtime draft, canonical draft hash, viewer approval, current project, and current evaluated frame.
- Produces: `compileGuardedInteractionPlan({ draft, approval, project, frame, now })`.
- Produces: `applyGuardedInteractionPlan({ project, plan })` returning `{ project, receipt }` without mutating the input project.
- Delegates: semantic validation to `planAgentIntent`; clip generation to `compileAgentPlan`; playback and ownership to Ruby's existing director/simulation runtime.

- [x] **Step 1: Add the local contracts package dependency**

Add exactly:

```json
"@layered-redraw/pact-cp03-contracts": "file:../../packages/pact-cp03-contracts"
```

Run `npm install --package-lock-only`. Do not create a root workspace.

- [x] **Step 2: Add failing ownership-propagation tests**

Extend `agent-runtime.test.js` so a `pickup` intent compiled from an affordance preserves:

```js
expect(interactionClip).toMatchObject({
  ownershipMode: "claim",
  holderAnchor: "carry",
  itemAnchor: "grip",
  actorContactAnchor: "grip",
});
```

For transfer/release, require valid registered `recipientId`/`placementTargetId`; reject undeclared or missing semantic targets instead of guessing.

- [x] **Step 3: Add failing Gate tests**

Start from `createInteractionDemoProject()` with an empty director timeline. Tests must prove:

1. draft hash mismatch rejects;
2. approval decision `REJECT` produces no plan;
3. stale `parentSceneHash` rejects;
4. raw or unknown actor/target/affordance rejects;
5. no approval means no clip and no project mutation;
6. a valid approved pickup produces navigation plus one interaction clip;
7. applying the plan leaves the input project unchanged;
8. evaluating the resulting project at the end reports `interaction-cup` held by `interaction-actor-a`;
9. the receipt links draft, approval, precondition, post-project hash, and changed clip IDs.

- [x] **Step 4: Preserve ownership metadata in Ruby's existing planner**

Copy only validated affordance metadata into the semantic intent and then into the interaction clip. Do not create a second ownership solver. Existing clips without ownership fields must retain current behaviour.

- [x] **Step 5: Implement the deterministic Gate**

The Gate performs only mechanical checks:

```text
validate draft
canonical hash equals approval.draftHash
case/turn/scene identities match
viewer decision is APPROVE
current project hash equals parentSceneHash
draft is PROPOSED + EXECUTABLE_PROPOSAL
capability name is registered
actor/target/affordance exist and pass planAgentIntent
expected/forbidden IDs match bounded runtime effects
```

It never writes poetry, chooses an affordance, inserts a coordinate, substitutes an asset, or repairs an invalid agent draft.

- [x] **Step 6: Apply as a transient director overlay**

Clone the project, append the generated clips, update timeline duration, and compute a result hash. The original project object and source/evidence objects remain unchanged. Return an immutable receipt; a later browser task will own playback and visual presentation.

- [x] **Step 7: Run focused/full tests, build, and commit**

Run:

```bash
npx vitest run src/agent-runtime.test.js src/cp03/capability-gate.test.js
npm test
npm run build
```

Stage only the six files above and commit:

```bash
git commit -m "feat(cp03): gate agent character interaction into scene runtime"
```

---

### Task 4: Freeze the Local Integration Result and Update the Roadmap

**Files:**
- Create: `docs/pact-cp03-progress.md`
- Modify: `docs/3d-scene-builder.md`
- Test: current package suites and Git checks.

**Interfaces:**
- Produces a truthful progress record distinguishing scripted local wiring from real-provider/live-viewer evidence.
- Produces the next external gate scope without sending it.

- [x] **Step 1: Record the original CP00-CP08 route and current evidence tier**

Use exact statuses: `ARCHIVED`, `PARTIAL`, `FOUNDATION_TESTED`, `NOT_STARTED`, and `BLOCKED_ON_SEPARATE_AUTHORITY`. List Ruby's commits separately from Haorui/Codex commits and identify the shared interface.

- [x] **Step 2: Document the new execution seam**

Add a concise section to `docs/3d-scene-builder.md` explaining:

```text
DSH executable draft -> viewer approval -> Capability Gate
-> existing Scene Builder semantic planner
-> existing navigation/interaction/simulation runtime
```

State that the local test uses a scripted provider and does not prove Gemini/DeepSeek quality, latency, multimodal interpretation, public UI, or CP03 completion.

- [x] **Step 3: Run the verification matrix**

Run:

```bash
cd packages/pact-cp03-contracts && npm test
cd ../../apps/pact-agent-host && npm run typecheck && npm run build && npm test
cd ../scene-builder && npm test && npm run build
cd ../.. && git diff --check && git status --short --branch
```

Expected: all suites pass and only planned files differ before the final commit.

- [x] **Step 4: Inspect Ruby remote truth one final time**

Run `git ls-remote` for the four collaborator refs. If any moved, report the new range and do not claim conflict-free integration until it is reviewed.

- [x] **Step 5: Commit the roadmap/documentation milestone**

Stage only `docs/pact-cp03-progress.md`, `docs/3d-scene-builder.md`, and this plan if not already committed. Commit:

```bash
git commit -m "docs(cp03): map agent and collaborator integration progress"
```

- [x] **Step 6: Stop at the external authority boundary**

Report the exact branch/HEAD, tests, local scripted interaction evidence, remaining real-provider/UI/archive work, and the next proposed call-count/model/input/cost disclosure. Do not run real providers or push without separate approval.

## Self-Review

- Spec coverage: this package covers the first executable character-interaction seam across DSH, viewer approval, Capability Gate, and Ruby runtime. It intentionally does not claim the complete five-action or checkpoint contract.
- Placeholder scan: no implementation step contains `TBD`, `TODO`, an unspecified test, or an unnamed interface.
- Type consistency: `cp03-runtime/0.1`, `performRegisteredInteraction`, `validateApprovalRecord`, `draftPayload`, `compileGuardedInteractionPlan`, and `applyGuardedInteractionPlan` are named consistently across tasks.
- Conflict control: no task rebuilds Ruby's path, collision, ownership, animation, camera, or renderer; no task weakens CP02 source-lock defaults.
