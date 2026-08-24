# PACT CP03 Audience-image Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved V1/R2 image boundary: one locally normalized audience image may be understood only by Witness and Rewriter after exact model-processing consent; it is ephemeral by default and only its normalized derivative may enter the local artwork archive after separate archive consent.

**Architecture:** Normalize in the browser before any backend handoff, validate the resulting contract in the shared CP03 package, hold model-visible bytes in a turn-scoped in-memory DSH `AttachmentStore`, project them only to Witness/Rewriter, and settle them through a separate consent-aware archive sink. The Scene Builder UI exposes both decisions but keeps provider dispatch disabled while routing is `pending-bakeoff`. A local synthetic-image smoke proves the UI and cleanup boundary without external calls or real visitor media.

**Tech Stack:** JavaScript ESM; browser Canvas and `createImageBitmap`; Web Crypto SHA-256; JSON Schema 2020-12 with Ajv 8; TypeScript 6; DSH attachment interfaces `0.1.0-rc.6`; Vitest 4; Playwright Core 1.62; visible Chrome.

**Spec:** `/Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/docs/superpowers/specs/2026-08-23-pact-cp03-gemini-37-adapter-bakeoff-design.md`

**Plan status:** `implementation_not_started`

**Suite position:** Execute after the Gemini 3.7 adapter-readiness plan and before enabling any representative real audience turn. This plan deliberately ends with provider dispatch disabled. It proves local intake, consent, projection, settlement, and archive mechanics; it does not prove provider image understanding or Stage C.

## Global Constraints

- Make zero Gemini or DeepSeek requests and process no real audience image during implementation or evidence capture.
- Accept at most one PNG, JPEG, or WebP per turn; source bytes at most 10 MiB and decoded pixels at most 24 megapixels.
- Apply orientation, remove metadata through pixel re-rendering, resize longest edge to at most 1536, emit WebP at most 2 MiB, and hash the normalized bytes.
- Never retain or log the source upload, original filename, object URL, device/location metadata, base64, or local filesystem path.
- `model_processing_consent` and `archive_consent` are separate, default false, per turn, and versioned. ScenePatch approval implies neither.
- When processing consent is true, it must bind the exact approved Witness and Rewriter provider/route/model targets from a final routing manifest. Until that manifest exists, the UI processing control remains disabled and no image attachment is created for DSH.
- Only Witness and Rewriter may receive image bytes. CaseConductor, Archivist, Guardian, deterministic assembly, Capability Gate, and Ruby receive structured observations/hashes, never the bytes.
- The uploaded image never becomes a scene asset or asset-registry entry during the turn.
- Without archive consent, purge normalized bytes after settlement and retain only allowed metadata/evidence. With archive consent, retain only the normalized derivative and consent receipt. Original bytes are never archived.
- An archive write failure returns `ARCHIVE_FAILED`, purges the ephemeral copy, and cannot be reported as archived.
- Checkpoint/evidence capture hides image preview when archive consent is absent.
- Do not alter Ruby's 3D runtime, historical Live Run paths, production routing state, or checkpoint acceptance logic.
- Stage explicit task files only; never use `git add .` or `git add -A`. Fetch and reconcile Ruby before normal push; never force-push.

## File Structure

### Shared contracts

- Create `packages/pact-cp03-contracts/schemas/runtime/audience-image-input.schema.json`.
- Create `packages/pact-cp03-contracts/schemas/runtime/audience-image-settlement.schema.json`.
- Modify `packages/pact-cp03-contracts/src/index.js`.
- Modify `packages/pact-cp03-contracts/test/fixtures.js`.
- Modify `packages/pact-cp03-contracts/test/contracts.test.js`.

### Browser intake and UI

- Create `apps/scene-builder/src/cp03/audience-image-intake.js`.
- Create `apps/scene-builder/src/cp03/audience-image-intake.test.js`.
- Modify `apps/scene-builder/index.html`.
- Modify `apps/scene-builder/src/main.js`.
- Modify `apps/scene-builder/src/styles.css`.
- Modify `apps/scene-builder/scripts/smoke-test-cp03-audience.mjs`.
- Create `apps/scene-builder/scripts/capture-cp03-image-lifecycle.mjs`.
- Modify `apps/scene-builder/package.json`.

### Agent Host lifecycle

- Create `apps/pact-agent-host/src/audience-image-store.ts`.
- Create `apps/pact-agent-host/src/audience-image-lifecycle.ts`.
- Create `apps/pact-agent-host/test/audience-image-store.test.ts`.
- Create `apps/pact-agent-host/test/audience-image-lifecycle.test.ts`.
- Modify `apps/pact-agent-host/src/council-runtime.ts`.
- Modify `apps/pact-agent-host/src/provider-stream-ledger.ts` only to carry the already-supported opaque attachment ID on image-role assignments; do not change retry semantics.
- Modify `apps/pact-agent-host/src/index.ts`.

### Engineering evidence

- Create `apps/pact-agent-host/src/audience-image-evidence.ts`.
- Create `apps/pact-agent-host/test/audience-image-evidence.test.ts`.
- Create `apps/pact-agent-host/scripts/archive-audience-image-lifecycle.mts`.
- Generate `checkpoints/cp03/audience-image-lifecycle/$AUDIENCE_IMAGE_RUN_ID/` only from a clean verified implementation commit.
- Modify `docs/pact-cp03-progress.md` only after evidence exists.

---

### Task 1: Freeze Independent Consent, Normalized Input, and Settlement Contracts

**Files:**

- Create: `packages/pact-cp03-contracts/schemas/runtime/audience-image-input.schema.json`
- Create: `packages/pact-cp03-contracts/schemas/runtime/audience-image-settlement.schema.json`
- Modify: `packages/pact-cp03-contracts/src/index.js`
- Modify: `packages/pact-cp03-contracts/test/fixtures.js`
- Modify: `packages/pact-cp03-contracts/test/contracts.test.js`
- Modify: `apps/pact-agent-host/src/contract-types.ts`
- Modify: `apps/pact-agent-host/src/pact-contracts.d.ts`

- [ ] **Step 1: Add valid fixtures and red rejection tests**

Freeze one processing-denied/ephemeral fixture, one exact processing-target fixture, and all three settlement outcomes. Use this logical shape:

```ts
export interface AudienceImageInput {
  readonly schemaVersion: 'cp03-audience-image/0.1';
  readonly sourceClass: 'audience_image';
  readonly caseSessionId: string;
  readonly turnId: string;
  readonly inputRefId: string;
  readonly normalized: {
    readonly mediaType: 'image/webp';
    readonly width: number;
    readonly height: number;
    readonly byteLength: number;
    readonly sha256: string;
    readonly transformVersion: 'cp03-image-normalize/0.1';
  };
  readonly consent: {
    readonly modelProcessing: {
      readonly granted: boolean;
      readonly targets: readonly {
        readonly role: 'Witness' | 'Rewriter';
        readonly provider: 'gemini';
        readonly route: 'google';
        readonly model: string;
      }[];
      readonly decidedAt: string;
      readonly copyVersion: 'cp03-image-processing-consent/0.1';
    };
    readonly archive: {
      readonly granted: boolean;
      readonly decidedAt: string;
      readonly copyVersion: 'cp03-image-archive-consent/0.1';
    };
  };
  readonly originalRetained: false;
}

export interface AudienceImageSettlement {
  readonly schemaVersion: 'cp03-audience-image-settlement/0.1';
  readonly caseSessionId: string;
  readonly turnId: string;
  readonly inputRefId: string;
  readonly normalizedSha256: string;
  readonly status: 'PURGED' | 'ARCHIVED' | 'ARCHIVE_FAILED';
  readonly normalizedBytesRetained: boolean;
  readonly originalBytesRetained: false;
  readonly archiveAssetId: string | null;
  readonly consentReceiptSha256: string;
  readonly settledAt: string;
}
```

The schema must use `if/then` rules:

- processing false requires `targets: []`;
- processing true requires exactly two unique targets, one Witness and one Rewriter;
- `PURGED` and `ARCHIVE_FAILED` require no retained bytes and null archive ID;
- `ARCHIVED` requires retained normalized bytes and a non-null content-addressed archive ID.

Add rejection tests for a filename/path/base64 field, PNG after normalization, dimensions over 1536, byte length over 2 MiB, malformed hash, inherited/global consent, processing true without exact targets, duplicate role target, a non-Gemini visual target, original retention true, and contradictory settlement fields.

- [ ] **Step 2: Run the red contract suite**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/packages/pact-cp03-contracts
npx vitest run test/contracts.test.js
```

Expected: FAIL because schemas, fixtures, constants, and validators do not exist.

- [ ] **Step 3: Implement and export the schemas and validators**

Export:

```js
export const CP03_AUDIENCE_IMAGE_SCHEMA_VERSION = "cp03-audience-image/0.1";
export const validateAudienceImageInput = checked(
  "AudienceImageInput",
  validators.audienceImageInput,
);
export const validateAudienceImageSettlement = checked(
  "AudienceImageSettlement",
  validators.audienceImageSettlement,
);
```

Use `additionalProperties: false` at every object layer. Keep validator errors path-only so rejected image metadata is never echoed.

- [ ] **Step 4: Run contracts and dependent typechecks**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/packages/pact-cp03-contracts
npm test
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npm run typecheck
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/scene-builder
npx vitest run src/cp03/capability-gate.test.js
```

Expected: contracts PASS and existing approval/Gate behavior remains unchanged.

- [ ] **Step 5: Commit the contract unit**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- packages/pact-cp03-contracts/schemas/runtime/audience-image-input.schema.json packages/pact-cp03-contracts/schemas/runtime/audience-image-settlement.schema.json packages/pact-cp03-contracts/src/index.js packages/pact-cp03-contracts/test/fixtures.js packages/pact-cp03-contracts/test/contracts.test.js apps/pact-agent-host/src/contract-types.ts apps/pact-agent-host/src/pact-contracts.d.ts
git commit -m "feat(cp03): define audience image consent contracts"
```

---

### Task 2: Normalize and Hash One Image Entirely in the Browser

**Files:**

- Create: `apps/scene-builder/src/cp03/audience-image-intake.js`
- Create: `apps/scene-builder/src/cp03/audience-image-intake.test.js`

- [ ] **Step 1: Add red validation and transform tests**

Freeze these constants and public functions:

```js
export const CP03_IMAGE_LIMITS = Object.freeze({
  sourceBytes: 10 * 1024 * 1024,
  decodedPixels: 24_000_000,
  normalizedLongestEdge: 1536,
  normalizedBytes: 2 * 1024 * 1024,
  acceptedTypes: Object.freeze(["image/png", "image/jpeg", "image/webp"]),
});

export function validateAudienceImageSource({ type, size, width, height }) {}

export async function normalizeAudienceImage({
  file,
  caseSessionId,
  turnId,
  consent,
  decode,
  encodeWebp,
  digest,
}) {}
```

Unit tests inject decode/encode/digest functions and require:

- unsupported media and source byte excess fail before decode;
- 24 MP excess fails before encode;
- aspect-ratio-preserving dimensions never exceed 1536;
- quality attempts are deterministic: `0.86`, `0.78`, `0.70`, `0.62`;
- output larger than 2 MiB after the last attempt fails closed;
- output is WebP, hashed from returned bytes, and has a turn-scoped path-free `inputRefId`;
- returned durable data has no `file`, filename, data URL, object URL, EXIF, or local path;
- processing and archive consent remain independent.

- [ ] **Step 2: Run the red intake test**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/scene-builder
npx vitest run src/cp03/audience-image-intake.test.js
```

Expected: FAIL because the intake module is absent.

- [ ] **Step 3: Implement the injectable pure boundary**

Return this split result so raw bytes are never mixed into the durable envelope:

```js
return Object.freeze({
  envelope: validateAudienceImageInput({
    schemaVersion: "cp03-audience-image/0.1",
    sourceClass: "audience_image",
    caseSessionId,
    turnId,
    inputRefId,
    normalized: {
      mediaType: "image/webp",
      width,
      height,
      byteLength: bytes.byteLength,
      sha256,
      transformVersion: "cp03-image-normalize/0.1",
    },
    consent,
    originalRetained: false,
  }),
  normalizedBytes: bytes,
});
```

The default browser decode uses `createImageBitmap(file, { imageOrientation: "from-image" })`. The default encoder draws to a fresh canvas and uses `toBlob("image/webp", quality)`. Re-rendering through a new canvas is the metadata-removal boundary. Close the bitmap and revoke every temporary object URL in `finally`.

- [ ] **Step 4: Add a real browser normalization assertion to the CP03 smoke**

Generate a 320×180 PNG in memory whose ancillary metadata contains a fixed marker. In Playwright, select it through the actual file input, normalize it, then assert:

- output reports WebP and bounded dimensions/bytes;
- SHA-256 is 64 lowercase hex;
- normalized bytes do not contain the marker or source filename;
- no non-local request occurs.

Do not save the synthetic source image in the repository.

- [ ] **Step 5: Run focused tests and commit**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/scene-builder
npx vitest run src/cp03/audience-image-intake.test.js src/cp03/audience-runtime.test.js
npm run build
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- apps/scene-builder/src/cp03/audience-image-intake.js apps/scene-builder/src/cp03/audience-image-intake.test.js
git commit -m "feat(cp03): normalize audience images locally"
```

---

### Task 3: Add the Ephemeral DSH Store, Role Projection, and Consent-aware Settlement

**Files:**

- Create: `apps/pact-agent-host/src/audience-image-store.ts`
- Create: `apps/pact-agent-host/src/audience-image-lifecycle.ts`
- Create: `apps/pact-agent-host/test/audience-image-store.test.ts`
- Create: `apps/pact-agent-host/test/audience-image-lifecycle.test.ts`
- Modify: `apps/pact-agent-host/src/council-runtime.ts`
- Modify: `apps/pact-agent-host/src/provider-stream-ledger.ts`
- Modify: `apps/pact-agent-host/src/index.ts`

- [ ] **Step 1: Add red store and lifecycle tests**

Test a `TurnScopedAudienceAttachmentStore` with these public operations:

```ts
export class TurnScopedAudienceAttachmentStore extends AttachmentStore {
  readonly imageLimits: ImageAttachmentLimits;
  validateImage(input: SaveImageAttachment): Promise<void>;
  saveImage(input: SaveImageAttachment): Promise<ImageAttachmentRef>;
  readImage(ref: ImageAttachmentRef, signal?: AbortSignal):
    Promise<StoredImageAttachment>;
  purge(attachmentId: AttachmentId): boolean;
  purgeAll(): number;
  sweepExpired(nowMs: number): number;
  get retainedObjectCount(): number;
}
```

Require owner-process memory only, content-addressed opaque IDs, no `name`, exact byte/hash verification on read, one-image/2-MiB/1536-edge limits, defensive copies, abort propagation, a fixed 30-minute expiry, and zero retained objects after purge/expiry.

Then test the lifecycle API:

```ts
export interface PreparedAudienceImage {
  readonly envelope: AudienceImageInput;
  readonly attachment: ImageAttachmentRef;
  readonly messageBlock: { readonly type: 'image'; readonly attachment: ImageAttachmentRef };
}

export async function prepareAudienceImageForCouncil(input: {
  readonly envelope: AudienceImageInput;
  readonly normalizedBytes: Uint8Array;
  readonly routingManifest: ProviderRoutingManifest;
  readonly store: TurnScopedAudienceAttachmentStore;
}): Promise<PreparedAudienceImage>;

export function projectAudienceImageForRole(
  prepared: PreparedAudienceImage,
  role: CouncilRole,
): { readonly inputRefId: string; readonly messageBlock?: PreparedAudienceImage['messageBlock'] };

export async function settleAudienceImage(input: {
  readonly prepared: PreparedAudienceImage;
  readonly store: TurnScopedAudienceAttachmentStore;
  readonly archiveRoot: string;
  readonly settledAt: string;
}): Promise<AudienceImageSettlement>;
```

Red tests must prove:

- missing processing consent creates no attachment;
- consent targets must exactly match approved Witness/Rewriter assignments and image modality;
- Witness/Rewriter receive the same opaque image ref; every other role gets no message block;
- no-archive settlement purges bytes;
- consented archive saves only WebP normalized bytes with `saveImageFile`, emits a versioned receipt, then purges the transient copy;
- forced archive failure yields `ARCHIVE_FAILED` and still purges;
- retries, exceptions, cancellation, and repeated settlement do not leak bytes or produce duplicate archives;
- original filename/path cannot enter the prompt, store, receipt, or session projection.

- [ ] **Step 2: Run the red host tests**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/audience-image-store.test.ts test/audience-image-lifecycle.test.ts
```

Expected: FAIL because the lifecycle modules do not exist.

- [ ] **Step 3: Implement the turn-scoped store and archive sink**

Use `validateImageFile()` from `@deepseek-ai/dsh-attachment-local` for full raster admission. The in-memory map stores a private copy keyed by `sha256:` ID. Use `saveImageFile()` only for the separately consented archive root; never use the durable DSH local store for default-ephemeral bytes.

Generate the consent receipt hash from canonical JSON containing only:

```ts
{
  schemaVersion: 'cp03-image-archive-consent/0.1',
  caseSessionId,
  turnId,
  inputRefId,
  normalizedSha256,
  archiveConsent: true,
  decidedAt,
  settledAt,
  archiveAssetId,
}
```

If the archive operation throws, purge first, then return `ARCHIVE_FAILED`; never return a partial archive ID.

- [ ] **Step 4: Project the attachment only into Witness/Rewriter DSH prompts**

Extend `CouncilRuntimeOptions` with optional `audienceImage: PreparedAudienceImage`. Extract a pure helper and test it directly:

```ts
export const contentForCouncilRole = (
  turn: FrozenCouncilTurn,
  role: CouncilRole,
  audienceImage?: PreparedAudienceImage,
): ContentBlock[] => {
  const content = shardPrompt(turn, role);
  if (audienceImage === undefined) return content;
  const projected = projectAudienceImageForRole(audienceImage, role);
  return projected.messageBlock === undefined
    ? content
    : [...content, projected.messageBlock];
};
```

Set `ProviderStreamAssignment.attachmentId` only for Witness/Rewriter assignments. CaseConductor commit receives the durable Witness/Rewriter typed shard projections after the parallel wave, not raw bytes. Add tests that enumerate all six dispatches and find exactly two image-bearing assignments.

- [ ] **Step 5: Run focused and historical regressions**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/audience-image-store.test.ts test/audience-image-lifecycle.test.ts test/council-runtime.test.ts test/council-routing.test.ts test/provider-real-runner.test.ts
npm run typecheck
npm run build
```

Expected: all PASS; historical runner remains unchanged; no provider request occurs.

- [ ] **Step 6: Commit the host lifecycle**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- apps/pact-agent-host/src/audience-image-store.ts apps/pact-agent-host/src/audience-image-lifecycle.ts apps/pact-agent-host/test/audience-image-store.test.ts apps/pact-agent-host/test/audience-image-lifecycle.test.ts apps/pact-agent-host/src/council-runtime.ts apps/pact-agent-host/src/provider-stream-ledger.ts apps/pact-agent-host/src/index.ts
git commit -m "feat(cp03): enforce ephemeral audience image lifecycle"
```

---

### Task 4: Add the Fail-closed Consent UI and Local Synthetic-image Smoke

**Files:**

- Modify: `apps/scene-builder/index.html`
- Modify: `apps/scene-builder/src/main.js`
- Modify: `apps/scene-builder/src/styles.css`
- Modify: `apps/scene-builder/scripts/smoke-test-cp03-audience.mjs`
- Create: `apps/scene-builder/scripts/capture-cp03-image-lifecycle.mjs`
- Modify: `apps/scene-builder/package.json`

- [ ] **Step 1: Add UI elements without enabling provider dispatch**

Add to the existing CP03 panel:

- one hidden file input accepting only PNG/JPEG/WebP;
- choose/replace/remove controls;
- normalized preview and path-free facts (dimensions, bytes, short hash);
- a model-processing consent checkbox, disabled while route is `pending-bakeoff`;
- independent archive-consent checkbox, default false;
- exact target summary area showing no targets until a final manifest exists;
- visible boundary copy: `本地归一化与同意界面；模型路线待选择，图片不会发送。`;
- settlement status with `PURGED`, `ARCHIVED`, `ARCHIVE_FAILED`, or `NOT_DISPATCHED`.

Do not place original filename in visible text, DOM data attributes, exported JSON, or diagnostics.

- [ ] **Step 2: Integrate browser intake with the existing local harness**

Store only the normalized result in the transient `cp03Session` state. Existing `buildLocalScriptedProposal()` remains text-only and must not claim to have interpreted the image. When routing is pending:

```js
cp03Session.imagePolicy = Object.freeze({
  routingStatus: "pending-bakeoff",
  providerDispatchEnabled: false,
  modelProcessingTargets: Object.freeze([]),
});
```

After reject, apply, reset, remove, or page teardown, revoke preview URLs and clear normalized bytes. If archive consent is absent, evidence snapshot exposes only hash/dimensions/consent and `previewVisible: false` after settlement.

- [ ] **Step 3: Extend the browser smoke with synthetic data only**

The smoke must assert:

- all existing five local actions still produce five Ruby-linked effects and zero provider calls;
- model-processing consent is disabled and default false;
- archive consent is independent and default false;
- locally generated metadata-bearing PNG normalizes to bounded WebP;
- the original marker/name never appears in DOM or exported engineering evidence;
- settling without archive consent removes preview and normalized bytes;
- a second turn starts clean;
- desktop and 390×844 layouts contain all consent controls;
- no non-local browser requests or console errors occur.

- [ ] **Step 4: Add the visible lifecycle evidence capture**

`capture-cp03-image-lifecycle.mjs` reuses visible Chrome recording. It records one uninterrupted sequence:

1. pending-route/disabled-processing boundary;
2. local synthetic image selection and normalization facts;
3. archive checkbox remaining independent;
4. text-only local proposal and exact hash approval;
5. Ruby local effect receipt;
6. settlement with preview hidden and status `NOT_DISPATCHED`/`PURGED`;
7. explanatory end card: `local consent and cleanup verification; no provider understanding result; not Stage C`.

Capture at least three stills and a 20-35 second WebM. The capture cannot use real audience media.

- [ ] **Step 5: Run the UI gate and inspect screenshots**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/scene-builder
npm test
npm run build
npm run test:cp03:audience
```

Expected: tests/build/smoke PASS; report has zero provider and non-local requests. Open the desktop/mobile screenshots and verify controls are legible and no preview remains after no-archive settlement.

- [ ] **Step 6: Commit the UI unit**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- apps/scene-builder/index.html apps/scene-builder/src/main.js apps/scene-builder/src/styles.css apps/scene-builder/scripts/smoke-test-cp03-audience.mjs apps/scene-builder/scripts/capture-cp03-image-lifecycle.mjs apps/scene-builder/package.json
git commit -m "feat(cp03): add fail-closed image consent UI"
```

---

### Task 5: Archive the Image-lifecycle Engineering Evidence and Push

**Files:**

- Create: `apps/pact-agent-host/src/audience-image-evidence.ts`
- Create: `apps/pact-agent-host/test/audience-image-evidence.test.ts`
- Create: `apps/pact-agent-host/scripts/archive-audience-image-lifecycle.mts`
- Modify: `apps/pact-agent-host/src/index.ts`
- Modify: `apps/pact-agent-host/package.json`
- Modify: `docs/pact-cp03-progress.md`
- Generate: `checkpoints/cp03/audience-image-lifecycle/$AUDIENCE_IMAGE_RUN_ID/**`

- [ ] **Step 1: Add a red evidence verifier**

Require a manifest that binds:

- implementation commit and run ID;
- shared contract, host, Scene Builder unit/type/build results;
- browser smoke report and zero-request facts;
- exact normalized synthetic hash and transform version;
- processing false, archive false, no targets, no original retention;
- transient store retained count zero after settlement;
- screenshot/video/copy file hashes;
- claim ceiling `local consent and cleanup verification; no provider understanding result; not Stage C`.

Reject any manifest or referenced file containing original names, absolute paths, base64, credential fields/values, retained raw bytes, a provider request, an `ARCHIVED` claim without an actual archive receipt, or a Stage C/checkpoint-complete claim.

- [ ] **Step 2: Implement and focused-test the evidence builder**

The archive script must refuse a dirty tree, run the three package gates, invoke the visible capture, hash each output, verify the archive from bytes, and write only relative paths. Add:

```json
"archive:audience-image-lifecycle": "node --import tsx/esm scripts/archive-audience-image-lifecycle.mts"
```

Run:

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
npx vitest run test/audience-image-evidence.test.ts test/audience-image-lifecycle.test.ts
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 3: Commit evidence machinery, then run the complete local gate**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git add -- apps/pact-agent-host/src/audience-image-evidence.ts apps/pact-agent-host/test/audience-image-evidence.test.ts apps/pact-agent-host/scripts/archive-audience-image-lifecycle.mts apps/pact-agent-host/src/index.ts apps/pact-agent-host/package.json apps/pact-agent-host/package-lock.json
git commit -m "test(cp03): verify audience image lifecycle evidence"
cd packages/pact-cp03-contracts
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

Expected: every local package gate PASS with zero provider requests.

- [ ] **Step 4: Generate and visually inspect one evidence run**

Run from a clean tree:

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03/apps/pact-agent-host
AUDIENCE_IMAGE_RUN_ID="$(date -u +cp03-audience-image-%Y%m%dT%H%M%SZ)"
npm run archive:audience-image-lifecycle -- --run-id "$AUDIENCE_IMAGE_RUN_ID"
```

Open every generated still and the WebM. Confirm the route remains pending, processing is visibly disabled, the image is synthetic, the preview disappears, and the end card preserves the claim ceiling.

- [ ] **Step 5: Update progress and commit the reviewed packet**

Record `AUDIENCE_IMAGE_LIFECYCLE_LOCAL_VERIFIED_ROUTE_DISABLED`; do not report real visitor intake, provider understanding, or Stage C. Resolve the one generated run directory and stage only its named files. Force-add only its reviewed WebM because of the root ignore rule.

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
AUDIENCE_IMAGE_RUN_DIR="$(find checkpoints/cp03/audience-image-lifecycle -mindepth 1 -maxdepth 1 -type d -name 'cp03-audience-image-*' | sort | tail -n 1)"
test -n "$AUDIENCE_IMAGE_RUN_DIR"
find "$AUDIENCE_IMAGE_RUN_DIR" -type f -size +25M -print
rg -n --hidden -i "api[_-]?key|authorization|bearer|private[_-]?key|access[_-]?token|/Users/|file://|data:image" "$AUDIENCE_IMAGE_RUN_DIR"
git add -- "$AUDIENCE_IMAGE_RUN_DIR/manifest.json" "$AUDIENCE_IMAGE_RUN_DIR/report.json" "$AUDIENCE_IMAGE_RUN_DIR/README.md" "$AUDIENCE_IMAGE_RUN_DIR/media/01-route-disabled.png" "$AUDIENCE_IMAGE_RUN_DIR/media/02-normalized.png" "$AUDIENCE_IMAGE_RUN_DIR/media/03-purged.png" docs/pact-cp03-progress.md
git add -f -- "$AUDIENCE_IMAGE_RUN_DIR/media/audience-image-lifecycle.webm"
git commit -m "test(cp03): archive audience image lifecycle"
```

Expected: size and sensitive-content scans produce no output before staging.

- [ ] **Step 6: Fetch Ruby, push normally, and verify remote truth**

```bash
cd /Users/yhryzy/Documents/ChatGPT/.worktrees/layered-redraw-pact-cp03
git fetch origin codex/pact-cp03-agent-native
git merge-base --is-ancestor origin/codex/pact-cp03-agent-native HEAD
git push origin HEAD:codex/pact-cp03-agent-native
git rev-parse HEAD
git ls-remote origin refs/heads/codex/pact-cp03-agent-native
```

Expected: remote is an ancestor before push and final local/remote SHAs match. If Ruby's branch diverged, reconcile and rerun affected gates before a normal push.

## Completion Boundary

Completion means shared contracts, browser normalization, ephemeral DSH storage, exact role projection, both settlement branches, disabled consent UI, synthetic browser evidence, full local regressions, commit, and remote SHA are verified. The state is `AUDIENCE_IMAGE_LIFECYCLE_LOCAL_VERIFIED_ROUTE_DISABLED`, not a live visitor feature.

The next plan may use only synthetic input for the isolated bake-off. Real audience-image processing remains disabled until all of these exist together: a technically eligible bake-off, the author's role-by-role selection, an approved final routing manifest, a loopback integration gate, and a separately approved representative Stage C encounter.
