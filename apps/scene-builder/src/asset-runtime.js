import * as THREE from "three";
import {
  animationSlotForCharacterAction,
  characterActionUsesFootLock,
  createCharacterActionStateMachine,
} from "./character-action-runtime.js";
import {
  autoMapRigBones,
  evaluateRigMapping,
  resolveRigBoneBindings,
} from "./character-rig.js";

const MAX_MODEL_BYTES = 80_000_000;
const ANIMATION_SLOTS = ["idle", "move", "interact", "react"];

const findName = (names, patterns) => {
  const entries = names.map((name) => ({ name, lower: name.toLowerCase() }));
  for (const pattern of patterns) {
    const match = entries.find((entry) => pattern.test(entry.lower));
    if (match) return match.name;
  }
  return null;
};

const uniqueNames = (names = []) => [...new Set(names.filter(Boolean).map(String))];
const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

export function inferSemanticBindings(nodeNames = [], clipNames = []) {
  const uniqueNodes = uniqueNames(nodeNames);
  const uniqueClips = uniqueNames(clipNames);
  const nodes = {
    root: findName(uniqueNodes, [/^root$/, /armature/, /hips?/, /pelvis/]) ?? uniqueNodes[0] ?? null,
    head: findName(uniqueNodes, [/(^|[_ .-])head($|[_ .-])/, /neck/, /gaze/, /camera[_ .-]?target/]),
    effector: findName(uniqueNodes, [/right[_ .-]?hand/, /hand[_ .-]?r/, /wrist/, /hand/, /probe/, /grip/]),
    statusLight: findName(uniqueNodes, [/status/, /beacon/, /indicator/, /light/, /emissive/]),
  };
  const animations = {
    idle: findName(uniqueClips, [/idle/, /stand/, /breath/]),
    move: findName(uniqueClips, [/walk/, /run/, /move/, /locomotion/]),
    interact: findName(uniqueClips, [/interact/, /pick[_ .-]?up/, /grab/, /reach/, /use/, /action/]),
    react: findName(uniqueClips, [/react/, /hit/, /surprise/, /look/, /turn/]),
  };
  return { nodes, animations };
}

export function inferRigBindings(boneNames = [], morphTargetNames = []) {
  const morphs = uniqueNames(morphTargetNames);
  return {
    bones: autoMapRigBones(boneNames).bones,
    expressions: {
      smile: findName(morphs, [/smile/, /happy/, /joy/]),
      frown: findName(morphs, [/frown/, /sad/, /angry/]),
      blinkLeft: findName(morphs, [/blink.*left/, /left.*blink/, /blink[_ .-]?l$/]),
      blinkRight: findName(morphs, [/blink.*right/, /right.*blink/, /blink[_ .-]?r$/]),
      mouthOpen: findName(morphs, [/mouth.*open/, /jaw.*open/, /viseme[_ .-]?aa/]),
      surprise: findName(morphs, [/surprise/, /wide/, /shock/]),
    },
  };
}

export function resolveSemanticBindings(config = {}, nodeNames = [], clipNames = []) {
  const inferred = inferSemanticBindings(nodeNames, clipNames);
  const nodeSet = new Set(nodeNames);
  const clipSet = new Set(clipNames);
  const nodes = Object.fromEntries(Object.entries(inferred.nodes).map(([slot, fallback]) => {
    const configured = config.nodes?.[slot];
    return [slot, configured && nodeSet.has(configured) ? configured : fallback];
  }));
  const animations = Object.fromEntries(ANIMATION_SLOTS.map((slot) => {
    const configured = config.animations?.[slot];
    return [slot, configured && clipSet.has(configured) ? configured : inferred.animations[slot]];
  }));
  return {
    nodes,
    animations,
    missingNodes: Object.entries(nodes).filter(([, name]) => !name).map(([slot]) => slot),
    missingAnimations: Object.entries(animations).filter(([, name]) => !name).map(([slot]) => slot),
  };
}

export function resolveRigBindings(config = {}, boneNames = [], morphTargetNames = []) {
  const inferred = inferRigBindings(boneNames, morphTargetNames);
  const resolvedBones = resolveRigBoneBindings(config, boneNames);
  const morphSet = new Set(morphTargetNames);
  const expressions = Object.fromEntries(Object.entries(inferred.expressions).map(([slot, fallback]) => {
    const configured = config.expressions?.[slot];
    return [slot, configured && morphSet.has(configured) ? configured : fallback];
  }));
  return {
    bones: resolvedBones.bones,
    boneSources: resolvedBones.sources,
    boneConfidence: resolvedBones.confidence,
    expressions,
    missingBones: Object.entries(resolvedBones.bones).filter(([, name]) => !name).map(([slot]) => slot),
    missingExpressions: Object.entries(expressions).filter(([, name]) => !name).map(([slot]) => slot),
  };
}

export function validateModelFile(file) {
  if (!file || typeof file !== "object") throw new Error("请选择一个 OBJ 或 GLB 模型文件。");
  const name = String(file.name ?? "");
  const extension = name.toLowerCase().match(/\.([^.]+)$/)?.[1] ?? "";
  const format = extension === "glb" ? "GLB" : extension === "obj" ? "OBJ" : null;
  if (!format) throw new Error("当前支持单文件 GLB 或 OBJ；骨架、动作和表情请使用 GLB。");
  const size = Number(file.size) || 0;
  if (!size) throw new Error(`${format} 文件为空。`);
  if (size > MAX_MODEL_BYTES) throw new Error(`${format} 超过 80 MB，请先压缩网格与贴图。`);
  return { name, size, format };
}

export function validateGlbFile(file) {
  const metadata = validateModelFile(file);
  if (metadata.format !== "GLB") throw new Error("当前接口需要单文件 GLB；骨架、动作和表情不能从 OBJ 读取。");
  return metadata;
}

export function inspectGlbBuffer(input) {
  const buffer = input instanceof ArrayBuffer
    ? input
    : ArrayBuffer.isView(input)
      ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
      : null;
  if (!buffer || buffer.byteLength < 20) throw new Error("文件不是有效的 GLB 2.0 容器。");
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
    throw new Error("文件不是有效的 GLB 2.0 容器。");
  }
  if (view.getUint32(8, true) !== buffer.byteLength) throw new Error("GLB 声明长度与文件大小不一致。");

  let offset = 12;
  let document = null;
  while (offset + 8 <= buffer.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkLength % 4 || chunkEnd > buffer.byteLength) throw new Error("GLB 分块长度无效。");
    if (chunkType === 0x4e4f534a && !document) {
      const jsonText = new TextDecoder().decode(new Uint8Array(buffer, chunkStart, chunkLength))
        .replace(/\u0000+$/u, "")
        .trim();
      try {
        document = JSON.parse(jsonText);
      } catch {
        throw new Error("GLB 的 JSON 场景描述无效。");
      }
    }
    offset = chunkEnd;
  }
  if (offset !== buffer.byteLength || !document) throw new Error("GLB 缺少有效的 JSON 分块。");
  const uris = [
    ...(document.buffers ?? []).map((entry) => entry?.uri),
    ...(document.images ?? []).map((entry) => entry?.uri),
  ].filter((uri) => typeof uri === "string" && !uri.startsWith("data:"));
  if (uris.length) throw new Error("GLB 含外部资源引用；请把缓冲区与贴图完整嵌入单文件。");
  return document;
}

const forwardRotation = (axis) => ({
  "+Z": Math.PI,
  "-X": -Math.PI / 2,
  "+X": Math.PI / 2,
}[axis] ?? 0);

const disposeMaterial = (material) => {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (value?.isTexture) value.dispose();
  }
  material.dispose?.();
};

const poseVector = (value) => Array.isArray(value) && value.length >= 3
  ? value.slice(0, 3).map((entry) => Number(entry) || 0)
  : null;
const basenameForRetarget = (value) => String(value ?? "animation.glb")
  .replaceAll("\\", "/")
  .split("/")
  .at(-1)
  .replace(/\.glb$/i, "")
  .slice(0, 48) || "retargeted";

export function createAssetController(asset, config = {}, sourceName = "model.glb", options = {}) {
  if (!asset?.scene?.isObject3D) throw new Error("模型中没有可用的三维场景。");
  const format = options.format ?? (/\.obj$/i.test(sourceName) ? "OBJ" : "GLB");
  const content = asset.scene;
  const nodeNames = [];
  const boneNames = [];
  const morphTargets = new Map();
  const nodeByName = new Map();
  const boneByName = new Map();
  let meshCount = 0;
  let skinnedMeshCount = 0;
  let firstSkinnedMesh = null;
  content.traverse((node) => {
    if (node.name) {
      nodeNames.push(node.name);
      if (!nodeByName.has(node.name)) nodeByName.set(node.name, node);
    }
    if (node.isBone && node.name) {
      boneNames.push(node.name);
      if (!boneByName.has(node.name)) boneByName.set(node.name, node);
    }
    if (!node.isMesh) return;
    meshCount += 1;
    if (node.isSkinnedMesh) {
      skinnedMeshCount += 1;
      firstSkinnedMesh ??= node;
    }
    node.castShadow = true;
    node.receiveShadow = true;
    for (const [name, index] of Object.entries(node.morphTargetDictionary ?? {})) {
      if (!morphTargets.has(name)) morphTargets.set(name, []);
      morphTargets.get(name).push({ mesh: node, index });
    }
  });
  if (!meshCount) throw new Error(`${format} 中没有可渲染网格。`);

  content.updateMatrixWorld(true);
  const sourceBounds = new THREE.Box3().setFromObject(content);
  if (sourceBounds.isEmpty()) throw new Error(`${format} 的包围盒为空，无法确定模型尺寸。`);
  const sourceSize = sourceBounds.getSize(new THREE.Vector3());
  const center = sourceBounds.getCenter(new THREE.Vector3());
  const root = new THREE.Group();
  root.name = `Runtime asset · ${sourceName}`;
  root.userData.isRuntimeAsset = true;
  const normalized = new THREE.Group();
  normalized.rotation.y = forwardRotation(config.forwardAxis);
  normalized.scale.setScalar(1 / Math.max(sourceSize.x, sourceSize.y, sourceSize.z, 0.0001));
  const centered = new THREE.Group();
  centered.position.copy(center).multiplyScalar(-1);
  centered.add(content);
  normalized.add(centered);
  root.add(normalized);
  root.updateMatrixWorld(true);
  const unitSize = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  const assetScale = Math.max(0.001, Number(config.scale) || 1);
  const fitAxes = Array.isArray(options.fitAxes)
    ? [...new Set(options.fitAxes.filter((axis) => Number.isInteger(axis) && axis >= 0 && axis <= 2))]
    : [0, 1, 2];
  if (!fitAxes.length) fitAxes.push(0, 1, 2);
  let lastCarrierScale = null;

  const clips = Array.isArray(asset.animations) ? asset.animations : [];
  const clipNames = uniqueNames(clips.map((clip) => clip.name));
  const uniqueNodeNames = uniqueNames(nodeNames);
  const uniqueBoneNames = uniqueNames(boneNames);
  const morphTargetNames = [...morphTargets.keys()];
  const semanticBindings = resolveSemanticBindings(config, uniqueNodeNames, clipNames);
  let rigConfig = { ...config, bones: { ...(config.bones ?? {}) } };
  let rigBindings = resolveRigBindings(rigConfig, uniqueBoneNames, morphTargetNames);
  const clipByName = new Map(clips.map((clip) => [clip.name, clip]));
  const morphNameByLower = new Map(morphTargetNames.map((name) => [name.toLowerCase(), name]));
  const boneNameByLower = new Map(uniqueBoneNames.map((name) => [name.toLowerCase(), name]));
  const boneByUuid = new Map([...boneByName.values()].map((bone) => [bone.uuid, bone]));
  let mixer = clips.length ? new THREE.AnimationMixer(content) : null;
  const expressionOverrides = new Map();
  const bonePoseOverrides = new Map();
  const ikTargets = new Map();
  const ikPreSolve = new Map();
  const actionStateMachine = createCharacterActionStateMachine();
  let lookTarget = null;
  const boneRestPose = new Map([...boneByName.values()].map((bone) => [bone.uuid, {
    position: bone.position.clone(),
    quaternion: bone.quaternion.clone(),
    scale: bone.scale.clone(),
  }]));
  let currentAction = null;
  let currentActionName = null;
  let currentSlot = null;

  const resolveExpressionName = (nameOrSlot) => {
    const requested = String(nameOrSlot ?? "");
    return rigBindings.expressions[requested] ?? morphNameByLower.get(requested.toLowerCase()) ?? null;
  };
  const resolveBone = (nameOrSlot) => {
    const requested = String(nameOrSlot ?? "");
    const name = Object.hasOwn(rigBindings.bones, requested)
      ? rigBindings.bones[requested]
      : boneNameByLower.get(requested.toLowerCase());
    return name ? boneByName.get(name) ?? null : null;
  };
  const applyExpressionOverrides = () => {
    for (const [name, weight] of expressionOverrides) {
      for (const target of morphTargets.get(name) ?? []) {
        if (target.mesh.morphTargetInfluences) target.mesh.morphTargetInfluences[target.index] = weight;
      }
    }
  };
  const applyBonePoseOverrides = () => {
    for (const { bone, pose } of bonePoseOverrides.values()) {
      if (pose.position) bone.position.fromArray(pose.position);
      if (pose.rotationDegrees) bone.rotation.set(
        THREE.MathUtils.degToRad(pose.rotationDegrees[0]),
        THREE.MathUtils.degToRad(pose.rotationDegrees[1]),
        THREE.MathUtils.degToRad(pose.rotationDegrees[2]),
      );
      if (pose.scale) bone.scale.fromArray(pose.scale);
    }
  };
  const limbSlotFor = (nameOrSlot, preferredKind = "hand") => {
    const requested = String(nameOrSlot ?? "").toLowerCase();
    const kind = requested.includes("foot") || requested.includes("leg") || requested.includes("toe")
      ? "foot"
      : requested.includes("hand") || requested.includes("arm") || requested.includes("wrist")
        ? "hand"
        : preferredKind;
    const side = requested.includes("left") || requested.endsWith("_l") || requested.endsWith(".l")
      ? "left"
      : requested.includes("right") || requested.endsWith("_r") || requested.endsWith(".r")
        ? "right"
        : null;
    if (side) return `${side}${kind === "foot" ? "Foot" : "Hand"}`;
    const right = `right${kind === "foot" ? "Foot" : "Hand"}`;
    const left = `left${kind === "foot" ? "Foot" : "Hand"}`;
    return rigBindings.bones[right] ? right : rigBindings.bones[left] ? left : null;
  };
  const chainForLimb = (slot) => {
    if (!slot) return null;
    const side = slot.startsWith("left") ? "left" : "right";
    const kind = slot.endsWith("Foot") ? "foot" : "hand";
    const effector = resolveBone(slot);
    const lower = resolveBone(`${side}${kind === "foot" ? "LowerLeg" : "LowerArm"}`);
    const upper = resolveBone(`${side}${kind === "foot" ? "UpperLeg" : "UpperArm"}`);
    if (!effector || !lower || !upper || new Set([effector.uuid, lower.uuid, upper.uuid]).size !== 3) return null;
    return { slot, kind, effector, joints: [lower, upper] };
  };
  const restoreIkPose = () => {
    for (const [uuid, quaternion] of ikPreSolve) {
      const bone = boneByUuid.get(uuid);
      if (bone) bone.quaternion.copy(quaternion);
    }
    ikPreSolve.clear();
  };
  const solveLimbIk = ({ chain, target, weight, iterations }) => {
    const identity = new THREE.Quaternion();
    const jointWorld = new THREE.Quaternion();
    const parentWorld = new THREE.Quaternion();
    const effectorPosition = new THREE.Vector3();
    const jointPosition = new THREE.Vector3();
    const currentDirection = new THREE.Vector3();
    const targetDirection = new THREE.Vector3();
    const maxStep = THREE.MathUtils.degToRad(42);
    for (const joint of chain.joints) {
      if (!ikPreSolve.has(joint.uuid)) ikPreSolve.set(joint.uuid, joint.quaternion.clone());
    }
    content.updateMatrixWorld(true);
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (const joint of chain.joints) {
        chain.effector.getWorldPosition(effectorPosition);
        joint.getWorldPosition(jointPosition);
        currentDirection.copy(effectorPosition).sub(jointPosition);
        targetDirection.copy(target).sub(jointPosition);
        if (currentDirection.lengthSq() < 1e-10 || targetDirection.lengthSq() < 1e-10) continue;
        currentDirection.normalize();
        targetDirection.normalize();
        const deltaWorld = new THREE.Quaternion().setFromUnitVectors(currentDirection, targetDirection);
        const angle = identity.angleTo(deltaWorld);
        if (angle > maxStep) deltaWorld.slerp(identity, 1 - maxStep / angle);
        joint.getWorldQuaternion(jointWorld);
        const desiredWorld = deltaWorld.multiply(jointWorld);
        if (joint.parent) joint.parent.getWorldQuaternion(parentWorld).invert();
        else parentWorld.identity();
        const desiredLocal = parentWorld.multiply(desiredWorld);
        joint.quaternion.slerp(desiredLocal, weight);
        joint.updateWorldMatrix(false, true);
      }
      chain.effector.getWorldPosition(effectorPosition);
      if (effectorPosition.distanceToSquared(target) < 1e-6) break;
    }
  };
  const applyLookTarget = () => {
    if (!lookTarget) return;
    const chain = [resolveBone("chest"), resolveBone("neck"), resolveBone("head")].filter(Boolean);
    if (!chain.length) return;
    const weights = chain.length === 3 ? [0.18, 0.32, 0.5] : chain.map(() => 1 / chain.length);
    const worldPosition = new THREE.Vector3();
    const worldQuaternion = new THREE.Quaternion();
    const parentWorld = new THREE.Quaternion();
    const forward = new THREE.Vector3();
    const desired = new THREE.Vector3();
    const identity = new THREE.Quaternion();
    for (const [index, bone] of chain.entries()) {
      if (!ikPreSolve.has(bone.uuid)) ikPreSolve.set(bone.uuid, bone.quaternion.clone());
      bone.getWorldPosition(worldPosition);
      desired.copy(lookTarget.target).sub(worldPosition);
      if (desired.lengthSq() < 1e-10) continue;
      bone.getWorldQuaternion(worldQuaternion);
      forward.set(0, 0, 1).applyQuaternion(worldQuaternion).normalize();
      desired.normalize();
      const deltaWorld = new THREE.Quaternion().setFromUnitVectors(forward, desired);
      const maxRadians = THREE.MathUtils.degToRad(lookTarget.maxDegrees * weights[index]);
      const angle = identity.angleTo(deltaWorld);
      if (angle > maxRadians) deltaWorld.slerp(identity, 1 - maxRadians / angle);
      const desiredWorld = deltaWorld.multiply(worldQuaternion);
      if (bone.parent) bone.parent.getWorldQuaternion(parentWorld).invert();
      else parentWorld.identity();
      bone.quaternion.slerp(parentWorld.multiply(desiredWorld), lookTarget.weight);
      bone.updateWorldMatrix(false, true);
    }
  };
  const applyIkTargets = () => {
    restoreIkPose();
    for (const entry of ikTargets.values()) solveLimbIk(entry);
    applyLookTarget();
  };
  const activateClip = (clipName, slot, { fadeSeconds = 0.18, loop = true, restart = false } = {}) => {
    const clip = clipByName.get(clipName);
    if (!mixer || !clip) {
      currentSlot = slot;
      currentActionName = null;
      return false;
    }
    if (!restart && currentSlot === slot && currentActionName === clipName) return false;
    const nextAction = mixer.clipAction(clip);
    nextAction.enabled = true;
    nextAction.reset();
    nextAction.setEffectiveTimeScale(1);
    nextAction.setEffectiveWeight(1);
    nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    nextAction.clampWhenFinished = !loop;
    nextAction.play();
    if (currentAction && currentAction !== nextAction) currentAction.crossFadeTo(nextAction, fadeSeconds, true);
    currentAction = nextAction;
    currentActionName = clipName;
    currentSlot = slot;
    return true;
  };

  const rigRuntimeReport = () => {
    const chains = ["leftHand", "rightHand", "leftFoot", "rightFoot"]
      .map(chainForLimb)
      .filter(Boolean);
    const diagnostics = evaluateRigMapping(rigBindings.bones, uniqueBoneNames, {
      sources: rigBindings.boneSources,
    });
    const handChains = chains.filter((chain) => chain.kind === "hand");
    const footChains = chains.filter((chain) => chain.kind === "foot");
    const lookBones = ["chest", "neck", "head"].filter((slot) => resolveBone(slot));
    return {
      bones: { ...rigBindings.bones },
      boneSources: { ...rigBindings.boneSources },
      boneConfidence: { ...rigBindings.boneConfidence },
      missingBones: [...rigBindings.missingBones],
      rigDiagnostics: diagnostics,
      ikChains: chains.map((chain) => ({
        slot: chain.slot,
        kind: chain.kind,
        bones: [...chain.joints.map((bone) => bone.name), chain.effector.name],
      })),
      capabilities: {
        handIk: handChains.length > 0,
        twoHandIk: handChains.length === 2,
        footIk: footChains.length > 0,
        footLock: footChains.length === 2,
        lookIk: lookBones.length > 0,
        fullBodyIk: diagnostics.valid && handChains.length === 2 && footChains.length === 2 && lookBones.length === 3,
      },
    };
  };
  const initialRigReport = rigRuntimeReport();

  const controller = {
    root,
    report: {
      sourceName,
      format,
      meshCount,
      skinnedMeshCount,
      nodeCount: uniqueNodeNames.length,
      boneCount: uniqueBoneNames.length,
      boneNames: uniqueBoneNames,
      clipNames,
      morphTargetNames,
      bounds: [sourceSize.x, sourceSize.y, sourceSize.z],
      unitBounds: [unitSize.x, unitSize.y, unitSize.z],
      preserveAspect: true,
      capabilities: {
        geometry: true,
        skeleton: skinnedMeshCount > 0 && uniqueBoneNames.length > 0,
        actions: clipNames.length > 0,
        expressions: morphTargetNames.length > 0,
        ...initialRigReport.capabilities,
        animationRetargeting: Boolean(firstSkinnedMesh?.skeleton),
      },
      ikChains: initialRigReport.ikChains,
      rigDiagnostics: initialRigReport.rigDiagnostics,
      warnings: [...(options.warnings ?? [])],
      ...semanticBindings,
      ...rigBindings,
      ...(options.report ?? {}),
    },
    fitToCarrier(carrierScale) {
      const available = (carrierScale?.toArray?.() ?? carrierScale ?? [1, 1, 1])
        .slice(0, 3)
        .map((value) => Math.max(0.0001, Math.abs(Number(value) || 1)));
      if (lastCarrierScale?.every((value, axis) => value === available[axis])) return false;
      const unitDimensions = [unitSize.x, unitSize.y, unitSize.z];
      const candidates = fitAxes
        .map((axis) => unitDimensions[axis] > 0.0001 ? available[axis] / unitDimensions[axis] : Infinity);
      const uniformWorldScale = Math.min(...candidates) * assetScale;
      root.scale.set(
        uniformWorldScale / available[0],
        uniformWorldScale / available[1],
        uniformWorldScale / available[2],
      );
      lastCarrierScale = available;
      return true;
    },
    setState(slot = "idle", fadeSeconds = 0.18) {
      const safeSlot = ANIMATION_SLOTS.includes(slot) ? slot : "idle";
      const clipName = semanticBindings.animations[safeSlot] ?? semanticBindings.animations.idle;
      const loop = safeSlot !== "interact" && safeSlot !== "react";
      return activateClip(clipName, safeSlot, { fadeSeconds, loop });
    },
    playAction(nameOrSlot, options = {}) {
      const requested = String(nameOrSlot ?? "");
      const slot = ANIMATION_SLOTS.includes(requested) ? requested : null;
      const clipName = slot
        ? semanticBindings.animations[slot]
        : clipByName.has(requested) ? requested : null;
      if (!clipName) return false;
      const inferredSlot = slot ?? Object.entries(semanticBindings.animations)
        .find(([, name]) => name === clipName)?.[0] ?? `clip:${clipName}`;
      const defaultLoop = inferredSlot !== "interact" && inferredSlot !== "react";
      return activateClip(clipName, inferredSlot, {
        fadeSeconds: options.fadeSeconds,
        loop: options.loop ?? defaultLoop,
        restart: options.restart === true,
      });
    },
    setExpression(nameOrSlot, weight, { exclusive = false } = {}) {
      const name = resolveExpressionName(nameOrSlot);
      if (!name) return false;
      if (exclusive) controller.clearExpressions();
      const safeWeight = clamp01(weight);
      for (const target of morphTargets.get(name) ?? []) {
        if (target.mesh.morphTargetInfluences) target.mesh.morphTargetInfluences[target.index] = safeWeight;
      }
      if (safeWeight > 0) expressionOverrides.set(name, safeWeight);
      else expressionOverrides.delete(name);
      return true;
    },
    clearExpressions() {
      for (const name of expressionOverrides.keys()) {
        for (const target of morphTargets.get(name) ?? []) {
          if (target.mesh.morphTargetInfluences) target.mesh.morphTargetInfluences[target.index] = 0;
        }
      }
      expressionOverrides.clear();
    },
    setLimbIk(nameOrSlot, targetWorld, { weight = 1, iterations = 4, locked = false, kind = "hand" } = {}) {
      const slot = limbSlotFor(nameOrSlot, kind);
      const chain = chainForLimb(slot);
      const target = targetWorld?.isVector3
        ? targetWorld.clone()
        : Array.isArray(targetWorld) && targetWorld.length >= 3
          ? new THREE.Vector3(...targetWorld.slice(0, 3).map((value) => Number(value) || 0))
          : null;
      if (!chain || !target) return false;
      const safeWeight = clamp01(weight);
      if (safeWeight <= 0) return controller.clearLimbIk(slot, { kind });
      ikTargets.set(slot, {
        chain,
        target,
        weight: safeWeight,
        iterations: Math.min(8, Math.max(1, Math.round(Number(iterations) || 4))),
        locked: locked === true,
      });
      applyIkTargets();
      return true;
    },
    clearLimbIk(nameOrSlot, { kind = "hand" } = {}) {
      const slot = limbSlotFor(nameOrSlot, kind);
      if (!slot || !ikTargets.delete(slot)) return false;
      applyIkTargets();
      return true;
    },
    setHandIk(nameOrSlot, targetWorld, options = {}) {
      return controller.setLimbIk(nameOrSlot, targetWorld, { ...options, kind: "hand", locked: false });
    },
    clearHandIk(nameOrSlot) {
      return controller.clearLimbIk(nameOrSlot, { kind: "hand" });
    },
    setFootLock(nameOrSlot, enabledOrTarget = true, options = {}) {
      const slot = limbSlotFor(nameOrSlot, "foot");
      if (!slot) return false;
      if (enabledOrTarget === false) return controller.clearLimbIk(slot, { kind: "foot" });
      const chain = chainForLimb(slot);
      if (!chain) return false;
      root.updateWorldMatrix(true, true);
      const target = enabledOrTarget?.isVector3 || Array.isArray(enabledOrTarget)
        ? enabledOrTarget
        : chain.effector.getWorldPosition(new THREE.Vector3());
      return controller.setLimbIk(slot, target, {
        ...options,
        kind: "foot",
        locked: true,
        iterations: options.iterations ?? 6,
      });
    },
    clearFootLock(nameOrSlot) {
      return controller.clearLimbIk(nameOrSlot, { kind: "foot" });
    },
    setLookTarget(targetWorld, { weight = 1, maxDegrees = 55 } = {}) {
      const target = targetWorld?.isVector3
        ? targetWorld.clone()
        : Array.isArray(targetWorld) && targetWorld.length >= 3
          ? new THREE.Vector3(...targetWorld.slice(0, 3).map((value) => Number(value) || 0))
          : null;
      if (!target || !["chest", "neck", "head"].some((slot) => resolveBone(slot))) return false;
      lookTarget = {
        target,
        weight: clamp01(weight),
        maxDegrees: Math.min(85, Math.max(1, Number(maxDegrees) || 55)),
      };
      applyIkTargets();
      return true;
    },
    clearLookTarget() {
      if (!lookTarget) return false;
      lookTarget = null;
      applyIkTargets();
      return true;
    },
    clearTransientIkTargets() {
      let changed = Boolean(lookTarget);
      lookTarget = null;
      for (const [slot, entry] of ikTargets) {
        if (!entry.locked) {
          ikTargets.delete(slot);
          changed = true;
        }
      }
      if (changed) applyIkTargets();
      return changed;
    },
    clearIkTargets() {
      const changed = ikTargets.size > 0 || ikPreSolve.size > 0 || Boolean(lookTarget);
      ikTargets.clear();
      lookTarget = null;
      restoreIkPose();
      return changed;
    },
    setRigBindings(bones = {}) {
      const nextRigConfig = { ...rigConfig, bones: { ...bones } };
      const nextRigBindings = resolveRigBindings(nextRigConfig, uniqueBoneNames, morphTargetNames);
      const nextDiagnostics = evaluateRigMapping(nextRigBindings.bones, uniqueBoneNames, {
        sources: nextRigBindings.boneSources,
      });
      if (nextDiagnostics.duplicateBones.length) {
        return structuredClone({ ...nextDiagnostics, applied: false });
      }
      controller.clearIkTargets();
      rigConfig = nextRigConfig;
      rigBindings = nextRigBindings;
      const nextRigReport = rigRuntimeReport();
      Object.assign(controller.report, {
        bones: nextRigReport.bones,
        boneSources: nextRigReport.boneSources,
        boneConfidence: nextRigReport.boneConfidence,
        missingBones: nextRigReport.missingBones,
        rigDiagnostics: nextRigReport.rigDiagnostics,
        ikChains: nextRigReport.ikChains,
      });
      Object.assign(controller.report.capabilities, nextRigReport.capabilities);
      return structuredClone({ ...nextRigReport.rigDiagnostics, applied: true });
    },
    setBehaviorState(state = "idle", context = {}, { synchronize = true, recaptureFootLocks = false } = {}) {
      const result = synchronize
        ? actionStateMachine.synchronize(state, context, { source: context.source ?? "timeline" })
        : actionStateMachine.transition(state, context, { source: context.source ?? "runtime" });
      if (!result.ok) return result;
      controller.setState(animationSlotForCharacterAction(state));
      if (!characterActionUsesFootLock(state)) {
        controller.clearFootLock("leftFoot");
        controller.clearFootLock("rightFoot");
      } else if (result.changed || recaptureFootLocks) {
        controller.clearFootLock("leftFoot");
        controller.clearFootLock("rightFoot");
        controller.setFootLock("leftFoot", true, { weight: 1 });
        controller.setFootLock("rightFoot", true, { weight: 1 });
      }
      return result;
    },
    async retargetAnimationsFrom(sourceAsset, { sourceName = "animation.glb", boneMap = {} } = {}) {
      if (!firstSkinnedMesh?.skeleton) throw new Error("目标模型没有可重定向的蒙皮骨架。");
      const sourceClips = Array.isArray(sourceAsset?.animations) ? sourceAsset.animations : [];
      let sourceSkinnedMesh = null;
      sourceAsset?.scene?.traverse?.((node) => {
        if (!sourceSkinnedMesh && node.isSkinnedMesh) sourceSkinnedMesh = node;
      });
      if (!sourceSkinnedMesh?.skeleton || !sourceClips.length) {
        throw new Error("动作 GLB 必须同时包含蒙皮骨架与至少一个 AnimationClip。");
      }
      const { retargetClip } = await import("three/examples/jsm/utils/SkeletonUtils.js");
      const mappedName = (targetBone) => boneMap[targetBone.name] ?? targetBone.name;
      const targetHip = rigBindings.bones.hips;
      const imported = [];
      const failures = [];
      for (const sourceClip of sourceClips) {
        try {
          if (!(Number(sourceClip.duration) > 0) || !sourceClip.tracks?.length) throw new Error("动画轨道为空");
          firstSkinnedMesh.skeleton.pose();
          sourceSkinnedMesh.skeleton.pose();
          firstSkinnedMesh.updateMatrixWorld(true);
          sourceSkinnedMesh.updateMatrixWorld(true);
          const clip = retargetClip(firstSkinnedMesh, sourceSkinnedMesh, sourceClip, {
            getBoneName: mappedName,
            hip: targetHip ? mappedName({ name: targetHip }) : undefined,
            useFirstFramePosition: true,
          });
          let name = sourceClip.name || `Retargeted ${imported.length + 1}`;
          if (clipByName.has(name)) name = `${name} · ${basenameForRetarget(sourceName)}`;
          let suffix = 2;
          while (clipByName.has(name)) name = `${sourceClip.name || "Retargeted"} · ${suffix++}`;
          clip.name = name;
          clips.push(clip);
          clipNames.push(name);
          clipByName.set(name, clip);
          imported.push(name);
          const inferred = inferSemanticBindings([], [name]).animations;
          for (const slot of ANIMATION_SLOTS) {
            if (!semanticBindings.animations[slot] && inferred[slot]) semanticBindings.animations[slot] = name;
          }
        } catch (error) {
          failures.push({ clipName: sourceClip.name || "unnamed", message: error.message });
        }
      }
      firstSkinnedMesh.skeleton.pose();
      firstSkinnedMesh.updateMatrixWorld(true);
      if (!imported.length) throw new Error(`没有动作可重定向：${failures[0]?.message ?? "骨架名称不兼容"}`);
      mixer ??= new THREE.AnimationMixer(content);
      semanticBindings.missingAnimations = Object.entries(semanticBindings.animations)
        .filter(([, name]) => !name)
        .map(([slot]) => slot);
      controller.report.capabilities.actions = true;
      return { sourceName, imported, failures, targetBoneCount: uniqueBoneNames.length };
    },
    setBonePose(nameOrSlot, pose = {}) {
      const bone = resolveBone(nameOrSlot);
      if (!bone) return false;
      const normalizedPose = {
        position: poseVector(pose.position),
        rotationDegrees: poseVector(pose.rotationDegrees),
        scale: poseVector(pose.scale),
      };
      if (!normalizedPose.position && !normalizedPose.rotationDegrees && !normalizedPose.scale) return false;
      bonePoseOverrides.set(bone.uuid, { bone, pose: normalizedPose });
      applyBonePoseOverrides();
      return true;
    },
    clearBonePose(nameOrSlot) {
      const bone = resolveBone(nameOrSlot);
      if (!bone || !bonePoseOverrides.delete(bone.uuid)) return false;
      const rest = boneRestPose.get(bone.uuid);
      if (rest) {
        bone.position.copy(rest.position);
        bone.quaternion.copy(rest.quaternion);
        bone.scale.copy(rest.scale);
      }
      return true;
    },
    update(deltaSeconds) {
      restoreIkPose();
      mixer?.update(Math.min(0.1, Math.max(0, Number(deltaSeconds) || 0)));
      applyBonePoseOverrides();
      applyExpressionOverrides();
      applyIkTargets();
    },
    nodeFor(slot) {
      const name = semanticBindings.nodes[slot];
      return name ? nodeByName.get(name) ?? null : null;
    },
    boneFor(nameOrSlot) {
      return resolveBone(nameOrSlot);
    },
    getState() {
      const behavior = actionStateMachine.snapshot();
      return {
        actionName: currentActionName,
        actionSlot: currentSlot,
        behavior: { state: behavior.state, context: behavior.context, sequence: behavior.sequence },
        expressions: Object.fromEntries(expressionOverrides),
        bonePoses: [...bonePoseOverrides.values()].map(({ bone }) => bone.name),
        ikTargets: [...ikTargets.keys()],
        footLocks: [...ikTargets.entries()].filter(([, entry]) => entry.locked).map(([slot]) => slot),
        lookTarget: lookTarget?.target.toArray() ?? null,
      };
    },
    dispose() {
      controller.clearIkTargets();
      mixer?.stopAllAction();
      mixer?.uncacheRoot(content);
      root.removeFromParent();
      content.traverse((node) => {
        node.geometry?.dispose?.();
        if (Array.isArray(node.material)) node.material.forEach(disposeMaterial);
        else disposeMaterial(node.material);
      });
    },
  };

  controller.fitToCarrier([1, 1, 1]);
  controller.setState("idle", 0);
  return controller;
}

export async function loadGlbFile(file, config = {}) {
  const { name } = validateGlbFile(file);
  let buffer;
  try {
    buffer = await file.arrayBuffer();
  } catch (error) {
    throw new Error(`GLB 载入失败：${error?.message || "无法读取文件"}`);
  }
  return loadGlbBytes(buffer, name, config);
}

export async function parseGlbAssetBytes(input, name = "model.glb") {
  const bytes = input instanceof ArrayBuffer
    ? new Uint8Array(input)
    : ArrayBuffer.isView(input)
      ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
      : null;
  validateGlbFile({ name, size: bytes?.byteLength ?? 0 });
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  inspectGlbBuffer(buffer);
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  return new GLTFLoader().parseAsync(buffer, "");
}

export async function parseGlbAssetFile(file) {
  const { name } = validateGlbFile(file);
  let buffer;
  try {
    buffer = await file.arrayBuffer();
    return await parseGlbAssetBytes(buffer, name);
  } catch (error) {
    throw new Error(`GLB 载入失败：${error?.message || "文件结构不兼容"}`);
  }
}

export async function loadGlbBytes(input, name = "model.glb", config = {}) {
  try {
    const gltf = await parseGlbAssetBytes(input, name);
    return createAssetController(gltf, config, name, { format: "GLB" });
  } catch (error) {
    throw new Error(`GLB 载入失败：${error?.message || "文件结构不兼容"}`);
  }
}

export async function loadObjFile(file, config = {}) {
  const { name, format } = validateModelFile(file);
  if (format !== "OBJ") throw new Error("当前接口需要 OBJ 文件。");
  const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
  try {
    const text = await file.text();
    const warnings = /(^|\n)\s*mtllib\s+/i.test(text)
      ? ["OBJ 中的 MTL/贴图引用未加载；请使用 GLB 打包材质。"]
      : [];
    const scene = new OBJLoader().parse(text);
    return createAssetController({ scene, animations: [] }, config, name, { format: "OBJ", warnings });
  } catch (error) {
    throw new Error(`OBJ 载入失败：${error?.message || "文本结构不兼容"}`);
  }
}

export async function loadModelFile(file, config = {}) {
  const { format } = validateModelFile(file);
  return format === "GLB" ? loadGlbFile(file, config) : loadObjFile(file, config);
}
