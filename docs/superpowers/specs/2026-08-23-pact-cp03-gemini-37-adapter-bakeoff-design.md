# PACT CP03 Gemini 3.7 Adapter and Model Bake-off Design

**Status:** `author_approved`

**Decision date:** 2026-08-23

**Implementation status:** `not_started`

**Provider bake-off status:** `not_authorized`

**Final routing status:** `pending_bakeoff_and_human_selection`

**Collaboration baseline:** Before this document was written, local
`codex/pact-cp03-agent-native` and
`origin/codex/pact-cp03-agent-native` were exact at
`633d27fa10b8dd518115aaf984ad95847351f655`. The baseline already contains the
two-parent Ruby/council reconciliation merge `fef3a99`. This design preserves
Ruby's merged 3D, camera, interaction, delivery, mutation, receipt, replay, and
rollback path.

**Evidence boundary:** This document records an approved design. It does not
claim that the dependency upgrade is implemented, Gemini 3.7 is locally
verified in this repository, a real provider accepted a request, any candidate
met the `2.5/8/12s` timing boundaries, model quality was compared, a final
provider routing manifest was approved, a Ruby scene was mutated by a real
provider result, or CP03 checkpoint acceptance was reached.

## Approval Evidence

The author made and approved the following decisions in order:

1. selected approach `C`: upgrade the adapter path before the fixed-input
   model bake-off;
2. continued with the recommended minimal `C1` boundary, then approved
   Section 1 containing that exact boundary: keep the DSH family at
   `0.1.0-rc.6` and update only the pi-ai catalog dependency;
3. selected `V1`: visual models perform multimodal understanding only, not
   live image or 3D-asset generation;
4. approved Section 1, the minimal compatibility-layer architecture and Ruby
   boundary;
5. selected `R2`: audience images are ephemeral by default and enter the
   artwork archive only after separate, explicit archive consent;
6. approved Section 2, the image-input lifecycle and consent boundary;
7. approved Section 3, the isolated bake-off, failure, verification, and
   checkpoint-evidence design.

These approvals authorize this written design and its collaboration commit.
They do not authorize implementation, package installation, a provider call,
the 28/30 bake-off, real audience media processing, final model selection,
checkpoint acceptance, deployment, or public release.

## Context

The existing CP03 host deliberately pins the DeepSeek Harness package family
to `0.1.0-rc.6`. Its installed `@deepseek-ai/dsh-llm-pi-ai` adapter currently
resolves `@earendil-works/pi-ai` `0.82.1`. That catalog exposes Gemini 3.5 and
3.6 candidates but not Gemini 3.7.

A read-only inspection of the published `@earendil-works/pi-ai` `0.84.2`
package found a catalog entry for `gemini-3.7-flash` on the Google Generative
AI route, with text and image input declared. The DSH pi-ai adapter currently
declares `^0.82.1`; because this is a `0.x` range, it does not naturally admit
`0.84.2`. The approved minimal path therefore requires an explicit package
override and treats API compatibility as unproven until the complete local
adapter and repository regression suite passes. By contrast, upgrading the
entire DSH family to `0.1.1-rc.2` introduces a broader peer-dependency and
runtime migration, including a new authorization seam. That migration is not
needed to answer CP03's immediate model-selection question.

The current CP03 critical path already preserves:

- one persistent DSH `CaseSession`;
- parallel Conductor, Witness, Archivist, Rewriter, and Guardian shards;
- a minimal Conductor commit over durable shard hashes;
- deterministic non-creative assembly;
- viewer approval before the Capability Gate;
- fail-closed ScenePatch execution through Ruby's existing runtime;
- receipts, replay, rollback, evidence verification, and a formal checkpoint
  evidence contract;
- a production routing state that remains `pending-bakeoff`.

Live Run 01, Live Run 02, and Live Run 03 remain failed historical evidence.
None is a model bake-off, a compatibility pass, or permission to execute Live
Run 04.

## Problem

CP03 cannot responsibly freeze its final model map from the tiny failed live
samples or from an installed model catalog. The adapter must first expose the
current candidate in a controlled, reversible way, then the project must
compare fixed role/model assignments using identical synthetic inputs and
separate deterministic technical eligibility from the author's artistic
judgment.

The design must also prepare the multimodal input boundary without turning an
ordinary audience interaction into automatic permanent image donation. It
must preserve the existing authority split: agents interpret and propose;
viewer approval, deterministic validation, and Ruby's registered capabilities
control execution.

## Goals

- Make `gemini-3.7-flash` discoverable through the existing DSH pi-ai adapter
  without migrating the full DSH runtime family.
- Verify the installed model ID, provider route, input modalities, context and
  output capabilities, and adapter/catalog versions without network access.
- Add Gemini 3.7 only to the Witness/Rewriter bake-off candidate set; do not
  silently replace the production route.
- Keep DeepSeek text candidates for CaseConductor, Archivist, and Guardian.
- Define an audience-image lifecycle with separate model-processing and local
  archive consent.
- Build a new, isolated fixed-input bake-off boundary that cannot overwrite or
  reinterpret Live Run 01-03.
- Record schema/tool validity, multimodal grounding, complete-output latency,
  usage, estimated cost, refusals, transport failures, and human artistic
  review.
- Produce screenshot, video, and copy artifacts at each sub-checkpoint while
  labelling their evidence level honestly.
- Preserve the existing Ruby integration and the formal five-class CP03
  checkpoint contract.

## Non-goals

- Do not upgrade the DSH package family beyond `0.1.0-rc.6` in this change.
- Do not add DeepSeek's experimental visual route to this bake-off.
- Do not generate images, meshes, textures, or 3D assets during an audience
  turn.
- Do not crawl, download, license, register, or vector-index new assets.
- Do not send repository code, artwork assets, Ruby files, private files, or
  real audience data during adapter verification or the model bake-off.
- Do not change Ruby's navigation, camera, collision, ownership, interaction,
  animation, rendering, mutation, replay, or rollback implementation.
- Do not modify or reuse the historical Live Run 01-03 runner or archives.
- Do not execute the 28/30 provider bake-off from this design approval.
- Do not replace `pending-bakeoff` or freeze a final
  `ProviderRoutingManifest` before technical evidence and human selection.
- Do not treat catalog readiness, local tests, a provider receipt, or a fast
  sample as proof of artistic suitability or checkpoint completion.

## Decision 1: Minimal Compatibility-layer Upgrade

### Dependency boundary

The implementation will keep every direct `@deepseek-ai/dsh-*` dependency at
`0.1.0-rc.6`. It will use an exact npm `overrides` entry to force
`@earendil-works/pi-ai` to `0.84.2`, update the package lock, and prevent an
unreviewed floating catalog update. The override intentionally crosses the
adapter's declared `^0.82.1` range; a successful install is not sufficient
evidence of compatibility.

The dependency change is one reversible unit. If the catalog or regression
audit fails, the repository keeps the existing DSH/Ruby path and does not
advance the model-selection state.

### Installed capability audit

A zero-network audit must read the installed catalog and emit a canonical,
hashable report containing at least:

- exact model ID `gemini-3.7-flash`;
- provider ID and Google route;
- declared text and image input modalities;
- context-window and maximum-output capabilities;
- pi-ai package version;
- DSH pi-ai adapter package and version;
- the audit report's own schema version and SHA-256.

The audit fails closed if the model is absent, duplicated, routed through an
unexpected provider/API, lacks text or image input, has non-positive limits,
or comes from an unexpected package version. It must not silently substitute
Gemini 3.5, Gemini 3.6, an alias such as `latest`, or a gateway route.

### Candidate-only routing

Catalog readiness adds Gemini 3.7 only to the model bake-off candidate set.
It does not update the active production assignment. The intended candidate
role classes are:

- `gemini-3.5-flash`, `gemini-3.6-flash`, and `gemini-3.7-flash` for Witness
  and Rewriter;
- `deepseek-v4-pro` and `deepseek-v4-flash` for CaseConductor, Archivist, and
  Guardian.

Witness and Rewriter are the only candidates that receive image bytes.
CaseConductor, Archivist, and Guardian receive structured observations,
evidence references, snapshot bindings, and text.

## Decision 2: Multimodal Understanding, Not Live Generation

The approved visual capability is input understanding. The model may observe
spatial relations, visible objects, ambiguity, atmosphere, and possible visual
or camera intent. It may author typed Witness or Rewriter content. It may not
generate an image or 3D asset and inject it into the scene.

The authority flow remains:

```text
viewer text/image
  -> normalized input reference
  -> DSH role council
  -> AgentActionDraft
  -> viewer approval or rejection
  -> deterministic Capability Gate
  -> registered ScenePatch
  -> Ruby 3D runtime
  -> receipt, replay, and rollback evidence
```

Agents may emit only schema-valid creative fields and registered semantic
capability requests. Arbitrary JavaScript, shell, raw Three.js, filesystem
paths, unknown URLs, invented assets, invented licence facts, and permission
grants remain outside the runtime contract.

## Decision 3: Audience-image Lifecycle

### Separate consent decisions

An image interaction has two independent decisions:

1. `model_processing_consent`: permission to send the normalized image to the
   exact approved provider/model for this turn;
2. `archive_consent`: permission to preserve the normalized image in the local
   artwork archive after settlement.

Both default to false. Model-processing consent does not imply archive
consent. Viewer approval of a ScenePatch does not imply either consent.
Archive consent is per interaction and may not be inherited from a previous
turn. Synthetic bake-off fixtures do not impersonate audience consent; they
are admitted only under the separate, hash-bound provider-run approval and
retain `synthetic` provenance.

### Local normalization contract

One turn accepts at most one PNG, JPEG, or WebP image. The source upload is at
most 10 MiB and 24 decoded megapixels. Before any provider dispatch, the local
intake boundary must:

1. validate media type, byte size, and decoded pixel bounds;
2. apply the declared orientation;
3. remove EXIF, original filename, device, and location metadata;
4. resize to a longest edge no greater than 1536 pixels;
5. re-encode as a standard WebP no larger than 2 MiB;
6. compute a SHA-256 over the normalized bytes;
7. issue a stable turn-scoped `inputRefId` that contains no local path.

The durable `AudienceInputEnvelope` records the turn, media type, normalized
dimensions, byte count, content hash, transformation version, and both consent
states. DSH prompts and ledgers must not contain the original filename or a
local filesystem path.

### Role projection

The normalized attachment is available only to Witness and Rewriter when the
approved routing manifest declares image support for those roles. Witness
records observations with exact `inputRefId` anchors and uncertainty.
Rewriter uses those observations and the immutable scene snapshot to author
spatial, visual, camera, light, sound, poetic, and registered-capability
intent.

Other roles receive only the typed observations, hash/evidence references, and
scene/registry facts. The uploaded image is not automatically admitted to the
asset registry and cannot become a reusable scene asset during the turn.

### Settlement and archive behavior

- Without archive consent, the original and normalized bytes are removed after
  turn settlement. Durable evidence retains only the input class, hash,
  dimensions, consent decision, agent observations, draft/decision chain,
  execution receipts, and permitted checkpoint media.
- With archive consent, only the normalized derivative is retained. The
  original image is never retained by CP03. The archive entry includes a
  versioned consent receipt, transformation manifest, normalized content hash,
  CaseSession/turn IDs, and archive asset ID.
- If archive persistence fails, the interaction result may remain valid but
  the archive status is `ARCHIVE_FAILED`; no checkpoint may report that image
  as archived.
- When archive consent is absent, checkpoint capture must hide the image
  preview. It may show abstract role observations and the resulting 3D scene.

The real-audience image path remains disabled during adapter verification and
the synthetic fixed-input bake-off. Enabling it requires separately verified
consent UX, settlement cleanup, archive behavior, and an approved final model
route.

## Decision 4: Isolated Fixed-input Model Bake-off

### Separate runner and archive

The model bake-off receives a new schema, run identity, approval record,
preflight, runner, verifier, and archive root. Historical
`provider-real-runner.ts` behavior and Live Run 01-03 artifacts remain
unchanged and readable as historical evidence only.

The bake-off archive root is:

```text
checkpoints/cp03/model-bakeoff/<run-id>/
```

Creating a runner or zero-call preflight does not authorize a real run.

### Fixed candidate matrix

Every model/role pair receives two repetitions with identical versioned
inputs, prompt/schema versions, token caps, and scene/registry fixtures.

DeepSeek matrix:

- two models: `deepseek-v4-pro`, `deepseek-v4-flash`;
- CaseConductor continuity: intent plus minimal commit;
- Archivist shard;
- Guardian shard;
- `16` planned dispatches total.

Gemini matrix:

- three models: `gemini-3.5-flash`, `gemini-3.6-flash`,
  `gemini-3.7-flash`;
- Witness shard;
- Rewriter shard;
- `12` planned dispatches total.

The full bake-off therefore declares `28 planned / 30 maximum` dispatches.
Each provider receives one global pre-side-effect transport-retry slot. Retry
slots are not transferable, do not create creative turns, and cannot retry a
refusal, schema failure, content failure, accepted side effect, late result,
or human rejection. The run is never automatically repeated.

These counts belong only to the bake-off. A representative production council
turn remains `6 planned / 8 maximum`.

### Fixed inputs and data exposure

The bake-off uses only:

- fictional room/object text written for the test;
- one local programmatically generated synthetic spatial image;
- a synthetic SceneSnapshot;
- fixed registry, asset, spatial, rights, and rollback fixture IDs;
- versioned role prompts and council schemas.

It does not send repository content, artwork assets, collaborator files,
private files, real audience inputs, or archived visitor media. Search,
grounding, repository upload, external tools, and asset download remain off.

### Fresh approval requirements

Immediately before any real bake-off, a fresh exact approval must bind:

- run ID and approval timestamp;
- all five model IDs and provider routes;
- prompt, schema, fixture, and input hashes;
- two repetitions per model/role pair;
- `28 planned / 30 maximum` dispatches;
- intended, eligible, excluded, and sent counts;
- Keychain credential references without exposing values;
- per-request input/output limits;
- refreshed official pricing and a worst-case estimate;
- an explicit USD ceiling;
- the two bounded transport-retry slots;
- one run only, with no automatic rerun.

No default cost ceiling or prior Live Run approval carries into this bake-off.
Without a complete matching approval, the runner remains zero-call.

## Technical Eligibility and Human Selection

### Deterministic technical evidence

For every attempt, the verifier records and checks:

- provider, route, exact model, adapter, and catalog version;
- role, phase, repetition, fixture hashes, prompt hash, and schema version;
- schema/tool acceptance and exact role contract;
- image attachment acceptance and grounded `inputRefId` use where required;
- immutable snapshot, scene, registry, deadline, and routing bindings;
- complete-output latency and public-trace latency where applicable;
- input, output, and total token usage;
- estimated cost, explicitly marked distinct from billing;
- refusal, provider error, transport failure, cancellation, and late result;
- side-effect acceptance state and retry eligibility;
- redacted raw output hash and durable attempt receipt;
- archive integrity and credential/secret scan.

A technically ineligible output cannot be repaired by the assembler, silently
retried, or promoted by a high artistic score.

Two repetitions are a bounded selection sample, not a reliability study. The
result may compare candidates for this checkpoint but must not be presented as
a population-level latency or quality benchmark.

### Blinded human artistic review

Technically eligible outputs are copied into a blinded, randomized review
packet. Model names, providers, prices, and latency are hidden during the
author's first quality judgment. The author reviews:

- fidelity to visible evidence;
- spatial and object-relation coherence;
- useful ambiguity and uncertainty;
- poetic and conceptual disturbance;
- preservation of seams, contradiction, and dissent;
- provenance and rights discipline;
- suitability for PACT's blurred old-film, experimental-image, avant-garde,
  and poetic visual direction.

Automatic metrics may describe candidates but cannot choose the final route.
The final assignment requires the author's explicit role-by-role selection.
Only after that decision may a versioned `ProviderRoutingManifest` replace
`pending-bakeoff`.

## Failure Isolation

- A dependency or catalog audit failure leaves the existing DSH/Ruby runtime
  and routing manifest unchanged.
- A missing or mismatched model fails the audit; aliases and silent fallback
  are forbidden.
- Missing model-processing consent prevents an image dispatch. The viewer may
  explicitly choose a text-only turn instead.
- Invalid image normalization yields `NEEDS_CLARIFICATION` with no provider
  call.
- Witness failure blocks every claim or mutation that depends on the image.
- Rewriter, Archivist, Guardian, or Conductor failure blocks the affected
  proposal; deterministic code may not invent a substitute.
- A provider-run failure persists redacted partial evidence and stops every
  dependent unsent dispatch. It does not trigger a whole-run rerun.
- A failed or late draft never reaches viewer approval or Ruby mutation.
- A Capability Gate failure yields no Ruby mutation.
- Archive-integrity or secret-scan failure makes the provider evidence
  ineligible even if the model output looked correct.
- A passing bake-off does not update production routing until human selection
  and a separately approved manifest are recorded.

## Verification and Evidence Sequence

Evidence advances through separate gates:

1. **Dependency resolution:** exact DSH and pi-ai versions in package and lock
   files.
2. **Catalog audit:** zero-network canonical Gemini 3.7 capability evidence.
3. **Local contracts:** model-selection, modality, consent, normalization,
   role projection, settlement, archive, preflight, and failure tests.
4. **Repository regression:** Host tests, typecheck/build, contracts tests,
   Scene Builder tests/build, Ruby integration seam, and diff checks.
5. **Zero-call preflight:** exact candidate matrix, inputs, counts, routes,
   pricing facts, and refusal when approval is absent.
6. **Separately authorized real bake-off:** one bounded 28/30 run with
   receipts and a redacted archive.
7. **Human artistic review:** blinded role-by-role selection.
8. **Routing-manifest approval:** explicit replacement of `pending-bakeoff`.
9. **Representative real interaction:** final 6/8 council, viewer decision,
   Capability Gate, Ruby mutation, replay, and rollback.
10. **Formal checkpoint judgment:** all five evidence classes plus separate
    technical `PASS`, artistic `KEEP`, archive integrity, commit/push evidence,
    and any public-release decision.

No gate is inferred from a later-looking artifact. A screenshot is not a
provider receipt; a provider receipt is not model-quality approval; model
selection is not a Ruby mutation; a Ruby mutation is not checkpoint
acceptance; a pushed checkpoint candidate is not public release.

## Stage-specific Media and Copy

Each stage produces a video, screenshots, and explanatory copy, but with a
claim ceiling appropriate to that stage.

### A. Adapter Readiness sub-checkpoint

Archive:

- dependency and lock manifest;
- catalog audit JSON and SHA-256;
- local test/build results;
- one catalog/capability screenshot;
- a 15-30 second zero-network audit recording;
- copy stating: `zero-network adapter verification; no model-quality result`.

This is engineering readiness only.

### B. Fixed-input Bake-off sub-checkpoint

Archive:

- exact approval and preflight;
- input, fixture, prompt, and schema manifests/hashes;
- attempt receipts, timing, usage, estimated-cost, and failure tables;
- redacted raw-output hashes;
- blinded output packet and contact sheet;
- a recording of the comparison/review surface;
- the author's signed role-by-role selection and explanatory copy.

This is model-selection evidence only.

### C. Representative 3D Interaction checkpoint candidate

Only after a final routing manifest is approved, capture:

- viewer text and approved synthetic or consented image input;
- honest role-attributed trace, proposal, dissent, and decision sequence;
- before and after 3D stills;
- one uninterrupted video of approval, actual Ruby mutation, and rollback;
- DSH ledger, `2.5/8/12s` facts, draft/scene hashes, Capability Gate result,
  Ruby receipt, replay, and rollback evidence;
- provider/model, prompt/schema, registry, asset, source, licence, and hash
  provenance;
- checkpoint copy, script correspondence, cited literature/artworks, and an
  account of how those references disturbed the interaction or visual form.

Only Stage C may become a full CP03 checkpoint candidate, and only after the
existing five evidence classes—interaction, visual, engineering, provenance,
and discourse—pass together with independent technical `PASS` and artistic
`KEEP` decisions.

## Acceptance Criteria for Implementation

1. All direct DSH dependencies remain at `0.1.0-rc.6`, while the installed
   pi-ai version is reproducibly locked to `0.84.2`.
2. A zero-network canonical audit accepts the exact Gemini 3.7 Google catalog
   entry and rejects absent, aliased, wrong-provider, text-only, duplicate, or
   version-mismatched entries.
3. Gemini 3.7 is visible only as a Witness/Rewriter candidate; the production
   routing manifest remains `pending-bakeoff`.
4. DeepSeek remains text-only in this scope, and no DeepSeek visual profile is
   introduced.
5. Model-processing consent and archive consent are represented independently,
   default false, and enforced before dispatch and settlement respectively.
6. Normalization strips metadata and paths, produces a bounded WebP and hash,
   and rejects unsupported or oversized inputs before any provider call.
7. No-archive settlement retains non-raw evidence but not image bytes; consented
   archive settlement retains only the normalized derivative and a consent
   receipt.
8. Witness/Rewriter are the only roles that can receive image bytes; every
   image-derived claim carries an exact input reference.
9. Historical Live Run 01-03 runner behavior and archives remain unchanged.
10. A new zero-call bake-off preflight proves the five-model, two-repetition,
    `28 planned / 30 maximum` matrix and refuses incomplete approval.
11. Every failure path is tested to produce no unauthorized route change and
    no Ruby scene mutation.
12. Host tests/typecheck/build, contracts tests, Scene Builder tests/build,
    Ruby integration checks, and diff checks pass without network access.
13. Generated evidence contains no credential values, original filenames, or
    local audience-image paths.
14. Progress and checkpoint copy preserve the distinctions among design,
    implementation, local verification, provider run, human model selection,
    routing approval, Ruby execution, checkpoint acceptance, push, and public
    release.

## Risks and Trade-offs

- Pinning only pi-ai minimizes migration breadth but intentionally overrides
  the adapter's declared `^0.82.1` compatibility range and retains the DSH
  `rc.6` runtime. Full adapter and repository regressions are therefore a hard
  gate; failure returns the project to an architecture decision rather than
  triggering a silent full-DSH upgrade.
- Catalog capability declarations are necessary but not provider evidence.
  The fixed-input run must verify actual image/tool behavior.
- Two repetitions keep cost and exposure bounded but cannot establish general
  reliability. They support checkpoint routing selection only.
- Re-encoding images protects the lifecycle boundary but changes pixels. The
  transformation version and normalized hash make that change explicit.
- A faster model may be less artistically useful. Technical eligibility and
  blinded human judgment remain separate.
- Keeping live generation outside CP03 limits spontaneous asset creation but
  preserves rights, latency, visual consistency, and Ruby execution control.

## Explicitly Deferred Decisions

The following decisions are intentionally not made by this design and require
future explicit gates rather than placeholders:

- the final role-by-role model assignments;
- the exact live bake-off run ID, timestamp, Keychain references, token caps,
  refreshed prices, and USD ceiling;
- whether a representative interaction uses only a synthetic image or a real
  visitor image under the approved consent UI;
- technical `PASS`, artistic `KEEP`, formal checkpoint acceptance, and public
  release.
