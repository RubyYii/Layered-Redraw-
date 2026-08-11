# Design modes

Layered Redraw uses one `design-plan.json` contract with two interfaces. Both modes control composition before marks or colour. Neither mode may add artwork text in v0.6.

## Guided mode

Use Guided mode by default. It is for users who want a strong result without managing a full art-direction matrix.

1. Choose a compatible preset.
2. Expose only the controls declared by that preset.
3. Let the user adjust faithfulness, abstraction, subject emphasis, space flattening, and colour intensity when exposed.
4. Resolve those controls into the complete expert parameter set before drawing.
5. Keep all unexposed decisions fixed by the preset.

For reference intelligence, Guided mode exposes scene upload, relative-depth generation, a planning prompt, a faithful/art-directed choice, and the 5–20 layer target. Model, device, RGB-D direction, and numeric depth transforms stay hidden.

Bundled presets are full visual systems, not brush packs. Each fixes composition, proportion, space, form, value, colour, edge, and material behaviour. Pixel-only presets must not be offered to non-pixel projects.

## Art Direction mode

Use Art Direction mode when the user asks to control the design language or when a preset repeatedly misses the intended result. Work from large decisions to small ones:

1. `composition`: balance, crop, negative space, asymmetry, and subject scale;
2. `space`: flattening, depth separation, and perspective strength;
3. `form`: simplification, geometricity, exaggeration, and contour closure;
4. `value`: number of value groups, global contrast, and focal contrast;
5. `color`: intensity, palette size, warmth, and accent ratio;
6. `edge`: hardness and hierarchy;
7. `material`: texture amount and mark scale.

Art Direction may additionally expose the depth model/device, supplied-depth orientation, offline cache mode, and layer-level depth flattening or exaggeration. These controls change only `depth-directive.json` and directed layer summaries; they must never mutate canonical `depth-16.png`.

Do not begin detailed rendering until composition, space, form, and value are coherent. A style is invalid when it changes only texture or brush appearance.

## Custom Guided presets

An accepted Art Direction plan can be saved under `presets/user/<id>.json`.

- Give it distinct Chinese and English names.
- Store the complete fixed parameter set.
- Expose only the Guided controls the user should be able to vary safely.
- Keep the preset local to the project so it remains portable and does not silently alter global behaviour.
- Never replace a built-in preset ID.

## Parameterized proofs

Both modes can branch the active plan into exactly three A/B/C proofs. Guided mode presents them as simple visual choices. Art Direction mode additionally shows parameter deltas and a spread control. The underlying proof files are identical in both modes.

Use `structure`, then `colour-material`, when the user needs separate composition and surface decisions. Use `full` for a single faster comparison. Require selection and lock before promotion. Read `design-proofs.md` for the complete file and state contract.

## Quality gate

Run `design-check` before detailed drawing and again before delivery. A ready plan must:

- keep `artwork_text` false;
- define every parameter group;
- include proportion and negative-space decisions;
- include a full style design profile from composition through rhythm;
- show meaningful structural change in composition, space, or form rather than relying on surface texture.

The design plan is included in the project revision hash. Take a snapshot before applying another preset or changing expert parameters.
