import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createAssetController,
  inferRigBindings,
  inferSemanticBindings,
  inspectGlbBuffer,
  loadObjFile,
  resolveRigBindings,
  resolveSemanticBindings,
  validateGlbFile,
  validateModelFile,
} from "./asset-runtime.js";

const glbWithDocument = (document) => {
  const rawJson = Buffer.from(JSON.stringify(document));
  const padding = (4 - (rawJson.length % 4)) % 4;
  const json = Buffer.concat([rawJson, Buffer.alloc(padding, 0x20)]);
  const output = Buffer.alloc(20 + json.length);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(json.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  json.copy(output, 20);
  return output;
};

describe("replaceable OBJ/GLB asset bindings", () => {
  it("infers common rig nodes and animation slots", () => {
    const bindings = inferSemanticBindings(
      ["Armature", "Head", "RightHand", "Status_Beacon"],
      ["Idle_Breath", "Walk", "Reach_Pickup", "Hit_React"],
    );

    expect(bindings.nodes).toEqual({
      root: "Armature",
      head: "Head",
      effector: "RightHand",
      statusLight: "Status_Beacon",
    });
    expect(bindings.animations).toEqual({
      idle: "Idle_Breath",
      move: "Walk",
      interact: "Reach_Pickup",
      react: "Hit_React",
    });
  });

  it("prefers valid explicit mappings and reports missing slots", () => {
    const resolved = resolveSemanticBindings(
      { nodes: { head: "FaceTarget" }, animations: { idle: "Calm" } },
      ["Root", "FaceTarget"],
      ["Calm"],
    );

    expect(resolved.nodes.head).toBe("FaceTarget");
    expect(resolved.animations.idle).toBe("Calm");
    expect(resolved.missingAnimations).toEqual(["move", "interact", "react"]);
  });

  it("infers and resolves skeleton and expression bindings", () => {
    const inferred = inferRigBindings(
      ["Armature", "Hips", "Spine01", "Head", "LeftHand", "RightHand", "Jaw"],
      ["Smile", "Blink_Left", "Blink_Right", "Jaw_Open"],
    );
    const resolved = resolveRigBindings(
      { bones: { head: "Head" }, expressions: { smile: "Smile" } },
      ["Armature", "Head"],
      ["Smile"],
    );

    expect(inferred.bones).toMatchObject({ hips: "Hips", head: "Head", leftHand: "LeftHand", rightHand: "RightHand" });
    expect(inferred.expressions).toMatchObject({ smile: "Smile", blinkLeft: "Blink_Left", mouthOpen: "Jaw_Open" });
    expect(resolved.bones.head).toBe("Head");
    expect(resolved.expressions.smile).toBe("Smile");
  });

  it("rejects split glTF and oversized local assets", () => {
    expect(validateModelFile({ name: "agent.obj", size: 100 })).toMatchObject({ format: "OBJ" });
    expect(() => validateGlbFile({ name: "agent.gltf", size: 100 })).toThrow(/GLB 或 OBJ/);
    expect(() => validateGlbFile({ name: "agent.obj", size: 100 })).toThrow(/需要单文件 GLB/);
    expect(() => validateGlbFile({ name: "agent.glb", size: 81_000_000 })).toThrow(/超过 80 MB/);
  });

  it("verifies the binary container and rejects external resource fetches", () => {
    const embedded = glbWithDocument({ asset: { version: "2.0" }, buffers: [{ byteLength: 0 }] });
    const external = glbWithDocument({ asset: { version: "2.0" }, images: [{ uri: "https://example.com/track.png" }] });

    expect(inspectGlbBuffer(embedded)).toMatchObject({ asset: { version: "2.0" } });
    expect(() => inspectGlbBuffer(external)).toThrow(/外部资源引用/);
    expect(() => inspectGlbBuffer(new Uint8Array(20))).toThrow(/有效的 GLB/);
  });

  it("drives actions, expressions, bone poses, and aspect-preserving fit through one controller", () => {
    const scene = new THREE.Group();
    scene.name = "Root";
    const hand = new THREE.Object3D();
    hand.name = "RightHand";
    const head = new THREE.Bone();
    head.name = "Head";
    const geometry = new THREE.BoxGeometry(1, 2, 1);
    geometry.morphAttributes.position = [geometry.attributes.position.clone()];
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.morphTargetDictionary = { Smile: 0 };
    mesh.morphTargetInfluences = [0];
    scene.add(hand, head, mesh);
    const controller = createAssetController({
      scene,
      animations: [new THREE.AnimationClip("Idle", 1, []), new THREE.AnimationClip("Walk", 1, [])],
    }, {
      animations: { idle: "Idle", move: "Walk" },
      nodes: { effector: "RightHand" },
      bones: { head: "Head" },
      expressions: { smile: "Smile" },
    }, "agent.glb");

    expect(controller.report.meshCount).toBe(1);
    expect(controller.report).toMatchObject({ format: "GLB", boneCount: 1, morphTargetNames: ["Smile"], preserveAspect: true });
    expect(controller.nodeFor("effector")).toBe(hand);
    expect(controller.boneFor("head")).toBe(head);
    expect(controller.setState("move")).toBe(true);
    expect(controller.setState("move")).toBe(false);
    expect(controller.playAction("Walk", { restart: true })).toBe(true);
    expect(controller.setExpression("smile", 0.75)).toBe(true);
    expect(controller.setBonePose("head", { rotationDegrees: [0, 30, 0] })).toBe(true);
    controller.fitToCarrier([2, 4, 8]);
    expect(() => controller.update(1 / 60)).not.toThrow();
    expect(mesh.morphTargetInfluences[0]).toBeCloseTo(0.75);
    expect(head.rotation.y).toBeCloseTo(Math.PI / 6);
    expect(controller.root.scale.toArray()).toEqual([2, 1, 0.5]);
    controller.dispose();
  });

  it("loads OBJ as a static, non-rigged asset without external material fetches", async () => {
    const text = "mtllib ignored.mtl\nv -0.5 0 0\nv 0.5 0 0\nv 0 1 0\nf 1 2 3\n";
    const controller = await loadObjFile({ name: "static.obj", size: text.length, text: async () => text });

    expect(controller.report).toMatchObject({
      format: "OBJ",
      meshCount: 1,
      boneCount: 0,
      clipNames: [],
      capabilities: { skeleton: false, actions: false, expressions: false },
    });
    expect(controller.report.warnings[0]).toMatch(/MTL/);
    controller.dispose();
  });

  it("reports a bound skinned mesh as a controllable skeleton", () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const vertexCount = geometry.attributes.position.count;
    const skinIndices = new Uint16Array(vertexCount * 4);
    const skinWeights = new Float32Array(vertexCount * 4);
    for (let index = 0; index < vertexCount; index += 1) skinWeights[index * 4] = 1;
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));

    const rootBone = new THREE.Bone();
    rootBone.name = "Hips";
    const skinnedMesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    skinnedMesh.add(rootBone);
    skinnedMesh.bind(new THREE.Skeleton([rootBone]));
    const scene = new THREE.Group();
    scene.add(skinnedMesh);

    const controller = createAssetController({ scene, animations: [] }, {}, "rigged.glb");

    expect(controller.report).toMatchObject({
      skinnedMeshCount: 1,
      boneCount: 1,
      capabilities: { skeleton: true },
    });
    expect(controller.boneFor("hips")).toBe(rootBone);
    controller.dispose();
  });
});
