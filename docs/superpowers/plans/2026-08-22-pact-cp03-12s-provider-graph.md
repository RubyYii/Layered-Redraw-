# PACT CP03 12-Second Provider Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the failed serialized 12-stream CP03 compatibility graph with a locally verified 8-stream DSH graph that preserves the 8-second draft target and 12-second hard cutoff while preventing continuable-child settlement from invoking the active Conductor.

**Architecture:** Keep DSH and the existing provider ledger as execution authority. Run route/trace, Rewriter, and Guardian in one common-deadline wave; cancel every successful tool probe after all expected tools are accepted; route automatic child settlement into dedicated parked sinks; then send one explicit draft turn carrying deterministic contribution references. Add bounded timing facts to both complete and partial runtime results.

**Tech Stack:** Node.js; TypeScript 6; Vitest 4; DSH `0.1.0-rc.6`; existing JSONL persistence, PACT tools, provider envelopes, run gate, and evidence verifier.

**Spec:** `/Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/docs/superpowers/specs/2026-08-22-pact-cp03-12s-provider-graph-design.md`

**Plan status:** `in_progress_local_no_network`

**Authorization:** The user selected option A after Live Run 02. This authorizes the local redesign, tests, progress update, milestone commits, remote synchronization checks, and push to the current collaboration branch. It does not authorize provider calls or Live Run 03.

## Global Constraints

- Make zero Gemini and DeepSeek requests in this implementation pass.
- Keep DeepSeek as Case Conductor/Guardian and Gemini as multimodal Rewriter.
- Keep the 2.5-second trace target, 8-second draft target, and 12-second hard deadline distinct.
- Preserve the eight-probe scope, one pre-side-effect retry per provider, synthetic checkerboard, durability barriers, late quarantine, and cancellation probes.
- Do not modify Ruby's Scene Builder, 3D assets, interaction runtime, or delivery artifacts.
- Stage explicit task files only. Fetch and compare Ruby's remote tips before each push.

---

### Task 1: Freeze the New Probe and Budget Contract

**Files:**
- Modify: `apps/pact-agent-host/src/probe-plan.ts`
- Modify: `apps/pact-agent-host/test/provider-compatibility.test.ts`
- Modify: `apps/pact-agent-host/test/provider-real-run-gate.test.ts`
- Modify: `apps/pact-agent-host/test/provider-real-command.test.ts`
- Modify: `apps/pact-agent-host/test/provider-run-evidence.test.ts`

- [x] **Step 1: Write red assertions for the 8/10 contract**

Require eight probes, eight planned dispatches, ten maximum, DeepSeek `5/6`, Gemini `3/4`, and waves `[01,03]`, `[02,04,05]`, `[06]`, `[07,08]`.

- [x] **Step 2: Run the focused red tests**

```bash
cd apps/pact-agent-host
npx vitest run test/provider-compatibility.test.ts test/provider-real-run-gate.test.ts test/provider-real-command.test.ts test/provider-run-evidence.test.ts
```

Expected: FAIL against the old 12/14 plan.

- [x] **Step 3: Remove receipt-consumption dispatches and update dependencies/waves**

Each probe declares one provider dispatch. Probe 04 and Probe 05 are independent at dispatch time; Probe 06 depends on 02, 04, and 05.

- [x] **Step 4: Re-run focused tests**

Expected: plan/gate/evidence fixtures agree on `8 planned / 10 maximum`.

---

### Task 2: Implement Tool-Aware Cancellation and Settlement Isolation

**Files:**
- Modify: `apps/pact-agent-host/src/provider-real-runner.ts`
- Modify: `apps/pact-agent-host/test/provider-real-runner.test.ts`
- Modify if a reusable assertion is needed: `apps/pact-agent-host/src/durable-turn.ts`

- [x] **Step 1: Write failing runner tests**

Require:

- exactly eight normal DSH streams;
- five DeepSeek and three Gemini streams;
- Probe 02 accepts both expected tools before cancellation;
- no successful probe opens a second receipt-consumption stream;
- a three-party barrier proves 02/04/05 start concurrently;
- settlement sinks end with `blocked` and the active Conductor has no child-settlement turn;
- one retry yields nine streams and two-provider retry yields ten.

- [x] **Step 2: Run the focused red runner suite**

```bash
cd apps/pact-agent-host
npx vitest run test/provider-real-runner.test.ts
```

Expected: FAIL against the serialized graph.

- [x] **Step 3: Track expected accepted tool names per assigned session**

Correlate `tool/call` IDs to names and cancel only after every expected tool has a non-error `tool/result`. Clear tracking at assignment disposal/reassignment. Keep Probe 08's first-token cancellation separate.

- [x] **Step 4: Split active Conductor from child settlement parents**

Create dedicated parked parents for 01, 03, 04, 05, and 08. Wait for each child turn and its sink's blocked turn. Assert no settlement-created turn appears on the active Conductor.

- [x] **Step 5: Parallelize the representative wave**

Start Probe 02, Probe 04, and Probe 05 against the same `chainStartedAt` and `chainDeadlineAt`. After all three durable submissions pass, extract contribution refs and run Probe 06 as the Conductor's only second explicit turn.

- [x] **Step 6: Fail before later waves**

Run `ledger.assertComplete()` after each completed wave. A late or invalid draft must throw before Probe 07 or Probe 08 starts.

---

### Task 3: Add Explicit 2.5/8/12 Timing Facts

**Files:**
- Modify: `apps/pact-agent-host/src/provider-real-runner.ts`
- Modify: `apps/pact-agent-host/src/provider-run-evidence.ts`
- Modify: `apps/pact-agent-host/test/provider-real-runner.test.ts`
- Modify: `apps/pact-agent-host/test/provider-run-evidence.test.ts`
- Modify: `apps/pact-agent-host/test/provider-real-command.test.ts`

- [x] **Step 1: Add red complete and partial timing assertions**

The scripted clock must record chain start, first accepted public trace, accepted draft, both target booleans, and hard-deadline status. A 12,001 ms draft must be late/quarantined and stop before cancellation probes.

- [x] **Step 2: Implement immutable timing summaries**

Use the runner's injected `now()` at domain-event observation time. Targets are diagnostic booleans; `hardDeadlineMet=false` is a runtime failure.

- [x] **Step 3: Validate timing evidence shape**

The evidence verifier must reject missing/inconsistent timing on a completed new run, while allowing a reported target miss to remain distinct from a hard-deadline failure.

- [x] **Step 4: Run runner, command, and evidence tests**

```bash
cd apps/pact-agent-host
npx vitest run test/provider-real-runner.test.ts test/provider-real-command.test.ts test/provider-run-evidence.test.ts
```

---

### Task 4: Verify, Document, Commit, Synchronize, and Push

**Files:**
- Modify: `docs/pact-cp03-progress.md`
- Modify: this plan's checkbox/status fields
- Test: Agent Host suite and Git/secret checks

- [x] **Step 1: Run proportional verification**

```bash
cd apps/pact-agent-host
npm test
npm run typecheck
npm run build
```

Also verify that no generated archive contains credential fields or configured secret values. Do not print those values.

- [x] **Step 2: Update progress truth**

Record the local 8/10 graph as scripted and verified, keep Live Run 02 as failed historical evidence, and mark Live Run 03 as `NOT_RUN / REQUIRES_NEW_APPROVAL`.

- [x] **Step 3: Commit coherent milestones**

Stage explicit files only. Use small descriptive commits for design/plan, implementation, and evidence/progress.

- [ ] **Step 4: Synchronize with Ruby before push**

Fetch origin, compare current branch and Ruby branch tips, integrate only if the current branch changed remotely, and re-run affected checks after any integration.

- [ ] **Step 5: Push and verify remote truth**

Push `codex/pact-cp03-agent-native`, then use `git ls-remote` to verify the remote branch SHA. Report local tested, committed, pushed, and real-provider-not-run as separate evidence tiers.
