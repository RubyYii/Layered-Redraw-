import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ThreeSceneAdapter } from "./editor.js";

const readRelative = (relativePath) => fs.readFileSync(
  fileURLToPath(new URL(relativePath, import.meta.url)),
  "utf8",
);

describe("CP02 interaction surface contract", () => {
  it("keeps the CP02 panel hidden by default and exposes the complete fixed proof controls", () => {
    const html = readRelative("../index.html");

    expect(html).toMatch(/id="cp02-panel"[^>]*hidden/);
    for (const id of [
      "cp02-utterance",
      "cp02-preview",
      "cp02-guardian-allow",
      "cp02-guardian-reject",
      "cp02-move-chair",
      "cp02-undo",
      "cp02-attempt-source-rewrite",
      "cp02-download-receipt",
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("publishes only a read-only evidence snapshot in CP02 query mode", () => {
    const source = readRelative("./main.js");

    expect(source).toContain("window.__PACT_CP02_EVIDENCE__ = Object.freeze");
    expect(source).toContain("snapshot: () => structuredClone");
    expect(source).toContain('searchParams.get("case") === "pact-cp02"');
  });

  it("provides ephemeral proposal and equal-duration decision-light APIs outside SceneStore", () => {
    expect(typeof ThreeSceneAdapter.prototype.showCp02ProposalPreview).toBe("function");
    expect(typeof ThreeSceneAdapter.prototype.clearCp02ProposalPreview).toBe("function");
    expect(typeof ThreeSceneAdapter.prototype.showCp02DecisionPressure).toBe("function");
    expect(typeof ThreeSceneAdapter.prototype.setGovernanceOverlay).toBe("function");
  });
});
