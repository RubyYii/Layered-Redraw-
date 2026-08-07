# Layer contract

Use 5–20 non-empty semantic top-level layers. Prefer 8–12.

## Required SVG structure

```xml
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     viewBox="0 0 1200 800">
  <g id="layer-background"
     data-layer="true"
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

## Output modes

- `vector-strict`: no `<image>` elements; use vector primitives, patterns, masks, gradients, and filters.
- `vector-textured`: remain vector but allow more expensive patterns, masks, filters, and repeated marks.
- `hybrid`: allow local embedded or linked raster textures while keeping semantic top-level layers vector-addressable.

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
