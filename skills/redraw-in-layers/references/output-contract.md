# Output contract

Deliver a project folder, not only a rendered image.

Vector projects contain `artwork.svg` plus per-layer SVG exports. Raster projects contain an ordered PNG stack plus a derived composite:

```text
project-name/
├─ artwork.svg | artwork.png
├─ preview.png
├─ project.json
├─ creative-brief.json
├─ design-plan.json      # guided or expert composition-to-material decisions
├─ object-specs.json     # real measurements, apparel sizes, transforms, sheet scale
├─ scene-reconstruction.json # clean-plate provenance and verification when used
├─ planning-request.json # RGB + prompt + immutable-depth interpretation
├─ layer-plan.json       # resolved semantic edit ownership
├─ directed-depth.json   # layer-level spatial interpretation, never raw evidence
├─ manifest.json
├─ style-recipe.json     # when a named style is selected
├─ presets/user/         # reusable project-local guided presets
├─ proofs/               # parameterized A/B/C plans, previews, and render requests
├─ history/              # recoverable source snapshots
├─ masks/                # lasso and brush selections
├─ directions/           # style proof contact sheet
├─ references/           # registered RGB sources and versioned relative-depth runs
├─ reconstruction/       # immutable source copy and raw completion candidates
├─ specifications/       # derived SVG/PDF/PNG sheets and CSV/JSON data copies
├─ layers/
│  ├─ index.json
│  ├─ 01-background.svg | 01-background.png
│  └─ ...
├─ prompts/              # raster-layered only
├─ staging/              # raster candidates only
└─ patches/
```

## Source of truth

- For vector modes, treat `artwork.svg` as canonical; `manifest.json` and exported layer SVGs are derived.
- For `raster-layered`, treat `layers/index.json` plus the PNG layer files as canonical; `artwork.png`, `preview.png`, `composition.json`, and `manifest.json` are derived.
- For recompose-ready photo projects, keep `scene-reconstruction.json`, the immutable source copy, removal mask, and raw clean-plate candidate beside the canonical stack. The registered clean plate is the locked bottom layer; transforms and z-order remain canonical entries in `layers/index.json`.
- When reference intelligence is used, keep registered RGB and every canonical depth run immutable under `references/`; create a new run instead of overwriting evidence.
- Treat `planning-request.json` and `layer-plan.json` as production inputs, not substitutes for the canonical SVG or PNG layer stack.
- Use `preview.png` for sharing and review, never as the editable source.
- For pixel art, keep `artwork.png` and every layer at logical resolution; only `preview.png` may be enlarged, using the recorded integer nearest-neighbour scale.
- For hybrid raster projects, keep each registered PNG render canonical for composition and keep `editable_source` beside it for manual source editing.
- OpenRaster files are exchange packages, not the only canonical source. Sync them back into the project and validate before delivery.
- Treat root `object-specs.json` as the source of truth for physical measurements. Visual SVG/PNG transforms and derived SVG/PDF/PNG/CSV/JSON files under `specifications/` must not redefine those values.

## Specification export formats

- Default to `specifications/object-spec-sheet.svg` as the editable specification master.
- Use PDF for print or approval at the declared physical page size.
- Use PNG for review and markup at the recorded DPI; do not treat it as an editable source.
- Use CSV for tabular exchange and JSON for a structured derived copy. Root `object-specs.json` remains canonical.
- Generate all selected formats from one validated document and commit them as one transaction. On failure, keep the previous selected outputs unchanged.
- A specification sheet is not a garment pattern, manufacturing CAD file, calibrated photogrammetric model, or printer-preflight proof.

## Project metadata

Record at least:

- schema version and project title;
- output mode: `vector-strict`, `vector-textured`, `hybrid`, or `raster-layered`;
- canonical SVG path or raster layer index and composite path;
- target layer count;
- style family and deterministic procedural seed;
- style recipe, layer types, dependencies, composition state, and history revision;
- workflow mode, selected design preset, complete design parameters, and an explicit text policy (default `artwork_text: false`; exceptions must list allowed layer IDs);
- active proof set, selected/locked/promoted direction, stage, and proof provenance when proofs are used;
- reference provenance without embedding private source data in public metadata.
- active RGB/depth IDs, source and artifact hashes, relative-depth status, and semantic layer-plan provenance when reference intelligence is used.
- object IDs, owning semantic layers, physical dimensions and units, declared size systems, measurement provenance/verification/confidence, visual transforms, output-sheet size, and drawing scale when specifications are used.
- clean-plate source/mask/candidate hashes, outside-mask verification, completion method/model/seed, layer roles, affine transforms, and occlusion order when scene reconstruction is used.

Before delivery, run `design-check` and `quality`, rebuild the manifest, render the preview, and visually inspect both the composite and the independently editable layers.
