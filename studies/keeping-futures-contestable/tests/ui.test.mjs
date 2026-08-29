import assert from "node:assert/strict";
import test from "node:test";

import { BRIEFS, baseStateFor } from "../src/stimuli.mjs";
import { artefactMarkup, specimenArtworkMarkup } from "../web/ui.mjs";

test("every brief has a deterministic inline visual with the shared visual grammar", () => {
  const visualIds = new Set();
  for (const brief of BRIEFS) {
    const artwork = specimenArtworkMarkup(brief.id);
    assert.match(artwork, /<figure class="specimen-visual"/);
    assert.match(artwork, /<svg viewBox="0 0 300 220" focusable="false">/);
    assert.match(artwork, /class="artwork-grid"/);
    assert.match(artwork, /class="artwork-wash"/);
    assert.match(artwork, /class="artwork-accent(?: [^"]+)?"/);
    assert.match(artwork, /class="artwork-node"/);
    assert.match(artwork, /class="artwork-baseline"/);
    assert.doesNotMatch(artwork, /https?:|<script|<image/i);

    const visualId = artwork.match(/data-visual-id="([^"]+)"/)?.[1];
    assert.ok(visualId, `${brief.id} is missing a visual identifier`);
    visualIds.add(visualId);
  }
  assert.equal(visualIds.size, BRIEFS.length);
});

test("artefact rendering includes the visual without changing participant-visible content", () => {
  for (const brief of BRIEFS) {
    const state = baseStateFor(brief.id);
    const markup = artefactMarkup(state, { blindLabel: "ITEM-TEST" });
    assert.match(markup, /class="specimen-lead"/);
    assert.match(markup, /class="specimen-visual"/);
    assert.match(markup, /ITEM-TEST/);
    assert.match(markup, new RegExp(state.visual.metric.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    for (const field of brief.fields) {
      assert.ok(markup.includes(state.values[field.id]));
    }
  }
});

test("unknown briefs cannot introduce an unreviewed visual motif", () => {
  assert.equal(specimenArtworkMarkup("unknown-brief"), "");
});
