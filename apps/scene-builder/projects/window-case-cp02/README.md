# PACT CP02 Mutable Room

This project is a deterministic derivative of the collaborator-authored
`window-case` fixture pinned in `source-lock.json` at Ruby's full-screenplay
commit `1691e8e`. It preserves all 200 source
objects and the source photograph bytes, while adding object-level governance
metadata and replacing the 166-second authored film timeline with a 60-second,
event-driven CP02 interaction timeline.

Regenerate it from the repository root with:

```bash
cd apps/scene-builder
npm run build:window-case:cp02
```

The generated project is an engineering-stage fixture. The current local
checkpoint has passed its runtime target and loads three separately cleared,
technically validated and artist-kept assets from a hash-bound ignored Case
Pack. That local approval does not authorise public display, publication,
deployment, or the composite artistic direction.

## Local interaction surface

Run the Scene Builder and open the CP02-only route:

```bash
npm run dev -- --host 127.0.0.1
# http://127.0.0.1:5173/?case=pact-cp02
```

The default editor route is unchanged. The CP02 route loads the derived fixture
as a separate local build asset and does not write it into the editor's default
autosave key.

The fixed proof sequence is:

1. Enter the supported memory statement and select **提出空间改写**. The table,
   chair, and cup appear only in the renderer's ephemeral `PROPOSED` layer.
2. Guardian **允许** creates one validated ScenePatch history checkpoint, or
   **拒绝** returns a `WITHHELD` receipt without changing SceneStore.
3. **椅子退出亲近位置** moves the authorised chair between two authored
   semantic slots; no direct transform is exposed to the intent provider.
4. **撤销上一补丁** uses the exact applied receipt. Two undos restore the
   original CP02 project hash after the initial add plus chair move sequence.
5. Under **工程边界验证**, the source-photo rewrite button must return
   `WITHHELD`; `sandbox-photo_image` remains `SOURCE_LOCKED` and byte-identical.

`SOURCE_LOCKED` is shown with a thin cyan edge. `EVIDENCE_LOCKED` markers appear
only when the evidence overlay is enabled. Authorised engineering proxies use a
solid material and visible seam; withheld proposals never create geometry.

The proposal preview remains a repository-authored procedural layer. After a
Guardian allow decision, the approved local Case Pack replaces the table and
chair carriers with the exact registered Poly Haven GLBs. The cup remains a
project-authored proxy. The approved thermos is a separate additive GLB and is
explicitly prohibited from replacing that cup. All four mutable objects remain
receipt-bound and reversible.

The Case Pack is served only from the ignored same-origin
`public/case-packs/pact-cp02/` directory. This route performs no model API call,
arbitrary asset retrieval, or non-local network request. The immutable
`DISCOVERED_CANDIDATE` entries in `asset-catalog.json` are the original
discovery records; the local Case Pack manifest is the current materialisation
authority.

The CP02 R2 visual profile does not delete the apparent duplicate furniture.
It treats the collaborator room's evidence table and retained cup as a dim
`ARCHIVE_LOCKED` layer at the frame edge, while the bedside table, chair,
proposal cup and additive thermos occupy a visibly labelled mutable layer. The
visual treatment changes no source object, source photograph, ScenePatch, or
undo hash.

For automated evidence, the route exposes only
`window.__PACT_CP02_EVIDENCE__.snapshot()`. It returns a structured clone of
current hashes, receipt state, governance counts, and the renderer's existing
performance report. It exposes no mutating method.

The ordinary `npm test` suite is intentionally independent of the ignored local
Case Pack. It builds a minimal self-contained GLB, binds it to an immutable
code-authored test catalog, and exercises the same byte count, SHA-256, path,
extra-file, missing-file, and symlink rejection flow. The formal `npm run
test:cp02` and `npm run render:window-case:cp02` gates still require the real
hash-bound local Case Pack; a missing pack is missing private evidence input,
not permission to substitute test bytes or claim a checkpoint pass.
