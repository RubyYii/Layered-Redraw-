# Edit contract

Normalize every edit into an inspectable request, then produce a structured patch plan.

## Edit request

```json
{
  "schema_version": "1.0",
  "kind": "layered-redraw-edit-request",
  "base_revision": "c3a117be0f92",
  "selection": {
    "mode": "bbox",
    "layer_ids": ["layer-water"],
    "object_ids": ["water-surface"],
    "bbox": [180, 430, 930, 320],
    "bbox_normalized": [0.15, 0.5375, 0.775, 0.4],
    "mask": null
  },
  "instruction": "Reduce the ripples and shift the water toward grey green.",
  "expected_changed_layers": ["layer-water"],
  "preserve_layers": ["layer-sky", "layer-buildings"],
  "constraints": {"preserve_unselected": true}
}
```

Selection modes are `layer`, `bbox`, `lasso`, `brush`, and `semantic-text`. A bounding box uses SVG viewBox coordinates. Lasso and brush modes save a full-canvas binary PNG under `masks/`; the mask limits location while `layer_ids` limits semantic ownership.

## Structured patch

The deterministic patch utility accepts these actions:

- `set-attributes`: set or replace SVG attributes on an element ID.
- `remove-attributes`: remove named attributes.
- `set-text`: replace the text content of a text element.
- `replace-element`: replace one element with safe SVG supplied in `svg` while preserving scope.
- `remove-element`: remove a non-layer child element.
- `replace-layer-file`: replace one PNG file in a `raster-layered` project, then validate alpha/dimensions, verify untouched hashes, and recompose.

```json
{
  "schema_version": "1.0",
  "base_revision": "c3a117be0f92",
  "expected_changed_layers": ["layer-water"],
  "operations": [
    {
      "target_id": "water-surface",
      "action": "set-attributes",
      "attributes": {"fill": "#718c80", "opacity": "0.88"}
    }
  ]
}
```

## Resolution rules

- Explicit layer or object selection outranks inferred text targets.
- Pure text should resolve nouns, spatial qualifiers, properties, and exclusions to stable IDs.
- If a global change such as lighting affects several layers, list every expected layer before applying it.
- If confidence is low and different targets would produce materially different art, ask one concise clarification question.
- Never use a bounding box as permission to crop or regenerate the document.
- Reject a patch when an operation escapes `expected_changed_layers` or changes a preserved layer.
- For raster projects, regenerate only declared layers. A replacement PNG must match the canvas and retain transparency above the bottom layer.
- For `style: pixel-art`, replacements must also preserve binary alpha and the shared palette limit; never smooth or resample a selected layer.
- Expand linked layers from `depends_on` only when the requested change affects their relationship. Record the expanded IDs before editing.
- Create a recoverable snapshot before applying the patch. Use history diff to verify both pixels and composition metadata.
