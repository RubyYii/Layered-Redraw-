# Pixel-art preset

Use `style: pixel-art` inside `raster-layered`; do not create a third output mode. Canonical layers remain full-canvas PNGs at the logical pixel resolution.

## Create the project

```text
python scripts/layered_redraw.py new output/project --mode raster-layered --style pixel-art --layers 10 --width 320 --height 240 --palette-size 32 --pixel-scale 4
```

When width and height are omitted, the CLI defaults to a 320×240 logical canvas. `artwork.png` stays at logical resolution; `preview.png` is enlarged with nearest-neighbour resampling.

## Confirm before generation

- era or family: 8-bit, 16-bit, handheld, modern high-detail, isometric, RPG environment, or portrait;
- logical canvas and delivery scale;
- shared palette size and color mood;
- silhouette priority and acceptable simplification;
- whether typography, UI ornaments, or sprite-like poses are needed.

## Generation contract

1. Lock one shared palette before detailed layers. Count visible RGB colors across the entire canonical layer stack, not per layer only.
2. Generate directly on the exact logical grid. Reject smooth high-resolution art that was merely downsampled.
3. Use hard pixel clusters. Do not use anti-aliasing, blur, soft brushes, gradients, subpixel marks, or partially transparent edge pixels.
4. Keep the background fully opaque. Use alpha values 0 or 255 on upper layers.
5. Preserve integer alignment, camera, silhouettes, light direction, and occlusion order across every generated layer.
6. Keep upper files free of baked lower-layer pixels. Use deliberate dithering made from palette colors when an intermediate tone is needed.
7. Inspect layers at 100% logical size and at the configured integer preview scale.

## Validation

`validate` rejects partial alpha, non-unit layer opacity, palette overflow, mismatched dimensions, and oversized nearest-neighbour previews. `compose` never resamples canonical layers and records preview scale and resampling in `composition.json`.

## Manual editing

Prefer Aseprite or Pixelorama. Photoshop, Krita, and Affinity Photo also work when anti-aliasing is disabled and transforms use nearest-neighbour resampling. Preserve filenames, canvas dimensions, binary alpha, and the shared palette before running `compose` and `validate` again.
