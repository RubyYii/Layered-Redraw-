export const UNIVERSAL_RIG_CONTRACT = "blockout-studio-universal-rig-v2";

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const cleanText = (value, fallback = "", limit = 80) => String(value ?? fallback).trim().slice(0, limit);
const cleanToken = (value, fallback = "bone") => cleanText(value, fallback, 64)
  .replace(/[^a-z0-9_.:-]+/giu, "-")
  .replace(/^-+|-+$/gu, "") || fallback;

const joint = (slot, name, parent, u, v, options = {}) => ({
  slot,
  name,
  parent,
  u,
  v,
  depthOffset: options.depthOffset ?? 0,
  role: options.role ?? "bone",
  chain: options.chain ?? "body",
  side: options.side ?? "center",
  effector: options.effector === true,
  mirror: options.mirror ?? null,
  limits: {
    axis: options.axis ?? "free",
    minDegrees: options.minDegrees ?? -180,
    maxDegrees: options.maxDegrees ?? 180,
  },
});

const HUMAN_JOINTS = [
  joint("root", "Root", null, 0.5, 0.66, { role: "root", chain: "body" }),
  joint("hips", "Hips", "root", 0.5, 0.58, { role: "pelvis", chain: "body" }),
  joint("spine", "Spine", "hips", 0.5, 0.49, { role: "spine", chain: "body" }),
  joint("chest", "Chest", "spine", 0.5, 0.38, { role: "chest", chain: "body" }),
  joint("neck", "Neck", "chest", 0.5, 0.27, { role: "neck", chain: "look", axis: "ball", minDegrees: -55, maxDegrees: 55 }),
  joint("head", "Head", "neck", 0.5, 0.16, { role: "head", chain: "look", effector: true, axis: "ball", minDegrees: -65, maxDegrees: 65 }),
  joint("leftShoulder", "LeftShoulder", "chest", 0.59, 0.31, { role: "shoulder", chain: "arm.L", side: "left", mirror: "rightShoulder" }),
  joint("leftUpperArm", "LeftUpperArm", "leftShoulder", 0.68, 0.37, { role: "upperLimb", chain: "arm.L", side: "left", mirror: "rightUpperArm", axis: "ball", minDegrees: -145, maxDegrees: 145 }),
  joint("leftLowerArm", "LeftLowerArm", "leftUpperArm", 0.76, 0.49, { role: "lowerLimb", chain: "arm.L", side: "left", mirror: "rightLowerArm", axis: "hinge", minDegrees: 0, maxDegrees: 155 }),
  joint("leftHand", "LeftHand", "leftLowerArm", 0.81, 0.61, { role: "hand", chain: "arm.L", side: "left", mirror: "rightHand", effector: true, axis: "ball", minDegrees: -70, maxDegrees: 70 }),
  joint("rightShoulder", "RightShoulder", "chest", 0.41, 0.31, { role: "shoulder", chain: "arm.R", side: "right", mirror: "leftShoulder" }),
  joint("rightUpperArm", "RightUpperArm", "rightShoulder", 0.32, 0.37, { role: "upperLimb", chain: "arm.R", side: "right", mirror: "leftUpperArm", axis: "ball", minDegrees: -145, maxDegrees: 145 }),
  joint("rightLowerArm", "RightLowerArm", "rightUpperArm", 0.24, 0.49, { role: "lowerLimb", chain: "arm.R", side: "right", mirror: "leftLowerArm", axis: "hinge", minDegrees: 0, maxDegrees: 155 }),
  joint("rightHand", "RightHand", "rightLowerArm", 0.19, 0.61, { role: "hand", chain: "arm.R", side: "right", mirror: "leftHand", effector: true, axis: "ball", minDegrees: -70, maxDegrees: 70 }),
  joint("leftUpperLeg", "LeftUpperLeg", "hips", 0.56, 0.61, { role: "upperLeg", chain: "leg.L", side: "left", mirror: "rightUpperLeg", axis: "ball", minDegrees: -115, maxDegrees: 115 }),
  joint("leftLowerLeg", "LeftLowerLeg", "leftUpperLeg", 0.57, 0.78, { role: "lowerLeg", chain: "leg.L", side: "left", mirror: "rightLowerLeg", axis: "hinge", minDegrees: 0, maxDegrees: 160 }),
  joint("leftFoot", "LeftFoot", "leftLowerLeg", 0.58, 0.93, { role: "foot", chain: "leg.L", side: "left", mirror: "rightFoot", effector: true, axis: "hinge", minDegrees: -45, maxDegrees: 65 }),
  joint("leftToe", "LeftToe", "leftFoot", 0.64, 0.96, { role: "toe", chain: "leg.L", side: "left", mirror: "rightToe", effector: true, axis: "hinge", minDegrees: -25, maxDegrees: 60 }),
  joint("rightUpperLeg", "RightUpperLeg", "hips", 0.44, 0.61, { role: "upperLeg", chain: "leg.R", side: "right", mirror: "leftUpperLeg", axis: "ball", minDegrees: -115, maxDegrees: 115 }),
  joint("rightLowerLeg", "RightLowerLeg", "rightUpperLeg", 0.43, 0.78, { role: "lowerLeg", chain: "leg.R", side: "right", mirror: "leftLowerLeg", axis: "hinge", minDegrees: 0, maxDegrees: 160 }),
  joint("rightFoot", "RightFoot", "rightLowerLeg", 0.42, 0.93, { role: "foot", chain: "leg.R", side: "right", mirror: "leftFoot", effector: true, axis: "hinge", minDegrees: -45, maxDegrees: 65 }),
  joint("rightToe", "RightToe", "rightFoot", 0.36, 0.96, { role: "toe", chain: "leg.R", side: "right", mirror: "leftToe", effector: true, axis: "hinge", minDegrees: -25, maxDegrees: 60 }),
];

const QUADRUPED_JOINTS = [
  joint("root", "Root", null, 0.48, 0.52, { role: "root", chain: "body" }),
  joint("pelvis", "Pelvis", "root", 0.40, 0.50, { role: "pelvis", chain: "body" }),
  joint("spine", "Spine", "pelvis", 0.52, 0.47, { role: "spine", chain: "body" }),
  joint("chest", "Chest", "spine", 0.64, 0.44, { role: "chest", chain: "body" }),
  joint("neck", "Neck", "chest", 0.73, 0.38, { role: "neck", chain: "look", axis: "ball", minDegrees: -70, maxDegrees: 70 }),
  joint("head", "Head", "neck", 0.82, 0.34, { role: "head", chain: "look", effector: true, axis: "ball", minDegrees: -75, maxDegrees: 75 }),
  joint("jaw", "Jaw", "head", 0.86, 0.39, { role: "jaw", chain: "jaw", effector: true, axis: "hinge", minDegrees: 0, maxDegrees: 50 }),
  joint("frontNearUpper", "FrontNearUpper", "chest", 0.66, 0.54, { role: "upperLeg", chain: "frontLeg.near", side: "near", mirror: "frontFarUpper", axis: "ball", minDegrees: -105, maxDegrees: 105 }),
  joint("frontNearLower", "FrontNearLower", "frontNearUpper", 0.67, 0.72, { role: "lowerLeg", chain: "frontLeg.near", side: "near", mirror: "frontFarLower", axis: "hinge", minDegrees: 0, maxDegrees: 150 }),
  joint("frontNearPaw", "FrontNearPaw", "frontNearLower", 0.69, 0.88, { role: "paw", chain: "frontLeg.near", side: "near", mirror: "frontFarPaw", effector: true, axis: "hinge", minDegrees: -35, maxDegrees: 55 }),
  joint("frontFarUpper", "FrontFarUpper", "chest", 0.60, 0.54, { role: "upperLeg", chain: "frontLeg.far", side: "far", mirror: "frontNearUpper", axis: "ball", minDegrees: -105, maxDegrees: 105 }),
  joint("frontFarLower", "FrontFarLower", "frontFarUpper", 0.58, 0.72, { role: "lowerLeg", chain: "frontLeg.far", side: "far", mirror: "frontNearLower", axis: "hinge", minDegrees: 0, maxDegrees: 150 }),
  joint("frontFarPaw", "FrontFarPaw", "frontFarLower", 0.57, 0.88, { role: "paw", chain: "frontLeg.far", side: "far", mirror: "frontNearPaw", effector: true, axis: "hinge", minDegrees: -35, maxDegrees: 55 }),
  joint("hindNearUpper", "HindNearUpper", "pelvis", 0.43, 0.57, { role: "upperLeg", chain: "hindLeg.near", side: "near", mirror: "hindFarUpper", axis: "ball", minDegrees: -115, maxDegrees: 115 }),
  joint("hindNearLower", "HindNearLower", "hindNearUpper", 0.45, 0.75, { role: "lowerLeg", chain: "hindLeg.near", side: "near", mirror: "hindFarLower", axis: "hinge", minDegrees: 0, maxDegrees: 155 }),
  joint("hindNearPaw", "HindNearPaw", "hindNearLower", 0.48, 0.90, { role: "paw", chain: "hindLeg.near", side: "near", mirror: "hindFarPaw", effector: true, axis: "hinge", minDegrees: -35, maxDegrees: 55 }),
  joint("hindFarUpper", "HindFarUpper", "pelvis", 0.36, 0.57, { role: "upperLeg", chain: "hindLeg.far", side: "far", mirror: "hindNearUpper", axis: "ball", minDegrees: -115, maxDegrees: 115 }),
  joint("hindFarLower", "HindFarLower", "hindFarUpper", 0.34, 0.75, { role: "lowerLeg", chain: "hindLeg.far", side: "far", mirror: "hindNearLower", axis: "hinge", minDegrees: 0, maxDegrees: 155 }),
  joint("hindFarPaw", "HindFarPaw", "hindFarLower", 0.31, 0.90, { role: "paw", chain: "hindLeg.far", side: "far", mirror: "hindNearPaw", effector: true, axis: "hinge", minDegrees: -35, maxDegrees: 55 }),
  joint("tail01", "Tail01", "pelvis", 0.31, 0.45, { role: "tail", chain: "tail", axis: "ball", minDegrees: -55, maxDegrees: 55 }),
  joint("tail02", "Tail02", "tail01", 0.22, 0.40, { role: "tail", chain: "tail", axis: "ball", minDegrees: -55, maxDegrees: 55 }),
  joint("tail03", "Tail03", "tail02", 0.12, 0.44, { role: "tailTip", chain: "tail", effector: true, axis: "ball", minDegrees: -65, maxDegrees: 65 }),
];

const BIRD_JOINTS = [
  joint("root", "Root", null, 0.50, 0.59, { role: "root", chain: "body" }),
  joint("body", "Body", "root", 0.50, 0.50, { role: "body", chain: "body" }),
  joint("chest", "Chest", "body", 0.50, 0.40, { role: "chest", chain: "body" }),
  joint("neck", "Neck", "chest", 0.50, 0.29, { role: "neck", chain: "look", axis: "ball", minDegrees: -95, maxDegrees: 95 }),
  joint("head", "Head", "neck", 0.50, 0.20, { role: "head", chain: "look", axis: "ball", minDegrees: -90, maxDegrees: 90 }),
  joint("beak", "Beak", "head", 0.50, 0.14, { role: "beak", chain: "beak", effector: true, axis: "hinge", minDegrees: 0, maxDegrees: 35 }),
  joint("leftWingRoot", "LeftWingRoot", "chest", 0.41, 0.37, { role: "wingRoot", chain: "wing.L", side: "left", mirror: "rightWingRoot", axis: "ball", minDegrees: -155, maxDegrees: 155 }),
  joint("leftWingMid", "LeftWingMid", "leftWingRoot", 0.27, 0.43, { role: "wing", chain: "wing.L", side: "left", mirror: "rightWingMid", axis: "hinge", minDegrees: -15, maxDegrees: 145 }),
  joint("leftWingTip", "LeftWingTip", "leftWingMid", 0.10, 0.52, { role: "wingTip", chain: "wing.L", side: "left", mirror: "rightWingTip", effector: true, axis: "hinge", minDegrees: -20, maxDegrees: 130 }),
  joint("rightWingRoot", "RightWingRoot", "chest", 0.59, 0.37, { role: "wingRoot", chain: "wing.R", side: "right", mirror: "leftWingRoot", axis: "ball", minDegrees: -155, maxDegrees: 155 }),
  joint("rightWingMid", "RightWingMid", "rightWingRoot", 0.73, 0.43, { role: "wing", chain: "wing.R", side: "right", mirror: "leftWingMid", axis: "hinge", minDegrees: -15, maxDegrees: 145 }),
  joint("rightWingTip", "RightWingTip", "rightWingMid", 0.90, 0.52, { role: "wingTip", chain: "wing.R", side: "right", mirror: "leftWingTip", effector: true, axis: "hinge", minDegrees: -20, maxDegrees: 130 }),
  joint("leftUpperLeg", "LeftUpperLeg", "body", 0.46, 0.60, { role: "upperLeg", chain: "leg.L", side: "left", mirror: "rightUpperLeg", axis: "ball", minDegrees: -95, maxDegrees: 95 }),
  joint("leftLowerLeg", "LeftLowerLeg", "leftUpperLeg", 0.44, 0.73, { role: "lowerLeg", chain: "leg.L", side: "left", mirror: "rightLowerLeg", axis: "hinge", minDegrees: 0, maxDegrees: 145 }),
  joint("leftFoot", "LeftFoot", "leftLowerLeg", 0.40, 0.85, { role: "foot", chain: "leg.L", side: "left", mirror: "rightFoot", effector: true, axis: "hinge", minDegrees: -45, maxDegrees: 65 }),
  joint("rightUpperLeg", "RightUpperLeg", "body", 0.54, 0.60, { role: "upperLeg", chain: "leg.R", side: "right", mirror: "leftUpperLeg", axis: "ball", minDegrees: -95, maxDegrees: 95 }),
  joint("rightLowerLeg", "RightLowerLeg", "rightUpperLeg", 0.56, 0.73, { role: "lowerLeg", chain: "leg.R", side: "right", mirror: "leftLowerLeg", axis: "hinge", minDegrees: 0, maxDegrees: 145 }),
  joint("rightFoot", "RightFoot", "rightLowerLeg", 0.60, 0.85, { role: "foot", chain: "leg.R", side: "right", mirror: "leftFoot", effector: true, axis: "hinge", minDegrees: -45, maxDegrees: 65 }),
  joint("tail", "Tail", "body", 0.50, 0.70, { role: "tail", chain: "tail", axis: "ball", minDegrees: -45, maxDegrees: 45 }),
  joint("tailTip", "TailTip", "tail", 0.50, 0.82, { role: "tailTip", chain: "tail", effector: true, axis: "ball", minDegrees: -55, maxDegrees: 55 }),
];

const SERPENT_JOINTS = [
  joint("root", "Root", null, 0.50, 0.54, { role: "root", chain: "body" }),
  joint("body01", "Body01", "root", 0.43, 0.56, { role: "spine", chain: "body", axis: "ball", minDegrees: -55, maxDegrees: 55 }),
  joint("body02", "Body02", "body01", 0.36, 0.61, { role: "spine", chain: "body", axis: "ball", minDegrees: -55, maxDegrees: 55 }),
  joint("body03", "Body03", "body02", 0.29, 0.66, { role: "spine", chain: "body", axis: "ball", minDegrees: -55, maxDegrees: 55 }),
  joint("tail01", "Tail01", "body03", 0.22, 0.67, { role: "tail", chain: "tail", axis: "ball", minDegrees: -65, maxDegrees: 65 }),
  joint("tail02", "Tail02", "tail01", 0.15, 0.63, { role: "tail", chain: "tail", axis: "ball", minDegrees: -65, maxDegrees: 65 }),
  joint("tailTip", "TailTip", "tail02", 0.09, 0.57, { role: "tailTip", chain: "tail", effector: true, axis: "ball", minDegrees: -75, maxDegrees: 75 }),
  joint("body04", "Body04", "root", 0.57, 0.49, { role: "spine", chain: "body", axis: "ball", minDegrees: -55, maxDegrees: 55 }),
  joint("body05", "Body05", "body04", 0.64, 0.43, { role: "spine", chain: "body", axis: "ball", minDegrees: -55, maxDegrees: 55 }),
  joint("body06", "Body06", "body05", 0.71, 0.39, { role: "spine", chain: "body", axis: "ball", minDegrees: -55, maxDegrees: 55 }),
  joint("neck", "Neck", "body06", 0.77, 0.34, { role: "neck", chain: "look", axis: "ball", minDegrees: -80, maxDegrees: 80 }),
  joint("head", "Head", "neck", 0.83, 0.30, { role: "head", chain: "look", axis: "ball", minDegrees: -80, maxDegrees: 80 }),
  joint("jaw", "Jaw", "head", 0.88, 0.34, { role: "jaw", chain: "jaw", effector: true, axis: "hinge", minDegrees: 0, maxDegrees: 55 }),
];

const PRESETS = Object.freeze({
  "front-humanoid-22": Object.freeze({
    id: "front-humanoid-22",
    label: "人形 · 22 骨",
    family: "humanoid",
    description: "正面双足角色，兼容现有全身 IK 与动作重定向。",
    recommendedView: "正面全身",
    capabilities: ["move", "look", "reach", "grasp", "walk", "speak"],
    joints: HUMAN_JOINTS,
  }),
  "side-quadruped-22": Object.freeze({
    id: "side-quadruped-22",
    label: "四足 · 22 骨",
    family: "quadruped",
    description: "猫、狗、鹿等侧面或三分之四视角角色。",
    recommendedView: "侧面或三分之四全身",
    capabilities: ["move", "look", "walk", "run", "bite", "wag"],
    joints: QUADRUPED_JOINTS,
  }),
  "front-bird-20": Object.freeze({
    id: "front-bird-20",
    label: "鸟类 · 20 骨",
    family: "avian",
    description: "双翼、双足、喙和尾部运动链。",
    recommendedView: "正面或展翼",
    capabilities: ["move", "look", "walk", "fly", "land", "perch", "peck"],
    joints: BIRD_JOINTS,
  }),
  "side-serpentine-13": Object.freeze({
    id: "side-serpentine-13",
    label: "蛇形 · 13 骨",
    family: "serpentine",
    description: "蛇、鱼、长尾或触手机构的连续脊柱链。",
    recommendedView: "侧面完整轮廓",
    capabilities: ["move", "look", "slither", "coil", "strike", "bite"],
    joints: SERPENT_JOINTS,
  }),
});

export const RIG_PRESET_OPTIONS = Object.freeze(Object.values(PRESETS).map((preset) => Object.freeze({
  id: preset.id,
  label: preset.label,
  family: preset.family,
  description: preset.description,
  recommendedView: preset.recommendedView,
  jointCount: preset.joints.length,
})));

const presetFor = (presetId) => PRESETS[presetId] ?? PRESETS["front-humanoid-22"];

const normalizeLimits = (value = {}, fallback = {}) => {
  const minimum = clamp(finite(value.minDegrees, fallback.minDegrees ?? -180), -180, 180);
  const maximum = clamp(finite(value.maxDegrees, fallback.maxDegrees ?? 180), -180, 180);
  return {
    axis: ["free", "ball", "hinge", "twist"].includes(value.axis) ? value.axis : fallback.axis ?? "free",
    minDegrees: Math.min(minimum, maximum),
    maxDegrees: Math.max(minimum, maximum),
  };
};

const normalizeJoint = (value, fallback, usedSlots) => {
  let slot = cleanToken(value?.slot, fallback?.slot ?? "bone");
  if (usedSlots.has(slot)) {
    const base = slot;
    let suffix = 2;
    while (usedSlots.has(`${base}-${suffix}`)) suffix += 1;
    slot = `${base}-${suffix}`;
  }
  usedSlots.add(slot);
  return {
    slot,
    name: cleanText(value?.name, fallback?.name ?? slot, 96) || slot,
    parent: value?.parent === undefined
      ? fallback?.parent ?? null
      : value.parent == null || value.parent === "" ? null : cleanToken(value.parent, "root"),
    u: clamp(finite(value?.u, fallback?.u ?? 0.5), 0, 1),
    v: clamp(finite(value?.v, fallback?.v ?? 0.5), 0, 1),
    depthOffset: clamp(finite(value?.depthOffset, fallback?.depthOffset ?? 0), -1, 1),
    role: cleanToken(value?.role, fallback?.role ?? "bone"),
    chain: cleanToken(value?.chain, fallback?.chain ?? "body"),
    side: ["left", "right", "center", "near", "far", "none"].includes(value?.side)
      ? value.side
      : fallback?.side ?? "center",
    effector: value?.effector === true || (value?.effector == null && fallback?.effector === true),
    mirror: value?.mirror === undefined
      ? fallback?.mirror ?? null
      : value.mirror == null || value.mirror === "" ? null : cleanToken(value.mirror, "bone"),
    limits: normalizeLimits(value?.limits, fallback?.limits),
  };
};

export function createRigDraft(presetId = "front-humanoid-22", overrides = {}) {
  const preset = presetFor(presetId || overrides?.preset);
  const savedJoints = Array.isArray(overrides?.joints) ? overrides.joints : [];
  const customized = Number(overrides?.schemaVersion) >= 2 || overrides?.topologyCustomized === true;
  const source = customized && savedJoints.length
    ? savedJoints.map((saved) => ({ saved, fallback: preset.joints.find((entry) => entry.slot === saved.slot) }))
    : preset.joints.map((fallback) => ({
      fallback,
      saved: savedJoints.find((entry) => entry.slot === fallback.slot),
    }));
  const usedSlots = new Set();
  const joints = source.map(({ saved, fallback }) => normalizeJoint(saved ?? fallback, fallback, usedSlots));
  const slots = new Set(joints.map((entry) => entry.slot));
  for (const entry of joints) {
    if (entry.mirror && !slots.has(entry.mirror)) entry.mirror = null;
  }
  const capabilities = [...new Set([
    ...preset.capabilities,
    ...(Array.isArray(overrides?.capabilities) ? overrides.capabilities.map((entry) => cleanToken(entry, "move")) : []),
  ])].sort();
  return {
    schemaVersion: 2,
    kind: "blockout-studio-rig-draft",
    contract: UNIVERSAL_RIG_CONTRACT,
    preset: preset.id,
    family: cleanToken(overrides?.family, preset.family),
    coordinateSpace: "image-normalized-top-left",
    topologyCustomized: customized || savedJoints.some((saved, index) => saved.slot !== preset.joints[index]?.slot),
    capabilities,
    joints,
  };
}

export function normalizeRigDraft(value, fallbackPreset = "front-humanoid-22") {
  return createRigDraft(value?.preset ?? fallbackPreset, value ?? {});
}

export function updateRigJoint(draft, slot, patch = {}) {
  const normalized = normalizeRigDraft(draft);
  if (!normalized.joints.some((entry) => entry.slot === slot)) return normalized;
  const next = {
    ...normalized,
    topologyCustomized: true,
    joints: normalized.joints.map((entry) => entry.slot === slot
      ? normalizeJoint({ ...entry, ...patch, slot: entry.slot }, entry, new Set())
      : { ...entry, limits: { ...entry.limits } }),
  };
  if (patch.parent !== undefined) return reparentRigJoint(next, slot, patch.parent);
  return next;
}

export function addRigJoint(draft, options = {}) {
  const normalized = normalizeRigDraft(draft);
  const slots = new Set(normalized.joints.map((entry) => entry.slot));
  const base = cleanToken(options.slot, "customBone");
  let slot = base;
  let suffix = 2;
  while (slots.has(slot)) slot = `${base}${suffix++}`;
  const parent = slots.has(options.parent) ? options.parent : normalized.joints[0]?.slot ?? null;
  const parentJoint = normalized.joints.find((entry) => entry.slot === parent);
  const added = normalizeJoint({
    slot,
    name: options.name ?? slot,
    parent,
    u: options.u ?? clamp((parentJoint?.u ?? 0.5) + 0.04, 0, 1),
    v: options.v ?? clamp((parentJoint?.v ?? 0.5) + 0.04, 0, 1),
    depthOffset: options.depthOffset ?? parentJoint?.depthOffset ?? 0,
    role: options.role ?? "bone",
    chain: options.chain ?? parentJoint?.chain ?? "custom",
    side: options.side ?? "none",
    effector: options.effector ?? true,
    mirror: options.mirror ?? null,
    limits: options.limits,
  }, null, new Set(slots));
  return {
    ...normalized,
    topologyCustomized: true,
    joints: [...normalized.joints.map((entry) => ({ ...entry, limits: { ...entry.limits } })), added],
  };
}

export function removeRigJoint(draft, slot) {
  const normalized = normalizeRigDraft(draft);
  const target = normalized.joints.find((entry) => entry.slot === slot);
  if (!target || normalized.joints.length <= 1) return normalized;
  const joints = normalized.joints
    .filter((entry) => entry.slot !== slot)
    .map((entry) => ({
      ...entry,
      parent: entry.parent === slot ? target.parent : entry.parent,
      mirror: entry.mirror === slot ? null : entry.mirror,
      limits: { ...entry.limits },
    }));
  return { ...normalized, topologyCustomized: true, joints };
}

const descendantsOf = (joints, slot) => {
  const descendants = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of joints) {
      if (!descendants.has(entry.slot) && (entry.parent === slot || descendants.has(entry.parent))) {
        descendants.add(entry.slot);
        changed = true;
      }
    }
  }
  return descendants;
};

export function reparentRigJoint(draft, slot, parent) {
  const normalized = normalizeRigDraft(draft);
  const slots = new Set(normalized.joints.map((entry) => entry.slot));
  if (!slots.has(slot)) return normalized;
  const safeParent = parent == null || parent === "" ? null : String(parent);
  if (safeParent && (!slots.has(safeParent) || safeParent === slot || descendantsOf(normalized.joints, slot).has(safeParent))) {
    throw new Error("父骨骼不能是自身、后代或不存在的骨骼。");
  }
  return {
    ...normalized,
    topologyCustomized: true,
    joints: normalized.joints.map((entry) => ({
      ...entry,
      parent: entry.slot === slot ? safeParent : entry.parent,
      limits: { ...entry.limits },
    })),
  };
}

const mirroredName = (name) => {
  const value = String(name);
  if (/left/iu.test(value)) return value.replace(/left/giu, "Right");
  if (/right/iu.test(value)) return value.replace(/right/giu, "Left");
  if (/\.L$/iu.test(value)) return value.replace(/\.L$/iu, ".R");
  if (/\.R$/iu.test(value)) return value.replace(/\.R$/iu, ".L");
  return value;
};

const mirroredChain = (chain) => {
  const value = String(chain);
  if (/\.L$/iu.test(value)) return value.replace(/\.L$/iu, ".R");
  if (/\.R$/iu.test(value)) return value.replace(/\.R$/iu, ".L");
  if (/\.near$/iu.test(value)) return value.replace(/\.near$/iu, ".far");
  if (/\.far$/iu.test(value)) return value.replace(/\.far$/iu, ".near");
  return value;
};

export function mirrorRigJoint(draft, slot) {
  let normalized = normalizeRigDraft(draft);
  const source = normalized.joints.find((entry) => entry.slot === slot);
  if (!source) return normalized;
  const paired = source.mirror ? normalized.joints.find((entry) => entry.slot === source.mirror) : null;
  const mirroredParent = normalized.joints.find((entry) => entry.slot === source.parent)?.mirror ?? source.parent;
  const nextSide = source.side === "left" ? "right" : source.side === "right" ? "left" : source.side === "near" ? "far" : source.side === "far" ? "near" : source.side;
  if (paired) {
    normalized = updateRigJoint(normalized, paired.slot, {
      u: 1 - source.u,
      v: source.v,
      depthOffset: source.depthOffset,
      parent: mirroredParent,
      role: source.role,
      chain: mirroredChain(source.chain),
      side: nextSide,
      effector: source.effector,
      limits: source.limits,
    });
    return normalized;
  }
  const pairedSlot = `${source.slot}-mirror`;
  const withPair = addRigJoint(normalized, {
    slot: pairedSlot,
    name: mirroredName(source.name) === source.name ? `${source.name} Mirror` : mirroredName(source.name),
    parent: mirroredParent,
    u: 1 - source.u,
    v: source.v,
    depthOffset: source.depthOffset,
    role: source.role,
    chain: mirroredChain(source.chain),
    side: nextSide,
    effector: source.effector,
    limits: source.limits,
  });
  const actualPair = withPair.joints.at(-1).slot;
  const first = updateRigJoint(withPair, slot, { mirror: actualPair });
  return updateRigJoint(first, actualPair, { mirror: slot });
}

export function validateRigDraft(draft) {
  const normalized = normalizeRigDraft(draft);
  const errors = [];
  const warnings = [];
  const slots = new Set(normalized.joints.map((entry) => entry.slot));
  const roots = normalized.joints.filter((entry) => entry.parent == null);
  if (!roots.length) errors.push("骨架必须至少有一个根骨骼。");
  if (roots.length > 1) warnings.push(`骨架包含 ${roots.length} 个根节点；导出时会作为并列骨架根。`);
  for (const entry of normalized.joints) {
    if (entry.parent && !slots.has(entry.parent)) errors.push(`${entry.name} 的父骨骼不存在。`);
    if (entry.parent === entry.slot) errors.push(`${entry.name} 不能以自身为父骨骼。`);
    if (entry.limits.minDegrees > entry.limits.maxDegrees) errors.push(`${entry.name} 的关节角度范围无效。`);
    if (descendantsOf(normalized.joints, entry.slot).has(entry.slot)) errors.push(`${entry.name} 所在拓扑存在循环。`);
  }
  const duplicateNames = normalized.joints
    .map((entry) => entry.name)
    .filter((name, index, names) => names.indexOf(name) !== index);
  if (duplicateNames.length) warnings.push(`存在重复骨骼名称：${[...new Set(duplicateNames)].join("、")}。`);
  const profile = rigProfileFromDraft(normalized);
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    rootSlots: roots.map((entry) => entry.slot),
    jointCount: normalized.joints.length,
    chainCount: profile.chains.length,
    effectorCount: normalized.joints.filter((entry) => entry.effector).length,
    capabilities: profile.capabilities,
  };
}

export function rigProfileFromDraft(draft) {
  const normalized = normalizeRigDraft(draft);
  const byChain = new Map();
  for (const entry of normalized.joints) {
    if (!byChain.has(entry.chain)) byChain.set(entry.chain, []);
    byChain.get(entry.chain).push(entry);
  }
  const roles = new Set(normalized.joints.map((entry) => entry.role.toLowerCase()));
  const chains = [...byChain.entries()].map(([id, entries]) => ({
    id,
    side: entries.find((entry) => entry.side !== "center" && entry.side !== "none")?.side ?? "center",
    roles: [...new Set(entries.map((entry) => entry.role))],
    joints: entries.map((entry) => entry.slot),
    effector: entries.findLast((entry) => entry.effector)?.slot ?? entries.at(-1)?.slot ?? null,
  }));
  const capabilities = new Set(normalized.capabilities);
  capabilities.add("move");
  if (roles.has("head") || roles.has("neck")) capabilities.add("look");
  if (roles.has("jaw")) capabilities.add("bite");
  if (roles.has("beak")) capabilities.add("peck");
  if (roles.has("hand") || roles.has("paw") || roles.has("tentacletip")) capabilities.add("reach");
  if (roles.has("hand") || roles.has("gripper")) capabilities.add("grasp");
  if (chains.filter((entry) => /leg/iu.test(entry.id)).length >= 2) capabilities.add("walk");
  if (chains.filter((entry) => /wing/iu.test(entry.id)).length >= 2) {
    capabilities.add("fly");
    capabilities.add("land");
  }
  if (chains.some((entry) => /tail/iu.test(entry.id))) capabilities.add("wag");
  if (normalized.family === "serpentine" || (roles.has("spine") && !chains.some((entry) => /leg/iu.test(entry.id)))) {
    capabilities.add("slither");
    capabilities.add("coil");
  }
  return {
    schemaVersion: 1,
    contract: UNIVERSAL_RIG_CONTRACT,
    preset: normalized.preset,
    family: normalized.family,
    jointCount: normalized.joints.length,
    roots: normalized.joints.filter((entry) => entry.parent == null).map((entry) => entry.slot),
    chains,
    capabilities: [...capabilities].sort(),
    mapping: Object.fromEntries(normalized.joints.map((entry) => [entry.slot, entry.name])),
    jointLimits: Object.fromEntries(normalized.joints.map((entry) => [entry.slot, { ...entry.limits }])),
  };
}
