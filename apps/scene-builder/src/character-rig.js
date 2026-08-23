const freezeDefinition = (definition) => Object.freeze({ ...definition });

export const RIG_SLOT_DEFINITIONS = Object.freeze([
  freezeDefinition({ slot: "root", label: "根节点", group: "躯干", required: false }),
  freezeDefinition({ slot: "hips", label: "骨盆", group: "躯干", required: true }),
  freezeDefinition({ slot: "spine", label: "下脊柱", group: "躯干", required: true }),
  freezeDefinition({ slot: "chest", label: "胸腔", group: "躯干", required: true }),
  freezeDefinition({ slot: "neck", label: "颈部", group: "躯干", required: true }),
  freezeDefinition({ slot: "head", label: "头部", group: "躯干", required: true }),
  freezeDefinition({ slot: "jaw", label: "下颌", group: "面部", required: false }),
  freezeDefinition({ slot: "leftEye", label: "左眼", group: "面部", required: false }),
  freezeDefinition({ slot: "rightEye", label: "右眼", group: "面部", required: false }),
  freezeDefinition({ slot: "leftShoulder", label: "左肩", group: "左臂", required: false }),
  freezeDefinition({ slot: "leftUpperArm", label: "左上臂", group: "左臂", required: true }),
  freezeDefinition({ slot: "leftLowerArm", label: "左前臂", group: "左臂", required: true }),
  freezeDefinition({ slot: "leftHand", label: "左手", group: "左臂", required: true }),
  freezeDefinition({ slot: "rightShoulder", label: "右肩", group: "右臂", required: false }),
  freezeDefinition({ slot: "rightUpperArm", label: "右上臂", group: "右臂", required: true }),
  freezeDefinition({ slot: "rightLowerArm", label: "右前臂", group: "右臂", required: true }),
  freezeDefinition({ slot: "rightHand", label: "右手", group: "右臂", required: true }),
  freezeDefinition({ slot: "leftUpperLeg", label: "左大腿", group: "左腿", required: true }),
  freezeDefinition({ slot: "leftLowerLeg", label: "左小腿", group: "左腿", required: true }),
  freezeDefinition({ slot: "leftFoot", label: "左脚", group: "左腿", required: true }),
  freezeDefinition({ slot: "leftToe", label: "左脚趾", group: "左腿", required: false }),
  freezeDefinition({ slot: "rightUpperLeg", label: "右大腿", group: "右腿", required: true }),
  freezeDefinition({ slot: "rightLowerLeg", label: "右小腿", group: "右腿", required: true }),
  freezeDefinition({ slot: "rightFoot", label: "右脚", group: "右腿", required: true }),
  freezeDefinition({ slot: "rightToe", label: "右脚趾", group: "右腿", required: false }),
]);

const SLOT_PATTERNS = Object.freeze({
  root: [[/^root$/i, 0.96], [/armature/i, 0.9], [/(^|[:_. -])(rig|skeleton)$/i, 0.82]],
  hips: [[/(^|[:_. -])hips?$/i, 0.98], [/pelvis/i, 0.94], [/mixamorig[:_. -]?hips/i, 0.98]],
  spine: [[/(^|[:_. -])spine(?:0?1)?$/i, 0.94], [/mixamorig[:_. -]?spine$/i, 0.97], [/lower[:_. -]?spine/i, 0.92]],
  chest: [[/(^|[:_. -])(chest|upper[:_. -]?chest)$/i, 0.97], [/upper[:_. -]?spine/i, 0.93], [/spine(?:0?2|0?3)$/i, 0.88], [/mixamorig[:_. -]?spine1$/i, 0.91]],
  neck: [[/(^|[:_. -])neck(?:0?1)?$/i, 0.97], [/mixamorig[:_. -]?neck/i, 0.96]],
  head: [[/(^|[:_. -])head$/i, 0.98], [/mixamorig[:_. -]?head/i, 0.98]],
  jaw: [[/jaw/i, 0.96], [/(^|[:_. -])mouth$/i, 0.72]],
  leftEye: [[/(left.*eye|eye.*left|eye[:_. -]?l)$/i, 0.95]],
  rightEye: [[/(right.*eye|eye.*right|eye[:_. -]?r)$/i, 0.95]],
  leftShoulder: [[/(left.*shoulder|shoulder.*left|clavicle[:_. -]?l)$/i, 0.96], [/mixamorig[:_. -]?leftshoulder/i, 0.98]],
  leftUpperArm: [[/(left.*upper.*arm|upper.*arm.*left|upperarm[:_. -]?l)$/i, 0.97], [/mixamorig[:_. -]?leftarm$/i, 0.98], [/(^|[:_. -])leftarm$/i, 0.92]],
  leftLowerArm: [[/(left.*forearm|forearm.*left|left.*lower.*arm|lower.*arm.*left|forearm[:_. -]?l)$/i, 0.97], [/mixamorig[:_. -]?leftforearm/i, 0.98]],
  leftHand: [[/(left.*hand|hand.*left|hand[:_. -]?l)$/i, 0.98], [/mixamorig[:_. -]?lefthand/i, 0.98]],
  rightShoulder: [[/(right.*shoulder|shoulder.*right|clavicle[:_. -]?r)$/i, 0.96], [/mixamorig[:_. -]?rightshoulder/i, 0.98]],
  rightUpperArm: [[/(right.*upper.*arm|upper.*arm.*right|upperarm[:_. -]?r)$/i, 0.97], [/mixamorig[:_. -]?rightarm$/i, 0.98], [/(^|[:_. -])rightarm$/i, 0.92]],
  rightLowerArm: [[/(right.*forearm|forearm.*right|right.*lower.*arm|lower.*arm.*right|forearm[:_. -]?r)$/i, 0.97], [/mixamorig[:_. -]?rightforearm/i, 0.98]],
  rightHand: [[/(right.*hand|hand.*right|hand[:_. -]?r)$/i, 0.98], [/mixamorig[:_. -]?righthand/i, 0.98]],
  leftUpperLeg: [[/(left.*(upper.*leg|up.*leg|thigh)|thigh.*left|upleg[:_. -]?l)$/i, 0.97], [/mixamorig[:_. -]?leftupleg/i, 0.98]],
  leftLowerLeg: [[/(left.*(lower.*leg|shin|calf)|lower.*leg.*left|(^|[:_. -])leftleg$|leg[:_. -]?l)$/i, 0.95], [/mixamorig[:_. -]?leftleg$/i, 0.98]],
  leftFoot: [[/(left.*foot|foot.*left|foot[:_. -]?l)$/i, 0.98], [/mixamorig[:_. -]?leftfoot/i, 0.98]],
  leftToe: [[/(left.*toe|toe.*left|toe[:_. -]?l)$/i, 0.95], [/mixamorig[:_. -]?lefttoebase/i, 0.98]],
  rightUpperLeg: [[/(right.*(upper.*leg|up.*leg|thigh)|thigh.*right|upleg[:_. -]?r)$/i, 0.97], [/mixamorig[:_. -]?rightupleg/i, 0.98]],
  rightLowerLeg: [[/(right.*(lower.*leg|shin|calf)|lower.*leg.*right|(^|[:_. -])rightleg$|leg[:_. -]?r)$/i, 0.95], [/mixamorig[:_. -]?rightleg$/i, 0.98]],
  rightFoot: [[/(right.*foot|foot.*right|foot[:_. -]?r)$/i, 0.98], [/mixamorig[:_. -]?rightfoot/i, 0.98]],
  rightToe: [[/(right.*toe|toe.*right|toe[:_. -]?r)$/i, 0.95], [/mixamorig[:_. -]?righttoebase/i, 0.98]],
});

const uniqueNames = (names = []) => [...new Set(names.filter(Boolean).map(String))];

const candidateFor = (slot, names, usedNames = new Set()) => {
  for (const [pattern, confidence] of SLOT_PATTERNS[slot] ?? []) {
    const name = names.find((candidate) => !usedNames.has(candidate) && pattern.test(candidate));
    if (name) return { name, confidence };
  }
  return { name: null, confidence: 0 };
};

export function autoMapRigBones(boneNames = []) {
  const names = uniqueNames(boneNames);
  const usedNames = new Set();
  const bones = {};
  const confidence = {};
  for (const definition of RIG_SLOT_DEFINITIONS) {
    const candidate = candidateFor(definition.slot, names, usedNames);
    bones[definition.slot] = candidate.name;
    confidence[definition.slot] = candidate.confidence;
    if (candidate.name) usedNames.add(candidate.name);
  }
  return { bones, confidence };
}

export function resolveRigBoneBindings(config = {}, boneNames = []) {
  const names = uniqueNames(boneNames);
  const nameSet = new Set(names);
  const configured = config?.bones && typeof config.bones === "object" ? config.bones : config;
  const inferred = autoMapRigBones(names);
  const bones = {};
  const sources = {};
  const confidence = {};
  for (const definition of RIG_SLOT_DEFINITIONS) {
    const slot = definition.slot;
    if (configured && Object.hasOwn(configured, slot)) {
      const requested = configured[slot] == null ? null : String(configured[slot]);
      bones[slot] = requested && nameSet.has(requested) ? requested : null;
      sources[slot] = bones[slot] ? "manual" : requested ? "invalid" : "unmapped";
      confidence[slot] = bones[slot] ? 1 : 0;
    } else {
      bones[slot] = inferred.bones[slot];
      sources[slot] = bones[slot] ? "auto" : "missing";
      confidence[slot] = inferred.confidence[slot];
    }
  }
  return { bones, sources, confidence };
}

export function evaluateRigMapping(mapping = {}, boneNames = [], options = {}) {
  const names = uniqueNames(boneNames);
  const nameSet = new Set(names);
  const sources = options.sources ?? {};
  const inferredConfidence = autoMapRigBones(names).confidence;
  const mappedSlotsByBone = new Map();
  const slots = RIG_SLOT_DEFINITIONS.map((definition) => {
    const requested = mapping[definition.slot] == null ? null : String(mapping[definition.slot]);
    const validName = requested && nameSet.has(requested) ? requested : null;
    const source = sources[definition.slot] ?? (validName ? "manual" : requested ? "invalid" : "missing");
    const confidence = validName
      ? source === "manual" ? 1 : inferredConfidence[definition.slot] || 0.78
      : 0;
    if (validName) {
      if (!mappedSlotsByBone.has(validName)) mappedSlotsByBone.set(validName, []);
      mappedSlotsByBone.get(validName).push(definition.slot);
    }
    return { ...definition, boneName: validName, requested, source, confidence, duplicate: false };
  });
  const duplicateBones = [...mappedSlotsByBone.entries()]
    .filter(([, mappedSlots]) => mappedSlots.length > 1)
    .map(([boneName, mappedSlots]) => ({ boneName, slots: mappedSlots }));
  const duplicateSlots = new Set(duplicateBones.flatMap((entry) => entry.slots));
  for (const slot of slots) slot.duplicate = duplicateSlots.has(slot.slot);
  const missingRequired = slots.filter((slot) => slot.required && !slot.boneName).map((slot) => slot.slot);
  const requiredSlots = slots.filter((slot) => slot.required);
  const overallConfidence = requiredSlots.length
    ? requiredSlots.reduce((sum, slot) => sum + (slot.duplicate ? 0 : slot.confidence), 0) / requiredSlots.length
    : 0;
  return {
    valid: missingRequired.length === 0 && duplicateBones.length === 0,
    slots,
    missingRequired,
    duplicateBones,
    mappedCount: slots.filter((slot) => slot.boneName).length,
    requiredCount: requiredSlots.length,
    overallConfidence,
  };
}
