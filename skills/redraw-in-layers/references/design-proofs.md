# Parameterized design proofs

Use design proofs when visual direction is not settled or when the user wants to compare composition before detailed drawing. A proof is a complete parameter plan plus a low-detail preview, not a final flattened artwork.

## Contract

Generate exactly three variants from the active `design-plan.json`:

- **A — Observed Anchor / 观察锚点**: preserve reference relationships and increase calm spacing;
- **B — Editorial Shift / 编辑重构**: re-crop, flatten depth, and strengthen graphic shape rhythm;
- **C — Atmospheric Story / 氛围叙事**: use negative space, warmth, edge hierarchy, and material for narrative.

Each variant must contain:

- its own complete `design-plan.json`;
- machine-readable parameter deltas from the shared base plan;
- a low-detail `preview.svg` parameter schematic;
- `render-request.json` for creating a scene-specific vector or raster preview;
- stable A/B/C identity even when a rendered preview later replaces the schematic.

Do not treat the deterministic schematic as a finished drawing. It visualizes parameter relationships without pretending to reconstruct the uploaded scene. When Codex creates a real low-detail proof, register the rendered PNG with `proof-register`; never overwrite the candidate plan.

## Two-stage workflow

Use `structure` first when composition is uncertain. It may change only composition, space, form, and value parameters. Lock crop, subject scale, negative space, perspective, silhouette, and value grouping before surface work.

Use `colour-material` after structure is accepted. It may change only value, colour, edge, and material parameters. Keep the accepted composition, space, and form unchanged.

Use `full` for a faster one-pass comparison when the user already has a clear direction or explicitly prefers speed over separate gates.

## Selection and promotion

1. Generate A/B/C with `proof-create` or the editor.
2. Compare the preview, bilingual intent, and parameter deltas.
3. Select one variant with `proof-select`.
4. Lock it with `proof-lock`. A locked set cannot change selection until unlocked.
5. Promote it with `proof-promote`.

Promotion requires a locked selection, takes a recoverable snapshot, copies the chosen candidate into canonical `design-plan.json`, records proof provenance, and changes the project phase to `production`. Promotion does not redraw existing layers; it authorizes the subsequent 8–12-layer production pass to use the chosen parameters.

## Files

```text
proofs/
├─ index.json
└─ sets/<set-id>/
   ├─ comparison-board.svg
   ├─ a/
   │  ├─ design-plan.json
   │  ├─ preview.svg | rendered-preview.png
   │  └─ render-request.json
   ├─ b/ ...
   └─ c/ ...
```

Keep prior proof sets; do not delete them merely because a newer set becomes active. Snapshots include the proof folder so an accepted direction remains auditable.

## Commands

```text
python scripts/layered_redraw.py proof-create <project> --stage structure --spread 0.65
python scripts/layered_redraw.py proof-select <project> B
python scripts/layered_redraw.py proof-lock <project>
python scripts/layered_redraw.py proof-register <project> B <rendered-preview.png>
python scripts/layered_redraw.py proof-promote <project>
python scripts/layered_redraw.py proofs <project>
```

Use `--unlock` with `proof-lock` to reopen selection. Use `--set <set-id>` when operating on an older non-promoted set.
