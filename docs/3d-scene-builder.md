# Experimental 3D Scene Builder

`apps/scene-builder` is a local-first Three.js application for turning a screenplay into an inspectable blockout, cinematic timeline, and deterministic video render. It is an incubation surface inside Layered Redraw, not a claim that 2D semantic layers have become a full game engine.

## Runtime layers

1. **Scene schema** — versioned JSON stores stable object IDs, parent relationships, transforms, render metadata, entity capabilities, motion profiles, asset bindings, and semantic interaction anchors.
2. **Director** — absolute-time clips evaluate movement, rotation, visibility, attachments, dialogue, cameras, and interactions without mutating source project data.
3. **Motion** — minimum-jerk easing and arc-length path sampling prevent abrupt acceleration and uneven speed across control points. Path tangents drive root yaw, lean, and bank.
4. **Renderer/editor** — Three.js groups preserve character hierarchy; camera position and look-at use centripetal Catmull–Rom paths.
5. **Agent boundary** — an observation builder exposes only visible semantic affordances. The validator rejects direct model control of transforms, paths, scripts, code, or asset URLs.

## Stable replacement contract

Characters are addressed through a root object rather than individual placeholder meshes. `asset.nodes` maps semantic slots such as `root`, `head`, `effector`, and `statusLight`; `asset.animations` maps `idle`, `move`, `interact`, and `react`. A future GLB importer can replace the placeholder hierarchy while preserving screenplay tracks and object interactions.

Props declare local `interactionSpec.anchors` and named `affordances`. A timeline interaction records actor, target, actor node, target anchor, action, and resulting state. The deterministic runtime remains responsible for reach distance, movement, collision, and animation.

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

- `asset` is a validated binding contract; GLB loading and `AnimationMixer` playback are not connected yet.
- Physics values are metadata; there is no rigid-body or character-controller solver yet.
- Camera splines and procedural secondary motion improve continuity but do not replace authored animation.
- The agent runtime validates semantic intents but does not call a language model.
- The example is real-time stylized blockout, not photoreal final rendering.

The next vertical slice should connect one replaceable GLB character, `AnimationMixer`, and a Rapier-backed navigation/collision adapter while keeping the semantic interaction contract unchanged.
