# Photo-stamp archive mode

Use `style: photo-stamp-archive` only with `raster-layered`. It preserves one supplied photograph in a dedicated panel and directly joins it to a quiet warm-paper panel containing a subject-derived stamp.

## Start a project

```text
python scripts/layered_redraw.py archive-new source.jpg output/archive \
  --orientation left-right --photo-side left --photo-ratio 0.55 \
  --stamp-shape circle --stamp-position lower-right
```

The command copies the original source bytes to `references/photo-stamp-archive/`, derives a canvas that can place the displayed source pixels without scaling, installs the style recipe and Guided preset, renders the semantic stack, and writes `archive-config.json`.

Use `archive-config <project>` to inspect the contract. Repeat it with options to revise paper, stamp, layout, inks, or the exact caption. Each mutation snapshots the previous project. Run `archive-verify <project>` to verify the copied source bytes, decoded source pixels, locked photo-layer pixels, and expected layer count with SHA-256 evidence.

## Composition contract

- Use one straight edge-to-edge seam: never gradient, feather, overlap, page turn, gutter, diagonal split, or decorative divider.
- Default to 55% photograph and 45% paper.
- Preserve at least 65% of the paper panel as a visual-direction target for quiet negative space. Engineering validation records the target but does not claim to measure artistic quality.
- Keep paper warm and lightly fibrous. Cap `paper_age` at 0.60; do not simulate heavy damage, cracks, burns, or dirt.
- Keep the stamp group in one paper-panel corner. It must be a compressed graphic impression, not a miniature pasted photograph.
- Choose `circle`, `square`, `arch`, `panoramic`, or `subject-silhouette` from subject geometry.
- Preserve a complete readable shape boundary while allowing dry-ink gaps and restrained registration error.

## Canonical layers

Default stack, bottom to top:

1. `layer-paper-base`
2. `layer-photo-panel`
3. `layer-paper-texture`
4. `layer-stamp-border`
5. `layer-stamp-motif`
6. `layer-secondary-ink`
7. `layer-dry-ink-wear`
8. `layer-archive-finish`

Add `layer-caption` as layer 9 only when the user supplies exact title or subtitle text. The deterministic CLI persists those exact fields; no caption-generation step is part of this mode. Keep the caption small, near but never over the stamp. The calling Skill must never invent, translate, or rewrite it.

Lock `layer-photo-panel` by default. Paper and stamp revisions must preserve the immutable source-file SHA-256, decoded-source-pixel SHA-256, and photo-layer-pixel SHA-256. Orientation or ratio changes may reposition the panel but must never scale, crop, redraw, or recolour the supplied source pixels.

## Revision scope

- Shape, ink, wear, and caption edits may change only their owning layers.
- Paper age may change paper base, paper texture, dry-ink wear colour, and archival finish.
- Layout orientation or photo ratio is a structural change and may rebuild every full-canvas layer after a snapshot.
- Export ORA for manual continuation; keep the PNG stack plus `layers/index.json` canonical.

## Attribution boundary

The design direction was independently implemented after reviewing the public MIT-licensed `Dlcccc71913/skill-make-photo-stamp-archive` project. Do not copy its prompt prose into generated projects. Preserve this repository's own layer, revision, text-policy, and provenance contracts.
