# Recompose-ready scene reconstruction

Use this workflow when a real photograph must become a scene whose objects can be moved, scaled, rotated, and reordered without exposing empty cutout holes.

## What changes

A cutout stack stores only the pixels that were visible in the source. A recompose-ready stack adds two kinds of completion:

1. **Clean-plate background completion** reconstructs the static background hidden by every movable foreground object, attached contact shadow, and attached reflection.
2. **Amodal object completion** is optional and reconstructs hidden parts of a partly occluded object. A clean plate cannot repair a subject whose own silhouette is truncated by another object.

Do not describe a project as freely recompose-ready until the clean plate is registered. When a movable object was partly occluded in the source, label it `visible-only` until a separate amodal completion is supplied.

## Canonical artifacts

```text
project-name/
├─ scene-reconstruction.json
├─ reconstruction/
│  ├─ source.png
│  └─ candidates/
│     └─ clean-plate-<hash>.png
├─ masks/
│  └─ clean-plate-mask.png
├─ prompts/
│  └─ clean-plate.md
└─ layers/
   ├─ 01-background.png   # registered opaque clean plate
   └─ ...                 # transparent movable objects and effects
```

The immutable source, binary removal mask, raw completion candidate, registered clean plate, hashes, method, model/tool, seed, and verification counts remain recoverable provenance. `layers/index.json` plus the layer PNGs remain the canonical render stack.

## Clean-plate workflow

1. Put every subject that may move, plus its object-owned shadow or reflection, inside one full-canvas binary removal mask. White means unknown background; black means immutable source evidence.
2. Initialize the task:

```text
python scripts/layered_redraw.py recompose-init <project> source.png removal-mask.png --prompt "Continue the wall and floor without adding objects"
```

3. Use an image-editing or inpainting tool to create the requested full-canvas opaque candidate. The generation step may synthesize pixels only for the white mask.
4. Register the candidate:

```text
python scripts/layered_redraw.py clean-plate-register <project> candidate.png --model <tool-or-model> --seed 7
```

Registration does not trust the candidate outside the mask. It copies source pixels back into every black-mask location, writes the result into the bottom layer, marks that layer `role: clean-plate`, locks it, and verifies that `outside_mask_changed_pixels` is zero. Every later `validate` repeats the pixel-exact outside-mask check.

Use `recompose-status` to inspect whether the project is `awaiting-clean-plate` or `ready`.

## Layer transforms

Movable raster entries may store this canonical transform:

```json
{
  "role": "movable-object",
  "transform": {
    "translate_x": 0.0,
    "translate_y": 0.0,
    "scale_x": 1.0,
    "scale_y": 1.0,
    "rotation_deg": 0.0,
    "anchor_x": 0.5,
    "anchor_y": 0.5,
    "anchor_space": "content-bbox"
  }
}
```

Translations use canvas pixels. Scale values are factors, not percentages. The anchor is normalized inside the layer's non-transparent content bounds. The compositor applies the transform around that anchor, clips outside the fixed canvas, and includes the canonical transform in the layer state hash. Raster art uses premultiplied-alpha bicubic resampling; pixel art uses nearest-neighbour resampling, whole-pixel translations, and rotations in multiples of 90 degrees.

Safety bounds are intentional: scale stays between 0.01 and 20, rotation between -360 and 360 degrees, anchors between 0 and 1, and translation within four canvas widths/heights. The clean plate must keep an identity transform.

Example:

```text
python scripts/layered_redraw.py layer-settings <project> layer-primary-subject --role movable-object --translate-x 120 --translate-y -24 --scale-x 1.15 --scale-y 1.15 --rotation-deg -6
python scripts/layered_redraw.py layer-settings <project> layer-primary-subject --move top
```

## Occlusion ownership

- Order the stack from back to front; z-order is the occlusion authority.
- Keep the clean plate at the bottom.
- Keep each independently movable object transparent outside its content.
- Keep an object-owned shadow or reflection in a separate `dependent-effect` layer and link it with `depends_on`.
- Transform a dependent effect with its owner when their spatial relationship must stay fixed; regenerate it when lighting or receiving geometry changes.
- Do not bake foreground remnants into the clean plate.
- Do not bake lower layers into movable objects.

## Limits

Background completion is inferred, not recovered ground truth. Very large movements can reveal perspective or parallax that a single flat clean plate cannot represent. Use several depth-separated background plates or a 2.5D/3D workflow when strong viewpoint changes are required. Physical measurements in `object-specs.json` remain independent of these visual transforms.