import { describe, expect, it } from "vitest";
import { createEmptyProject, normalizeProject, parseProject, serializeProject } from "./model.js";
import {
  createPortableProjectPackage,
  filesForPortableBinding,
  importPortableProjectPackage,
  persistPortableFile,
  persistPortableFiles,
} from "./portable-project-package.js";

class MemoryPersistence {
  available = true;
  records = new Map();

  async putAsset(record) {
    this.records.set(record.sha256, structuredClone(record));
    return record;
  }

  async getAsset(sha256) {
    return this.records.get(sha256) ?? null;
  }
}

const namedBlob = (name, bytes, type = "application/octet-stream") => {
  const blob = new Blob([new Uint8Array(bytes)], { type });
  Object.defineProperty(blob, "name", { value: name, enumerable: true });
  return blob;
};

describe("portable project package", () => {
  it("round-trips project JSON and content-addressed model bytes", async () => {
    const sourceStore = new MemoryPersistence();
    const binding = await persistPortableFiles(sourceStore, "model", [{
      role: "model",
      file: namedBlob("performer.glb", [1, 2, 3, 4]),
    }]);
    const project = normalizeProject({
      ...createEmptyProject("portable"),
      objects: [{
        type: "box",
        id: "performer",
        name: "Performer",
        asset: { portable: binding },
      }],
    });

    const built = await createPortableProjectPackage(project, sourceStore, serializeProject);
    expect(built.manifest.assets).toHaveLength(1);
    expect(built.manifest.bindings[0].objectId).toBe("performer");

    const destinationStore = new MemoryPersistence();
    const imported = await importPortableProjectPackage(built.blob, destinationStore, parseProject);
    expect(imported.project.objects[0].asset.portable).toEqual(binding);
    const restored = await filesForPortableBinding(destinationStore, binding);
    expect(restored[0].role).toBe("model");
    expect([...new Uint8Array(await restored[0].file.arrayBuffer())]).toEqual([1, 2, 3, 4]);
  });

  it("requires all three spatial bridge roles", async () => {
    const store = new MemoryPersistence();
    await expect(persistPortableFiles(store, "spatial-bridge", [{
      role: "bridge",
      file: namedBlob("spatial-bridge.json", [123, 125], "application/json"),
    }])).rejects.toThrow(/文件集合不完整/);
  });

  it("round-trips an optional retarget animation beside the model", async () => {
    const sourceStore = new MemoryPersistence();
    const modelBinding = await persistPortableFiles(sourceStore, "model", [{
      role: "model",
      file: namedBlob("performer.glb", [1, 2, 3, 4]),
    }]);
    const animation = await persistPortableFile(
      sourceStore,
      "animation",
      namedBlob("wave.glb", [9, 8, 7, 6]),
    );
    const binding = { ...modelBinding, entries: [...modelBinding.entries, animation] };
    const project = normalizeProject({
      ...createEmptyProject("portable-animation"),
      objects: [{ id: "performer", name: "Performer", type: "box", asset: { portable: binding } }],
    });

    const built = await createPortableProjectPackage(project, sourceStore, serializeProject);
    expect(built.manifest.assets.map((entry) => entry.role).sort()).toEqual(["animation", "model"]);
    const destinationStore = new MemoryPersistence();
    const imported = await importPortableProjectPackage(built.blob, destinationStore, parseProject);
    const restored = await filesForPortableBinding(destinationStore, imported.project.objects[0].asset.portable);
    expect(restored.map((entry) => entry.role).sort()).toEqual(["animation", "model"]);
  });

  it("round-trips a reproducible single-image model with source, depth, and rig recipe", async () => {
    const sourceStore = new MemoryPersistence();
    const binding = await persistPortableFiles(sourceStore, "single-image-model", [
      { role: "model", file: namedBlob("portrait.glb", [1, 2, 3], "model/gltf-binary") },
      { role: "rgb", file: namedBlob("portrait-source.png", [4, 5], "image/png") },
      { role: "depth", file: namedBlob("portrait-depth.png", [6, 7], "image/png") },
      { role: "rig", file: namedBlob("portrait-rig.json", [123, 125], "application/json") },
    ]);
    const project = normalizeProject({
      ...createEmptyProject("single-image-portable"),
      objects: [{ id: "portrait", name: "Portrait", type: "plane", asset: { portable: binding } }],
    });

    const built = await createPortableProjectPackage(project, sourceStore, serializeProject);
    const destinationStore = new MemoryPersistence();
    const imported = await importPortableProjectPackage(built.blob, destinationStore, parseProject);
    const restored = await filesForPortableBinding(destinationStore, imported.project.objects[0].asset.portable);

    expect(imported.project.objects[0].asset.portable.kind).toBe("single-image-model");
    expect(restored.map((entry) => entry.role).sort()).toEqual(["depth", "model", "rgb", "rig"]);
  });
});
