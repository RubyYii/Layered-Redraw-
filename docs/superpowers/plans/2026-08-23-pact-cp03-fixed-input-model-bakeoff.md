# PACT CP03 Fixed-input Model Bake-off and Representative Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new isolated five-model, two-repetition, `28 planned / 30 maximum` DSH bake-off; separate technical eligibility from blinded author judgment; then, only after explicit model-routing approval, carry one real `6 planned / 8 maximum` council encounter through viewer approval, the Capability Gate, Ruby's actual 3D mutation, replay, rollback, and the formal five-class CP03 archive.

**Architecture:** Freeze fictional text, a generated spatial image, synthetic scene/registry fixtures, role prompts, schemas, and candidate order as hash-bound inputs. Run every candidate through a new approval-gated DSH transport and archive that cannot touch Live Run 01-03. A deterministic verifier decides technical eligibility; a separate blinded packet collects the author's artistic selection. The approved selection produces one authoritative critical-path routing manifest and a deterministic projection for the existing council runtime. A same-origin loopback host then connects the selected real council to the existing Scene Builder/Ruby runtime without giving models raw JavaScript, coordinates, URLs, files, assets, permissions, or direct scene authority.

**Tech Stack:** Node.js 22.19+; TypeScript 6; DSH `0.1.0-rc.6`; locked pi-ai `0.84.2`; JSON Schema 2020-12 and Ajv 8; Vitest 4; macOS Keychain references; local content-addressed attachments; Playwright Core 1.62; visible Chrome; existing Scene Builder/Ruby Three.js, character, interaction, receipt, replay, and rollback runtime.

**Spec:** `/Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/docs/superpowers/specs/2026-08-23-pact-cp03-gemini-37-adapter-bakeoff-design.md`

**Plan status:** `implementation_not_started_real_run_not_authorized`

**Suite position:** Execute after adapter readiness. Audience-image lifecycle may be implemented in parallel locally, but Stage B uses only its own synthetic fixture and never visitor data. This written plan authorizes implementation and scripted/local verification only. It does not authorize the paid Stage B run, human selection, production-route change, paid Stage C encounter, checkpoint acceptance, deployment, or public release.

## Global Constraints

- During Tasks 1-6 implementation and local verification, make zero Gemini/DeepSeek requests. Use injected scripted DSH adapters for all executable tests.
- Historical `provider-real-runner.ts`, `provider-real-command.ts`, `provider-real-run-gate.ts`, `provider-run-evidence.ts`, Live Run 01-03 archives, and their schemas remain unchanged.
- New archive root is `checkpoints/cp03/model-bakeoff/$MODEL_BAKEOFF_RUN_ID/`; no file from the historical compatibility archive may be copied or reinterpreted.
- Candidate matrix is exact: DeepSeek `deepseek-v4-pro` and `deepseek-v4-flash` for Conductor intent/commit, Archivist, Guardian; Gemini `gemini-3.5-flash`, `gemini-3.6-flash`, `gemini-3.7-flash` on route `google` for Witness/Rewriter; two repetitions each; `28 planned / 30 maximum`.
- Each provider family has one global pre-side-effect transport retry slot. Slots are not transferable. No retry for refusal, schema/content failure, accepted provider side effect, late result, or human rejection. Never automatically rerun the batch.
- Only fictional test text, one local programmatic synthetic spatial PNG, and synthetic scene/registry/rights/rollback facts may leave the machine. Never send repository code, artwork assets, Ruby files, collaborator files, private files, real visitor media, or archived visitor media.
- Search, grounding, file/repository upload, browsing, external tools, asset download, image generation, 3D generation, and model-authored code remain off.
- Token caps, fresh official prices, Keychain service/account references, run identity, exact hashes, and USD ceiling must be bound by a fresh Stage B approval. No previous Live Run approval or cost cap carries over.
- Report `intended / eligible / excluded / sent` before a real batch. If eligibility shrinks, stop before dispatch and request a new approval.
- Technically ineligible output cannot be repaired by deterministic assembly or selected by artistic review. Both repetitions for a role/model pair must be technically eligible before that pair enters the blind packet.
- Automatic metrics never select the final model. The author must make and sign each role decision before names are unblinded into routing.
- Stage B proves model-selection evidence only. It cannot satisfy full `2.5/8/12s` council timing, Ruby mutation, artistic `KEEP`, or checkpoint acceptance.
- The final source-of-truth route is the existing `pact-cp03-provider-routing/0.1` critical-path manifest. The older council-runtime shape is a hash-bound deterministic projection, not a second independently authored route.
- Stage C remains `6 planned / 8 maximum`, requires a separate exact provider-run approval, and preserves viewer approval before Gate/Ruby execution.
- Stage C checkpoint capture must include actual Ruby mutation and rollback, not a rendered mock or scripted-provider result.
- Technical `PASS`, artistic `KEEP`, checkpoint acceptance, push, deployment, and public release remain separate facts and decisions.
- Every progress row and checkpoint caption must keep design approval, implementation, local verification, provider run, human model selection, routing approval, Ruby execution, checkpoint acceptance, commit, push, deployment, and public release as separate evidence states.
- Stage explicit files only. Never use `git add .` or `git add -A`. Fetch/reconcile Ruby before normal push; never force-push.

## File Structure

### Shared bake-off contracts

- Create `packages/pact-cp03-contracts/schemas/bakeoff/model-bakeoff-approval.schema.json`.
- Create `packages/pact-cp03-contracts/schemas/bakeoff/model-bakeoff-attempt.schema.json`.
- Create `packages/pact-cp03-contracts/schemas/bakeoff/model-bakeoff-selection.schema.json`.
- Modify shared validator exports and fixtures/tests.

### Fixed inputs, plan, preflight, gate, and runner

- Create `apps/pact-agent-host/src/synthetic-spatial-image.ts`.
- Create `apps/pact-agent-host/src/model-bakeoff-fixtures.ts`.
- Create `apps/pact-agent-host/src/model-bakeoff-plan.ts`.
- Create `apps/pact-agent-host/src/model-bakeoff-pricing.ts`.
- Create `apps/pact-agent-host/src/model-bakeoff-preflight.ts`.
- Create `apps/pact-agent-host/src/model-bakeoff-gate.ts`.
- Create `apps/pact-agent-host/src/model-bakeoff-runner.ts`.
- Create `apps/pact-agent-host/src/model-bakeoff-dsh-transport.ts`.
- Create matching focused tests.
- Create `apps/pact-agent-host/scripts/model-bakeoff.mts`.

### Evidence, blind review, and routing

- Create `apps/pact-agent-host/src/model-bakeoff-evidence.ts`.
- Create `apps/pact-agent-host/src/model-bakeoff-blind-review.ts`.
- Create `apps/pact-agent-host/src/model-routing-selection.ts`.
- Create matching focused tests.
- Create `apps/scene-builder/scripts/capture-cp03-model-bakeoff.mjs`.
- Create `apps/scene-builder/scripts/capture-cp03-representative-interaction.mjs`.

### Representative loopback integration

- Create `apps/pact-agent-host/src/cp03-loopback-protocol.ts`.
- Create `apps/pact-agent-host/src/cp03-loopback-server.ts`.
- Create `apps/pact-agent-host/test/cp03-loopback-server.test.ts`.
- Create `apps/pact-agent-host/scripts/serve-cp03.mts`.
- Create `apps/scene-builder/src/cp03/agent-bridge.js`.
- Create `apps/scene-builder/src/cp03/agent-bridge.test.js`.
- Modify `apps/scene-builder/src/main.js`, `index.html`, and `styles.css` only to switch the CP03 panel between visibly labelled local-scripted and real-loopback modes.

---

### Task 1: Freeze the Synthetic Inputs and Exact 28-dispatch Matrix

**Files:**

- Create: `apps/pact-agent-host/src/synthetic-spatial-image.ts`
- Create: `apps/pact-agent-host/src/model-bakeoff-fixtures.ts`
- Create: `apps/pact-agent-host/src/model-bakeoff-plan.ts`
- Create: `apps/pact-agent-host/test/synthetic-spatial-image.test.ts`
- Create: `apps/pact-agent-host/test/model-bakeoff-fixtures.test.ts`
- Create: `apps/pact-agent-host/test/model-bakeoff-plan.test.ts`
- Modify: `apps/pact-agent-host/src/index.ts`

- [ ] **Step 1: Add red matrix and fixture tests**

Freeze the matrix constants exactly:

```ts
export const BAKEOFF_DEEPSEEK_MODELS = [
  'deepseek-v4-pro',
  'deepseek-v4-flash',
] as const;

export const BAKEOFF_GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
] as const;

export const BAKEOFF_DEEPSEEK_PHASES = [
  'ConductorIntent',
  'Archivist',
  'Guardian',
  'ConductorCommit',
] as const;

export const BAKEOFF_GEMINI_PHASES = [
  'Witness',
  'Rewriter',
] as const;

export const BAKEOFF_REPETITIONS = [1, 2] as const;
export const BAKEOFF_PLANNED_DISPATCHES = 28 as const;
export const BAKEOFF_MAXIMUM_DISPATCHES = 30 as const;
```

Generate repetition 1 in listed model order and repetition 2 in reversed model order within each provider to counterbalance simple order effects. Within each DeepSeek candidate/repetition, keep the phase order shown above so Conductor commit follows its intent on one continuable session. Within each Gemini candidate/repetition, Witness precedes Rewriter.

Tests must assert:

```ts
expect(plan).toHaveLength(28);
expect(plan.map((entry) => entry.plannedOrdinal))
  .toEqual(Array.from({ length: 28 }, (_, index) => index + 1));
expect(plan.filter((entry) => entry.provider === 'deepseek')).toHaveLength(16);
expect(plan.filter((entry) => entry.provider === 'gemini')).toHaveLength(12);
expect(new Set(plan.map((entry) => entry.caseId)).size).toBe(28);
expect(summary).toEqual({
  intended: 28,
  plannedDispatches: 28,
  maximumDispatches: 30,
  retrySlots: { deepseek: 1, gemini: 1 },
});
```

- [ ] **Step 2: Add red synthetic-input tests**

The generated image is a 384×256 PNG with no text, metadata, external source, or randomness. It depicts only fixed geometric relations: rear window, bed, table, chair, cup, thermos, source plane, floor grid, and two deliberately ambiguous overlaps. Tests require a stable PNG signature, dimensions, byte hash, pixel hash, and absence of source paths/URLs/text markers.

The fixture manifest contains:

```ts
export interface ModelBakeoffFixtureManifest {
  readonly schemaVersion: 'cp03-model-bakeoff-fixtures/0.1';
  readonly fictionalText: string;
  readonly syntheticImage: {
    readonly inputRefId: 'synthetic-spatial-image-01';
    readonly mediaType: 'image/png';
    readonly width: 384;
    readonly height: 256;
    readonly byteLength: number;
    readonly sha256: string;
  };
  readonly sceneSnapshot: Readonly<Record<string, unknown>>;
  readonly registry: Readonly<Record<string, unknown>>;
  readonly rights: readonly string[];
  readonly rollbackCapabilities: readonly string[];
  readonly promptManifestSha256: string;
  readonly schemaManifestSha256: string;
  readonly fixtureManifestSha256: string;
}
```

Fixture IDs are synthetic and cannot match registered production asset IDs. The fictional text must explicitly name uncertainty and avoid any claim about a real memory, person, source image, or licence.

- [ ] **Step 3: Run the red tests**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/synthetic-spatial-image.test.ts test/model-bakeoff-fixtures.test.ts test/model-bakeoff-plan.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement canonical fixtures and matrix**

Export pure functions:

```ts
export function createSyntheticSpatialImage(): Uint8Array;
export function createModelBakeoffFixtures(): ModelBakeoffFixtures;
export function createModelBakeoffPlan(
  fixtures: ModelBakeoffFixtureManifest,
): readonly ModelBakeoffCase[];
export function summarizeModelBakeoffPlan(
  plan: readonly ModelBakeoffCase[],
): ModelBakeoffPlanSummary;
```

Every case binds provider, route, exact model, role/phase, repetition, planned ordinal, fixture/prompt/schema hashes, expected input classes, and continuity key. Only Witness/Rewriter declare the synthetic image input.

- [ ] **Step 5: Run focused tests and commit**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/synthetic-spatial-image.test.ts test/model-bakeoff-fixtures.test.ts test/model-bakeoff-plan.test.ts
npm run typecheck
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- apps/pact-agent-host/src/synthetic-spatial-image.ts apps/pact-agent-host/src/model-bakeoff-fixtures.ts apps/pact-agent-host/src/model-bakeoff-plan.ts apps/pact-agent-host/test/synthetic-spatial-image.test.ts apps/pact-agent-host/test/model-bakeoff-fixtures.test.ts apps/pact-agent-host/test/model-bakeoff-plan.test.ts apps/pact-agent-host/src/index.ts
git commit -m "feat(cp03): freeze fixed model bakeoff inputs"
```

---

### Task 2: Define Fresh Pricing and Zero-call Preflight

**Files:**

- Create: `apps/pact-agent-host/src/model-bakeoff-pricing.ts`
- Create: `apps/pact-agent-host/src/model-bakeoff-preflight.ts`
- Create: `apps/pact-agent-host/test/model-bakeoff-pricing.test.ts`
- Create: `apps/pact-agent-host/test/model-bakeoff-preflight.test.ts`
- Modify: `apps/pact-agent-host/src/index.ts`

- [ ] **Step 1: Add red pricing-manifest tests**

Do not extend stale `official-pricing.ts`. Define a new externally supplied manifest:

```ts
export interface ModelBakeoffPricingManifest {
  readonly schemaVersion: 'cp03-model-bakeoff-pricing/0.1';
  readonly retrievedAt: string;
  readonly sources: readonly {
    readonly provider: 'deepseek' | 'gemini';
    readonly url: string;
    readonly pageSha256: string;
  }[];
  readonly rates: Readonly<Record<string, {
    readonly inputUsdPerMillionTokens: number;
    readonly outputUsdPerMillionTokens: number;
    readonly assumption: string;
  }>>;
  readonly manifestSha256: string;
}
```

Require all five exact models, only official DeepSeek/Google pricing URLs, non-negative finite rates, a retrieval timestamp no older than 24 hours at preflight time, and a recomputable self-hash. Test fixtures use explicitly synthetic rates and can never be accepted by a real preflight.

The estimator receives approved per-role input/output caps and includes all 30 maximum dispatches conservatively, assigning each provider retry to that provider's highest-priced candidate. It returns estimated worst case and never sets a user cap.

- [ ] **Step 2: Add red preflight tests**

Freeze:

```ts
export interface ModelBakeoffPreflight {
  readonly schemaVersion: 'cp03-model-bakeoff-preflight/0.1';
  readonly status: 'NOT_ELIGIBLE' | 'ELIGIBLE_AWAITING_EXPLICIT_APPROVAL';
  readonly runId: string;
  readonly counts: {
    readonly intended: 28;
    readonly eligible: number;
    readonly excluded: number;
    readonly sent: 0;
    readonly plannedDispatches: 28;
    readonly maximumDispatches: 30;
  };
  readonly planSha256: string;
  readonly fixtureManifestSha256: string;
  readonly promptManifestSha256: string;
  readonly schemaManifestSha256: string;
  readonly pricingManifestSha256: string;
  readonly worstCaseEstimatedUsd: number | null;
  readonly credentials: readonly {
    readonly provider: 'deepseek' | 'gemini';
    readonly envRef: 'DEEPSEEK_API_KEY' | 'GEMINI_API_KEY';
    readonly keychainService: string;
    readonly keychainAccount: string;
    readonly present: boolean;
  }[];
  readonly candidateFacts: readonly CandidateCatalogFact[];
  readonly exclusions: readonly { readonly caseId: string; readonly reason: string }[];
  readonly providerRequestsMade: 0;
  readonly preflightSha256: string;
}
```

Tests reject absent/duplicate/aliased/wrong-route models, missing modalities, stale/unhashed pricing, missing Keychain references, a missing Keychain item, altered fixture hashes, any eligible count below 28, and nonzero sent/provider request counts.

- [ ] **Step 3: Run the red tests**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/model-bakeoff-pricing.test.ts test/model-bakeoff-preflight.test.ts
```

Expected: FAIL because the modules are absent.

- [ ] **Step 4: Implement keyless catalog and Keychain-presence inspection**

Mount the locked DSH adapters once and list only local catalogs for `deepseek-official` and `google`. Do not resolve credentials or open streams. Check Keychain item presence with `/usr/bin/security find-generic-password` without `-w`, discard stdout/stderr, and record only service/account/presence. Inherited API-key environment variables do not satisfy this gate.

The preflight is eligible only when all 28 cases remain eligible. If one model is absent, `eligible` shrinks and status is `NOT_ELIGIBLE`; no reduced run is silently allowed.

- [ ] **Step 5: Implement the default-zero-call CLI mode**

Create `scripts/model-bakeoff.mts` with default mode `preflight`; add package script:

```json
"model-bakeoff": "node --import tsx/esm scripts/model-bakeoff.mts"
```

Preflight requires explicit run ID, pricing-manifest path, role-cap manifest, and both Keychain service/account references. It writes a canonical preflight file only under the new run root. Calling the CLI without `--mode real` can never reach transport code.

- [ ] **Step 6: Run focused tests and commit**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/model-bakeoff-pricing.test.ts test/model-bakeoff-preflight.test.ts test/model-catalog-audit.test.ts
npm run typecheck
npm run build
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- apps/pact-agent-host/src/model-bakeoff-pricing.ts apps/pact-agent-host/src/model-bakeoff-preflight.ts apps/pact-agent-host/test/model-bakeoff-pricing.test.ts apps/pact-agent-host/test/model-bakeoff-preflight.test.ts apps/pact-agent-host/scripts/model-bakeoff.mts apps/pact-agent-host/src/index.ts apps/pact-agent-host/package.json apps/pact-agent-host/package-lock.json
git commit -m "feat(cp03): add zero-call model bakeoff preflight"
```

---

### Task 3: Freeze the Exact Approval and Attempt Contracts

**Files:**

- Create: `packages/pact-cp03-contracts/schemas/bakeoff/model-bakeoff-approval.schema.json`
- Create: `packages/pact-cp03-contracts/schemas/bakeoff/model-bakeoff-attempt.schema.json`
- Create: `packages/pact-cp03-contracts/schemas/bakeoff/model-bakeoff-selection.schema.json`
- Modify: `packages/pact-cp03-contracts/src/index.js`
- Modify: `packages/pact-cp03-contracts/test/fixtures.js`
- Modify: `packages/pact-cp03-contracts/test/contracts.test.js`
- Create: `apps/pact-agent-host/src/model-bakeoff-gate.ts`
- Create: `apps/pact-agent-host/test/model-bakeoff-gate.test.ts`

- [ ] **Step 1: Add red shared-contract tests**

The approval must bind all of these fields:

```ts
export interface ModelBakeoffApproval {
  readonly schemaVersion: 'cp03-model-bakeoff-approval/0.1';
  readonly approvalId: string;
  readonly approvedAt: string;
  readonly runId: string;
  readonly planSha256: string;
  readonly preflightSha256: string;
  readonly fixtureManifestSha256: string;
  readonly promptManifestSha256: string;
  readonly schemaManifestSha256: string;
  readonly pricingManifestSha256: string;
  readonly candidates: readonly {
    readonly provider: 'deepseek' | 'gemini';
    readonly route: 'deepseek-official' | 'google';
    readonly model: string;
  }[];
  readonly repetitions: 2;
  readonly counts: {
    readonly intended: 28;
    readonly eligible: 28;
    readonly excluded: 0;
    readonly sent: 0;
    readonly plannedDispatches: 28;
    readonly maximumDispatches: 30;
  };
  readonly inputClasses: readonly [
    'fictional_text',
    'synthetic_spatial_image',
    'synthetic_scene_registry'
  ];
  readonly tokenCapsSha256: string;
  readonly keychainReferencesSha256: string;
  readonly retrySlots: { readonly deepseek: 1; readonly gemini: 1 };
  readonly worstCaseEstimatedUsd: number;
  readonly maxUsd: number;
  readonly oneRunOnly: true;
  readonly automaticRerun: false;
  readonly externalCapabilities: readonly [];
}
```

Attempt records bind case/attempt/sent ordinals, exact model/role/repetition/hashes, timestamps, complete latency, optional public-trace latency, usage, estimated cost, finish/refusal/error, side-effect acceptance, retry relation, tool/schema result, exact grounded input refs, redacted output hash, and session event range.

The selection contract contains blind packet hash, technical evidence hash, per-role selected blind label, author notes, signed timestamp, and `authorDecision: "SELECTED"`. It contains no model identity until deterministic unblinding.

- [ ] **Step 2: Add red exact-scope gate tests**

`authorizeModelBakeoff()` returns a zero-call refusal unless every approval field exactly matches preflight and fixed manifests. Test each mismatch independently, including cost cap below estimate, old timestamp, missing candidate, changed model order, changed token caps, changed Keychain refs, counts, retries, extra capability, and duplicate run directory.

```ts
export type ModelBakeoffAuthorization =
  | { readonly status: 'AUTHORIZED'; readonly approval: ModelBakeoffApproval }
  | {
      readonly status: 'REFUSED';
      readonly code: string;
      readonly mismatches: readonly string[];
      readonly providerRequestsMade: 0;
    };
```

- [ ] **Step 3: Run red tests, implement, and rerun**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/packages/pact-cp03-contracts
npx vitest run test/contracts.test.js
cd ../../apps/pact-agent-host
npx vitest run test/model-bakeoff-gate.test.ts
```

Expected before implementation: FAIL. After implementation: shared contracts and all mismatch/refusal tests PASS.

- [ ] **Step 4: Commit the approval boundary**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- packages/pact-cp03-contracts/schemas/bakeoff/model-bakeoff-approval.schema.json packages/pact-cp03-contracts/schemas/bakeoff/model-bakeoff-attempt.schema.json packages/pact-cp03-contracts/schemas/bakeoff/model-bakeoff-selection.schema.json packages/pact-cp03-contracts/src/index.js packages/pact-cp03-contracts/test/fixtures.js packages/pact-cp03-contracts/test/contracts.test.js apps/pact-agent-host/src/model-bakeoff-gate.ts apps/pact-agent-host/test/model-bakeoff-gate.test.ts
git commit -m "feat(cp03): gate exact model bakeoff approval"
```

---

### Task 4: Implement the Bounded Runner with Scripted Transport First

**Files:**

- Create: `apps/pact-agent-host/src/model-bakeoff-runner.ts`
- Create: `apps/pact-agent-host/test/model-bakeoff-runner.test.ts`
- Modify: `apps/pact-agent-host/src/index.ts`

- [ ] **Step 1: Add red dispatcher tests**

Define:

```ts
export interface ModelBakeoffTransport {
  dispatch(request: ModelBakeoffDispatchRequest): Promise<ModelBakeoffTransportResult>;
  dispose(): Promise<void>;
}

export async function runModelBakeoff(input: {
  readonly approval: ModelBakeoffApproval;
  readonly preflight: ModelBakeoffPreflight;
  readonly plan: readonly ModelBakeoffCase[];
  readonly transport: ModelBakeoffTransport;
  readonly now?: () => number;
}): Promise<ModelBakeoffRunResult>;
```

Scripted tests prove:

- exactly 28 accepted requests and no hidden stream on success;
- sent ordinal increments immediately before transport;
- maximum 30 cannot be exceeded;
- one pre-side-effect transport failure per provider may retry the same exact case once;
- a second retry for one provider is refused even if the other slot is unused;
- refusal/schema/content/grounding/late/accepted-side-effect failures do not retry;
- ConductorCommit is skipped when its same-model/repetition ConductorIntent dependency fails;
- independent cases may finish and archive, but every dependent unsent case is stopped;
- a global cost, approval, integrity, or dispatch-budget failure stops all unsent cases;
- no whole-run rerun or continuation method exists;
- `dispose()` always executes and partial attempt evidence survives failure.

- [ ] **Step 2: Run the red runner test**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/model-bakeoff-runner.test.ts
```

Expected: FAIL because the runner is absent.

- [ ] **Step 3: Implement deterministic scheduling and retry**

Execute cases serially in the frozen counterbalanced order so candidates do not contend for local/provider concurrency. Preserve planned ordinal on retry and assign a new sent ordinal/attempt ID. A transport result is retryable only when:

```ts
result.kind === 'transport_failure'
  && result.preSideEffect === true
  && result.sideEffectAccepted === false
  && !retryUsed.has(request.provider)
  && sentDispatches < 30;
```

All attempt records are append-only and immutable after finalization.

- [ ] **Step 4: Run focused tests and commit**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/model-bakeoff-runner.test.ts test/model-bakeoff-gate.test.ts
npm run typecheck
npm run build
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- apps/pact-agent-host/src/model-bakeoff-runner.ts apps/pact-agent-host/test/model-bakeoff-runner.test.ts apps/pact-agent-host/src/index.ts
git commit -m "feat(cp03): bound fixed-input bakeoff dispatches"
```

---

### Task 5: Add the Real DSH Transport Behind the Gate, Without Calling It

**Files:**

- Create: `apps/pact-agent-host/src/model-bakeoff-dsh-transport.ts`
- Create: `apps/pact-agent-host/test/model-bakeoff-dsh-transport.test.ts`
- Modify: `apps/pact-agent-host/scripts/model-bakeoff.mts`
- Modify: `apps/pact-agent-host/src/index.ts`

- [ ] **Step 1: Add red DSH transport tests using only scripted adapters**

Use the actual DSH session/agent/tool/attachment stack with a scripted LLM adapter. Test:

- exact route/model selection is assigned by case, never model self-report;
- same candidate/repetition Conductor intent and commit share one continuable session and continuity key;
- Archivist/Guardian use DeepSeek candidates and text/scene facts only;
- Witness/Rewriter use Gemini candidates and receive the one synthetic attachment plus exact `synthetic-spatial-image-01` reference;
- no other role receives image bytes;
- every role must call its exact existing council tool once;
- accepted tool payload passes the shared role schema before attempt success;
- output is cancelled after the accepted tool result and no settlement wake creates an undeclared stream;
- search, grounding, provider tools, file tools, and arbitrary code tools are unavailable;
- attempt records include DSH session event ranges and provider envelope facts;
- no repository/worktree path or credential appears in prompts/events/results.

- [ ] **Step 2: Run the red transport test**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/model-bakeoff-dsh-transport.test.ts
```

Expected: FAIL because the transport is absent.

- [ ] **Step 3: Implement candidate-scoped DSH harnesses**

Mount `LlmRuntime`, session persistence, tools, subagent runtime, the locked DeepSeek/pi-ai adapters, and a local attachment store containing only the generated synthetic image. Reuse `createFoundationHarness()` and existing council tool contracts where possible; do not add direct provider SDK calls.

Create one candidate/repetition harness scope. DeepSeek Conductor intent/commit share its conductor session; role probes use bounded children. Dispose and verify each scope before moving to the next candidate. Provider adapters use the approval-bound token limits, no SDK auto-retry, and a 12-second hard attempt timeout.

- [ ] **Step 4: Add Keychain-only real mode**

`--mode real` requires both preflight and approval files. Only after `authorizeModelBakeoff()` returns `AUTHORIZED` may it load values from the exact approval-bound Keychain service/account pairs using `/usr/bin/security ... -w`. It must delete inherited `DEEPSEEK_API_KEY` and `GEMINI_API_KEY` first, use the Keychain values only in the child runtime environment, never print/serialize them, and pass exact values to the post-run secret scan. There is no credential fallback.

The command requires the matching preflight run root, refuses when that root already contains a result/pending-result archive, uses a new exclusive pending-result directory, and atomically publishes the result archive only after evidence verification.

- [ ] **Step 5: Run local DSH tests and commit**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/model-bakeoff-dsh-transport.test.ts test/model-bakeoff-runner.test.ts test/council-runtime.test.ts test/provider-real-runner.test.ts
npm run typecheck
npm run build
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- apps/pact-agent-host/src/model-bakeoff-dsh-transport.ts apps/pact-agent-host/test/model-bakeoff-dsh-transport.test.ts apps/pact-agent-host/scripts/model-bakeoff.mts apps/pact-agent-host/src/index.ts
git commit -m "feat(cp03): wire gated DSH model bakeoff transport"
```

Expected: scripted/local PASS and `providerRequestsMade: 0`. Do not run `--mode real` in this task.

---

### Task 6: Verify Technical Evidence and Build the Blind Review Packet

**Files:**

- Create: `apps/pact-agent-host/src/model-bakeoff-evidence.ts`
- Create: `apps/pact-agent-host/src/model-bakeoff-blind-review.ts`
- Create: `apps/pact-agent-host/test/model-bakeoff-evidence.test.ts`
- Create: `apps/pact-agent-host/test/model-bakeoff-blind-review.test.ts`
- Create: `apps/scene-builder/scripts/capture-cp03-model-bakeoff.mjs`
- Modify: `apps/scene-builder/package.json`
- Modify: `apps/pact-agent-host/src/index.ts`

- [ ] **Step 1: Add red evidence-verifier tests**

For every attempt verify exact provider/route/model, role/repetition, all fixture/prompt/schema hashes, tool/schema acceptance, immutable bindings, complete latency, usage, estimated cost, finish/refusal/error, retry eligibility, redacted output hash, DSH event range, and archive/secret integrity.

Witness/Rewriter additionally require exact grounded use of `synthetic-spatial-image-01`; mentioning only generic image content is ineligible. A role/model pair is selectable only when both repetitions are technically eligible.

The report separates:

```ts
checks: {
  archive: 'PASS' | 'FAIL';
  approval: 'PASS' | 'FAIL';
  plan: 'PASS' | 'FAIL';
  dispatchBudget: 'PASS' | 'FAIL';
  contracts: 'PASS' | 'FAIL';
  grounding: 'PASS' | 'FAIL';
  timing: 'PASS' | 'FAIL';
  usageAndCost: 'PASS' | 'FAIL';
  dshTrace: 'PASS' | 'FAIL';
  secretScan: 'PASS' | 'FAIL';
}
```

Component latency may be compared, but the report states `fullCouncilTimingProven: false`; Stage B cannot claim the production 2.5/8/12 graph.

- [ ] **Step 2: Add red blinded-packet tests**

Use a cryptographically generated review seed stored only in the sealed mapping file. Produce per-role anonymous labels and two outputs per candidate. The visible packet omits model/provider/route, pricing, latency, token usage, attempt IDs, and label ordering clues.

Tests prove deterministic regeneration from the sealed mapping, no technically ineligible pair enters review, no label leaks identity, and no model choice is generated automatically.

The author form has five route decisions covering six dispatch roles: ConductorIntent and ConductorCommit are one continuity decision, plus Witness, Archivist, Rewriter, and Guardian. Each records the approved criteria: visible-evidence fidelity, spatial coherence, useful uncertainty, poetic/conceptual disturbance, seam/dissent preservation, provenance/rights discipline, and PACT visual-direction suitability.

- [ ] **Step 3: Implement verifier and packet builder**

Write redacted accepted output text into the review packet; keep raw provider envelopes only in the technical archive. Scan serialized content for forbidden field names and exact Keychain values before any file is published. If secret scan fails, persist only a non-secret failure report and do not write the raw archive.

- [ ] **Step 4: Implement the Stage B comparison capture surface**

`capture-cp03-model-bakeoff.mjs` opens the local blind-review HTML, displays the synthetic image, criteria, anonymous candidate outputs, and empty author decision controls. It captures a contact-sheet PNG and 20-45 second visible WebM. It must not unblind names or manufacture author selections.

- [ ] **Step 5: Run focused tests and commit the zero-call implementation**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/model-bakeoff-evidence.test.ts test/model-bakeoff-blind-review.test.ts test/model-bakeoff-runner.test.ts
npm run typecheck
npm run build
cd ../scene-builder
npm run build
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- apps/pact-agent-host/src/model-bakeoff-evidence.ts apps/pact-agent-host/src/model-bakeoff-blind-review.ts apps/pact-agent-host/test/model-bakeoff-evidence.test.ts apps/pact-agent-host/test/model-bakeoff-blind-review.test.ts apps/pact-agent-host/src/index.ts apps/scene-builder/scripts/capture-cp03-model-bakeoff.mjs apps/scene-builder/package.json
git commit -m "test(cp03): verify and blind model bakeoff evidence"
```

- [ ] **Step 6: Run the complete zero-call release gate**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/packages/pact-cp03-contracts
npm test
cd ../../apps/pact-agent-host
npm test
npm run typecheck
npm run build
cd ../scene-builder
npm test
npm run build
npm run test:cp03:audience
```

Expected: all PASS and no provider request. Update `docs/pact-cp03-progress.md` to `BAKEOFF_IMPLEMENTED_LOCAL_SCRIPTED / REAL_RUN_NOT_AUTHORIZED`, then run:

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- docs/pact-cp03-progress.md
git commit -m "docs(cp03): record local model bakeoff readiness"
git fetch origin codex/pact-cp03-agent-native
git merge-base --is-ancestor origin/codex/pact-cp03-agent-native HEAD
git push origin HEAD:codex/pact-cp03-agent-native
git rev-parse HEAD
git ls-remote origin refs/heads/codex/pact-cp03-agent-native
```

Require matching local/remote SHAs before asking for a paid run. If Ruby's branch diverged, reconcile and rerun affected gates before a normal push.

---

### Task 7: Produce a Fresh Eligible Preflight, Then Stop for Exact Paid Approval

**External boundary:** This task may read current official pricing pages and inspect named Keychain item presence, but it makes zero provider requests. Do not execute it merely because the implementation plan exists; begin only when the user asks to prepare the real bake-off.

- [ ] **Step 1: Refresh official price facts from primary sources**

Read the current official DeepSeek and Gemini pricing pages, record retrieval time, hash the relevant saved page extracts, and create the five-model pricing manifest. If a model lacks an unambiguous official rate, preflight is `NOT_ELIGIBLE`; do not infer a price.

- [ ] **Step 2: Create explicit role caps and Keychain references**

The role-cap manifest must set one input/output cap per role class, apply the same cap across all candidates for that role, remain within local catalog limits, and use no more than 32,768 input and 2,048 output tokens per dispatch. The Keychain manifest names exact service/account pairs and never contains a value.

- [ ] **Step 3: Generate one zero-call preflight**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
MODEL_BAKEOFF_RUN_ID="$(date -u +cp03-model-bakeoff-%Y%m%dT%H%M%SZ)"
MODEL_BAKEOFF_RUN_ROOT="/Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/checkpoints/cp03/model-bakeoff/$MODEL_BAKEOFF_RUN_ID"
npm run model-bakeoff -- --mode preflight --run-id "$MODEL_BAKEOFF_RUN_ID" --pricing-manifest "$MODEL_BAKEOFF_RUN_ROOT/preflight-inputs/pricing-manifest.json" --role-caps "$MODEL_BAKEOFF_RUN_ROOT/preflight-inputs/role-caps.json" --keychain-references "$MODEL_BAKEOFF_RUN_ROOT/preflight-inputs/keychain-references.json"
```

Expected before asking the user: `intended 28 / eligible 28 / excluded 0 / sent 0`, `planned 28 / maximum 30`, five exact catalog candidates, fresh pricing hash/estimate, both Keychain items present, and `providerRequestsMade: 0`.

- [ ] **Step 4: Stop and present the exact approval scope**

Present the complete preflight hashes, models/routes, role caps, Keychain references, retry contract, worst-case estimate, proposed USD ceiling, input classes, forbidden capabilities, one-run/no-rerun terms, and exact run ID. Request a fresh explicit approval. Do not create the approval record from implication, a prior Live Run approval, or a generic “continue”.

If `eligible` is below 28 or any fact changes after presentation, regenerate preflight and request approval again. No reduced batch is sent silently.

---

### Task 8: Execute One Approved Stage B Run and Archive Its Honest Result

**Authorization boundary:** Execute only after the user approves the exact Task 7 scope. One approval permits one run ID only.

- [ ] **Step 1: Materialize and verify the approval record**

Create the approval JSON from the user's exact approved facts, validate it with the shared schema, canonical-hash it, and call the gate in zero-call mode. Require `AUTHORIZED` before loading Keychain values.

- [ ] **Step 2: Run once with Keychain-only credentials**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
MODEL_BAKEOFF_RUN_ROOT="$(find /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/checkpoints/cp03/model-bakeoff -mindepth 1 -maxdepth 1 -type d -name 'cp03-model-bakeoff-*' | sort | tail -n 1)"
test -n "$MODEL_BAKEOFF_RUN_ROOT"
npm run model-bakeoff -- --mode real --preflight "$MODEL_BAKEOFF_RUN_ROOT/preflight.json" --approval "$MODEL_BAKEOFF_RUN_ROOT/approval.json"
```

Do not automatically rerun, resume, substitute a model, or increase budget. Persist partial redacted evidence on failure and stop dependent unsent dispatches.

- [ ] **Step 3: Verify technical evidence before any quality review**

Run the archive verifier and exact-value secret scan. Report actual intended/eligible/excluded/sent, attempts/retries, costs as estimates distinct from billing, all failures/refusals, and selectable role/model pairs. A failed archive remains `FAILED_ARCHIVED`; it is not repaired into a pass.

- [ ] **Step 4: Build and capture the blind packet only from eligible pairs**

Generate the anonymous review surface, contact sheet, and video. Do not show the sealed mapping. Stage B copy must state: `fixed-input bounded model-selection evidence; two repetitions; not a reliability benchmark; not a Ruby interaction`.

- [ ] **Step 5: Commit and push the Stage B technical archive**

Inspect every image/video, run size and secret/path scans, commit the exact run directory and progress update, fetch/reconcile Ruby, push normally, and verify local/remote SHA. A failed run may still be committed as failed evidence if it passes the secret scan; its status must remain failed.

---

### Task 9: Collect the Author's Blinded Selection and Approve One Routing Manifest

**Files:**

- Create: `apps/pact-agent-host/src/model-routing-selection.ts`
- Create: `apps/pact-agent-host/test/model-routing-selection.test.ts`
- Create after author routing approval: `apps/pact-agent-host/config/cp03-provider-routing.json`
- Modify: `apps/pact-agent-host/src/index.ts`
- Modify: `docs/pact-cp03-progress.md`

**Human boundary:** Codex may render the packet and validate form completeness. It may not score, choose, sign, or convert model output into the author's artistic judgment.

- [ ] **Step 1: Present the anonymous packet to the author**

The author reviews and signs five route decisions covering six dispatch roles—one shared Conductor intent/commit continuity decision plus Witness, Archivist, Rewriter, and Guardian—and adds explanatory notes. If no technically eligible candidate is artistically acceptable for a role, the decision is `NO_SELECTION`; routing remains pending and Stage C cannot proceed.

- [ ] **Step 2: Validate, freeze, and unblind only the signed decisions**

Validate `model-bakeoff-selection.schema.json`, bind it to technical evidence and blind packet hashes, then use the sealed mapping to resolve exact model IDs. Preserve the original blind labels and signed artifact.

- [ ] **Step 3: Build one authoritative routing manifest**

First add red tests proving an unsigned, incomplete, technically ineligible, wrong-packet, or `NO_SELECTION` record cannot produce routing. Then create `apps/pact-agent-host/config/cp03-provider-routing.json` in the existing `pact-cp03-provider-routing/0.1` shape. Conductor intent and commit must use the one author-selected continuity model. Fill `approvalId`, `approvedAt`, and `bakeoffEvidenceId`; keep `plannedDispatches: 6`, `maximumDispatches: 8`; include only selected, technically eligible exact routes/models/adapters/prompt hashes.

Add these exact functions in `model-routing-selection.ts`:

```ts
export function buildApprovedCriticalPathRouting(input: {
  readonly selection: ModelBakeoffSelection;
  readonly unblinding: ModelBakeoffUnblinding;
  readonly evidence: ModelBakeoffEvidenceReport;
  readonly routingApproval: RoutingApproval;
}): CriticalPathProviderRoutingManifest;

export function projectApprovedRoutingForCouncilRuntime(
  manifest: CriticalPathProviderRoutingManifest,
): ProviderRoutingManifest;
```

Tests must prove all identities, hashes, input classes, limits, concurrency, and Conductor continuity remain equal between source and projection.

- [ ] **Step 4: Stop for explicit routing approval**

Present the signed selection hash, unblinded role map, source manifest hash, derived projection hash, and technical limitations. The author must explicitly approve replacing `pending-bakeoff`. Until that approval, do not commit the production manifest or enable real audience processing.

- [ ] **Step 5: After approval, test, commit, fetch, and push**

Run:

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/model-routing-selection.test.ts test/critical-path-routing.test.ts test/council-routing.test.ts test/council-runtime.test.ts test/audience-image-lifecycle.test.ts
npm test
npm run typecheck
npm run build
cd ../scene-builder
npm test
npm run build
cd ../pact-agent-host
npx vitest run test/council-to-ruby.integration.test.js
```

Commit the author-approved manifest/selection/evidence by exact paths, update progress to `ROUTING_APPROVED`, fetch/reconcile Ruby, push normally, and verify remote SHA. This state is still not Stage C or checkpoint acceptance.

---

### Task 10: Build the Same-origin Agent-to-Ruby Loopback in Scripted Mode

**Files:**

- Create: `apps/pact-agent-host/src/cp03-loopback-protocol.ts`
- Create: `apps/pact-agent-host/src/cp03-loopback-server.ts`
- Create: `apps/pact-agent-host/test/cp03-loopback-server.test.ts`
- Create: `apps/pact-agent-host/scripts/serve-cp03.mts`
- Create: `apps/scene-builder/src/cp03/agent-bridge.js`
- Create: `apps/scene-builder/src/cp03/agent-bridge.test.js`
- Modify: `apps/scene-builder/src/main.js`
- Modify: `apps/scene-builder/index.html`
- Modify: `apps/scene-builder/src/styles.css`
- Modify both package scripts.

- [ ] **Step 1: Add red protocol and no-mutation failure tests**

Use same-origin endpoints:

```text
POST /api/cp03/cases
POST /api/cp03/cases/{caseId}/inputs
PUT  /api/cp03/cases/{caseId}/inputs/{inputRefId}/content
POST /api/cp03/cases/{caseId}/turns
GET  /api/cp03/cases/{caseId}/turns/{turnId}/events
POST /api/cp03/cases/{caseId}/proposals/{draftHash}/decision
POST /api/cp03/cases/{caseId}/receipts
POST /api/cp03/cases/{caseId}/turns/{turnId}/settle
POST /api/cp03/cases/{caseId}/receipts/{receiptId}/rollback
```

The host serves the built Scene Builder from the same loopback origin. Image envelope JSON and normalized WebP bytes use separate requests; the server verifies length/hash before admission. Server events expose durable role trace/proposal/dissent/decision facts but no raw model stream or image bytes.

Tests require reject/hash mismatch/deadline/Guardian/Gate/Ruby/receipt failures to produce no mutation or a verified rollback. A proposal cannot execute until the exact viewer decision is durable. The server never executes arbitrary model-authored code or raw transforms.

- [ ] **Step 2: Implement the bridge around existing authority**

The host runs `runCouncilRuntime()` with the approved derived manifest and returns a frozen `AgentActionDraft`. Scene Builder uses its existing `validateApprovalForDraft()`, Capability Gate, and Ruby interaction/effect functions. It posts the actual Ruby receipt and scene hashes back to the CaseSession ledger. Do not duplicate Ruby navigation, collision, ownership, animation, camera, render, receipt, replay, or rollback logic in Agent Host.

- [ ] **Step 3: Keep modes visibly separate**

Default remains `0-CALL LOCAL HARNESS`. Real loopback requires an explicit URL mode and displays `REAL DSH / ROUTING APPROVED` plus provider/model facts. No browser API key exists. Operator setup/reset/diagnostics remain separate from audience controls.

- [ ] **Step 4: Run a scripted vertical slice**

Use fictional text and the generated synthetic image with the scripted DSH adapter. Drive public trace, proposal, viewer approval, Gate, one real Ruby effect/interaction, receipt, replay, rollback, and settlement. Assert provider requests zero, but Ruby mutation and rollback are actual.

- [ ] **Step 5: Run all local gates, visually inspect, commit, and push**

Run contracts, host tests/typecheck/build, Scene Builder tests/build, scripted loopback Playwright, existing CP03 audience smoke, and council-to-Ruby integration. Capture local screenshots/video labelled `SCRIPTED PROVIDER / REAL RUBY / NOT STAGE C`. Commit exact files/evidence, fetch/reconcile Ruby, push normally, and verify remote SHA.

---

### Task 11: Run One Separately Approved Real Stage C Encounter

**Authorization boundary:** Routing approval does not authorize Stage C provider calls. Before dispatch, the user must separately select synthetic versus consented visitor image, approve exact text/image exposure, selected model map, `6 planned / 8 maximum`, Keychain references, token caps, fresh price estimate/USD ceiling, one turn, retry rules, capture scope, and no search/tools/generation.

- [ ] **Step 1: Freeze the discourse-source manifest before the encounter**

The author supplies or approves the exact project script/text and cited literature/artwork source records. Hash and freeze them in a discourse-source manifest. Codex may map correspondence but cannot invent citations, treat unsynchronized thread text as source truth, or convert AI commentary into the author's signed discourse judgment.

- [ ] **Step 2: Generate a zero-call Stage C preflight and stop for approval**

Report intended/eligible/excluded/sent, exact 6/8 route, input hashes/classes, consent state, scene/registry/asset/right hashes, prompt/schema hashes, pricing, Keychain references, and capture path. If any input or route changes, request approval again.

- [ ] **Step 3: Execute exactly one encounter**

Start visible same-origin Scene Builder, submit viewer text and the approved synthetic or consented normalized image, record honest role-attributed traces, freeze the proposal hash, wait for actual viewer approve/reject, then let deterministic Gate/Ruby execute only registered capabilities. Record first trace, complete draft, and hard-deadline facts. A miss/failure produces no mutation or rollback and remains failed evidence; no automatic rerun.

- [ ] **Step 4: Capture uninterrupted Stage C media**

`capture-cp03-representative-interaction.mjs` records:

1. input/consent and source boundary;
2. role-attributed trace and dissent;
3. exact proposal hash and viewer decision;
4. before 3D still;
5. actual Ruby mutation/interaction and receipt;
6. after 3D still;
7. replay evidence;
8. actual rollback to the exact before-scene hash;
9. end card with provider/models, timing facts, and evidence status.

If no archive consent exists, hide the input-image preview in checkpoint stills/video after settlement.

- [ ] **Step 5: Build and verify all five evidence classes**

Populate the existing checkpoint contract:

- interaction: viewer inputs, durable role trace, proposal, dissent, decision sequence;
- visual: before/after stills, continuous capture, mutation receipt, rollback capture;
- engineering: local scripted PASS, real provider run, DSH ledger, 2.5/8/12 facts, draft/scene/Gate/Ruby/replay/rollback hashes;
- provenance: exact providers/models/prompts/schemas/registry/assets/sources/licences/hashes;
- discourse: checkpoint copy, script correspondence, approved cited references, and disturbance account.

Run archive integrity and exact-value secret scans. Any missing class leaves status `BLOCKED`.

- [ ] **Step 6: Request separate human technical and artistic decisions**

Present the verified archive and media. The author separately records technical `PASS` or `FAIL` and artistic `KEEP`, `REVISE`, or `REJECT`. Codex may not fill these fields. Only technical `PASS` plus artistic `KEEP` can yield a checkpoint candidate.

- [ ] **Step 7: Commit/push the honest outcome; do not publish**

Commit a passing or failed reviewed archive with its exact status, fetch/reconcile Ruby, push normally, and verify remote SHA. Public release remains `NOT_REQUESTED` unless separately authorized. A pushed checkpoint candidate is not deployment or publication.

## Completion Boundary

This plan has three independently reportable completion levels:

1. `BAKEOFF_IMPLEMENTED_LOCAL_SCRIPTED`: Tasks 1-6 complete, zero provider calls, pushed so Ruby can sync.
2. `STAGE_B_MODEL_SELECTION_ARCHIVED`: Tasks 7-9 complete after exact paid approval and author selection; final routing separately approved and pushed.
3. `CP03_CHECKPOINT_CANDIDATE_COMPLETE`: Tasks 10-11 complete with a separately approved real encounter, actual Ruby mutation/replay/rollback, all five evidence classes, technical `PASS`, artistic `KEEP`, archive integrity, commit, and remote SHA.

None of these levels implies deployment or public release. If Stage B or Stage C fails, preserve and label the failed evidence; do not raise the claim ceiling or rerun without a new approval.
