# Non-destructive workflow

Use these rules for history, masks, style proofs, hybrid sources, and external-editor round trips.

## Direction proofs

Generate 2–4 low-detail candidates when the requested feeling is uncertain. Compare crop, subject scale, negative space, space flattening, shape grammar, and value grouping before palette, edge behaviour, texture, or lighting. Record accepted candidates with `direction-board`; do not carry rejected direction details into the final prompts.

## Style recipes

Treat `design-plan.json` and `style-recipe.json` as the reproducible visual contract. Preserve the chosen composition-to-material design profile and record user overrides rather than silently replacing it. List styles with `styles`, design templates with `presets`, and validate both using `design-check`.

## Recoverable revisions

- Create a snapshot before every applied patch, composition-setting change, ORA sync, or restore.
- Use `history` to inspect available revisions and `diff` to identify added, removed, changed, and unchanged layers.
- `undo` first saves the current state, then restores the requested snapshot. This makes undo reversible.
- Do not edit archives inside `history/revisions/`.
- Use layer `state_sha256` for comparisons because visibility, opacity, order, dependencies, and source metadata can change while rendered file bytes stay constant.

## Lasso and brush masks

Store masks as full-canvas binary grayscale PNG files under `masks/`. Keep the same coordinate system as the canonical SVG viewBox or raster canvas. The edit request must include the mask entry, selected semantic layer IDs, and instruction. A mask restricts location; it does not authorize changes to unselected layers.

## Hybrid layers

Keep a registered full-canvas PNG render for every raster-layered entry. Set:

- `layer_type: raster` for painted or generated PNG content;
- `layer_type: pixel` for hard-grid pixel content;
- `layer_type: vector` when `editable_source` points to a safe local SVG and `file` remains its current registered PNG render.

After changing a vector source manually, rerender its PNG at the exact canvas dimensions before composition. Never make the external source the only representation required to open the project.

Use `depends_on` for relationships such as a cast shadow depending on its subject or reflected light depending on water. Keep the dependency graph acyclic. Include linked layers only when the requested change genuinely affects them.

## Composition controls

Support `normal`, `multiply`, `screen`, `overlay`, `darken`, and `lighten`. Record visibility, lock state, opacity, blend mode, labels, layer type, editable source, dependency list, and z-order in the manifest revision. Pixel-art layers must stay at opacity 1 to preserve their palette.

## OpenRaster round trip

Use `export-ora` for manual editing in Krita or another OpenRaster editor. The export writes stable layer IDs into names, rendered layers, visibility, opacity, blend mode, merged image, and thumbnail. Use `import-ora` with the existing project directory to sync the edited stack back. Reject canvas, count, or stable-ID mismatches; create a snapshot before replacing files.

## Quality gate

Run `quality` before delivery. Resolve errors and inspect warnings for duplicate rendered pixels, near-white semi-transparent halos, upper layers covering almost the full canvas, stale composites, missing recipes, unexpected layer counts, and pixel-contract violations. A numerical score is a summary, not permission to ignore visual inspection.
