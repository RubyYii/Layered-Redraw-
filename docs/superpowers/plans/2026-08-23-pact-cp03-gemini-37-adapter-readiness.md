# PACT CP03 Gemini 3.7 Adapter Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproducibly expose the exact `google/gemini-3.7-flash` catalog entry through the existing DSH `0.1.0-rc.6` adapter boundary, prove that fact without a provider request, and archive an honestly labelled Stage A screenshot, video, manifest, and copy packet.

**Architecture:** Keep every direct `@deepseek-ai/dsh-*` package pinned at `0.1.0-rc.6`; force only the transitive `@earendil-works/pi-ai` catalog package to exact `0.84.2` with npm `overrides`. Add a pure fail-closed catalog auditor around a keyless local DSH catalog inspection. A separate evidence builder records the dependency identity, canonical audit, complete local regression results, and a visible zero-network report surface. Nothing in this plan changes the production routing manifest or calls Gemini/DeepSeek.

**Tech Stack:** Node.js 22.19+; TypeScript 6; npm lockfile v3; Vitest 4; DSH `0.1.0-rc.6`; `@earendil-works/pi-ai` `0.84.2`; Playwright Core 1.62; visible Chrome; canonical JSON and SHA-256.

**Spec:** `/Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/docs/superpowers/specs/2026-08-23-pact-cp03-gemini-37-adapter-bakeoff-design.md`

**Plan status:** `implementation_not_started`

**Suite position:** Execute this plan first. The audience-image lifecycle and fixed-input bake-off plans depend on its exact package/catalog facts. Completing this plan proves engineering readiness only; it does not authorize or prove a provider call, image understanding, model quality, routing selection, Ruby mutation, or CP03 checkpoint acceptance.

## Global Constraints

- Make zero Gemini or DeepSeek requests. Do not resolve credentials or open an LLM stream.
- Keep all direct `@deepseek-ai/dsh-*` dependency strings at exact `0.1.0-rc.6`.
- Override only `@earendil-works/pi-ai` to exact `0.84.2`; do not migrate the DSH family or add another Gemini SDK.
- The only accepted model identity is route `google`, model `gemini-3.7-flash`, with declared `text` and `image` input. Reject aliases, duplicates, alternate routes, and silent fallback.
- Do not modify historical Live Run 01-03 code or archives.
- Keep both production routing representations at `pending-bakeoff`; catalog visibility is candidate readiness, not route approval.
- Preserve Ruby's 3D, camera, interaction, mutation, receipt, replay, and rollback implementation unchanged.
- Stage A copy must say exactly: `zero-network adapter verification; no model-quality result`.
- Stage A media must show the catalog report, not simulate an agent answer or a 3D mutation.
- Record `providerRequestsMade: 0` and verify no non-loopback browser requests during capture.
- Stage explicit files only. Never use `git add .` or `git add -A`.
- Commit each coherent task after its focused tests pass. Before push, fetch the collaboration branch; if the remote is not an ancestor of local `HEAD`, stop and reconcile Ruby's work before pushing. Never force-push.

## File Structure

### Modify

- `apps/pact-agent-host/package.json`: add the exact pi-ai override and Stage A scripts; leave direct DSH versions unchanged.
- `apps/pact-agent-host/package-lock.json`: lock the override resolution and integrity for pi-ai `0.84.2`.
- `apps/pact-agent-host/src/index.ts`: export the catalog audit and Stage A evidence contracts.
- `apps/scene-builder/package.json`: add the explicit Stage A capture script.
- `docs/pact-cp03-progress.md`: report Stage A only after the full local archive is generated and verified.

### Create

- `apps/pact-agent-host/src/model-catalog-audit.ts`: pure audit plus local DSH catalog source inspection.
- `apps/pact-agent-host/test/dependency-lock.test.ts`: exact dependency and lock invariants.
- `apps/pact-agent-host/test/model-catalog-audit.test.ts`: accepted and rejected catalog cases.
- `apps/pact-agent-host/src/adapter-readiness-evidence.ts`: canonical Stage A manifest and archive verifier.
- `apps/pact-agent-host/test/adapter-readiness-evidence.test.ts`: tamper, claim-ceiling, media, command, and zero-call checks.
- `apps/pact-agent-host/scripts/audit-gemini-37.mts`: stdout/file CLI for the keyless catalog audit.
- `apps/pact-agent-host/scripts/archive-adapter-readiness.mts`: local verification and Stage A archive orchestrator.
- `apps/scene-builder/scripts/capture-cp03-adapter-readiness.mjs`: visible Chrome screenshot/video capture of the audit report.

### Generate only after the implementation commit is clean

- `checkpoints/cp03/adapter-readiness/$ADAPTER_RUN_ID/catalog-audit.json`
- `checkpoints/cp03/adapter-readiness/$ADAPTER_RUN_ID/verification-results.json`
- `checkpoints/cp03/adapter-readiness/$ADAPTER_RUN_ID/evidence-manifest.json`
- `checkpoints/cp03/adapter-readiness/$ADAPTER_RUN_ID/README.md`
- `checkpoints/cp03/adapter-readiness/$ADAPTER_RUN_ID/media/catalog-capability.png`
- `checkpoints/cp03/adapter-readiness/$ADAPTER_RUN_ID/media/adapter-readiness.webm`

---

### Task 1: Lock the Minimal Compatibility-layer Override

**Files:**

- Create: `apps/pact-agent-host/test/dependency-lock.test.ts`
- Modify: `apps/pact-agent-host/package.json`
- Modify: `apps/pact-agent-host/package-lock.json`

- [ ] **Step 1: Add a red exact-lock test**

Read both JSON files from the package root and freeze these invariants:

```ts
const directDsh = Object.entries(pkg.dependencies)
  .filter(([name]) => name.startsWith('@deepseek-ai/dsh-'));

expect(directDsh.length).toBeGreaterThan(0);
expect(new Set(directDsh.map(([, version]) => version)))
  .toEqual(new Set(['0.1.0-rc.6']));
expect(pkg.overrides).toEqual({
  '@earendil-works/pi-ai': '0.84.2',
});
expect(lock.packages['node_modules/@deepseek-ai/dsh-llm-pi-ai'].version)
  .toBe('0.1.0-rc.6');
expect(lock.packages['node_modules/@earendil-works/pi-ai'].version)
  .toBe('0.84.2');
```

Also assert that no direct dependency named `@earendil-works/pi-ai`, `@google/generative-ai`, or another Gemini SDK was added.

- [ ] **Step 2: Run the red focused test**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/dependency-lock.test.ts
```

Expected: FAIL because the override is absent and the lock still resolves pi-ai `0.82.1`.

- [ ] **Step 3: Add the exact override and refresh the local installation**

Add this top-level package field without changing any direct DSH version:

```json
"overrides": {
  "@earendil-works/pi-ai": "0.84.2"
}
```

Then run:

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npm install --ignore-scripts
```

Expected: npm updates `package-lock.json` and the local `node_modules` resolution to exact pi-ai `0.84.2`; direct DSH packages remain `0.1.0-rc.6`.

- [ ] **Step 4: Prove the package graph and focused regression**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npm ls @deepseek-ai/dsh-llm-pi-ai @earendil-works/pi-ai
npx vitest run test/dependency-lock.test.ts test/provider-compatibility.test.ts
npm run typecheck
```

Expected: the dependency tree shows DSH pi-ai adapter `0.1.0-rc.6` and pi-ai `0.84.2`; tests and typecheck PASS. An npm install by itself is not the acceptance signal.

- [ ] **Step 5: Commit the dependency unit**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- apps/pact-agent-host/package.json apps/pact-agent-host/package-lock.json apps/pact-agent-host/test/dependency-lock.test.ts
git commit -m "build(cp03): lock Gemini 3.7 catalog adapter"
```

---

### Task 2: Build the Fail-closed Zero-network Catalog Audit

**Files:**

- Create: `apps/pact-agent-host/src/model-catalog-audit.ts`
- Create: `apps/pact-agent-host/test/model-catalog-audit.test.ts`
- Create: `apps/pact-agent-host/scripts/audit-gemini-37.mts`
- Modify: `apps/pact-agent-host/src/index.ts`
- Modify: `apps/pact-agent-host/package.json`

- [ ] **Step 1: Add red pure-audit tests**

Define one valid source fixture and mutations that must fail for:

- missing exact model;
- duplicate exact model;
- model ID `gemini-3.7-flash-latest`;
- provider/route other than `google`;
- missing `text` or `image` modality;
- non-positive or absent context/output limits;
- DSH adapter version other than `0.1.0-rc.6`;
- pi-ai catalog version other than `0.84.2`.

The public shape is:

```ts
export interface Gemini37CatalogSource {
  readonly dshAdapter: {
    readonly name: '@deepseek-ai/dsh-llm-pi-ai';
    readonly version: string;
  };
  readonly catalogPackage: {
    readonly name: '@earendil-works/pi-ai';
    readonly version: string;
  };
  readonly entries: readonly {
    readonly provider: string;
    readonly id: string;
    readonly name: string;
    readonly inputModalities: readonly string[];
    readonly contextWindow: number | null;
    readonly defaultMaxTokens: number | null;
  }[];
}

export interface Gemini37CatalogAudit {
  readonly schemaVersion: 'cp03-model-catalog-audit/0.1';
  readonly status: 'PASS' | 'FAIL';
  readonly route: 'google';
  readonly model: 'gemini-3.7-flash';
  readonly packages: Gemini37CatalogSource['dshAdapter'] & {
    readonly catalogName: '@earendil-works/pi-ai';
    readonly catalogVersion: string;
  };
  readonly capability: {
    readonly inputModalities: readonly string[];
    readonly contextWindow: number | null;
    readonly defaultMaxTokens: number | null;
  };
  readonly findings: readonly string[];
  readonly providerRequestsMade: 0;
  readonly auditSha256: string;
}
```

The hash is computed over the canonical report with `auditSha256` omitted; recomputation must be independently testable.

- [ ] **Step 2: Run the red audit test**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/model-catalog-audit.test.ts
```

Expected: FAIL because the module and exports do not exist.

- [ ] **Step 3: Implement the pure auditor and local source inspector**

Implement these exact public functions:

```ts
export function auditGemini37Catalog(
  source: Gemini37CatalogSource,
): Gemini37CatalogAudit;

export async function inspectInstalledGemini37Catalog():
  Promise<Gemini37CatalogSource>;

export function verifyGemini37CatalogAudit(
  audit: Gemini37CatalogAudit,
): { readonly status: 'PASS' | 'FAIL'; readonly findings: readonly string[] };
```

`inspectInstalledGemini37Catalog()` must mount `LlmRuntime` and the existing `@deepseek-ai/dsh-llm-pi-ai` plugin, call only `ctx.llm.listModels('google')`, and dispose the Cordis context in `finally`. Resolve each installed package entry with `createRequire().resolve()`, walk upward to the nearest `package.json`, and require its `name` to match before reading `version`; pi-ai does not export its `package.json` subpath. It must not inspect environment keys, call `resolveModelInfo` with an alias, or call `ctx.llm.stream`.

Audit acceptance is exactly:

```ts
const exact = source.entries.filter((entry) =>
  entry.provider === 'google' && entry.id === 'gemini-3.7-flash');

const pass = exact.length === 1
  && source.dshAdapter.version === '0.1.0-rc.6'
  && source.catalogPackage.version === '0.84.2'
  && exact[0]!.inputModalities.includes('text')
  && exact[0]!.inputModalities.includes('image')
  && Number.isInteger(exact[0]!.contextWindow)
  && exact[0]!.contextWindow! > 0
  && Number.isInteger(exact[0]!.defaultMaxTokens)
  && exact[0]!.defaultMaxTokens! > 0;
```

Do not change `catalog-eligibility.ts` semantics for historical runs. Shared helpers may be extracted only if all historical tests remain unchanged.

- [ ] **Step 4: Add a stdout-first CLI**

Add package script:

```json
"audit:gemini37": "node --import tsx/esm scripts/audit-gemini-37.mts"
```

The CLI supports only the optional `--output` argument. It prints canonical JSON, writes the same bytes only when an output path is explicit, exits `0` on audit PASS, exits `1` on audit FAIL, and never prints environment variables or package-local absolute paths.

- [ ] **Step 5: Run focused acceptance checks**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/dependency-lock.test.ts test/model-catalog-audit.test.ts test/provider-compatibility.test.ts
npm run audit:gemini37
npm run typecheck
npm run build
```

Expected: all tests PASS; CLI report has `status: "PASS"`, exact Google/model/package identities, valid limits, a recomputable hash, and `providerRequestsMade: 0`.

- [ ] **Step 6: Commit the audit unit**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- apps/pact-agent-host/src/model-catalog-audit.ts apps/pact-agent-host/test/model-catalog-audit.test.ts apps/pact-agent-host/scripts/audit-gemini-37.mts apps/pact-agent-host/src/index.ts apps/pact-agent-host/package.json apps/pact-agent-host/package-lock.json
git commit -m "feat(cp03): audit Gemini 3.7 catalog locally"
```

---

### Task 3: Build and Verify the Stage A Evidence Packet

**Files:**

- Create: `apps/pact-agent-host/src/adapter-readiness-evidence.ts`
- Create: `apps/pact-agent-host/test/adapter-readiness-evidence.test.ts`
- Create: `apps/pact-agent-host/scripts/archive-adapter-readiness.mts`
- Create: `apps/scene-builder/scripts/capture-cp03-adapter-readiness.mjs`
- Modify: `apps/pact-agent-host/src/index.ts`
- Modify: `apps/pact-agent-host/package.json`
- Modify: `apps/scene-builder/package.json`

- [ ] **Step 1: Add red archive-verifier tests**

Freeze this manifest contract:

```ts
export interface AdapterReadinessManifest {
  readonly schemaVersion: 'pact-cp03-adapter-readiness/0.1';
  readonly status: 'ENGINEERING_READY';
  readonly evidenceLevel: 'STAGE_A_ADAPTER_READINESS';
  readonly claimCeiling:
    'zero-network adapter verification; no model-quality result';
  readonly runId: string;
  readonly runtimeCommit: string;
  readonly generatedAt: string;
  readonly providerRequestsMade: 0;
  readonly nonLocalBrowserRequests: 0;
  readonly auditSha256: string;
  readonly verification: readonly {
    readonly id: 'contracts-test' | 'host-test' | 'host-typecheck' |
      'host-build' | 'scene-test' | 'scene-build';
    readonly status: 'PASS';
    readonly logPath: string;
    readonly logSha256: string;
  }[];
  readonly media: {
    readonly screenshot: { readonly path: string; readonly sha256: string };
    readonly video: { readonly path: string; readonly sha256: string };
  };
  readonly copyPath: string;
  readonly manifestSha256: string;
}
```

Tests must reject missing commands, a failed command, an absolute path, missing media, tampered hashes, provider requests greater than zero, a non-local browser request, wrong claim copy, and self-hash mismatch.

- [ ] **Step 2: Run the red evidence test**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/adapter-readiness-evidence.test.ts
```

Expected: FAIL because the evidence module is absent.

- [ ] **Step 3: Implement canonical evidence creation and verification**

Export:

```ts
export function createAdapterReadinessManifest(input: {
  readonly runId: string;
  readonly runtimeCommit: string;
  readonly generatedAt: string;
  readonly catalogAudit: Gemini37CatalogAudit;
  readonly verification: AdapterReadinessManifest['verification'];
  readonly media: AdapterReadinessManifest['media'];
  readonly copyPath: string;
  readonly nonLocalBrowserRequests: number;
}): AdapterReadinessManifest;

export function verifyAdapterReadinessManifest(
  manifest: AdapterReadinessManifest,
  files: ReadonlyMap<string, Uint8Array>,
): { readonly status: 'PASS' | 'FAIL'; readonly findings: readonly string[] };
```

Paths inside the manifest must be POSIX relative paths below the run root. Hash every referenced file from bytes, not from process exit codes or filenames.

- [ ] **Step 4: Implement the visible report capture**

`capture-cp03-adapter-readiness.mjs` accepts the named `--audit` and `--output-dir` arguments. It launches visible Chrome, uses `page.setContent()` with locally generated HTML, shows the exact model/route/modalities/limits/package versions/hash and claim ceiling, captures one PNG, and records one uninterrupted 18-second WebM while the rows are highlighted in order. It must attach the existing non-local request recorder logic and return:

```json
{
  "screenshot": "media/catalog-capability.png",
  "video": "media/adapter-readiness.webm",
  "nonLocalBrowserRequests": 0,
  "consoleErrors": []
}
```

Do not add the report surface to the artwork UI. This is an evidence renderer, not a visitor interaction.

- [ ] **Step 5: Implement the archive orchestrator**

Add package scripts:

```json
"archive:gemini37-readiness": "node --import tsx/esm scripts/archive-adapter-readiness.mts"
```

The orchestrator accepts one required `--run-id`, refuses a dirty Git tree, verifies `HEAD` is a 40-character commit, creates the fixed run root, runs the six verification commands in isolated child processes, records relative command IDs and complete logs, runs the audit CLI and visible capture, writes the exact README claim ceiling, builds the manifest, re-reads every output, and calls `verifyAdapterReadinessManifest()` before returning success. It must never inherit or print credential values and must not make provider requests.

- [ ] **Step 6: Run focused archive tests**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/model-catalog-audit.test.ts test/adapter-readiness-evidence.test.ts
npm run typecheck
npm run build
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/scene-builder
npm run build
```

Expected: focused tests, host typecheck/build, and Scene Builder build PASS.

- [ ] **Step 7: Commit the Stage A evidence machinery**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- apps/pact-agent-host/src/adapter-readiness-evidence.ts apps/pact-agent-host/test/adapter-readiness-evidence.test.ts apps/pact-agent-host/scripts/archive-adapter-readiness.mts apps/pact-agent-host/src/index.ts apps/pact-agent-host/package.json apps/pact-agent-host/package-lock.json apps/scene-builder/scripts/capture-cp03-adapter-readiness.mjs apps/scene-builder/package.json
git commit -m "feat(cp03): archive adapter readiness evidence"
```

---

### Task 4: Run the Full Local Regression and Record the Honest Progress State

**Files:**

- Modify: `docs/pact-cp03-progress.md`

- [ ] **Step 1: Run every local package gate with network-free inputs**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/packages/pact-cp03-contracts
npm test
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npm test
npm run typecheck
npm run build
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/scene-builder
npm test
npm run build
npm run test:cp03:audience
```

Expected: all tests/builds PASS; audience smoke reports `providerRequestsMade: 0` and `checkpointEligible: false`. If any historical Live Run test changes its expected archive or behavior, stop and repair non-drift before continuing.

- [ ] **Step 2: Update only evidence-backed progress statements**

Record:

- exact DSH/pi-ai versions;
- catalog audit locally passing with zero provider calls;
- test/build counts from this run;
- Stage A status `LOCAL_VERIFIED_PENDING_MEDIA_ARCHIVE` until Task 5 finishes;
- production route still `pending-bakeoff`;
- provider quality, human selection, Stage B, Stage C, formal checkpoint, deploy, and public release still not done.

- [ ] **Step 3: Commit the verified implementation state**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- docs/pact-cp03-progress.md
git commit -m "docs(cp03): record adapter readiness verification"
```

---

### Task 5: Generate, Inspect, Commit, and Push the Stage A Archive

**Files:**

- Generate: `checkpoints/cp03/adapter-readiness/$ADAPTER_RUN_ID/**`
- Modify: `docs/pact-cp03-progress.md`

- [ ] **Step 1: Generate the archive from a clean implementation commit**

Derive the run ID from UTC time and run exactly once in the same shell:

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
ADAPTER_RUN_ID="$(date -u +cp03-adapter-readiness-%Y%m%dT%H%M%SZ)"
npm run archive:gemini37-readiness -- --run-id "$ADAPTER_RUN_ID"
```

Expected: the six checks PASS, visible Chrome produces the PNG and 18-second WebM, audit and manifest hashes verify, browser non-local requests are zero, and provider requests remain zero.

- [ ] **Step 2: Inspect the actual media and archive boundaries**

Open the PNG and video. Confirm text is legible, no credential or unrelated local content is visible, the complete recording is uninterrupted, and the visual claim is only adapter readiness. Then run:

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
ADAPTER_RUN_DIR="$(find checkpoints/cp03/adapter-readiness -mindepth 1 -maxdepth 1 -type d -name 'cp03-adapter-readiness-*' | sort | tail -n 1)"
test -n "$ADAPTER_RUN_DIR"
find "$ADAPTER_RUN_DIR" -type f -size +25M -print
rg -n --hidden -i "api[_-]?key|authorization|bearer|private[_-]?key|access[_-]?token|/Users/|file://" "$ADAPTER_RUN_DIR"
```

Expected: both commands produce no output. If either produces output, do not commit the packet.

- [ ] **Step 3: Mark Stage A archived without raising the claim ceiling**

Update `docs/pact-cp03-progress.md` from `LOCAL_VERIFIED_PENDING_MEDIA_ARCHIVE` to `STAGE_A_ENGINEERING_READY_ARCHIVED`, link the run-relative manifest, and retain every explicit non-claim.

- [ ] **Step 4: Commit the exact packet**

Because root Git ignore excludes WebM globally, stage that one reviewed file explicitly with `-f`; stage every other generated file and the progress document by exact path:

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
ADAPTER_RUN_DIR="$(find checkpoints/cp03/adapter-readiness -mindepth 1 -maxdepth 1 -type d -name 'cp03-adapter-readiness-*' | sort | tail -n 1)"
test -n "$ADAPTER_RUN_DIR"
git add -- "$ADAPTER_RUN_DIR/catalog-audit.json" "$ADAPTER_RUN_DIR/verification-results.json" "$ADAPTER_RUN_DIR/evidence-manifest.json" "$ADAPTER_RUN_DIR/README.md" "$ADAPTER_RUN_DIR/media/catalog-capability.png" docs/pact-cp03-progress.md
git add -f -- "$ADAPTER_RUN_DIR/media/adapter-readiness.webm"
git commit -m "test(cp03): archive Gemini 3.7 adapter readiness"
```

- [ ] **Step 5: Synchronize with Ruby and push normally**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git fetch origin codex/pact-cp03-agent-native
git merge-base --is-ancestor origin/codex/pact-cp03-agent-native HEAD
git push origin HEAD:codex/pact-cp03-agent-native
git rev-parse HEAD
git ls-remote origin refs/heads/codex/pact-cp03-agent-native
```

Expected: the ancestor check returns success before push; the final local and remote 40-character SHAs are identical. If Ruby pushed a divergent tip, do not push; reconcile the two lines, rerun the affected local gates, then use a normal push.

## Completion Boundary

This plan is complete only when the exact override, zero-network audit, full local regression, screenshot, video, copy, manifest, commit, and remote SHA are all verified. The resulting state is `STAGE_A_ENGINEERING_READY_ARCHIVED`. It still leaves the following explicitly open:

- audience-image intake/consent/settlement implementation;
- any paid provider request;
- the 28 planned / 30 maximum model bake-off;
- blinded human artistic review and route selection;
- approved production `ProviderRoutingManifest`;
- representative 6/8 real council interaction;
- actual Ruby mutation/rollback media under the selected models;
- technical `PASS`, artistic `KEEP`, five-class checkpoint acceptance, deployment, or public release.
