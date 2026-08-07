# Output contract

Deliver a project folder, not only a rendered image.

```text
project-name/
├─ artwork.svg
├─ preview.png
├─ project.json
├─ creative-brief.json
├─ manifest.json
├─ layers/
│  ├─ 01-background.svg
│  └─ ...
└─ patches/
   └─ ...
```

## Source of truth

- Treat `artwork.svg` as the canonical editable document.
- Treat `manifest.json` and `layers/` as derived artifacts that may be regenerated.
- Preserve the original reference separately only when the user wants it packaged.
- Use `preview.png` for sharing and review, never as the editable source.

## Project metadata

Record at least:

- schema version and project title;
- output mode: `vector-strict`, `vector-textured`, or `hybrid`;
- canonical SVG path;
- target layer count;
- style family and deterministic procedural seed;
- reference provenance without embedding private source data in public metadata.

Before delivery, validate the SVG, rebuild the manifest, split layer copies, render a preview when a renderer is available, and visually inspect the result.
