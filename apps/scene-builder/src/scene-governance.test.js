import { describe, expect, it } from "vitest";

import catalogFixture from "../projects/window-case-cp02/asset-catalog.json" with { type: "json" };
import slotFixture from "../projects/window-case-cp02/scene-slots.json" with { type: "json" };
import {
  normalizeGovernance,
  resolveAssetForSlot,
  validateAssetCatalog,
  validateSceneSlots,
} from "./scene-governance.js";

describe("CP02 scene governance", () => {
  it("normalizes unknown states to WITHHELD", () => {
    expect(normalizeGovernance({ state: "invented" }).state).toBe("WITHHELD");
  });

  it("rejects a mutable asset from a non-matching authored slot", () => {
    const slots = validateSceneSlots([
      {
        id: "memory-chair-near",
        semanticClass: "chair",
        position: [0.55, 0.5, -0.55],
        rotation: [0, 32, 0],
      },
    ]);
    const catalog = validateAssetCatalog([
      {
        assetId: "CP02-TABLE-PROXY-001",
        semanticClass: "table",
        status: "PROJECT_AUTHORED_PROXY",
        publicDisplay: false,
        objectId: "cp02-memory-table",
        bundle: {
          children: [{
            id: "cp02-memory-table-top",
            type: "box",
            name: "table top",
            position: [0, 0.7, 0],
            dimensions: [1, 0.1, 1],
            color: "#4b382c",
          }],
        },
      },
    ]);

    expect(() => resolveAssetForSlot(
      catalog,
      slots,
      "CP02-TABLE-PROXY-001",
      "memory-chair-near",
    )).toThrow(/semantic class/i);
  });

  it("keeps discovered candidates and proxies out of curated-public resolution", () => {
    const slots = validateSceneSlots([
      { id: "memory-table-bedside", semanticClass: "table", position: [1, 1, -1], rotation: [0, 0, 0] },
    ]);
    const catalog = validateAssetCatalog([
      {
        assetId: "CP02-TABLE-PROXY-001",
        semanticClass: "table",
        status: "PROJECT_AUTHORED_PROXY",
        publicDisplay: false,
        objectId: "cp02-memory-table",
        bundle: {
          children: [{
            id: "cp02-memory-table-top",
            type: "box",
            name: "table top",
            position: [0, 0.7, 0],
            dimensions: [1, 0.1, 1],
            color: "#4b382c",
          }],
        },
      },
    ]);

    expect(() => resolveAssetForSlot(
      catalog,
      slots,
      "CP02-TABLE-PROXY-001",
      "memory-table-bedside",
      "curated-public",
    )).toThrow(/curated-public/i);
  });

  it("validates the frozen four slots, three proxies, and three discovered candidates", () => {
    const slots = validateSceneSlots(slotFixture);
    const catalog = validateAssetCatalog(catalogFixture);
    const proxies = catalog.filter((record) => record.status === "PROJECT_AUTHORED_PROXY");
    const candidates = catalog.filter((record) => record.status === "DISCOVERED_CANDIDATE");

    expect(slots.map((slot) => slot.id)).toEqual([
      "memory-table-bedside",
      "memory-chair-near",
      "memory-chair-withdrawn",
      "memory-cup-on-table",
    ]);
    expect(proxies.map((record) => record.assetId)).toEqual([
      "CP02-TABLE-PROXY-001",
      "CP02-CHAIR-PROXY-001",
      "CP02-CUP-PROXY-001",
    ]);
    expect(candidates).toHaveLength(3);
    expect(candidates.every((record) => record.publicDisplay === false)).toBe(true);
  });
});
