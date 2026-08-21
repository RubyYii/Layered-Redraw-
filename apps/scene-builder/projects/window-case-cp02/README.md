# PACT CP02 Mutable Room

This project is a deterministic derivative of the collaborator-authored
`window-case` fixture pinned in `source-lock.json`. It preserves all 200 source
objects and the source photograph bytes, while adding object-level governance
metadata and replacing the 166-second authored film timeline with a 60-second,
event-driven CP02 interaction timeline.

Regenerate it from the repository root with:

```bash
cd apps/scene-builder
npm run build:window-case:cp02
```

The generated project is an engineering-stage fixture. It is not evidence that
the CP02 interaction, performance target, public assets, or artistic direction
has been approved.

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

The three displayed furniture assets remain repository-authored engineering
proxies. The Poly Haven records in `asset-catalog.json` remain metadata-only
`DISCOVERED_CANDIDATE` entries with `publicDisplay: false`; this route performs
no model API call, public-asset download, or non-local network request.

For automated evidence, the route exposes only
`window.__PACT_CP02_EVIDENCE__.snapshot()`. It returns a structured clone of
current hashes, receipt state, governance counts, and the renderer's existing
performance report. It exposes no mutating method.
