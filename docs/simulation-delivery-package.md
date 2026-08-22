# Reproducible simulation delivery package

Every deterministic Scene Builder video render is paired with an inspectable simulation package. The video is one view of the run; it is no longer the only retained result.

## Package contract

| File | Role |
| --- | --- |
| `delivery.manifest.json` | package ID, deterministic `simulationIdentity`, timeline, validation result, and SHA-256/size for every packaged file |
| `scene.blockout.json` | canonical source-scene snapshot with stable object IDs, hierarchy, bindings, anchors, proxies, and director timeline |
| `assets.lock.json` | declared model bindings and hashes for inline texture bytes; unresolved runtime URLs remain explicit |
| `simulation.trace.jsonl` | header, full initial object state, per-frame object deltas, camera/clip state, interactions, ownership, contacts, violations, and terminal sample |
| `interactions.json` | authored interaction definitions plus observed ownership-state changes |
| `collision-report.json` | sampled corrections, contact pairs, maximum initial/residual penetration, unsafe samples, and semantic violations |
| `render-report.json` | portable video/render metadata without machine-specific output paths |
| `final-video.*` | independent video copy; changing the source video cannot mutate the delivered file |
| `replay.html`, `replay-runtime.js`, `vendor/` | network-free Three.js replay with free orbit, scrubbing, video comparison, ledger, and audit panels |
| `verify-delivery.mjs` | local integrity and identity verifier |

The trace records rendered frames plus one terminal sample. Frame zero is a full state; later records contain only changed objects while keeping complete simulation semantics. Numeric values are rounded to six decimal places before canonical serialization.

## Build, verify, replay

Rendering creates the package automatically:

```powershell
cd apps/scene-builder
npm run render:interaction-demo:video30
npm run render:window-case:video30
```

An existing video can be packaged without rendering it again:

```powershell
npm run package:interaction-demo
npm run package:window-case
```

For an arbitrary project and video:

```powershell
node scripts/build-simulation-delivery-package.mjs `
  --project path/to/scene.blockout.json `
  --video path/to/render.webm `
  --report path/to/render.report.json `
  --audit-dir path/to/collision-audit-images `
  --fps 30 `
  --output path/to/render.simulation-package
```

Verify and replay from inside the generated directory:

```powershell
node verify-delivery.mjs
node serve-replay.mjs
```

Open the loopback URL printed by the server. Directly double-clicking `replay.html` is unsupported because browser module and fetch security rules require an HTTP origin; the server binds only to `127.0.0.1`.

## What “reproducible” means

`simulationIdentity` hashes only the canonical scene, asset lock, frame trace, interaction ledger, and collision report together with cadence and time range. It excludes absolute paths, wall-clock render duration, hardware, the encoded video, and the replay UI. Therefore the same deterministic simulation has the same identity even if the codec output or machine changes.

The manifest still hashes the video and every support file. `verify-delivery.mjs` checks those hashes, rejects undeclared files and incomplete publication markers, and recomputes the identity. A changed video or UI asset fails package integrity without falsely changing the underlying simulation identity.

Publication uses a staging directory. An existing package is retained under a timestamped `.previous-*` sibling before replacement. On platforms that reject whole-directory renames, files are promoted in the same parent with an incomplete marker and the manifest moved last.

## Validation and limits

The generator records a `PASS` only when every sampled collision result is safe and there are no ownership/simulation violations. A failed simulation remains a complete replayable `FAIL` package for diagnosis; integrated render commands then exit unsuccessfully.

This proves deterministic kinematic playback, semantic ownership, proxy separation, traceability, and file integrity. It does not prove rigid-body dynamics, continuous collision detection, gravity, cloth, full-body/hand IK, photoreal rendering, or artistic approval.

OBJ/GLB/RGB-D assets loaded only into a browser session are not silently embedded. Persist an asset through the project/asset contract before relying on it in a delivery. Self-contained GLB remains the preferred animated-character format because it can carry meshes, skins, bones, clips, and morph targets; the package preserves semantic `nodes`, `animations`, `bones`, and `expressions` bindings so a later model replacement can reuse the same timeline and compare the new run by simulation identity and reports.
