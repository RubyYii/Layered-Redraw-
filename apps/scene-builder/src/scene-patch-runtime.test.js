import { beforeEach, describe, expect, it } from "vitest";

import catalogFixture from "../projects/window-case-cp02/asset-catalog.json" with { type: "json" };
import projectFixture from "../projects/window-case-cp02/cp02-mutable-room.blockout.json" with { type: "json" };
import slotFixture from "../projects/window-case-cp02/scene-slots.json" with { type: "json" };
import { SceneStore, normalizeProject, serializeProject } from "./model.js";
import {
  applyScenePatch,
  hashProject,
  serializeProjectForHash,
  undoScenePatch,
  validateScenePatch,
} from "./scene-patch-runtime.js";
import { validateAssetCatalog, validateSceneSlots } from "./scene-governance.js";

const catalog = validateAssetCatalog(catalogFixture);
const slots = validateSceneSlots(slotFixture);
const protectedIds = projectFixture.objects.map((object) => object.id).sort();

const idsFor = (assetId) => {
  const asset = catalog.find((record) => record.assetId === assetId);
  return [asset.objectId, ...asset.bundle.children.map((child) => child.id)];
};

async function validReframePatch(project, overrides = {}) {
  return {
    schemaVersion: 1,
    patchId: "CP02-REFRAME-INITIAL-001",
    caseAction: "Reframe",
    provider: "deterministic-cp02-fixture-v1",
    reason: "Participant proposes furniture outside the source photograph.",
    preconditionHash: await hashProject(project),
    expectedChangedObjectIds: [
      ...idsFor("CP02-TABLE-PROXY-001"),
      ...idsFor("CP02-CHAIR-PROXY-001"),
      ...idsFor("CP02-CUP-PROXY-001"),
    ],
    forbiddenChangedObjectIds: protectedIds,
    operations: [
      { kind: "add", assetId: "CP02-TABLE-PROXY-001", slotId: "memory-table-bedside" },
      { kind: "add", assetId: "CP02-CHAIR-PROXY-001", slotId: "memory-chair-near" },
      { kind: "add", assetId: "CP02-CUP-PROXY-001", slotId: "memory-cup-on-table" },
    ],
    ...overrides,
  };
}

describe("transactional CP02 ScenePatch", () => {
  let project;

  beforeEach(() => {
    project = normalizeProject(projectFixture);
  });

  it("binds large inline evidence bytes without reserializing them into every project hash payload", async () => {
    const fullSerialization = serializeProject(project);
    const compactPayload = await serializeProjectForHash(project);
    const changed = structuredClone(project);
    const photo = changed.objects.find((object) => object.id === "sandbox-photo_image");
    const replacement = photo.render.textureDataUrl.endsWith("A") ? "B" : "A";
    photo.render.textureDataUrl = `${photo.render.textureDataUrl.slice(0, -1)}${replacement}`;

    expect(compactPayload.length).toBeLessThan(fullSerialization.length / 10);
    expect(await serializeProjectForHash(changed)).not.toBe(compactPayload);
    expect(await hashProject(changed)).not.toBe(await hashProject(project));
  });

  it("validates a patch without structured-cloning large inline evidence bytes", async () => {
    const patch = await validReframePatch(project);
    const originalStructuredClone = globalThis.structuredClone;
    let failure;

    globalThis.structuredClone = (value, options) => {
      const containsLargeInlineEvidence = value?.objects?.some(
        (object) => object.render?.textureDataUrl?.length > 1_000_000,
      );
      if (containsLargeInlineEvidence) throw new Error("large inline evidence reached structuredClone");
      return originalStructuredClone(value, options);
    };
    try {
      await validateScenePatch({ project, catalog, slots, patch, mode: "engineering-evidence" });
    } catch (error) {
      failure = error;
    } finally {
      globalThis.structuredClone = originalStructuredClone;
    }

    expect(failure).toBeUndefined();
  });

  it("rejects any patch that targets the source photograph", async () => {
    const patch = await validReframePatch(project, {
      patchId: "CP02-FORBIDDEN-SOURCE-001",
      expectedChangedObjectIds: ["sandbox-photo_image"],
      operations: [{ kind: "replace", objectId: "sandbox-photo_image", assetId: "CP02-CUP-PROXY-001" }],
    });

    await expect(validateScenePatch({ project, catalog, slots, patch, mode: "engineering-evidence" }))
      .rejects.toThrow(/SOURCE_LOCKED/);
  });

  it("turns an attempted source replacement into a WITHHELD receipt without mutation", async () => {
    const store = new SceneStore(project);
    const before = serializeProject(store.getState().project);
    const patch = await validReframePatch(store.getState().project, {
      patchId: "CP02-FORBIDDEN-SOURCE-RECEIPT-001",
      expectedChangedObjectIds: ["sandbox-photo_image"],
      operations: [{ kind: "replace", objectId: "sandbox-photo_image", assetId: "CP02-CUP-PROXY-001" }],
    });

    const receipt = await applyScenePatch({
      store, catalog, slots, patch, guardianDecision: "ALLOW", mode: "engineering-evidence",
    });

    expect(receipt).toMatchObject({ outcome: "WITHHELD", reasonCode: "SCENE_PATCH_REJECTED" });
    expect(receipt.reason).toMatch(/SOURCE_LOCKED/);
    expect(serializeProject(store.getState().project)).toBe(before);
    expect(store.historyIndex).toBe(0);
  });

  it("applies three bundles as one history entry and undo restores the exact project", async () => {
    const store = new SceneStore(project);
    const before = serializeProject(store.getState().project);
    const historyBefore = store.historyIndex;
    const patch = await validReframePatch(store.getState().project);

    const receipt = await applyScenePatch({
      store,
      catalog,
      slots,
      patch,
      guardianDecision: "ALLOW",
      mode: "engineering-evidence",
    });

    expect(store.historyIndex).toBe(historyBefore + 1);
    expect(receipt.outcome).toBe("APPLIED");
    expect(receipt.protectedPreconditionHash).toBe(receipt.protectedResultHash);
    const undoReceipt = await undoScenePatch({ store, receipt });
    expect(undoReceipt.outcome).toBe("UNDONE");
    expect(serializeProject(store.getState().project)).toBe(before);
  });

  it("rejects URL, transform, undeclared object and stale precondition input", async () => {
    for (const unsafe of [
      { url: "https://example.com/a.glb" },
      { position: [99, 0, 0] },
      { objectId: "unknown-object" },
      { preconditionHash: "stale" },
    ]) {
      const patch = await validReframePatch(project, unsafe);
      await expect(validateScenePatch({ project, catalog, slots, patch, mode: "engineering-evidence" }))
        .rejects.toThrow();
    }
  });

  it("requires the expected and forbidden object sets to be exact", async () => {
    const patch = await validReframePatch(project);

    await expect(validateScenePatch({
      project,
      catalog,
      slots,
      patch: { ...patch, expectedChangedObjectIds: patch.expectedChangedObjectIds.slice(1) },
      mode: "engineering-evidence",
    })).rejects.toThrow(/expectedChangedObjectIds/);
    await expect(validateScenePatch({
      project,
      catalog,
      slots,
      patch: { ...patch, forbiddenChangedObjectIds: patch.forbiddenChangedObjectIds.slice(1) },
      mode: "engineering-evidence",
    })).rejects.toThrow(/forbiddenChangedObjectIds/);
  });

  it("supports a second chair move and two exact undo receipts", async () => {
    const store = new SceneStore(project);
    const originalHash = await hashProject(store.getState().project);
    const firstPatch = await validReframePatch(store.getState().project);
    const firstReceipt = await applyScenePatch({
      store, catalog, slots, patch: firstPatch, guardianDecision: "ALLOW", mode: "engineering-evidence",
    });
    const movePatch = {
      schemaVersion: 1,
      patchId: "CP02-REFRAME-MOVE-001",
      caseAction: "Reframe",
      provider: "deterministic-cp02-fixture-v1",
      reason: "Participant withdraws the proposed chair.",
      preconditionHash: await hashProject(store.getState().project),
      expectedChangedObjectIds: idsFor("CP02-CHAIR-PROXY-001"),
      forbiddenChangedObjectIds: protectedIds,
      operations: [{
        kind: "move_between_slots",
        objectId: "cp02-memory-chair",
        fromSlotId: "memory-chair-near",
        slotId: "memory-chair-withdrawn",
      }],
    };
    const moveReceipt = await applyScenePatch({
      store, catalog, slots, patch: movePatch, guardianDecision: "ALLOW", mode: "engineering-evidence",
    });

    expect(store.getState().project.objects.find((object) => object.id === "cp02-memory-chair").governance.slotId)
      .toBe("memory-chair-withdrawn");
    await undoScenePatch({ store, receipt: moveReceipt });
    expect(store.getState().project.objects.find((object) => object.id === "cp02-memory-chair").governance.slotId)
      .toBe("memory-chair-near");
    await undoScenePatch({ store, receipt: firstReceipt });
    expect(await hashProject(store.getState().project)).toBe(originalHash);
  });

  it("adds the thermos on a sized carrier, keeps the cup, and undoes only the follow-up first", async () => {
    const store = new SceneStore(project);
    const originalHash = await hashProject(store.getState().project);
    const firstReceipt = await applyScenePatch({
      store,
      catalog,
      slots,
      patch: await validReframePatch(store.getState().project),
      guardianDecision: "ALLOW",
      mode: "engineering-evidence",
    });
    const afterFurnitureHash = await hashProject(store.getState().project);
    const thermosIds = idsFor("CP02-THERMOS-CARRIER-001");
    const thermosPatch = {
      schemaVersion: 1,
      patchId: "CP02-REFRAME-THERMOS-001",
      caseAction: "Reframe",
      provider: "deterministic-cp02-fixture-v1",
      reason: "Participant adds a thermos while preserving the existing cup.",
      preconditionHash: afterFurnitureHash,
      expectedChangedObjectIds: thermosIds,
      forbiddenChangedObjectIds: protectedIds,
      operations: [{
        kind: "add",
        assetId: "CP02-THERMOS-CARRIER-001",
        slotId: "memory-thermos-on-table",
      }],
    };
    const thermosReceipt = await applyScenePatch({
      store,
      catalog,
      slots,
      patch: thermosPatch,
      guardianDecision: "ALLOW",
      mode: "engineering-evidence",
    });

    const afterThermos = store.getState().project;
    expect(thermosReceipt.outcome).toBe("APPLIED");
    expect(afterThermos.objects.some((object) => object.id === "cp02-memory-cup")).toBe(true);
    expect(afterThermos.objects.find((object) => object.id === "cp02-memory-thermos")?.dimensions)
      .toEqual([0.22, 0.34, 0.22]);

    await undoScenePatch({ store, receipt: thermosReceipt });
    expect(await hashProject(store.getState().project)).toBe(afterFurnitureHash);
    expect(store.getState().project.objects.some((object) => object.id === "cp02-memory-cup")).toBe(true);
    expect(store.getState().project.objects.some((object) => object.id === "cp02-memory-thermos")).toBe(false);

    await undoScenePatch({ store, receipt: firstReceipt });
    expect(await hashProject(store.getState().project)).toBe(originalHash);
  });

  it("supports governed replace and remove operations without touching protected objects", async () => {
    const store = new SceneStore(project);
    const firstPatch = await validReframePatch(store.getState().project);
    await applyScenePatch({
      store, catalog, slots, patch: firstPatch, guardianDecision: "ALLOW", mode: "engineering-evidence",
    });

    const replacePatch = {
      schemaVersion: 1,
      patchId: "CP02-REFRAME-REPLACE-001",
      caseAction: "Reframe",
      provider: "deterministic-cp02-fixture-v1",
      reason: "Replace the proposed chair at the withdrawn authored slot.",
      preconditionHash: await hashProject(store.getState().project),
      expectedChangedObjectIds: idsFor("CP02-CHAIR-PROXY-001"),
      forbiddenChangedObjectIds: protectedIds,
      operations: [{
        kind: "replace",
        objectId: "cp02-memory-chair",
        assetId: "CP02-CHAIR-PROXY-001",
        slotId: "memory-chair-withdrawn",
      }],
    };
    const replaceReceipt = await applyScenePatch({
      store, catalog, slots, patch: replacePatch, guardianDecision: "ALLOW", mode: "engineering-evidence",
    });
    expect(replaceReceipt.outcome).toBe("APPLIED");
    expect(store.getState().project.objects.find((object) => object.id === "cp02-memory-chair").governance.slotId)
      .toBe("memory-chair-withdrawn");

    const removeIds = idsFor("CP02-CUP-PROXY-001");
    const removePatch = {
      schemaVersion: 1,
      patchId: "CP02-REFRAME-REMOVE-001",
      caseAction: "Reframe",
      provider: "deterministic-cp02-fixture-v1",
      reason: "Remove only the proposed cup bundle.",
      preconditionHash: await hashProject(store.getState().project),
      expectedChangedObjectIds: removeIds,
      forbiddenChangedObjectIds: protectedIds,
      operations: [{ kind: "remove", objectId: "cp02-memory-cup" }],
    };
    const removeReceipt = await applyScenePatch({
      store, catalog, slots, patch: removePatch, guardianDecision: "ALLOW", mode: "engineering-evidence",
    });
    expect(removeReceipt.outcome).toBe("APPLIED");
    expect(store.getState().project.objects.some((object) => removeIds.includes(object.id))).toBe(false);
    expect(removeReceipt.protectedPreconditionHash).toBe(removeReceipt.protectedResultHash);
  });

  it("returns a WITHHELD receipt without mutation when Guardian rejects", async () => {
    const store = new SceneStore(project);
    const before = serializeProject(store.getState().project);
    const patch = await validReframePatch(store.getState().project);
    const receipt = await applyScenePatch({
      store, catalog, slots, patch, guardianDecision: "REJECT", mode: "engineering-evidence",
    });

    expect(receipt.outcome).toBe("WITHHELD");
    expect(serializeProject(store.getState().project)).toBe(before);
    expect(store.historyIndex).toBe(0);
  });

  it("fails closed when unrelated edits occur after apply", async () => {
    const store = new SceneStore(project);
    const patch = await validReframePatch(store.getState().project);
    const receipt = await applyScenePatch({
      store, catalog, slots, patch, guardianDecision: "ALLOW", mode: "engineering-evidence",
    });
    store.setProjectName("unrelated edit");

    await expect(undoScenePatch({ store, receipt })).rejects.toThrow(/result hash/);
    expect(store.getState().project.name).toBe("unrelated edit");
  });
});
