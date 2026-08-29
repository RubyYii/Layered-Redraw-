import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createAssetController,
  inferRigBindings,
  inferSemanticBindings,
  inspectGlbBuffer,
  loadGlbBytes,
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

const createFullBodyRig = ({ degenerateRightArm = false } = {}) => {
  const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  const vertexCount = geometry.attributes.position.count;
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(vertexCount * 4), 4));
  const weights = new Float32Array(vertexCount * 4);
  for (let index = 0; index < vertexCount; index += 1) weights[index * 4] = 1;
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
  const bone = (name, position) => {
    const value = new THREE.Bone();
    value.name = name;
    value.position.fromArray(position);
    return value;
  };
  const hips = bone("Hips", [0, 0, 0]);
  const spine = bone("Spine", [0, 0.45, 0]);
  const chest = bone("Chest", [0, 0.42, 0]);
  const neck = bone("Neck", [0, 0.28, 0]);
  const head = bone("Head", [0, 0.25, 0]);
  hips.add(spine); spine.add(chest); chest.add(neck); neck.add(head);
  const limbs = {};
  for (const side of ["Left", "Right"]) {
    const sign = side === "Left" ? -1 : 1;
    const upperArm = bone(`${side}UpperArm`, [sign * 0.18, 0.16, 0]);
    const lowerArm = bone(`${side}ForeArm`, [
      side === "Right" && degenerateRightArm ? 0 : sign * 0.48,
      0,
      0,
    ]);
    const hand = bone(`${side}Hand`, [sign * 0.42, 0, 0]);
    chest.add(upperArm); upperArm.add(lowerArm); lowerArm.add(hand);
    const upperLeg = bone(`${side}UpLeg`, [sign * 0.18, -0.08, 0]);
    const lowerLeg = bone(`${side}Leg`, [0, -0.58, 0]);
    const foot = bone(`${side}Foot`, [0, -0.55, 0.12]);
    hips.add(upperLeg); upperLeg.add(lowerLeg); lowerLeg.add(foot);
    Object.assign(limbs, {
      [`${side.toLowerCase()}Hand`]: hand,
      [`${side.toLowerCase()}Foot`]: foot,
    });
  }
  const allBones = [];
  hips.traverse((node) => { if (node.isBone) allBones.push(node); });
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  mesh.add(hips);
  mesh.bind(new THREE.Skeleton(allBones));
  const scene = new THREE.Group();
  scene.add(mesh);
  return { scene, ...limbs };
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

  it("loads only self-contained GLB bytes through the reusable byte API", async () => {
    const external = glbWithDocument({
      asset: { version: "2.0" },
      images: [{ uri: "https://example.com/track.png" }],
    });

    await expect(loadGlbBytes(external, "external.glb")).rejects.toThrow(/外部资源引用/);
    await expect(loadGlbBytes(external, "external.gltf")).rejects.toThrow(/GLB/);
  });

  it("drives actions, expressions, bone poses, and aspect-preserving fit through one controller", () => {
    const scene = new THREE.Group();
    scene.name = "Root";
    const hand = new THREE.Object3D();
    hand.name = "RightHand";
    const head = new THREE.Bone();
    head.name = "Head";
    const geometry = new THREE.BoxGeometry(1, 2, 1);
    geometry.morphAttributes.position = [
      geometry.attributes.position.clone(),
      geometry.attributes.position.clone(),
    ];
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.morphTargetDictionary = { Smile: 0, JawOpen: 1 };
    mesh.morphTargetInfluences = [0, 0];
    scene.add(hand, head, mesh);
    const controller = createAssetController({
      scene,
      animations: [new THREE.AnimationClip("Idle", 1, []), new THREE.AnimationClip("Walk", 1, [])],
    }, {
      animations: { idle: "Idle", move: "Walk" },
      nodes: { effector: "RightHand" },
      bones: { head: "Head" },
      expressions: { smile: "Smile", mouthOpen: "JawOpen" },
    }, "agent.glb");

    expect(controller.report.meshCount).toBe(1);
    expect(controller.report).toMatchObject({
      format: "GLB",
      boneCount: 1,
      morphTargetNames: ["Smile", "JawOpen"],
      preserveAspect: true,
      capabilities: { semanticPerformance: true, automaticExpressions: true },
    });
    expect(controller.nodeFor("effector")).toBe(hand);
    expect(controller.boneFor("head")).toBe(head);
    expect(controller.setState("move")).toBe(true);
    expect(controller.setState("move")).toBe(false);
    expect(controller.playAction("Walk", { restart: true })).toBe(true);
    expect(controller.setExpression("smile", 0.75)).toBe(true);
    expect(controller.setBehaviorState("speak", {
      utterance: "The room remembers us.",
      phaseProgress: 0.5,
    }).ok).toBe(true);
    expect(controller.setBonePose("head", { rotationDegrees: [0, 30, 0] })).toBe(true);
    controller.fitToCarrier([2, 4, 8]);
    expect(() => controller.update(1 / 60)).not.toThrow();
    expect(mesh.morphTargetInfluences[0]).toBeCloseTo(0.75);
    expect(mesh.morphTargetInfluences[1]).toBeGreaterThan(0);
    expect(controller.getState()).toMatchObject({
      performance: { state: "speak", footLock: true },
      automaticExpressions: { JawOpen: expect.any(Number) },
    });
    expect(controller.setBehaviorState("idle").ok).toBe(true);
    expect(mesh.morphTargetInfluences[1]).toBe(0);
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

  it("can fit a shallow spatial surface by its XY carrier without crushing depth", () => {
    const scene = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.5, 0.2),
      new THREE.MeshBasicMaterial(),
    );
    scene.add(mesh);
    const controller = createAssetController(
      { scene, animations: [] },
      {},
      "spatial-bridge.json",
      { format: "RGB-D", fitAxes: [0, 1], report: { spatialBridge: { metricScale: false } } },
    );

    controller.fitToCarrier([2, 4, 0.01]);
    expect(controller.root.scale.toArray()).toEqual([1, 0.5, 200]);
    expect(controller.report).toMatchObject({
      format: "RGB-D",
      spatialBridge: { metricScale: false },
    });
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

  it("solves a real two-bone hand IK chain in world space", () => {
    const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const vertexCount = geometry.attributes.position.count;
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(vertexCount * 4), 4));
    const weights = new Float32Array(vertexCount * 4);
    for (let index = 0; index < vertexCount; index += 1) weights[index * 4] = 1;
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
    const upper = new THREE.Bone();
    upper.name = "RightUpperArm";
    const lower = new THREE.Bone();
    lower.name = "RightForeArm";
    lower.position.x = 1;
    const hand = new THREE.Bone();
    hand.name = "RightHand";
    hand.position.x = 1;
    upper.add(lower);
    lower.add(hand);
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    mesh.add(upper);
    mesh.bind(new THREE.Skeleton([upper, lower, hand]));
    const scene = new THREE.Group();
    scene.add(mesh);
    const host = new THREE.Scene();
    const controller = createAssetController({ scene, animations: [] }, {}, "arm.glb");
    host.add(controller.root);
    host.updateMatrixWorld(true);
    const before = hand.getWorldPosition(new THREE.Vector3());
    const target = before.clone().add(new THREE.Vector3(-0.35, 0.55, 0));
    const beforeDistance = before.distanceTo(target);

    expect(controller.report.capabilities.handIk).toBe(true);
    expect(controller.setHandIk("rightHand", target, { iterations: 8 })).toBe(true);
    host.updateMatrixWorld(true);
    expect(hand.getWorldPosition(new THREE.Vector3()).distanceTo(target)).toBeLessThan(beforeDistance);
    expect(controller.getState().ikTargets).toEqual(["rightHand"]);
    controller.clearIkTargets();
    controller.dispose();
  });

  it("solves both hands, locks both feet, and follows a head look target", () => {
    const rig = createFullBodyRig();
    const host = new THREE.Scene();
    const controller = createAssetController({ scene: rig.scene, animations: [] }, {}, "full-body.glb");
    host.add(controller.root);
    host.updateMatrixWorld(true);
    const leftBefore = rig.leftHand.getWorldPosition(new THREE.Vector3());
    const rightBefore = rig.rightHand.getWorldPosition(new THREE.Vector3());
    const leftTarget = leftBefore.clone().add(new THREE.Vector3(0.12, 0.16, 0.08));
    const rightTarget = rightBefore.clone().add(new THREE.Vector3(-0.12, 0.16, 0.08));

    expect(controller.report.capabilities).toMatchObject({
      twoHandIk: true,
      footLock: true,
      lookIk: true,
      fullBodyIk: true,
    });
    expect(controller.setHandIk("leftHand", leftTarget, { iterations: 8 })).toBe(true);
    expect(controller.setHandIk("rightHand", rightTarget, { iterations: 8 })).toBe(true);
    expect(controller.setLookTarget([0, 1.4, 2])).toBe(true);
    host.updateMatrixWorld(true);
    expect(rig.leftHand.getWorldPosition(new THREE.Vector3()).distanceTo(leftTarget))
      .toBeLessThan(leftBefore.distanceTo(leftTarget));
    expect(rig.rightHand.getWorldPosition(new THREE.Vector3()).distanceTo(rightTarget))
      .toBeLessThan(rightBefore.distanceTo(rightTarget));

    expect(controller.setBehaviorState("idle", {}, { recaptureFootLocks: true }).ok).toBe(true);
    expect(controller.getState().footLocks).toEqual(["leftFoot", "rightFoot"]);
    expect(controller.setBehaviorState("approach", { targetId: "destination" }).ok).toBe(true);
    expect(controller.getState().footLocks).toEqual([]);
    controller.dispose();
  });

  it("clamps an unreachable hand target and reports the effective solve target", () => {
    const rig = createFullBodyRig();
    const host = new THREE.Scene();
    const controller = createAssetController({ scene: rig.scene, animations: [] }, {}, "clamped.glb");
    host.add(controller.root);
    host.updateMatrixWorld(true);
    const target = rig.rightHand.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(100, 20, -40));

    expect(controller.setHandIk("rightHand", target, { iterations: 8 })).toBe(true);
    host.updateMatrixWorld(true);
    const diagnostic = controller.getState().ikRuntime.diagnostics.rightHand;

    expect(diagnostic).toMatchObject({ valid: true, clamped: true, reason: "outside_max_reach" });
    expect(diagnostic.effectiveDistance).toBeLessThan(diagnostic.requestedDistance);
    expect(diagnostic.effectiveDistance).toBeCloseTo(diagnostic.maxReach);
    expect(rig.rightHand.getWorldPosition(new THREE.Vector3()).toArray().every(Number.isFinite)).toBe(true);
    controller.dispose();
  });

  it("rejects zero-length limb segments without emitting invalid rotations", () => {
    const rig = createFullBodyRig({ degenerateRightArm: true });
    const controller = createAssetController({ scene: rig.scene, animations: [] }, {}, "degenerate.glb");
    const rightChain = controller.report.ikChains.find((chain) => chain.slot === "rightHand");

    expect(rightChain).toMatchObject({ valid: false, reason: "degenerate_chain" });
    expect(controller.report.capabilities.twoHandIk).toBe(false);
    expect(controller.setHandIk("rightHand", [10, 2, 0])).toBe(false);
    expect(() => controller.update(1 / 60)).not.toThrow();
    expect(rig.rightHand.quaternion.toArray().every(Number.isFinite)).toBe(true);
    controller.dispose();
  });

  it("batches timeline hand and gaze changes into one IK solve pass", () => {
    const rig = createFullBodyRig();
    const controller = createAssetController({ scene: rig.scene, animations: [] }, {}, "batch.glb");
    const leftTarget = rig.leftHand.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0.1, 0.1, 0));
    const rightTarget = rig.rightHand.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(-0.1, 0.1, 0));
    const before = controller.getState().ikRuntime.solvePasses;

    controller.beginIkBatch();
    expect(controller.setHandIk("leftHand", leftTarget, { iterations: 8 })).toBe(true);
    expect(controller.setHandIk("rightHand", rightTarget, { iterations: 8 })).toBe(true);
    expect(controller.setLookTarget([0, 1.4, 2])).toBe(true);
    expect(controller.getState().ikRuntime.solvePasses).toBe(before);
    expect(controller.endIkBatch()).toBe(true);

    expect(controller.getState().ikRuntime).toMatchObject({ solvePasses: before + 1, chainSolves: 2 });
    controller.dispose();
  });

  it("transitions interactive IK budgets gradually while export quality applies immediately", () => {
    const rig = createFullBodyRig();
    const controller = createAssetController({ scene: rig.scene, animations: [] }, {}, "lod.glb");

    controller.setIkSolvePolicy({ tier: "offscreen", iterations: 1 });
    controller.update(1 / 60);
    expect(controller.getState().ikRuntime).toMatchObject({
      policyTier: "offscreen",
      iterations: 7,
      targetIterations: 1,
    });
    for (let index = 0; index < 6; index += 1) controller.update(1 / 60);
    expect(controller.getState().ikRuntime.iterations).toBe(1);
    controller.setIkSolvePolicy({ tier: "near", iterations: 8 });
    controller.update(1 / 60);
    expect(controller.getState().ikRuntime.iterations).toBe(2);
    controller.setIkSolvePolicy({ tier: "export-full", iterations: 8 }, { immediate: true });
    expect(controller.getState().ikRuntime.iterations).toBe(8);
    controller.dispose();
  });

  it("rebuilds IK capabilities immediately after a saved bone-map change", () => {
    const rig = createFullBodyRig();
    const controller = createAssetController({ scene: rig.scene, animations: [] }, {}, "remap.glb");
    const mapping = { ...controller.report.bones, rightUpperArm: null };

    const diagnostics = controller.setRigBindings(mapping);

    expect(diagnostics.missingRequired).toContain("rightUpperArm");
    expect(controller.report.capabilities.twoHandIk).toBe(false);
    expect(controller.report.ikChains.map((chain) => chain.slot)).not.toContain("rightHand");
    controller.dispose();
  });

  it("exposes non-human rig topology and semantic capabilities without claiming humanoid full-body IK", () => {
    const rig = createFullBodyRig();
    const controller = createAssetController({ scene: rig.scene, animations: [] }, {}, "creature.glb");
    const rigProfile = {
      contract: "blockout-studio-universal-rig-v2",
      preset: "side-quadruped-22",
      family: "quadruped",
      capabilities: ["bite", "look", "run", "walk"],
      mapping: {
        frontUpper: "LeftUpperArm",
        frontLower: "LeftForeArm",
        frontPaw: "LeftHand",
        hindUpper: "LeftUpLeg",
        hindLower: "LeftLeg",
        hindPaw: "LeftFoot",
      },
      chains: [
        { id: "frontLeg.near", joints: ["frontUpper", "frontLower", "frontPaw"], effector: "frontPaw" },
        { id: "hindLeg.near", joints: ["hindUpper", "hindLower", "hindPaw"], effector: "hindPaw" },
      ],
      jointLimits: { frontLower: { axis: "hinge", minDegrees: -10, maxDegrees: 150 } },
    };

    const diagnostics = controller.setRigBindings(controller.report.bones, rigProfile);

    expect(diagnostics.applied).toBe(true);
    expect(controller.report.rigProfile).toMatchObject({ family: "quadruped", preset: "side-quadruped-22" });
    expect(controller.report.capabilities).toMatchObject({
      universalRig: true,
      nonHumanoidRig: true,
      handIk: false,
      footIk: false,
      fullBodyIk: false,
      genericIkChains: 2,
      semanticActions: ["bite", "look", "run", "walk"],
    });
    rig.scene.updateMatrixWorld(true);
    const target = rig.leftHand.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(-0.05, 0.08, 0.04));
    expect(controller.setChainIk("frontLeg.near", target, { iterations: 4 })).toBe(true);
    expect(controller.getState().ikTargets).toContain("chain:frontLeg.near");
    expect(controller.clearChainIk("frontLeg.near")).toBe(true);
    controller.dispose();
  });

  it("fails safely when a caller supplies a malformed universal rig profile", () => {
    const rig = createFullBodyRig();
    const controller = createAssetController({ scene: rig.scene, animations: [] }, {}, "malformed-rig.glb");
    expect(() => controller.setRigBindings(controller.report.bones, {
      family: "quadruped",
      chains: { invalid: true },
      capabilities: { invalid: true },
      mapping: null,
    })).not.toThrow();
    expect(controller.report.capabilities).toMatchObject({
      universalRig: true,
      nonHumanoidRig: true,
      genericIkChains: 0,
      semanticActions: [],
      fullBodyIk: false,
    });
    expect(controller.setChainIk("missing", [0, 0, 0])).toBe(false);
    controller.dispose();
  });

  it("rejects duplicate runtime bone mappings without mutating the active rig", () => {
    const rig = createFullBodyRig();
    const controller = createAssetController({ scene: rig.scene, animations: [] }, {}, "duplicate.glb");
    const before = { ...controller.report.bones };

    const diagnostics = controller.setRigBindings({ ...before, leftHand: before.rightHand });

    expect(diagnostics).toMatchObject({ applied: false });
    expect(diagnostics.duplicateBones).toHaveLength(1);
    expect(controller.report.bones).toEqual(before);
    expect(controller.report.capabilities.twoHandIk).toBe(true);
    controller.dispose();
  });

  it("retargets compatible source clips onto the loaded skeleton", async () => {
    const makeRig = () => {
      const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
      const vertexCount = geometry.attributes.position.count;
      geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(new Uint16Array(vertexCount * 4), 4));
      const weights = new Float32Array(vertexCount * 4);
      for (let index = 0; index < vertexCount; index += 1) weights[index * 4] = 1;
      geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
      const hips = new THREE.Bone();
      hips.name = "Hips";
      const arm = new THREE.Bone();
      arm.name = "RightUpperArm";
      arm.position.y = 1;
      hips.add(arm);
      const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
      mesh.add(hips);
      mesh.bind(new THREE.Skeleton([hips, arm]));
      const scene = new THREE.Group();
      scene.add(mesh);
      return { scene, arm };
    };
    const target = makeRig();
    const source = makeRig();
    const clip = new THREE.AnimationClip("Wave", 1, [
      new THREE.QuaternionKeyframeTrack(
        ".bones[RightUpperArm].quaternion",
        [0, 1],
        [0, 0, 0, 1, 0, 0.3826834, 0, 0.9238795],
      ),
    ]);
    const controller = createAssetController({ scene: target.scene, animations: [] }, {}, "target.glb");
    const report = await controller.retargetAnimationsFrom({ scene: source.scene, animations: [clip] }, { sourceName: "wave.glb" });

    expect(report.imported).toEqual(["Wave"]);
    expect(controller.report.clipNames).toContain("Wave");
    expect(controller.report.capabilities.actions).toBe(true);
    expect(controller.playAction("Wave")).toBe(true);
    controller.dispose();
  });
});
