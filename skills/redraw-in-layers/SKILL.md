---
name: redraw-in-layers
description: Interview the user about visual intent, analyze an uploaded reference photo, and redraw it as editable SVG artwork with 5–20 stable semantic layers (normally 8–12). Use when asked to create photo-derived vector art, layered illustrations, posters, line drawings, sketches, watercolor-like or painterly SVGs, or to revise an existing Layered Redraw project through layer selection, bounding-box selection, or pure-text instructions while preserving untouched layers.
---

# Redraw In Layers

Create artwork by writing SVG geometry and structure directly. Do not call an image-generation model or apply a one-click bitmap filter. Keep the work portable, inspectable, and locally editable.

## Route the request

- For a new reference photo, follow the new-artwork workflow.
- For an existing `artwork.svg` or Layered Redraw folder, follow the edit workflow.
- For validation, splitting, manifest generation, or local editor launch, run `scripts/layered_redraw.py` directly.
- For style-specific decisions, read `references/styles.md` only after the user chooses or requests a style.

## Create new artwork

1. Inspect the uploaded photograph and identify subjects, spatial depth, silhouette, dominant relationships, palette, light, and removable detail.
2. Determine whether the prompt already fixes the creative direction. When it does not, ask 3–5 high-information questions from `references/creative-brief.md`. Do not start detailed drawing in guided mode until the intent is understood.
3. Summarize the answers as a concise creative brief. In quick mode, infer reasonable defaults and proceed without an extra confirmation turn.
4. Propose 5–20 top-level semantic layers; target 8–12. Group minor objects by edit intent, semantic class, depth, and visual treatment rather than creating a layer per object.
5. Draw a low-detail direction proof first when style uncertainty is high. After the direction is accepted, write the complete SVG.
6. Use stable top-level IDs such as `layer-background`, `layer-subject`, and `layer-lighting`. Keep style details as child groups and objects inside those layers.
7. Default to `vector-strict`: paths, shapes, text, gradients, masks, patterns, and SVG filters only. Use embedded or linked raster texture only when the user explicitly selects hybrid mode.
8. Package the result according to `references/output-contract.md` and run validation before delivery.

## Edit existing artwork

1. Read `project.json`, `manifest.json`, and the current `artwork.svg` when present.
2. Resolve the target from one of three inputs:
   - explicit layer or object IDs;
   - a bounding box plus instruction;
   - pure text mapped onto semantic layer and object IDs.
3. Treat explicit selection as authoritative scope. Text describes the requested change; it does not authorize unrelated changes.
4. Write or normalize an `edit-request.json` and a structured patch plan using `references/edit-contract.md`.
5. Record the current manifest before editing. Modify only targets inside `expected_changed_layers`.
6. Rebuild the manifest and verify that every untouched top-level layer has the same hash. If an unrelated layer changed, revert that edit and repair the patch.
7. Preserve manually edited geometry. Never reconstruct the full SVG merely because one layer is difficult to patch.

## Drawing rules

- Preserve recognizable scene logic without mechanically tracing every contour.
- Prefer a small number of deliberate paths over noisy auto-traced geometry.
- Keep every top-level layer non-empty and independently selectable.
- Keep IDs unique, stable, lowercase, and descriptive.
- Do not flatten layers, outline every editable text object, or merge the document into one path.
- Keep external resources local to the project and avoid executable SVG content.
- Use deterministic seeds for procedural marks and record them in `project.json`.

## Tools

Run the bundled utility with Python 3.10 or newer:

```text
python scripts/layered_redraw.py validate <project-or-svg> --write-manifest
python scripts/layered_redraw.py split <project-or-svg>
python scripts/layered_redraw.py apply-patch <project-or-svg> <patch.json>
python scripts/layered_redraw.py serve <project-directory>
```

Use `assets/editor/` for local click, box-select, and instruction-request authoring. The editor creates requests; Codex interprets the artistic instruction and writes the actual vector patch.

## Load references selectively

- Read `references/creative-brief.md` before a guided pre-drawing interview.
- Read `references/layer-contract.md` before planning or restructuring layers.
- Read `references/edit-contract.md` before any localized edit.
- Read `references/styles.md` only for the selected style family.
- Read `references/output-contract.md` before packaging or delivering a project.
