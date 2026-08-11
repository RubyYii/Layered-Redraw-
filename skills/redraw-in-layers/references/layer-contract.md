# Layer contract

Use 5–20 non-empty semantic layers. Prefer 8–12. Vector projects express them as top-level SVG groups; raster projects express them as ordered full-canvas PNG files in `layers/index.json`.

## Required SVG structure

```xml
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     viewBox="0 0 1200 800">
  <g id="layer-background"
     data-layer="true"
     data-layer-type="vector"
     data-blend-mode="normal"
     data-depends-on=""
     opacity="1"
     inkscape:groupmode="layer"
     inkscape:label="Background">
    <!-- editable objects and subgroups -->
  </g>
</svg>
```

## Invariants

- Place semantic layers directly under the root `<svg>`; `<defs>`, `<style>`, `<title>`, and metadata may precede them.
- Name IDs `layer-<semantic-name>` with lowercase ASCII letters, digits, and hyphens.
- Never reuse an ID anywhere in the SVG.
- Keep the same top-level IDs when switching styles.
- Put brush marks, highlights, shadows, contours, and texture subgroups inside the owning semantic layer.
- Keep minor repeated objects together when they share edit intent.
- Split a subject only when the parts are likely to require independent edits.
- Store an optional `data-bbox="x y width height"` hint; the editor computes live geometry when possible.
- Record opacity, blend mode, visibility, lock state, bilingual labels, and dependency relationships as revision-bearing layer state.
- Keep `depends_on` acyclic. Use it for edit relationships, not merely because two layers overlap.
- When `layer-plan.json` exists, preserve its stable IDs and region ownership unless the user explicitly approves restructuring.
- Do not create one layer per depth band. Combine semantic class, occlusion, treatment, depth, edit priority, and prompt intent.
- Keep raw normalized depth separate from art-directed layer depth; both may be recorded on the plan, but only the latter controls stylized stacking.

## Output modes

- `vector-strict`: no `<image>` elements; use vector primitives, patterns, masks, gradients, and filters.
- `vector-textured`: remain vector but allow more expensive patterns, masks, filters, and repeated marks.
- `hybrid`: allow local embedded or linked raster textures while keeping semantic top-level layers vector-addressable.
- `raster-layered`: use registered full-canvas PNG renders with alpha above the bottom layer. Each entry may be `raster`, `pixel`, or `vector`; a vector entry additionally points to a safe local SVG `editable_source`. Read `raster-contract.md`.

## Recommended layer plan

Adapt this plan rather than applying it mechanically:

1. background or paper;
2. sky or far environment;
3. distant forms;
4. midground structures;
5. primary subject;
6. secondary subjects;
7. ground or water;
8. lighting and reflections;
9. foreground framing;
10. atmosphere and finishing marks.
