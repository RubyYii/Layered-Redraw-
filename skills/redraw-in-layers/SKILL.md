---
name: redraw-in-layers
description: Interview the user about visual intent, analyze one or more RGB or RGB-D references, optionally estimate relative depth, and create or revise artwork with 5–20 stable semantic layers (normally 8–12). Supports prompt-directed semantic layer planning, editable SVG, generated raster, layered pixel art, parameterized A/B/C proofs, hybrid sources, masks, recoverable revisions, OpenRaster, and scoped edits. Use for photo-derived drawing, multi-reference or depth-aware planning, multi-layer generation, pixel art, posters, sketches, painterly images, art direction, local layer controls, or non-destructive revision.
---

# Redraw In Layers

Create portable, inspectable artwork in one of two project modes. Keep stable semantic layer IDs, recoverable revisions, and explicit edit ownership in both modes.

This repository is an incubation prototype. It is not a released VULCA Effect Pack. Follow `docs/vulca-migration.md` for the upstream boundary and do not claim SDK integration until the corresponding upstream package is accepted and released.

## Choose the design interface

- Default to `guided` workflow mode. Present compatible visual-system presets and only a few safe controls.
- Switch to `expert` / Art Direction mode when the user wants direct control over composition, proportion, space, form, value, colour, edges, and material.
- Use one `design-plan.json` in both modes. Guided controls must resolve into the same complete parameter schema used by expert mode.
- Save an accepted expert plan as a project-local Guided preset when the user wants to reuse it.
- Forbid artwork text by default. Allow it only when the user explicitly requests it and `design-plan.json` names every permitted semantic layer in `text_policy.allowed_layers`; interface labels and project metadata do not need an exception.
- Read `references/design-modes.md` before choosing or changing a preset, editing expert parameters, or saving a custom preset.
- Read `references/design-proofs.md` before generating, registering, locking, or promoting A/B/C parameterized proofs.

## Route the request

- Default to `vector-strict` when the user wants hand-editable vector drawing. Write SVG geometry directly and do not call an image-generation model.
- Choose `raster-layered` when the user asks for 生图, non-vector artwork, raster painting, or generated PNG layers. Use the available image-generation tool for pixels; do not trace the result into SVG.
- For pixel art, keep `raster-layered`, set `style: pixel-art`, and read `references/pixel-art.md` before creating prompts or files.
- For a named bundled style, install its machine-readable `style-recipe.json`; use `styles` to inspect recipes instead of relying on an unstructured prompt alone.
- For mixed vector, paint, and pixel treatment, keep the registered PNG render stack canonical and attach an `editable_source` plus `layer_type` to layers that need a vector or pixel source.
- For an existing Layered Redraw folder, read `project.json` first and preserve its output mode unless the user requests a separate style or mode variant.
- For validation, splitting, manifest generation, or local editor launch, run `scripts/layered_redraw.py` directly.
- For style-specific decisions, read `references/styles.md` only after the user chooses or requests a style.

## Build reference intelligence

Read `references/reference-intelligence.md` whenever the user supplies multiple images, RGB-D, a depth map, asks for depth estimation, or wants source image plus prompt to control layer planning.

1. Register every input with a declared role. Only `primary-rgb` and `alternate-view` can become the active scene; style and palette references remain supporting evidence.
2. When useful, estimate relative depth with the optional local Transformers backend or pair a supplied single-channel depth map of identical dimensions. Treat monocular output as relative depth, never metric geometry.
3. Inspect the RGB, prompt, and depth preview together. Use RGB for semantics, depth for spatial and occlusion evidence, and the prompt for edit ownership and art direction.
4. Save `planning-request.json` before resolving regions. Keep raw depth immutable; in Art Direction mode, flattening and exaggeration affect only the planner's interpretation.
5. Write valid `semantic-regions.json`, then run `plan-resolve` to produce 5–20 stable semantic layers. Never substitute depth bands for semantic layers, and never invent per-pixel masks when only labels exist.
6. Carry the resolved `layer-plan.json` into vector or raster production. Preserve the registered source bundle and all depth-run hashes in recoverable snapshots.

## Create vector artwork

1. Inspect the uploaded photograph and identify subjects, spatial depth, silhouette, dominant relationships, palette, light, and removable detail. If a reference bundle or layer plan exists, use it as the controlled evidence handoff.
2. Determine whether the prompt already fixes the creative direction. When it does not, ask 3–5 high-information questions from `references/creative-brief.md`. Do not start detailed drawing in guided mode until the intent is understood.
3. Summarize the answers as a concise creative brief, choose a design preset, and resolve `design-plan.json`. In quick mode, infer reasonable defaults and proceed without an extra confirmation turn.
4. Propose 5–20 top-level semantic layers; target 8–12. Group minor objects by edit intent, semantic class, depth, and visual treatment rather than creating a layer per object.
5. Generate exactly three parameterized A/B/C proofs when direction is unsettled. The built-in SVGs are parameter schematics, not visual-effect evidence; register scene-specific rendered previews before using a proof to judge appearance. Prefer a `structure` proof before a `colour-material` proof; use `full` for a faster one-pass comparison. Select, lock, and promote one plan before detailed drawing. Use `direction-board` only for legacy or externally supplied 2–6 image contact sheets.
6. Use stable top-level IDs such as `layer-background`, `layer-subject`, and `layer-lighting`. Keep style details as child groups and objects inside those layers.
7. Default to `vector-strict`: paths, shapes, gradients, masks, patterns, and SVG filters only. Keep words out unless the accepted design plan declares explicit text-layer exceptions. Use embedded or linked raster texture only when the user explicitly selects hybrid mode.
8. Package the result according to `references/output-contract.md` and run validation before delivery.

## Create raster-layered artwork

Read `references/raster-contract.md` before generating any layer files.

1. Confirm the canvas, style, composition, and 5–20 semantic layers; target 8–12.
2. Run `new --mode raster-layered --style <recipe>`, choose Guided or Art Direction mode, and resolve the design plan before generation. Keep every rendered layer as a full-canvas PNG at identical dimensions; attach editable SVG sources only through the hybrid layer fields.
3. Lock a composition guide before detailed generation. When direction is uncertain, generate A/B/C parameterized proofs and promote one locked candidate first. Record subject boxes, horizon, camera, palette, lighting, and occlusion order in the brief and per-layer prompts.
4. Generate the bottom background layer as an opaque image. Generate every higher layer as an RGBA image with transparency outside its named content. Include the guide or preceding composite as a reference so registration stays fixed.
5. Do not bake lower layers into upper files. Remove stray backgrounds, duplicated subjects, shadows owned by another layer, and accidental opaque borders before accepting a layer.
6. Place accepted files at the paths declared in `layers/index.json`; keep candidates in `staging/`.
7. Run `compose`, then `validate --write-manifest`. Visually inspect both the composite and individual alpha layers before delivery.
8. Run `quality` for engineering checks, then perform a separate human visual review. The command does not assess composition, style execution, or artistic quality. Deliver the PNG stack, composite, preview, style recipe, prompts, index, manifest, masks, and recoverable history. Export ORA when the user wants to continue in Krita or another OpenRaster editor.

## Edit existing artwork

1. Read `project.json`, `manifest.json`, and the canonical SVG or raster layer index.
2. Resolve the target from one of five inputs:
   - explicit layer or object IDs;
   - a bounding box plus instruction;
   - a lasso mask;
   - a brush mask;
   - pure text mapped onto semantic layer and object IDs.
3. Treat explicit selection as authoritative scope. Text describes the requested change; it does not authorize unrelated changes.
4. Write or normalize an `edit-request.json` and a structured patch plan using `references/edit-contract.md`.
5. Create a recoverable snapshot before applying an edit. Modify only targets inside `expected_changed_layers`.
6. Rebuild the manifest and verify that every untouched top-level layer has the same hash. If an unrelated layer changed, revert that edit and repair the patch.
7. For SVG, preserve manually edited geometry. For raster, regenerate only selected PNG layers and apply them with `replace-layer-file`; never regenerate the whole stack for a local request.
8. Use `layer-settings` for opacity, blend mode, ordering, labels, type, source, and dependencies. Use `diff` and `undo` instead of reconstructing an older version manually.

## Drawing rules

- Preserve recognizable scene logic and fixed registration across layers.
- Design in this order: composition and crop, subject proportion, space, shape grammar, value groups, colour system, edge hierarchy, then material marks.
- Reject style directions that change only brushes, grain, or texture while leaving the photographic composition untouched.
- Do not draw titles, captions, labels, or other artwork text unless the accepted design plan explicitly allows their stable layer IDs.
- Keep registered RGB and canonical depth artifacts immutable. Prompt-directed depth changes belong in `directed-depth.json`, not in `depth-16.png`.
- Use depth bands only for diagnosis and spatial reasoning; group final layers by semantics and edit intent.
- In vector mode, prefer deliberate paths over noisy auto-traced geometry.
- In raster mode, reject empty alpha layers, flattened composites, and mismatched canvas sizes.
- In pixel-art projects, preserve the logical grid, shared palette, binary alpha, and nearest-neighbour preview scale.
- Keep every semantic layer non-empty and independently selectable.
- Keep IDs unique, stable, lowercase, and descriptive.
- Do not flatten layers or merge the document into one path.
- Keep external resources local to the project and avoid executable SVG content.
- Use deterministic seeds for procedural marks and record them in `project.json`.

## Tools

Run the bundled utility with Python 3.10 or newer:

```text
python scripts/layered_redraw.py validate <project-or-svg> --write-manifest
python scripts/layered_redraw.py split <project-or-svg>
python scripts/layered_redraw.py compose <raster-project>
python scripts/layered_redraw.py apply-patch <project-or-svg> <patch.json>
python scripts/layered_redraw.py quality <project>
python scripts/layered_redraw.py snapshot <project> --reason "Before experiment"
python scripts/layered_redraw.py history <project>
python scripts/layered_redraw.py diff <project> <snapshot-id>
python scripts/layered_redraw.py undo <project> <snapshot-id>
python scripts/layered_redraw.py layer-settings <project> <layer-id> --opacity 0.7 --blend-mode screen
python scripts/layered_redraw.py export-ora <raster-project>
python scripts/layered_redraw.py import-ora <file.ora> <project>
python scripts/layered_redraw.py styles
python scripts/layered_redraw.py presets --project <project>
python scripts/layered_redraw.py apply-preset <project> editorial-geometric --control abstraction=0.7
python scripts/layered_redraw.py design <project>
python scripts/layered_redraw.py design-check <project>
python scripts/layered_redraw.py save-preset <project> my-direction --name-zh "我的方向" --name-en "My direction"
python scripts/layered_redraw.py proof-create <project> --stage structure --spread 0.65
python scripts/layered_redraw.py proof-select <project> B
python scripts/layered_redraw.py proof-lock <project>
python scripts/layered_redraw.py proof-register <project> B rendered-preview.png
python scripts/layered_redraw.py proof-promote <project>
python scripts/layered_redraw.py proofs <project>
python scripts/layered_redraw.py direction-board <project> --candidate "A=a.png" --candidate "B=b.png"
python scripts/layered_redraw.py reference-add <project> scene.jpg --role primary-rgb
python scripts/layered_redraw.py references <project>
python scripts/layered_redraw.py depth-estimate <project> --zones 5 --device auto
python scripts/layered_redraw.py depth-register <project> depth.png --raw-near high
python scripts/layered_redraw.py plan-request <project> "Keep the main figure separate" --layers 10
python scripts/layered_redraw.py plan-resolve <project> semantic-regions.json
python scripts/layered_redraw.py serve <project-directory>
```

Use `assets/editor/` for multi-reference registration, RGB/depth comparison, RGB-D import, optional relative-depth estimation, planning-request authoring, Guided presets, Art Direction controls, parameterized A/B/C proof creation and promotion, layer, box, lasso, brush, and text-described selection; mask persistence; composition controls; history comparison; undo; engineering and plan-schema reports; and request authoring. The server is loopback-only and mutations require the same-origin session token fetched by the bundled UI. Preset and expert parameter changes participate in the revision hash and create recoverable snapshots where appropriate.

## Load references selectively

- Read `references/creative-brief.md` before a guided pre-drawing interview.
- Read `references/design-modes.md` before choosing or changing the workflow mode or presets.
- Read `references/design-proofs.md` before creating, comparing, registering, locking, or promoting parameterized proofs.
- Read `references/reference-intelligence.md` before multi-reference, RGB-D, depth-estimation, or prompt-directed semantic-layer planning.
- Read `references/layer-contract.md` before planning or restructuring layers.
- Read `references/edit-contract.md` before any localized edit.
- Read `references/raster-contract.md` for raster-layered generation, compositing, or editing.
- Read `references/pixel-art.md` whenever the requested or existing style is pixel art.
- Read `references/styles.md` only for the selected style family.
- Read `references/non-destructive-workflow.md` before history restore, ORA round trips, hybrid-source changes, or mask-based edits.
- Read `references/output-contract.md` before packaging or delivering a project.
