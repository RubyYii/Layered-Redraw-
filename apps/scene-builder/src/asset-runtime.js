import * as THREE from "three";

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
  const bones = uniqueNames(boneNames);
  const morphs = uniqueNames(morphTargetNames);
  return {
    bones: {
      root: findName(bones, [/^root$/, /armature/, /rig/, /skeleton/]) ?? bones[0] ?? null,
      hips: findName(bones, [/hips?/, /pelvis/]),
      spine: findName(bones, [/(^|[_ .-])spine(?:0?1)?($|[_ .-])/, /lower[_ .-]?spine/]),
      chest: findName(bones, [/chest/, /upper[_ .-]?spine/, /spine(?:0?2|0?3)/]),
      neck: findName(bones, [/(^|[_ .-])neck($|[_ .-])/]),
      head: findName(bones, [/(^|[_ .-])head($|[_ .-])/]),
      jaw: findName(bones, [/jaw/, /mouth/]),
      leftHand: findName(bones, [/left.*hand/, /hand.*left/, /hand[_ .-]?l$/]),
      rightHand: findName(bones, [/right.*hand/, /hand.*right/, /hand[_ .-]?r$/]),
      leftFoot: findName(bones, [/left.*foot/, /foot.*left/, /foot[_ .-]?l$/]),
      rightFoot: findName(bones, [/right.*foot/, /foot.*right/, /foot[_ .-]?r$/]),
      leftEye: findName(bones, [/left.*eye/, /eye.*left/, /eye[_ .-]?l$/]),
      rightEye: findName(bones, [/right.*eye/, /eye.*right/, /eye[_ .-]?r$/]),
    },
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
  const boneSet = new Set(boneNames);
  const morphSet = new Set(morphTargetNames);
  const bones = Object.fromEntries(Object.entries(inferred.bones).map(([slot, fallback]) => {
    const configured = config.bones?.[slot];
    return [slot, configured && boneSet.has(configured) ? configured : fallback];
  }));
  const expressions = Object.fromEntries(Object.entries(inferred.expressions).map(([slot, fallback]) => {
    const configured = config.expressions?.[slot];
    return [slot, configured && morphSet.has(configured) ? configured : fallback];
  }));
  return {
    bones,
    expressions,
    missingBones: Object.entries(bones).filter(([, name]) => !name).map(([slot]) => slot),
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
    if (node.isSkinnedMesh) skinnedMeshCount += 1;
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
  let lastCarrierScale = null;

  const clips = Array.isArray(asset.animations) ? asset.animations : [];
  const clipNames = uniqueNames(clips.map((clip) => clip.name));
  const uniqueNodeNames = uniqueNames(nodeNames);
  const uniqueBoneNames = uniqueNames(boneNames);
  const morphTargetNames = [...morphTargets.keys()];
  const semanticBindings = resolveSemanticBindings(config, uniqueNodeNames, clipNames);
  const rigBindings = resolveRigBindings(config, uniqueBoneNames, morphTargetNames);
  const clipByName = new Map(clips.map((clip) => [clip.name, clip]));
  const morphNameByLower = new Map(morphTargetNames.map((name) => [name.toLowerCase(), name]));
  const boneNameByLower = new Map(uniqueBoneNames.map((name) => [name.toLowerCase(), name]));
  const mixer = clips.length ? new THREE.AnimationMixer(content) : null;
  const expressionOverrides = new Map();
  const bonePoseOverrides = new Map();
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
    const name = rigBindings.bones[requested] ?? boneNameByLower.get(requested.toLowerCase());
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
      },
      warnings: [...(options.warnings ?? [])],
      ...semanticBindings,
      ...rigBindings,
    },
    fitToCarrier(carrierScale) {
      const available = (carrierScale?.toArray?.() ?? carrierScale ?? [1, 1, 1])
        .slice(0, 3)
        .map((value) => Math.max(0.0001, Math.abs(Number(value) || 1)));
      if (lastCarrierScale?.every((value, axis) => value === available[axis])) return false;
      const candidates = [unitSize.x, unitSize.y, unitSize.z]
        .map((value, axis) => value > 0.0001 ? available[axis] / value : Infinity);
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
      mixer?.update(Math.min(0.1, Math.max(0, Number(deltaSeconds) || 0)));
      applyBonePoseOverrides();
      applyExpressionOverrides();
    },
    nodeFor(slot) {
      const name = semanticBindings.nodes[slot];
      return name ? nodeByName.get(name) ?? null : null;
    },
    boneFor(nameOrSlot) {
      return resolveBone(nameOrSlot);
    },
    getState() {
      return {
        actionName: currentActionName,
        actionSlot: currentSlot,
        expressions: Object.fromEntries(expressionOverrides),
        bonePoses: [...bonePoseOverrides.values()].map(({ bone }) => bone.name),
      };
    },
    dispose() {
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

export async function loadGlbBytes(input, name = "model.glb", config = {}) {
  const bytes = input instanceof ArrayBuffer
    ? new Uint8Array(input)
    : ArrayBuffer.isView(input)
      ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
      : null;
  validateGlbFile({ name, size: bytes?.byteLength ?? 0 });
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  try {
    inspectGlbBuffer(buffer);
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const gltf = await new GLTFLoader().parseAsync(buffer, "");
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
