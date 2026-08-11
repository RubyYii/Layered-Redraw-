# VULCA migration decision record

Status: implementation in progress. Layered Redraw remains an incubation prototype until an SDK PR is merged and released.

## Ten pre-development answers

1. **First and only upstream capability:** `openraster-roundtrip`, an engineering Effect Pack for lossless VULCA Artifact → ORA/Krita → VULCA Artifact interchange.
2. **Canonical SDK location:** `vulca.layers.export`, `vulca.layers.manifest`, `LayerInfo`, `LayerResult`, and `LayeredArtwork`, exposed through the existing `layers export` and `layers_export` surfaces.
3. **Parallel contract removed:** the SDK implementation will not import Layered Redraw's `project.json`, `layers/index.json`, history, editor, or style schema. It consumes the existing VULCA manifest/Artifact. After SDK release, the personal ORA implementation becomes a compatibility adapter and stops receiving independent features.
4. **Visible pixel change:** none is intended. A no-edit round trip must preserve every layer's RGBA pixels and the recomposited result byte-for-pixel, while manual Krita edits may change only the edited layers.
5. **Protected invariants:** canvas size, layer count, stable IDs, names, bottom-to-top order, visibility, opacity, supported blend mode, alpha, and untouched layer pixel hashes.
6. **Baseline:** VULCA v0.23.1 exports a flat PNG or a PNG directory labelled as PSD; it has no ORA round trip. Direct-provider and filter baselines are not applicable to this engineering-only effect.
7. **Failure and rollback:** export never mutates the source Artifact. Import writes into a new destination or validated staging area, rejects malformed ZIP paths and contract drift, and provides source/import hash evidence before promotion.
8. **Provenance:** no image provider is invoked. Evidence records source manifest hash, per-layer hashes, ORA hash, operation version, timestamp, and import/export action; provider/model/prompt/seed/cost/latency are explicitly `not_applicable`.
9. **Plugin promotion:** remain `advanced/experimental` until the SDK PR is merged, a release candidate is installable, round-trip tests pass on CI, and a plugin smoke test calls only the public SDK API.
10. **End of dual-track maintenance:** once the SDK version containing ORA round-trip is released, equivalent personal runtime code is frozen and then removed in the next Layered Redraw minor release; only a thin migration adapter and incubation documentation remain.

## PR boundaries

- **Layered Redraw PR0:** license/provenance, localhost write security, CI, deterministic fixture freshness, truthful text policy, and evidence terminology.
- **VULCA SDK PR:** ORA round-trip only, using the SDK's existing layer and manifest types. No editor, depth, presets, design proofs, or parallel project schema.
- **Later work:** artistic Effect Packs require real provider execution, rights-clean source/result baselines, human selection, and separate evidence. They are intentionally outside these PRs.

