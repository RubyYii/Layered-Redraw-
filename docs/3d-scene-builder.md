# Experimental 3D Scene Builder

`apps/scene-builder` is a local-first Three.js application for turning a screenplay into an inspectable blockout, cinematic timeline, and deterministic video render. It is an incubation surface inside Layered Redraw, not a claim that 2D semantic layers have become a full game engine.

## Runtime layers

1. **Scene schema** — versioned JSON stores stable object IDs, parent relationships, transforms, render metadata, entity capabilities, motion profiles, asset bindings, and semantic interaction anchors.
2. **Director** — absolute-time clips evaluate movement, rotation, visibility, attachments, dialogue, cameras, and interactions without mutating source project data.
3. **Motion** — minimum-jerk easing and arc-length path sampling prevent abrupt acceleration and uneven speed across control points. Path tangents drive root yaw, lean, and bank.
4. **Renderer/editor** — Three.js groups preserve character hierarchy; cached camera position/look-at curves avoid rebuilding Catmull–Rom data every frame. Preview transforms bypass material work, timeline highlighting is incremental, and measured frame pacing can lower pixel ratio and temporarily simplify shadows/local lights on weak or software renderers. Fixed-step and keyframe render scripts opt into full quality so deliverables do not vary with interactive performance.
5. **Asset runtime** — a local OBJ or self-contained GLB can replace a selected placeholder for the browser session without non-uniformly distorting the source. OBJ provides static geometry. GLB can additionally provide skins, bones, animation clips, and morph targets; the runtime reports those capabilities and infers semantic nodes, actions, rig bones, and expression slots. `AnimationMixer` crossfades between `idle`, `move`, `interact`, and `react` states supplied by the deterministic timeline.
6. **Agent boundary** — an observation builder exposes only visible semantic affordances. The validator rejects direct model control of transforms, paths, scripts, code, or asset URLs; the planner can deterministically add a collision-aware ground path before an out-of-range interaction. `runAgentTurn` is the single callback boundary for a future provider and returns validated timeline clips rather than executing model-authored transforms.

## Incoming depth-painting bridge

The Layered Redraw editor can export `spatial-bridge.json` using contract `depth-heightfield-v1`. It binds one immutable RGB artifact to one near-white relative-depth run, records both sets of hashes, carries the display mesh resolution and displacement, and includes semantic-layer depth summaries only when the layer plan matches that exact RGB/depth pair. `metric_scale: false` and `relative_depth_must_not_be_treated_as_metres` are hard boundaries.

The bridge is intentionally marked `ready-for-import-adapter`: the Scene Builder does not yet import it automatically. A future adapter may create a textured 2.5D environment surface or camera-composition reference after verifying the hashes. It must not silently turn the height field into collision geometry, infer hidden surfaces, or claim calibrated world scale. Authored scene objects, character rigs, navigation, and interaction anchors remain separate Scene Builder data.

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

Props declare local `interactionSpec.anchors` and named `affordances`. A timeline interaction records actor, target, actor node, target anchor, action, and resulting state. It exposes anticipation, reach, contact, and recovery phases; gray-box effectors procedurally approach anchors while targets receive a bounded contact response, and carried offsets rotate in the holder's local frame. Imported rigs use their mapped animation clip instead of the gray-box effector pose. The deterministic runtime remains responsible for reach distance, movement, collision planning, and animation state.

## Run and verify

```powershell
cd apps/scene-builder
npm ci
npm test
npm run build:window-case
npm run build
npm run dev
```

The bundled `projects/window-case` fixture contains one continuous room, four non-human agents, 19 camera shots, and a 166-second director timeline. Fixed-step video rendering is available through `npm run render:window-case:video30`; generated frames and videos stay under the ignored `artifacts/` directory.

## Current limits

- OBJ and GLB loading are connected for local session files, but model files are not embedded in project JSON or packaged for transfer yet.
- OBJ is intentionally static: its common interchange form has no portable skin, skeletal animation, or morph-expression contract. Animated characters should use a self-contained GLB; external OBJ MTL/texture references are ignored.
- GLB bone overrides are local-pose controls, not animation retargeting or inverse kinematics.
- The ground planner expands axis-aligned static bounds by actor radius; it is not a navigation mesh and does not replace a rigid-body or character-controller solver.
- Semantic effectors select animation/node bindings, but full-body and hand IK are not connected yet.
- Camera splines and procedural secondary motion improve continuity but do not replace authored animation.
- The agent runtime validates semantic intents but does not call a language model.
- The example is real-time stylized blockout, not photoreal final rendering.
- The RGB-D spatial bridge is exportable from the painting editor, but its Scene Builder import adapter is not implemented yet.

The next vertical slice should persist/package imported assets, add a retargeting profile and hand IK for one pickup interaction, and connect a Rapier-backed capsule controller while keeping the semantic interaction contract unchanged.
