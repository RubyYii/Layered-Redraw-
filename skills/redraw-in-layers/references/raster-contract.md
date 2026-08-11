# Raster-layered contract

Use `output_mode: raster-layered` for AI-generated or hand-painted bitmap artwork that must remain editable by semantic layer.

## File contract

```text
project-name/
├─ artwork.png
├─ preview.png
├─ project.json
├─ creative-brief.json
├─ composition.json
├─ manifest.json
├─ style-recipe.json
├─ history/
├─ masks/
├─ directions/
├─ layers/
│  ├─ index.json
│  ├─ 01-background.png
│  └─ 02-sky.png
├─ prompts/
├─ staging/
└─ patches/
```

The PNG stack plus `layers/index.json` is canonical. `artwork.png`, `preview.png`, `composition.json`, and `manifest.json` are derived.

## Layer invariants

- Use 5–20 semantic layers; prefer 8–12.
- Use stable IDs matching `layer-[a-z0-9-]+` and keep them across style variants.
- Order the `layers` array from bottom to top. Position 1 / `z_index: 1` is the background.
- Store every layer as a full-canvas PNG at the exact canvas dimensions.
- Make the bottom layer opaque unless the user requests a transparent final artwork.
- Preserve an alpha channel above the bottom layer. Pixels outside the named content must be transparent.
- Keep one semantic responsibility per file. Do not duplicate lower-layer content in an upper layer.
- Keep `opacity` between 0 and 1. Supported deterministic blend modes are `normal`, `multiply`, `screen`, `overlay`, `darken`, and `lighten`.
- Set `layer_type` to `raster`, `pixel`, or `vector`. A vector layer keeps its registered PNG in `file` and its safe local SVG in `editable_source`.
- Use an acyclic `depends_on` list for shadows, reflections, lighting, or other edit-linked ownership.
- Treat prompts and layout guides as provenance, not visible project layers.

## Registration workflow

1. Lock canvas dimensions, camera, horizon, subject boxes, palette, and light direction.
2. Create a layout guide or accepted base composite before detailed layers.
3. Generate the opaque background first.
4. Generate transparent layers from back to front, always using the same guide and canvas.
5. Composite after each accepted layer and reject drift early.
6. Put temporary candidates in `staging/`; copy only accepted PNGs to paths declared in `layers/index.json`.

## Validation and composition

```text
python scripts/layered_redraw.py new output/project --mode raster-layered --layers 10 --width 1200 --height 1600
python scripts/layered_redraw.py compose output/project
python scripts/layered_redraw.py validate output/project --write-manifest
python scripts/layered_redraw.py serve output/project --open
```

Raster commands require Pillow. Vector-only commands remain dependency-free.

Use `export-ora` to open the complete stack in an OpenRaster editor. Use `import-ora file.ora project` to sync an exported stack back after validating canvas, layer count, stable IDs, opacity, visibility, and blend modes.

## Pixel-art specialization

For pixel art, set `style: pixel-art` and read `pixel-art.md`. The preset keeps canonical layers at logical resolution, requires binary alpha and a shared limited palette, and writes a nearest-neighbour enlarged `preview.png` without resampling `artwork.png` or the source layers.

## Scoped replacement

Regenerate a selected layer as a same-size PNG and use a structured raster patch:

```json
{
  "schema_version": "1.0",
  "base_revision": "21afc9e0d041",
  "expected_changed_layers": ["layer-primary-subject"],
  "preserve_layers": ["layer-background", "layer-sky"],
  "operations": [
    {
      "target_id": "layer-primary-subject",
      "action": "replace-layer-file",
      "source": "staging/primary-subject-v2.png"
    }
  ]
}
```

Run `apply-patch` with `--dry-run` first. The utility validates dimensions and alpha, verifies preserved hashes, replaces only declared files, recomposites the artwork, and writes an audit log.
