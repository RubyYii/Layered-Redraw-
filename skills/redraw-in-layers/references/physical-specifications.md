# Physical object specifications

Use `object-specs.json` when artwork objects need declared real-world sizes,
apparel labels, placement coordinates, or angles. Keep these facts separate
from the visible SVG/PNG geometry.

## Non-negotiable distinction

- **Physical measurement** describes the real object: a belt is 100 cm long.
- **Visual transform** describes the composition: the belt is drawn at 72%,
  rotated -12 degrees, and placed at canvas coordinate 420, 310.
- **Output layout** describes the sheet: A4 at 210 x 297 mm, perhaps at 1:10.

Changing either visual scale or sheet scale must never overwrite physical
measurements.

## Evidence rules

- Treat user-entered measurements and supplied product sheets as declared data.
- Mark data as `verified` only after an appropriate human or calibrated process
  confirms it.
- A scale reference, calibrated camera, or RGB-D source can support measured
  geometry when its calibration is recorded.
- Monocular depth is relative. It may help with placement and occlusion but
  cannot establish centimetres by itself.
- If only a photograph is available, use `visual-estimate` or
  `monocular-estimate`, lower the confidence, and never call the value
  production-ready.

## Object schema

Each object has one stable `object-*` ID and belongs to one semantic `layer-*`.
One layer may own several physical objects. Vector projects may additionally
link nested SVG IDs through `object_node_ids`.

```json
{
  "id": "object-belt",
  "name_zh": "腰带",
  "name_en": "Belt",
  "layer_id": "layer-accessories",
  "object_node_ids": ["belt-shape"],
  "category": "belt",
  "measurement_source": "user-provided",
  "verification": "declared",
  "confidence": 1.0,
  "measurements": {
    "length": {"value": 100, "unit": "cm"},
    "width": {"value": 3.5, "unit": "cm", "tolerance": 0.1}
  },
  "declared_size": null,
  "placement": {
    "coordinate_unit": "svg-unit",
    "x": 420,
    "y": 310,
    "rotation_deg": -12,
    "scale_percent": 72,
    "orientation": "front",
    "pose": {"yaw_deg": 0, "pitch_deg": 0, "roll_deg": -12},
    "perspective_quad": null
  },
  "notes": null
}
```

Use kebab-case measurement names. Supported physical units are `mm`, `cm`,
`m`, `in`, and `ft`.

## Apparel fields

Do not treat `XL` as a universal physical size. Always record its brand,
region, or published standard in `declared_size.system`, and add numeric garment
measurements whenever available.

- Belt: `length`, `width`; document whether length means total length or buckle
  pin to centre hole in notes.
- Shirt: `shoulder-width`, `chest-circumference`, `garment-length`,
  `sleeve-length`.
- Skirt: `waist-circumference`, `hip-circumference`, `skirt-length`.

Category profiles are completeness warnings, not universal tailoring rules.
Add brand-specific measurements instead of forcing incompatible fields.

## CLI workflow

```text
python scripts/layered_redraw.py spec-layout <project> --output-width 210 --output-height 297 --output-unit mm --drawing-scale 1:10
python scripts/layered_redraw.py spec-set <project> layer-primary-subject object-belt --name-zh "腰带" --name-en "Belt" --category belt --measurement length=100cm --measurement width=3.5cm --rotation-deg -12 --scale-percent 72
python scripts/layered_redraw.py spec-set <project> layer-primary-subject object-shirt --name-zh "衬衫" --name-en "Shirt" --category shirt --size-label XL --size-system "Brand CN 2026" --measurement shoulder-width=48cm --measurement chest-circumference=116cm --measurement garment-length=74cm --measurement sleeve-length=62cm
python scripts/layered_redraw.py spec-set <project> layer-primary-subject object-skirt --name-zh "裙子" --name-en "Skirt" --category skirt --size-label XL --size-system "Brand CN 2026" --measurement waist-circumference=82cm --measurement hip-circumference=106cm --measurement skirt-length=78cm
python scripts/layered_redraw.py specs <project>
python scripts/layered_redraw.py spec-export <project>
```

Every mutating command creates a recoverable snapshot. `spec-export` writes an
editable SVG sheet and UTF-8 CSV under `specifications/`; it does not add text
to the canonical artwork.

## Handoff checks

Before delivery:

1. Run `validate --write-manifest` and inspect every specification warning.
2. Confirm all production-critical values are verified or explicitly declared.
3. Confirm size labels name a system and have numeric measurements where needed.
4. Confirm drawing scale and output size match the intended sheet.
5. Export the SVG/CSV specification sheet and have a designer or production
   specialist approve it.

These specifications improve design handoff. They do not replace garment
patterns, seam allowance, grading, fabric stretch data, colour management, or
printer preflight.
