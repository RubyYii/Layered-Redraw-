import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  SceneStore,
  createEmptyProject,
  createEntityConfig,
  createSceneObject,
  createStarterProject,
  normalizeProject,
  parseProject,
  serializeProject,
} from "./model.js";

describe("scene schema", () => {
  it("preserves governance through project serialization", () => {
    const object = createSceneObject("box", {
      governance: { state: "SOURCE_LOCKED", sourceId: "B2-SOURCE-001" },
    });
    const parsed = parseProject(serializeProject({ ...createStarterProject(), objects: [object] }));

    expect(parsed.objects[0].governance.state).toBe("SOURCE_LOCKED");
    expect(parsed.objects[0].governance.sourceId).toBe("B2-SOURCE-001");
  });

  it("preserves validated CP02 source metadata through project serialization", () => {
    const project = {
      ...createStarterProject(),
      cp02: {
        sourceRuntimeCommit: "24b4c3b4c6c287378eb20d8b586e5064b59df256",
        sourceProjectSha256: "2b16245c4dfa07a2e689610eac94adb096a9c7c1ffc7d04329228f5419262368",
        sourcePhotoSha256: "c597660e245b599dadb5ecdc9d73720357cc81c75c2c5404376a9a01d36c8dec",
        evidenceObjectIds: ["sandbox-photo_image"],
      },
    };
    project.objects.push(createSceneObject("plane", { id: "sandbox-photo_image" }));
    const parsed = parseProject(serializeProject(project));

    expect(parsed.cp02).toEqual(project.cp02);
  });

  it("does not add synthetic governance or CP02 metadata to legacy projects", () => {
    const project = normalizeProject({ objects: [{ id: "legacy", type: "box" }] });

    expect(project.objects[0]).not.toHaveProperty("governance");
    expect(project).not.toHaveProperty("cp02");
  });

  it("rejects CP02 evidence IDs that are absent from the project", () => {
    expect(() => normalizeProject({
      objects: [],
      cp02: {
        sourceRuntimeCommit: "24b4c3b4c6c287378eb20d8b586e5064b59df256",
        sourceProjectSha256: "2b16245c4dfa07a2e689610eac94adb096a9c7c1ffc7d04329228f5419262368",
        sourcePhotoSha256: "c597660e245b599dadb5ecdc9d73720357cc81c75c2c5404376a9a01d36c8dec",
        evidenceObjectIds: ["missing-evidence"],
      },
    })).toThrow(/does not exist/);
  });

  it("normalizes unsafe object values", () => {
    const object = createSceneObject("sphere", {
      name: "",
      dimensions: [-2, "oops", 4],
      scale: [0, 2, 3],
      color: "red",
    });

    expect(object.type).toBe("sphere");
    expect(object.name).toBe("球体");
    expect(object.dimensions).toEqual([0.05, 2, 4]);
    expect(object.scale).toEqual([0.01, 2, 3]);
    expect(object.color).toBe("#91aaa5");
  });

  it("repairs duplicate ids and stamps the current schema", () => {
    const project = normalizeProject({
      schemaVersion: 0,
      objects: [
        { id: "same", type: "box" },
        { id: "same", type: "sphere" },
      ],
    });

    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(new Set(project.objects.map((object) => object.id)).size).toBe(2);
  });

  it("round-trips only plain project data", () => {
    const project = createEmptyProject("测试场景");
    project.objects.push(createSceneObject("cone", { name: "路标" }));
    project.reference = {
      dataUrl: "data:image/png;base64,AA==",
      name: "构图草图",
      width: 640,
      height: 360,
      opacity: 0.4,
      visible: true,
      prompt: "雾中的入口",
    };
    const restored = parseProject(serializeProject(project));

    expect(restored.name).toBe("测试场景");
    expect(restored.objects[0].type).toBe("cone");
    expect(restored.objects[0].name).toBe("路标");
    expect(restored.reference.name).toBe("构图草图");
    expect(restored.reference.prompt).toBe("雾中的入口");
  });

  it("migrates v1 projects without losing scene objects", () => {
    const restored = normalizeProject({
      schemaVersion: 1,
      name: "旧灰模",
      objects: [{ id: "legacy-box", type: "box", name: "旧物体" }],
    });

    expect(restored.schemaVersion).toBe(SCHEMA_VERSION);
    expect(restored.objects[0].name).toBe("旧物体");
    expect(restored.reference).toBeNull();
    expect(restored.breakdown).toEqual([]);
  });

  it("rejects future schemas", () => {
    expect(() => normalizeProject({ schemaVersion: SCHEMA_VERSION + 1 })).toThrow(/较新的项目格式/);
  });

  it("preserves safe camera framing values for director shots", () => {
    const project = normalizeProject({
      director: {
        timeline: {
          clips: [
            { type: "camera", track: "camera", start: 0, duration: 2, preset: "perspective", framing: 0.1, fromFraming: 9 },
          ],
        },
      },
    });

    expect(project.director.timeline.clips[0].framing).toBe(0.25);
    expect(project.director.timeline.clips[0].fromFraming).toBe(4);
  });

  it("preserves cinematic render metadata and explicit camera paths", () => {
    const project = normalizeProject({
      objects: [{
        id: "lit-prop",
        type: "box",
        render: {
          roughness: 0.2,
          metalness: 0.8,
          opacity: 0.35,
          emissive: "#e2bd63",
          emissiveIntensity: 4,
          edge: false,
          textureDataUrl: "data:image/png;base64,AA==",
          light: { color: "#e2bd63", intensity: 7, distance: 9, decay: 2 },
        },
      }],
      director: {
        timeline: {
          clips: [{
            type: "camera",
            track: "camera",
            start: 0,
            duration: 3,
            preset: "perspective",
            fromPosition: [0, 2, 8],
            toPosition: [1, 1.5, 4],
            fromLookAt: [0, 1, 0],
            toLookAt: [1, 1, -2],
            fromFov: 48,
            toFov: 32,
          }],
        },
      },
    });

    expect(project.objects[0].render).toMatchObject({
      roughness: 0.2,
      metalness: 0.8,
      opacity: 0.35,
      emissive: "#e2bd63",
      emissiveIntensity: 4,
      edge: false,
    });
    expect(project.objects[0].render.light.intensity).toBe(7);
    expect(project.director.timeline.clips[0]).toMatchObject({
      fromPosition: [0, 2, 8],
      toPosition: [1, 1.5, 4],
      fromLookAt: [0, 1, 0],
      toLookAt: [1, 1, -2],
      fromFov: 48,
      toFov: 32,
    });
  });

  it("preserves replaceable asset bindings and semantic interaction anchors", () => {
    const object = createSceneObject("group", {
      id: "agent-root",
      asset: {
        url: "assets/agent.glb",
        scale: 0.85,
        forwardAxis: "+Z",
        nodes: { effector: "RightHand" },
        animations: { interact: "Use" },
        bones: { head: "HeadBone", rightHand: "RightHandBone" },
        expressions: { smile: "Smile", mouthOpen: "JawOpen" },
        rigProfile: {
          contract: "blockout-studio-universal-rig-v2",
          preset: "side-quadruped-22",
          family: "quadruped",
          jointCount: 22,
          roots: ["root"],
          capabilities: ["walk", "bite", "walk"],
          chains: [{ id: "frontLeg.near", side: "near", roles: ["upperLeg", "paw"], joints: ["frontUpper", "frontPaw"], effector: "frontPaw" }],
          mapping: { root: "Root", frontPaw: "FrontPaw" },
          jointLimits: { frontPaw: { axis: "hinge", minDegrees: -35, maxDegrees: 55 } },
        },
      },
      motion: { kind: "hover", hoverAmplitude: 0.04, bankDegrees: 8 },
      interactionSpec: {
        anchors: { effector: [0.5, 1.1, -0.2] },
        collisionProxy: {
          shape: "capsule",
          dimensions: [0.8, 1.8, 0.7],
          offset: [0, 0.9, 0],
          margin: 0.06,
        },
        affordances: {
          inspect: {
            action: "inspect",
            targetAnchor: "effector",
            actorNode: "hand",
            maxDistance: 1.4,
            resultingState: "inspected",
          },
        },
      },
    });

    expect(object.asset).toMatchObject({
      url: "assets/agent.glb",
      scale: 0.85,
      forwardAxis: "+Z",
      nodes: { effector: "RightHand" },
      animations: { interact: "Use" },
      bones: { head: "HeadBone", rightHand: "RightHandBone" },
      expressions: { smile: "Smile", mouthOpen: "JawOpen" },
      rigProfile: {
        preset: "side-quadruped-22",
        family: "quadruped",
        capabilities: ["bite", "walk"],
        mapping: { root: "Root", frontPaw: "FrontPaw" },
      },
    });
    expect(object.asset).not.toHaveProperty("portable");
    expect(object.motion).toMatchObject({ kind: "hover", hoverAmplitude: 0.04, bankDegrees: 8 });
    expect(object.interactionSpec.affordances.inspect).toMatchObject({
      targetAnchor: "effector",
      actorNode: "hand",
      maxDistance: 1.4,
      resultingState: "inspected",
    });
    expect(object.interactionSpec.collisionProxy).toMatchObject({
      shape: "capsule",
      dimensions: [0.8, 1.8, 0.7],
      offset: [0, 0.9, 0],
      margin: 0.06,
      support: false,
    });
  });

  it("preserves only complete canonical multi-view gray-model bindings", () => {
    const entry = (role, character) => ({
      role,
      sha256: character.repeat(64),
      filename: `${role}.bin`,
      bytes: 12,
      mimeType: "application/octet-stream",
    });
    const complete = createSceneObject("box", {
      asset: {
        portable: {
          schemaVersion: 1,
          kind: "multi-view-gray-model",
          entries: [
            entry("model", "a"),
            entry("recipe", "b"),
            entry("view-front", "c"),
            entry("view-right", "d"),
            entry("depth-front", "e"),
          ],
        },
      },
    });
    const incomplete = createSceneObject("box", {
      asset: {
        portable: {
          schemaVersion: 1,
          kind: "multi-view-gray-model",
          entries: [entry("model", "a"), entry("recipe", "b"), entry("view-front", "c")],
        },
      },
    });

    expect(complete.asset.portable.kind).toBe("multi-view-gray-model");
    expect(complete.asset.portable.entries.map((item) => item.role)).toEqual(["depth-front", "model", "recipe", "view-front", "view-right"]);
    expect(incomplete.asset).not.toHaveProperty("portable");
  });

  it("persists explicit unmapped rig slots and controlled behavior clips", () => {
    const project = normalizeProject({
      objects: [
        { id: "actor", type: "group", entity: createEntityConfig("character"), asset: { bones: { head: null, leftHand: "Hand.L" } } },
        { id: "target", type: "box" },
      ],
      director: {
        timeline: {
          clips: [{
            id: "reach",
            type: "behavior",
            track: "character",
            start: 0,
            duration: 1,
            targetId: "actor",
            secondaryTargetId: "target",
            behaviorAction: "reach",
            hand: "both",
          }],
        },
      },
    });

    expect(project.objects[0].asset.bones).toEqual({ head: null, leftHand: "Hand.L" });
    expect(project.director.timeline.clips[0]).toMatchObject({
      type: "behavior",
      behaviorAction: "reach",
      hand: "both",
      secondaryTargetId: "target",
    });
  });
});

describe("SceneStore history", () => {
  it("checkpoints large inline evidence without serializing or structured-cloning its bytes", () => {
    const project = createEmptyProject();
    const inlineEvidence = `data:image/png;base64,${"A".repeat(2_000_000)}`;
    project.reference = {
      dataUrl: inlineEvidence,
      name: "large-evidence.png",
      width: 1280,
      height: 720,
      opacity: 0.36,
      visible: true,
      prompt: "",
    };
    const store = new SceneStore(project);
    const originalStructuredClone = globalThis.structuredClone;
    const originalStringify = JSON.stringify;
    let failure;

    globalThis.structuredClone = (value, options) => {
      if (value?.reference?.dataUrl === inlineEvidence) {
        throw new Error("large inline evidence reached structuredClone");
      }
      return originalStructuredClone(value, options);
    };
    JSON.stringify = (value, replacer, space) => {
      if (value?.reference?.dataUrl === inlineEvidence) {
        throw new Error("large inline evidence reached JSON.stringify");
      }
      return originalStringify(value, replacer, space);
    };

    try {
      store.mutate((draft) => {
        draft.name = "history without large-byte copying";
      });
      store.undo();
    } catch (error) {
      failure = error;
    } finally {
      globalThis.structuredClone = originalStructuredClone;
      JSON.stringify = originalStringify;
    }

    expect(failure).toBeUndefined();
    expect(store.getState().project.reference.dataUrl).toBe(inlineEvidence);
  });

  it("reports whether a mutation created a history checkpoint", () => {
    const store = new SceneStore(createEmptyProject());

    expect(store.mutate((project) => {
      project.name = "transactional change";
    })).toBe(true);
    expect(store.historyIndex).toBe(1);
  });

  it("supports add, edit, undo and redo", () => {
    const store = new SceneStore(createEmptyProject());
    const id = store.addObject("box");
    store.updateObject(id, { position: [2, 3, 4] });

    expect(store.getState().project.objects[0].position).toEqual([2, 3, 4]);
    expect(store.undo()).toBe(true);
    expect(store.getState().project.objects[0].position).toEqual([0, 1, 0]);
    expect(store.redo()).toBe(true);
    expect(store.getState().project.objects[0].position).toEqual([2, 3, 4]);
  });

  it("groups live gizmo updates into one checkpoint", () => {
    const store = new SceneStore(createEmptyProject());
    const id = store.addObject("box");
    store.updateObject(id, { position: [1, 1, 0] }, { history: false });
    store.updateObject(id, { position: [2, 1, 0] }, { history: false });
    store.updateObject(id, { position: [3, 1, 0] }, { history: false });
    store.checkpoint();

    expect(store.getState().project.objects[0].position).toEqual([3, 1, 0]);
    store.undo();
    expect(store.getState().project.objects[0].position).toEqual([0, 1, 0]);
  });

  it("protects locked objects from deletion", () => {
    const project = createEmptyProject();
    const locked = createSceneObject("plane", { locked: true });
    project.objects.push(locked);
    const store = new SceneStore(project);
    store.setSelection(locked.id);

    expect(store.deleteObject()).toBe(false);
    expect(store.getState().project.objects).toHaveLength(1);
  });

  it("builds and unlinks objects from the reference breakdown", () => {
    const store = new SceneStore(createEmptyProject());
    const partId = store.addBreakdownItem("入口拱门", "box");
    const objectId = store.buildBreakdownItem(partId);
    const builtState = store.getState();

    expect(builtState.project.objects[0].name).toBe("入口拱门");
    expect(builtState.project.breakdown[0].objectId).toBe(objectId);
    expect(store.deleteObject(objectId)).toBe(true);
    expect(store.getState().project.breakdown[0].objectId).toBeNull();
  });
});
