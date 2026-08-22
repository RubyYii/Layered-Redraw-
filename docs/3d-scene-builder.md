# Experimental 3D Scene Builder

`apps/scene-builder` is a local-first Three.js application for turning a screenplay into an inspectable blockout, cinematic timeline, and deterministic video render. It is an incubation surface inside Layered Redraw, not a claim that 2D semantic layers have become a full game engine.

## Runtime layers

1. **Scene schema** — versioned JSON stores stable object IDs, parent relationships, transforms, render metadata, entity capabilities, motion profiles, asset bindings, and semantic interaction anchors.
2. **Director** — absolute-time clips evaluate movement, rotation, visibility, attachments, dialogue, cameras, and interactions without mutating source project data.
3. **Motion** — minimum-jerk easing and arc-length path sampling prevent abrupt acceleration and uneven speed across control points. Path tangents drive root yaw, lean, and bank.
4. **Interaction simulation** — preview advances through a 60Hz fixed-step clock. Ownership clips perform legal `claim`, `transfer`, and `release` transitions; item roots are solved from character hold, item grip, and placement-surface anchors. Invalid transitions are reported instead of silently teleporting a prop. This backend is deterministic kinematics, not rigid-body dynamics.
5. **Collision proxies** — before ownership solving, kinematic character capsules are separated from static box footprints and from each other; after ownership solving, props that explicitly opt into a collision proxy are separated from static geometry, with declared support surfaces receiving an upward correction. Decorative props remain outside the solver unless authored otherwise. The report exposes initial penetration, corrected pairs, and residual penetration. This is a discrete deterministic pass, not continuous collision detection.
6. **Renderer/editor** — Three.js groups preserve character hierarchy; gray-box effectors are projected onto opposite target surfaces and their telescoping arms are rebuilt from shoulder to contact point. Cached camera position/look-at curves avoid rebuilding Catmull–Rom data every frame. Preview transforms bypass material work, timeline highlighting is incremental, and measured frame pacing can lower pixel ratio and temporarily simplify shadows/local lights on weak or software renderers. Fixed-step and keyframe render scripts opt into full quality so deliverables do not vary with interactive performance.
7. **Asset runtime** — a local OBJ or self-contained GLB can replace a selected placeholder for the browser session without non-uniformly distorting the source. OBJ provides static geometry. GLB can additionally provide skins, bones, animation clips, and morph targets; the runtime reports those capabilities and infers semantic nodes, actions, rig bones, and expression slots. `AnimationMixer` crossfades between `idle`, `move`, `interact`, and `react` states supplied by the deterministic timeline.
8. **Spatial bridge runtime** — a selected carrier can load a Layered Redraw project folder containing `spatial-bridge.json`. The importer resolves the declared RGB and near-white depth-preview paths, verifies both SHA-256 digests, checks dimensions and hard relative-depth invariants, then creates an aspect-preserving textured height field. XY fitting keeps shallow carriers from crushing the authored display depth. The result remains session-only and is never added to collision or navigation data.
9. **Agent boundary** — an observation builder exposes only visible semantic affordances. The validator rejects direct model control of transforms, paths, scripts, code, or asset URLs; the planner can deterministically add a collision-aware ground path before an out-of-range interaction. `runAgentTurn` is the single callback boundary for a future provider and returns validated timeline clips rather than executing model-authored transforms.

## Incoming depth-painting bridge

The Layered Redraw editor can export `spatial-bridge.json` using contract `depth-heightfield-v1`. It binds one immutable RGB artifact to one near-white relative-depth run, records both sets of hashes, carries the display mesh resolution and displacement, and includes semantic-layer depth summaries only when the layer plan matches that exact RGB/depth pair. `metric_scale: false` and `relative_depth_must_not_be_treated_as_metres` are hard boundaries.

New bridges are marked `ready-for-import`. Select a Scene Builder carrier, choose **RGB-D 工程**, then select the Layered Redraw project folder. If a browser cannot expose folder selection, **改选桥接 + RGB + 深度** accepts the three consumed files directly. Both paths use the same importer: it finds one bridge, suffix-matches its project-relative artifact paths (with an unambiguous basename fallback for three-file selection), checks the declared RGB and depth-preview hashes, decodes both at the contract dimensions, and mounts a CPU-displaced `PlaneGeometry` through the same replaceable-asset lifecycle used by OBJ/GLB. Older `ready-for-import-adapter` bridges remain accepted for compatibility.

The contract checksum is retained as the handoff fingerprint while the importer independently validates all executable contract fields and both consumed artifact hashes. It does not silently turn the height field into collision geometry, infer hidden surfaces, or claim calibrated world scale. Authored scene objects, character rigs, navigation, and interaction anchors remain separate Scene Builder data. Clearing the session asset restores the original placeholder without changing project JSON or screenplay tracks.

## Stable replacement contract

Characters are addressed through a root object rather than individual placeholder meshes. `asset.nodes` maps semantic slots such as `root`, `head`, `effector`, and `statusLight`; `asset.animations` maps `idle`, `move`, `interact`, and `react`; `asset.bones` maps common rig roles such as `hips`, `head`, and both hands; `asset.expressions` maps roles such as `smile`, blinks, and `mouthOpen` to morph-target names. The importer replaces the placeholder hierarchy for the current session while preserving screenplay tracks and object interactions. Explicit bindings win when present; otherwise conservative name matching reports missing slots instead of inventing them.

The editor runtime provides a format-independent control boundary:

```js
const report = editor.assetReport(objectId);
editor.playAssetAction(objectId, "interact");
editor.setAssetExpression(objectId, "smile", 0.8, { exclusive: true });
editor.setAssetBonePose(objectId, "head", { rotationDegrees: [0, 20, 0] });
editor.clearAssetExpressions(objectId);
editor.clearAssetBonePose(objectId, "head");
```

Actions, expressions, and bones accept either a semantic slot or the original GLB name. `assetReport` exposes the source format, geometry/skin/bone counts, clip and morph-target names, inferred bindings, capability flags, warnings, and current overrides. A future behavior tree or model provider should inspect this report and issue constrained semantic commands rather than writing transforms or model URLs directly.

Props declare local `interactionSpec.anchors` and named `affordances`. A timeline interaction records actor, target, actor node, target anchor, action, and resulting state. Ownership-aware clips additionally declare `ownershipMode`, holder/item anchors, an `actorContactAnchor`, and either a recipient or placement target. Optional `interactionSpec.collisionProxy` data declares a box, sphere, cylinder, or capsule with dimensions/offset/margin; support boxes can opt into top-surface correction. They expose anticipation, reach, contact, and recovery phases; gray-box effectors meet the outside of the target while the simulation continuously resolves the prop constraint. Imported rigs use their mapped animation clip instead of gray-box articulation. The deterministic runtime remains responsible for reach distance, legal ownership, movement, collision-aware approach planning, proxy separation, and animation state.

## Run and verify

```powershell
cd apps/scene-builder
npm ci
npm test
npm run build:interaction-demo
npm run render:interaction-demo:video30
npm run build:window-case
npm run render:window-case:video30
npm run build
npm run dev
```

The bundled `projects/interaction-lab` fixture contains two gray-box agents, one prop, three legal ownership transitions, one continuous camera, and a ten-second timeline. Its regression test evaluates all 601 inclusive 60Hz samples for residual proxy penetration and checks persistent holder-contact poses. `npm run render:interaction-demo:video30` renders exactly 300 frames at 1280×720, saves six collision-audit PNGs (including both carry segments), and fails when any milestone reports non-zero residual penetration. The larger `projects/window-case` fixture contains one continuous room, four non-human agents, 200 objects, 720 timeline clips, 19 camera shots, 30 English screen-text cues, and a 166-second director timeline. Its regression test evaluates all 4,981 inclusive 30fps samples and requires zero residual penetration and zero simulation violations. `npm run render:window-case:video30` outputs exactly 4,980 frames at 1280×720 with the cues burned into the VP8 WebM. Generated frames, reports, and videos stay under the ignored `artifacts/` directory.

## Current limits

- OBJ and GLB loading are connected for local session files, but model files are not embedded in project JSON or packaged for transfer yet.
- OBJ is intentionally static: its common interchange form has no portable skin, skeletal animation, or morph-expression contract. Animated characters should use a self-contained GLB; external OBJ MTL/texture references are ignored.
- GLB bone overrides are local-pose controls, not animation retargeting or inverse kinematics.
- The ground planner expands axis-aligned static bounds by actor radius; the runtime collision pass uses discrete capsule/box proxies. Neither is a navigation mesh, swept continuous collision detector, or rigid-body character controller.
- The ownership solver is deterministic kinematics. It constrains authored anchors, corrects configured proxy penetration, and rejects illegal transitions, but it does not simulate gravity, impulses, frictional stacking, or Rapier contacts.
- Semantic effectors select animation/node bindings, but full-body and hand IK are not connected yet.
- Camera splines and procedural secondary motion improve continuity but do not replace authored animation.
- The agent runtime validates semantic intents but does not call a language model.
- The example is real-time stylized blockout, not photoreal final rendering.
- RGB-D height fields are session-only textured 2.5D surfaces. They are not packaged with project JSON and do not provide backs, watertight topology, metric scale, collision, rigging, or navigation geometry.

The next vertical slice should persist/package imported OBJ/GLB/RGB-D assets, add a retargeting profile and real hand IK to this verified pickup/handoff fixture, then replace the kinematic physics adapter with a Rapier-backed capsule/controller world while keeping the semantic ownership contract unchanged.
