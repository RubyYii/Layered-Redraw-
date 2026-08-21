# Reference Intelligence Contract

Use this workflow when a project starts from one or more images, supplied RGB-D, or a request to use estimated depth when planning editable semantic layers.

## Core rule

RGB explains **what** is present. Depth provides evidence about **where** it sits. The user's prompt explains **what should remain independently editable** and how literal the spatial reading should be.

Never create one artwork layer per depth band. A tree and the wall behind it may occupy similar depth but require separate edit ownership; several distant buildings may span different depths yet belong in one architecture layer. Resolve layers from semantic class, depth, occlusion, visual treatment, edit priority, and the prompt together.

## Source bundle

`references/index.json` is the project-local registry. It can contain:

- one active `primary-rgb` or `alternate-view` scene;
- additional scene viewpoints;
- `style-reference` and `palette-reference` images that cannot become depth sources;
- zero or more immutable relative-depth runs paired to scene RGB references.

Every uploaded reference is normalized to local sRGB PNG, keeps its source and stored SHA-256 digests, and receives a stable ID. Do not embed user images in JSON or send them to an external service merely to register them.

## Relative-depth evidence

The optional default estimator is `depth-anything/Depth-Anything-V2-Small-hf` through Transformers. It produces relative depth, not metres or camera-calibrated geometry. A depth run stores:

- `depth-16.png`: canonical 16-bit near-white relative depth;
- `depth-preview.png`: readable 8-bit grayscale;
- `depth-colour.png`: editorial false-colour preview;
- `depth-zones.png` and `depth-zones-colour.png`: 3–8 diagnostic bands;
- `depth.json`: model, device, normalization, source hashes, band statistics, and artifact hashes.

Robust percentile normalization is recorded. Never overwrite an old run; create a new run so model or normalization changes remain comparable. Never claim monocular relative depth is metric RGB-D.

For supplied RGB-D, accept only a single-channel map with exactly the same width and height as its paired RGB. The user or source format must state whether near values are high or low. Preserve the supplied file digest and record the conversion.

## 3D spatial painting

The local editor can turn the active scene RGB and its paired near-white depth preview into an orbitable WebGL height field. RGB remains the colour texture; normalized nearness displaces vertices along the surface normal. Depth strength, mesh detail, perspective, and grid display are view parameters only. The depth-strength control runs in the vertex shader so dragging it does not resample or rewrite the depth image.

This is a 2.5D spatial canvas, not reconstructed metric geometry. It is useful for judging depth rhythm, camera angle, silhouette separation, and future 3D adapter work. It does not infer hidden or back-facing surfaces, calibrated camera intrinsics, real-world scale, watertight topology, collision shapes, or character rigs.

`spatial-bridge.json` is the auditable handoff. It binds:

- the source RGB artifact and SHA-256;
- one paired immutable depth run and all artifact hashes;
- near-white relative-depth orientation and an explicit `metric_scale: false` declaration;
- height-field resolution, display displacement, perspective, and texture-fit policy;
- semantic layer depth summaries only when `layer-plan.json` is current for the exact RGB/depth pair;
- invariants that forbid treating relative depth as metres or art direction as a rewritten raw map.

The bridge advertises the downstream `depth-heightfield-v1` contract. `ready-for-import-adapter` means the evidence is prepared for a Scene Builder adapter; it does not claim that an automatic importer, full mesh reconstruction, or physics simulation already exists. A downstream adapter must verify the hashes and preserve this limitation.

## Prompt-directed planning

Create `planning-request.json` before semantic region resolution. It contains:

- active RGB and optional paired depth run;
- the user's planning prompt;
- `faithful` or `art-directed` spatial interpretation;
- a 5–20 layer budget, normally 8–12;
- explicit separate, merge, and overlay directives when known;
- optional depth flattening or exaggeration in Art Direction mode.

`depth-directive.json` is not a rewritten depth map. It records how the planner may interpret immutable raw depth. Faithful mode permits no flattening or exaggeration.

## Semantic-region handoff

Codex must inspect the RGB, prompt, and available depth previews and write `semantic-regions.json` using kind `layered-redraw-semantic-regions`. Each region needs:

```json
{
  "id": "region-main-figure",
  "label_zh": "主体人物",
  "label_en": "Main figure",
  "semantic_class": "figure",
  "depth_mean": 0.78,
  "area_fraction": 0.16,
  "confidence": 0.91,
  "edit_priority": "high",
  "must_separate": true,
  "is_overlay": false
}
```

`depth_mean` is normalized nearness from 0 (robust far) to 1 (robust near), or `null` when depth evidence is unavailable. Region masks may be supplied separately; do not invent pixel masks from labels alone.

Resolve the regions with `plan-resolve`. The deterministic resolver:

1. applies explicit separate, merge, and overlay directives;
2. groups compatible semantic regions by edit intent;
3. merges only unprotected compatible groups when the budget is exceeded;
4. orders ordinary layers by directed depth and overlays last;
5. writes stable layer IDs plus raw and directed depth summaries;
6. refuses fewer than 5 layers or an impossible protected-layer budget.

Outputs are `layer-plan.json`, `semantic-regions.json`, and `directed-depth.json`. The latter explicitly states that no per-pixel directed depth was fabricated when semantic masks do not exist.

## Commands

```text
python scripts/layered_redraw.py reference-add <project> scene.jpg --role primary-rgb
python scripts/layered_redraw.py reference-add <project> alternate.jpg --role alternate-view --inactive
python scripts/layered_redraw.py references <project>
python scripts/layered_redraw.py reference-active <project> <source-id>

# Optional model inference; may download model weights unless --offline is used.
python scripts/layered_redraw.py depth-estimate <project> --zones 5 --device auto

# Existing RGB-D / depth source.
python scripts/layered_redraw.py depth-register <project> depth.png --raw-near high --zones 5

# Export the same non-destructive contract used by the editor's 3D canvas.
python scripts/layered_redraw.py spatial-bridge <project> --displacement 0.65 --resolution 96

python scripts/layered_redraw.py plan-request <project> "Keep the figure separate; merge distant buildings" --layers 10 --separate figure --merge "building-one,building-two"
python scripts/layered_redraw.py plan-resolve <project> semantic-regions.json
```

Install model inference separately from the core vector/raster dependencies:

```text
python -m pip install -r requirements-depth.txt
```

The editor can register multiple references, compare RGB with depth, import supplied depth, estimate relative depth when the optional backend is ready, and save the planning request. It does not pretend to perform semantic vision locally: Codex still analyzes the evidence and produces the semantic-region handoff before deterministic resolution.

## Quality gates

Reject the run when:

- source or depth dimensions differ;
- a depth image contains multiple channels;
- the requested source and depth run are not paired;
- the prompt is empty or layer budget falls outside 5–20;
- faithful mode asks for depth transformation;
- a directive names no semantic region;
- high-priority or explicitly separate regions cannot fit the budget;
- the plan derives layers directly from depth bands without semantic reasoning;
- any generated artwork step mutates the registered source or canonical depth evidence.
- a spatial handoff claims metric scale, hidden geometry, or physical simulation from monocular relative depth.
