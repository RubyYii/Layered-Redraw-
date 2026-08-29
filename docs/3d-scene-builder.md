# Experimental 3D Scene Builder

`apps/scene-builder` is a local-first Three.js application for turning a screenplay into an inspectable blockout, cinematic timeline, and deterministic video render. It is an incubation surface inside Layered Redraw, not a claim that 2D semantic layers have become a full game engine.

## Runtime layers

1. **Scene schema** — versioned JSON stores stable object IDs, parent relationships, transforms, render metadata, entity capabilities, motion profiles, asset bindings, and semantic interaction anchors.
2. **Director** — absolute-time clips evaluate movement, rotation, visibility, attachments, dialogue, cameras, and interactions without mutating source project data.
3. **Motion** — minimum-jerk easing and arc-length path sampling prevent abrupt acceleration and uneven speed across control points. Path tangents drive root yaw, lean, and bank.
4. **Interaction simulation** — preview advances through a 60Hz fixed-step clock. Ownership clips perform legal `claim`, `transfer`, and `release` transitions; item roots are solved from character hold, item grip, and placement-surface anchors. Invalid transitions are reported instead of silently teleporting a prop. Semantic interaction remains deterministic kinematics even when unconstrained dynamic props use Rapier.
5. **Collision and rigid bodies** — deterministic capsule/box proxies remain the audit layer for authored interaction milestones. Separately, preview lazily loads the real Rapier WASM world when a `dynamic` body exists and steps gravity, colliders, mass, friction, restitution, damping, and CCD at 60Hz. A timeline-controlled or owned dynamic body becomes kinematic for that frame so physics cannot fight the semantic authority chain.
6. **Renderer/editor** — Three.js groups preserve character hierarchy; gray-box effectors still use explicit surface contact and telescoping arms, while imported mapped rigs solve four world-space two-bone CCD limb chains plus distributed chest/neck/head gaze. Non-locomotion states can capture both foot effectors as world-space locks. Timeline hand, gaze, and foot updates are batched into one solve pass per actor per frame. Interactive solving transitions one iteration at a time between distance/visibility budgets; selected actors and `renderQuality=full` stay at eight iterations so fixed-step output never inherits preview LOD. Cached camera position/look-at curves avoid rebuilding Catmull–Rom data every frame. Preview transforms bypass material work, timeline highlighting is incremental, and measured frame pacing can lower pixel ratio and temporarily simplify shadows/local lights on weak or software renderers.
7. **Asset runtime** — a local OBJ or self-contained GLB can replace a selected placeholder without non-uniformly distorting the source. OBJ provides static geometry. GLB can additionally provide skins, bones, animation clips, morph targets, four humanoid limb-IK chains, gaze control, foot locks, and a target for imported animation-GLB retargeting. A portable universal rig profile can also declare arbitrary named chains, semantic effectors, capabilities, and ball/hinge/twist limits; `setAssetChainIk` resolves those chains against the actual GLB hierarchy and runs multi-segment CCD with the authored local limits. Every target is constrained to a world-scale reachable annulus with a small straight-chain singularity margin; zero-length and non-finite chains are rejected without writing invalid rotations. Per-chain diagnostics expose validity and runtime state. A 25-slot searchable human bone-map editor persists explicit bindings (including intentional unmapping), while generated non-human rigs retain their independent semantic profile. `AnimationMixer` crossfades between semantic states; a phase-aware performance profile adds bounded two-hand contact planning, foot-lock/gaze policy and deterministic semantic Morph cues while preserving explicit expression overrides. The model and optional animation source are persisted by SHA-256 rather than remaining only in memory.
8. **Spatial bridge runtime** — a selected carrier can load a Layered Redraw project folder containing `spatial-bridge.json`. The importer resolves the declared RGB and near-white depth-preview paths, verifies both SHA-256 digests, checks dimensions and hard relative-depth invariants, then creates an aspect-preserving textured height field. The bridge, RGB, and depth bytes enter the same content-addressed asset store, but the surface remains non-metric and is never silently added to collision or navigation data.
9. **Single-image model runtime** — the asset inspector accepts one PNG/JPEG/WebP, downsizes it locally, and lazily loads a quantized Depth Anything V2 Transformers.js pipeline with WebGPU-first/WASM-fallback execution. Relative depth becomes a discontinuity-aware vertex-colour OBJ. The rig workbench supplies front-humanoid, side-quadruped, front-bird, and side-serpentine presets plus arbitrary topology editing. It builds four-influence skin weights and exports a self-contained GLB with a universal rig profile that re-enters the ordinary asset runtime. A `single-image-model` portable binding freezes model, processed RGB, depth PNG, and the complete rig recipe by SHA-256.
10. **Multi-view gray-model runtime** — a separate local workbench accepts canonical front/back/left/right/top/bottom photos, requires front plus one side in the guided path, derives inspectable silhouettes, and optionally estimates per-view relative depth with the same browser-local Depth Anything V2 runtime. Silhouettes form a hard voxel envelope; enabled depth maps can only carve it through adjustable visible-surface ceilings. Exposed faces become a texture-free, neutral vertex-colour OBJ that re-enters the ordinary rotatable asset runtime. A `multi-view-gray-model` binding freezes the OBJ, reconstruction JSON, every processed view, and every available raw depth PNG under semantic roles and SHA-256. The recipe also records model metadata, evidence controls, before/after voxel counts, and a local content-free interaction trace for correction-effort analysis.
11. **Agent boundary and navigation** — an observation builder exposes only visible semantic affordances. `runAgentBehaviorTurn` accepts exactly `approach`, `look`, `reach`, `grasp`, `transfer`, `release`, or `speak`; it rejects undeclared fields and direct model control of transforms, paths, scripts, code, or asset URLs. Out-of-range actions are planned over a radius-inflated triangulated raster navigation mesh with shared-edge portals, triangle A*, and visibility simplification; the older grid A* remains an explicit fallback. The compiler emits controlled `move`, `behavior`, `interaction`, or `dialogue` clips and a receipt binding command, normalized scene, and generated clips by SHA-256 instead of executing model-authored transforms.
12. **CP02 governed mutation** — `?case=pact-cp02` loads a source-locked derivative of the collaborator room. A deterministic fixture can propose only semantic assets in authored slots. Guardian approval routes one closed ScenePatch through exact changed-ID and protected-object checks; rejection and receipt-bound undo remain first-class outcomes. The route exposes only a read-only evidence snapshot and does not write the ordinary editor autosave key.
13. **Reproducible delivery** — deterministic renderers emit a sibling `.simulation-package/` containing an independent video copy, canonical scene snapshot, asset lock, delta-encoded per-frame trace, interaction/ownership ledger, collision audit, portable render report, vendored replay runtime, and full-file SHA-256 manifest. A package-local verifier recomputes hashes and `simulationIdentity`; the browser replay uses only packaged files.
14. **Cinematic camera editing** — authored camera clips remain first-class timeline records. The non-modal editor captures the current perspective viewport into explicit A/B position, look-at, and FOV endpoints; validates 3–16 point camera/look-at rails; edits timing and easing through the same undoable store; and runs bounded shot previews without recompiling the screenplay or mutating unrelated tracks.
15. **Persistent recovery and portable projects** — ordinary edits are debounced into an IndexedDB recovery snapshot up to 96 MB, while small projects retain a synchronous localStorage mirror. A `.blockout.zip` contains canonical project JSON plus content-addressed OBJ/GLB, optional animation GLB, the exact bridge/RGB/depth triplet, a generated model/processed-RGB/depth/rig quartet, or the multi-view OBJ/recipe/canonical-view set; import rejects missing, extra, oversized, or hash-mismatched assets.
16. **CP03 local audience surface** — `?case=pact-cp03` exposes exactly five governed actions, a role-attributed zero-call trace, immutable proposal hash, viewer approve/reject controls, Capability Gate result, Ruby receipt, and five distinct transient Three.js effects. Its export is explicitly `ENGINEERING_ONLY_NOT_CHECKPOINT`.

## Incoming depth-painting bridge

The Layered Redraw editor can export `spatial-bridge.json` using contract `depth-heightfield-v1`. It binds one immutable RGB artifact to one near-white relative-depth run, records both sets of hashes, carries the display mesh resolution and displacement, and includes semantic-layer depth summaries only when the layer plan matches that exact RGB/depth pair. `metric_scale: false` and `relative_depth_must_not_be_treated_as_metres` are hard boundaries.

New bridges are marked `ready-for-import`. Select a Scene Builder carrier, choose **RGB-D 工程**, then select the Layered Redraw project folder. If a browser cannot expose folder selection, **改选桥接 + RGB + 深度** accepts the three consumed files directly. Both paths use the same importer: it finds one bridge, suffix-matches its project-relative artifact paths (with an unambiguous basename fallback for three-file selection), checks the declared RGB and depth-preview hashes, decodes both at the contract dimensions, and mounts a CPU-displaced `PlaneGeometry` through the same replaceable-asset lifecycle used by OBJ/GLB. Older `ready-for-import-adapter` bridges remain accepted for compatibility.

The contract checksum is retained as the handoff fingerprint while the importer independently validates all executable contract fields and both consumed artifact hashes. It does not silently turn the height field into collision geometry, infer hidden surfaces, or claim calibrated world scale. Authored scene objects, character rigs, navigation, and interaction anchors remain separate Scene Builder data. Clearing the asset restores the original placeholder and removes its portable binding without changing screenplay tracks.

Runtime attachment is also subordinate to scene governance. Generic OBJ, GLB, and RGB-D attachment rejects `SOURCE_LOCKED`, `EVIDENCE_LOCKED`, `STAGE_LOCKED`, and `WITHHELD` carriers before reading asset bytes or creating a replacement controller; only an authorised or otherwise mutable carrier may accept a persistent asset binding. In the CP02 route, the Case Pack manifest and source lock remain authoritative, ScenePatch validation still controls project mutations, and receipt-bound undo still restores the exact project hash. A successful RGB-D import therefore proves a governed, reversible display substitution on one permitted carrier—not permission to rewrite the source photograph or bypass the CP02 protocol.

## Single image to OBJ and rigged GLB

Select a mutable carrier and open **单图 → OBJ / 骨架**. The processed image never leaves the browser. The first depth run downloads the pinned `onnx-community/depth-anything-v2-small` model; later runs reuse browser caches. WebGPU uses the `q4f16` graph when available and WASM falls back to the single-file `q8` graph. The single-file repository is intentional: it stays compatible with the stable Transformers.js 3.8.1 browser loader instead of relying on a split ONNX/external-data pair.

`buildReliefMeshData` resamples colour, alpha, and near-white relative depth onto an aspect-preserving grid. Faces crossing a configured depth discontinuity or transparent cutout are omitted. The OBJ serializer writes vertex colour, UV, normal, and face indices in one static file. The rig step starts from an editable humanoid, quadruped, bird, or serpentine graph. Users can drag anchors, add/delete/mirror joints, reparent them, and edit semantic role, chain, effector, front/back offset, and ball/hinge/twist limits. Missing parents and cycles fail validation before export. Four normalized nearest-segment weights per vertex produce a self-contained skinned GLB, while the universal profile preserves roots, chains, mappings, limits, and inferred controlled capabilities such as walk, fly, bite, peck, wag, or slither.

This is deliberately a 2.5D authoring accelerator. It does not infer metric scale, body semantics, occluded backs, thickness, watertight topology, subject segmentation, pose landmarks, balance, muscles, fingers, or production skin weights. The presets and joint limits are editable authoring defaults, not detected anatomy. Transparent isolated side views work best for quadrupeds and serpentine characters; front views work best for the humanoid and bird presets. Arbitrary scenes are better kept as static OBJ reliefs. The portable binding preserves the exact processed RGB, depth preview, model, and rig recipe needed to inspect or reproduce the generated asset on another machine.

Dependency boundary: Transformers.js 3.8.1 declares the Node-only `sharp` package even though Vite resolves its browser export and the Scene Builder decodes images through browser APIs. The 2026 npm audit currently reports the upstream `sharp <0.35.0` libvips advisory with no available dependency fix. This application does not route imported images through Node `sharp`; releases should still monitor and upgrade the upstream package when a fixed compatible version exists.

## Multi-view photos to a rotatable gray model

Select a mutable carrier and open **多视角 → 可旋转灰模**. Add a front photograph and either a left or right photograph of the same static object; back, the opposite side, top, and bottom are optional constraints. Keep the object upright and centred, use a clean or transparent background, and avoid changing focal length or camera distance. Each card can display either the locally derived magenta silhouette or an optional Depth Anything V2 relative-depth preview. Threshold, silhouette inversion, depth enablement, and near/far inversion are edited per view before the bounded voxel grid is carved. Model weights are downloaded and cached on first use, while photographs stay in the browser.

The silhouette intersection remains the deterministic hard outer envelope: a voxel can survive only when its projection is foreground in every supplied canonical view. Optional monocular depth never adds volume. Instead, each enabled map supplies a visible-surface ceiling along that camera ray. Values are robustly normalized inside that view's silhouette using its 5th–95th percentile range, smoothed locally, and blended from the pure-hull baseline with a user-controlled influence. A tolerance absorbs small estimation noise; a nearly flat map is rejected automatically. Maps are never scale/shift aligned across views and must not be interpreted as metric depth.

The interface exposes adjacent one-click builds for the silhouette-only baseline and the depth-assisted condition. After each build, an evidence panel reports exact pure-hull, retained, total-carved, per-view rejected, and multi-view jointly rejected voxel counts. These numbers describe geometric effect and are never labelled as confidence. If depth removes at least half of the silhouette hull, the result carries an explicit direction/baseline warning.

The OBJ contains one neutral vertex colour and no UV, MTL, texture, camera, or source pixel data. The paired JSON records view roles, processed dimensions, silhouette and depth controls, model/backend metadata, coordinate convention, grid settings, pure-hull and post-depth voxel counts, per-view rejection counts, warnings, capability boundary, and a local action sequence. Processed view files, raw near-white depth PNGs, JSON, and OBJ are persisted together by SHA-256 so a portable project can restore both the displayed model and the inspection state. Near/far inversion is metadata rather than a destructive rewrite of the saved depth raster.

This method cannot recover unsupported concavities, hidden surfaces, true scale, material, camera calibration, or production topology. Monocular depth may be locally wrong or mutually inconsistent, so its default influence is deliberately low and every view can be disabled or inverted. Perspective mismatch and inconsistent framing can distort the hull. A smooth or detailed result would require a separately validated reconstruction pipeline; the current blocky surface is intentional evidence of grid resolution rather than simulated precision.

### HCI evaluation role

The feature is an enabling apparatus, not evidence by itself. The strongest HCI comparison now isolates the role of inspectable algorithmic evidence: **photos only**, **silhouette visual hull**, and **depth-assisted visual hull with per-view preview, rejection, inversion, influence, and tolerance controls**. The question is whether inspectable and rejectable depth helps drawers notice spatial inconsistencies and calibrate reliance while preserving authorial control—not whether one reconstruction wins a geometry benchmark.

A defensible study can use a counterbalanced within-participant B/C comparison, with photos-only retained as a familiarisation or between-group baseline if fatigue permits. The explicit baseline/depth buttons prevent condition assignment from depending on remembering to move a slider to zero. Use objects whose reference geometry is independently available and include both ordinary depth estimates and prespecified local depth failures. Keep drawing task, source views, time budget, and blind final-artwork rubric constant. Primary outcomes should be spatial-error detection and confidence calibration; secondary outcomes can include correction quality, perceived control, workload, and blind drawing ratings. The recipe provides process measures for view/preview selection, threshold and near/far correction, depth acceptance/rejection, influence/tolerance changes, condition-specific build attempts, elapsed sequence, pure-hull voxels, total carved voxels, and each view's rejected voxels. Interview when and why participants trusted, corrected, or rejected the estimate. Do not treat implementation logs, synthetic smoke fixtures, developer inspection, or voxel reduction alone as participant evidence.

## Stable replacement contract

Characters are addressed through a root object rather than individual placeholder meshes. `asset.nodes` maps semantic slots such as `root`, `head`, `effector`, and `statusLight`; `asset.animations` maps `idle`, `move`, `interact`, and `react`; `asset.bones` maps 25 stable torso, face, arm, hand, leg, foot, and optional toe/shoulder roles; `asset.expressions` maps roles such as `smile`, blinks, and `mouthOpen` to morph-target names. `asset.portable` binds content-addressed model and optional animation entries. Explicit bindings—including intentional `null` unmapping—win when present; otherwise conservative name matching reports missing slots instead of inventing them.

The editor runtime provides a format-independent control boundary:

```js
const report = editor.assetReport(objectId);
editor.playAssetAction(objectId, "interact");
editor.setAssetExpression(objectId, "smile", 0.8, { exclusive: true });
editor.setAssetBonePose(objectId, "head", { rotationDegrees: [0, 20, 0] });
editor.setAssetHandIk(objectId, "rightHand", [0.4, 1.2, -0.7], { weight: 1 });
editor.setAssetRigBindings(objectId, savedBoneMap, savedRigProfile);
editor.setAssetChainIk(objectId, "wing.left", [0.4, 1.2, -0.7], { weight: 1 });
editor.previewAssetRig(objectId, "hands");
await editor.loadRetargetAnimationFile(objectId, animationGlbFile);
editor.clearAssetExpressions(objectId);
editor.clearAssetBonePose(objectId, "head");
editor.clearAssetHandIk(objectId, "rightHand");
editor.clearAssetChainIk(objectId, "wing.left");
```

Actions, expressions, bones, hands, and feet accept either a semantic slot or the original GLB name. Universal profiles additionally expose named multi-segment chains through `setAssetChainIk`; their local joint limits are applied during CCD. Retargeting accepts an animation GLB only when it contains a source skinned mesh and clips; incompatible names or rest poses fail without replacing existing clips. `assetReport` exposes geometry/skin/bone counts, clips, morphs, mapping diagnostics, universal-rig family/capabilities/chains, `twoHandIk`/`footLock`/`lookIk`/`fullBodyIk`, retarget capability, warnings, and current state-machine data. A future behavior tree or model provider should use the semantic capability boundary and inspect its receipt rather than writing transforms or model URLs directly.

Props declare local `interactionSpec.anchors` and named `affordances`. A timeline interaction records actor, target, actor node, target anchor, action, and resulting state. Ownership-aware clips additionally declare `ownershipMode`, holder/item anchors, an `actorContactAnchor`, and either a recipient or placement target. Optional `interactionSpec.collisionProxy` data declares a box, sphere, cylinder, or capsule with dimensions/offset/margin; support boxes can opt into top-surface correction. They expose anticipation, reach, contact, and recovery phases plus bounded phase progress/contact weight. Gray-box effectors meet the outside of the target, while imported rigs combine their mapped clip with contact-driven hand IK; `hand: both` plans symmetric contact points from the target width in the actor's contact frame and clamps the span before solving both chains. The deterministic runtime remains responsible for reach distance, legal ownership, navigation, proxy audit, animation state and semantic expression envelopes; Rapier owns only unconstrained dynamic-body motion.

## Run and verify

```powershell
cd apps/scene-builder
npm ci
npm test
npm run build:interaction-demo
npm run render:interaction-demo:video30
npm run build:window-case
npm run render:window-case:video30
npm run package:interaction-demo
npm run package:window-case
npm run build:window-case:cp02
npm run test:cp03:audience
npm run test:single-image-3d
npm run test:large-autosave
npm run build
npm run dev
```

The bundled `projects/interaction-lab` fixture contains two gray-box agents, one prop, three legal ownership transitions, one continuous camera, and a ten-second timeline. Its regression test evaluates all 601 inclusive 60Hz samples for residual proxy penetration and checks persistent holder-contact poses. `npm run render:interaction-demo:video30` renders exactly 300 frames at 1280×720, saves six collision-audit PNGs (including both carry segments), and fails when any milestone reports non-zero residual penetration. The larger `projects/window-case` fixture contains one continuous room, four non-human agents, 200 objects, 720 timeline clips, 19 camera shots, 30 English screen-text cues, and a 166-second director timeline. Its regression test evaluates all 4,981 inclusive 30fps samples and requires zero residual penetration and zero simulation violations. `npm run render:window-case:video30` outputs exactly 4,980 frames at 1280×720 with the cues burned into the VP8 WebM. Both renderers also build and validate the matching reproducible simulation package. `package:*` can retrofit the same contract around an existing video. Generated frames, reports, videos, and packages stay under the ignored `artifacts/` directory.

Inside a generated package, run `node verify-delivery.mjs`, then `node serve-replay.mjs`. Verification checks every declared byte count and SHA-256, rejects undeclared files and incomplete publication markers, and recomputes the deterministic identity from the scene, asset lock, trace, interactions, and collision report. The identity deliberately excludes the video, renderer wall time, hardware, and absolute paths: two executions with the same simulation must match even when visual codecs or machines differ. See [`simulation-delivery-package.md`](simulation-delivery-package.md).

### CP02 runtime and evidence gate

The CP02 route is an engineering checkpoint for one reversible `Reframe`, not a
general scene-generation system. Its fixed local sequence is proposal → Guardian
allow/reject → additive thermos → semantic chair move → exact undos → forbidden
source-photo replacement. The source photograph, evidence objects, and stage
objects remain locked. Proposal geometry is procedural; after Guardian allow,
the table and chair carriers load exact hash-bound local GLBs, the cup remains a
project-authored proxy, and the artist-kept thermos is loaded only as a separate
additive object. The ignored local Case Pack is not public-release clearance.

Case Pack validation is policy-bound. Production uses the fixed CP02 catalog;
additional application-authored catalogs can create an immutable validator for
their own approved records, but a manifest cannot select or mutate that policy.
The unit suite uses this boundary with a generated minimal GLB, so repository
tests do not depend on ignored private binaries while still exercising real
SHA-256 and filesystem checks.

The R2 viewport makes the intentional duplication explicit: the existing
evidence table and retained cup are rendered as a muted archive layer, while the
bedside table, chair, proposal cup and thermos occupy a dynamic mutable layer.
This is a render-only distinction and does not change project hashes or weaken
the ScenePatch protection boundary.

Run the formal local gate on the target Apple M5 MacBook Air with visible system
Chrome:

```bash
export BLOCKOUT_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
npm test
npm run build
npm run test:cp02
npm run render:window-case:cp02
```

`test:cp02` starts its own loopback Vite server, drives only visible UI controls,
fails on non-local requests or browser errors, captures six 1280×720 stills and
five receipts, times at least 20 production apply/undo cycles, retains every raw
frame delta for a 60-second adaptive run, and preserves a separate 30-second
`renderQuality=full` diagnostic. `render:window-case:cp02` records an uncut WebM
of the same interaction and creates the render report. Generated evidence is
written under ignored `artifacts/window-case-cp02/`; an existing evidence set is
moved into its `history/` directory before a new smoke run, never deleted.

The provisional runtime thresholds are median FPS ≥ 30, frame-time P95 ≤ 50 ms,
preloaded apply and undo P95 ≤ 250 ms, and no continuous five-second interval
below 75% adaptive quality. Headless, SwiftShader/software, non-1280×720, or
non-target-machine evidence is `ENVIRONMENT_INVALID`, not a pass. A threshold
miss is retained as `FAIL`. Only `PASS` can become `RUNTIME_TESTED` after archive
verification; screenshots and controller inspection never populate the artist's
`ARTISTICALLY_APPROVED` decision.

## CP03 agent-to-Ruby execution seam

CP03 now has one local, no-network executable seam that preserves the division
between creative agency and mechanical authority:

```text
DSH CaseConductor executable draft
  -> canonical draft hash
  -> hash- and scene-bound viewer approval
  -> deterministic Capability Gate
  -> existing semantic intent planner
  -> existing navigation / interaction / ownership / collision runtime
  -> transient director overlay + linked receipt
  -> immutable CaseSession transition
  -> DSH append / flush / inspect durability barrier
```

The first registered capability is `performRegisteredInteraction`. The draft can
name only a stable actor ID, target ID, target-declared affordance, and—when the
affordance requires it—a registered recipient or placement target. Raw
coordinates, transforms, paths, code, scripts, URLs, undeclared fields and
unregistered affordances cannot cross the schema/Gate boundary. The Gate also
requires a viewer `APPROVE` decision for the exact canonical draft hash and the
current project hash. It does not repair or reinterpret an invalid proposal.

Ruby's existing Scene Builder remains the only owner of path generation,
contact phases, ownership transitions, collision correction, animation state
and timeline evaluation. The CP03 adapter only preserves validated affordance
metadata and appends the generated clips to a cloned director overlay; the
source project is not mutated, and rollback is discarding that overlay. The
CaseSession layer records the resulting receipt IDs and pre/post scene hashes;
it is not a parallel Ruby execution backend.

The local integration test still runs the real DSH rc.6 session/tool/event stack
with the `pact-fake` scripted adapter through hash approval, Gate, Ruby execution,
receipt, flush, and cold read. In addition, the approved critical-path redesign
now has a provider-neutral local engine: all five typed role shards start against
one immutable snapshot, durable Witness/Rewriter text is the only eligible public
trace, Guardian dissent cannot be dropped, a minimal Conductor commit selects
hashes, and a non-creative assembler deterministically produces the draft. Tests
cover strict-at-deadline quarantine, 6 planned/8 maximum dispatch accounting,
one pre-side-effect retry per provider, stable draft hashes, and no draft on
failure. A routing-manifest audit rejects silent model switching, missing
multimodal support, or insufficient parallel concurrency before any call.

The audience route and all five transient visual effects are implemented and
browser-tested at desktop and 390×844 with zero external requests. This remains
a scripted local engineering surface, not provider proof. Live Runs 01–03 remain
failed evidence; no Live Run 04 was made. Real Gemini/DeepSeek compatibility
still requires exact model/route/repetition/input/call-count/USD approval, DSH
adapter wiring to the new council, a passing archived run, and separate human
quality review.

The formal checkpoint **contract** is implemented as a fail-closed archive gate.
It requires interaction, visual, engineering, provenance, and discourse evidence,
plus a passing representative real-provider archive, Ruby execution and rollback,
technical review, artistic `KEEP`, integrity, commit, and pushed-branch facts.
No formal CP03 archive has been produced, because those external and human facts
do not yet exist.

## Current limits

- OBJ, GLB, animation GLB, and RGB-D inputs enter a browser content-addressed store and can be exported in a cross-machine `.blockout.zip`. CP02's separate fixed ignored Case Pack remains private and is not automatically admitted to that public project package.
- OBJ is intentionally static: its common interchange form has no portable skin, skeletal animation, or morph-expression contract. Animated characters should use a self-contained GLB; external OBJ MTL/texture references are ignored.
- Animation retargeting still lacks general rest-pose normalization between differently proportioned human or non-human rigs. The human runtime's “full-body IK” capability still means two valid arm chains, two valid leg chains, distributed gaze, and stationary foot locks are mapped. Universal profiles add authored per-joint limits and generic multi-segment CCD, but not a balance solver, finger/talon IK, gait-aware footstep planner, wing aerodynamics, muscles, or terrain adaptation.
- Navigation is a deterministic triangulated raster mesh over radius-inflated axis-aligned static bounds. It is not Recast polygon baking, dynamic obstacle avoidance, crowd steering, or arbitrary sloped-surface traversal.
- Rapier provides real gravity and rigid-body contacts for unconstrained dynamic objects. Authored ownership and timeline control intentionally override those bodies kinematically; stacked-scene tuning and a full rigid-body character controller remain future work.
- Camera splines and procedural secondary motion improve continuity but do not replace authored animation.
- The Scene Builder agent runtime validates semantic intents but does not itself call a language model. The new parallel council is provider-neutral local code; real DSH Gemini/DeepSeek adapters for it are not yet accepted.
- CP02 understands only the two frozen bilingual fixture statements; Gemini, DeepSeek, and DSH are not live dependencies in this checkpoint.
- CP02's three selected public assets have separate source, technical and local artistic records and are loaded from the fixed ignored Case Pack. This does not generalise to arbitrary catalog entries and does not authorise public display.
- The example is real-time stylized blockout, not photoreal final rendering.
- RGB-D height fields can now be persisted and packaged with their exact bridge/RGB/depth bytes, but they still do not provide backs, watertight topology, metric scale, collision, rigging, or navigation geometry.
- Single-image OBJ/GLB generation is a relative-depth relief workflow. Editable humanoid, quadruped, bird, serpentine, and custom rig graphs remove the hard-coded human topology, but they are not pose estimation, automatic anatomical rigging, subject segmentation, hidden-surface reconstruction, volumetric modelling, or production skinning.
- Multi-view gray-model generation is a canonical silhouette visual hull with optional per-view monocular-depth carving. It is local, reproducible, and volumetric enough for rotational blockout reference, but independently normalized relative depth is not cross-view metric evidence; the result is not photogrammetry, NeRF/Gaussian reconstruction, metric scanning, texture fusion, camera calibration, reliable hidden-concavity recovery, smoothing, remeshing, or production topology.

The next CP03 gate is narrower than before: wire the approved parallel council
to real DSH continuable sessions, produce a new zero-call preflight, then request
fresh exact Live Run 04 authority. Only a passing run plus human quality review
can unblock formal encounters and the five-class archive. Separately, 3D hardening
can deepen humanoid retarget profiles, balance/finger IK, gait-aware foot placement, Recast-style navigation,
dynamic obstacles, and rigid-body character control without weakening semantic
ownership or hash approval.
