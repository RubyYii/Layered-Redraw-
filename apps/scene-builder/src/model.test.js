import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  SceneStore,
  createEmptyProject,
  createSceneObject,
  normalizeProject,
  parseProject,
  serializeProject,
} from "./model.js";

describe("scene schema", () => {
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
      },
      motion: { kind: "hover", hoverAmplitude: 0.04, bankDegrees: 8 },
      interactionSpec: {
        anchors: { effector: [0.5, 1.1, -0.2] },
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
    });
    expect(object.motion).toMatchObject({ kind: "hover", hoverAmplitude: 0.04, bankDegrees: 8 });
    expect(object.interactionSpec.affordances.inspect).toMatchObject({
      targetAnchor: "effector",
      actorNode: "hand",
      maxDistance: 1.4,
      resultingState: "inspected",
    });
  });
});

describe("SceneStore history", () => {
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
