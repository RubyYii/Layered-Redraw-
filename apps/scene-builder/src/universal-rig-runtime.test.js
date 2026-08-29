import { describe, expect, it } from "vitest";

import {
  RIG_PRESET_OPTIONS,
  UNIVERSAL_RIG_CONTRACT,
  addRigJoint,
  createRigDraft,
  mirrorRigJoint,
  normalizeRigDraft,
  removeRigJoint,
  reparentRigJoint,
  rigProfileFromDraft,
  updateRigJoint,
  validateRigDraft,
} from "./universal-rig-runtime.js";

describe("universal rig runtime", () => {
  it("provides valid humanoid, quadruped, avian and serpentine presets", () => {
    const expected = {
      "front-humanoid-22": ["humanoid", 22, "grasp"],
      "side-quadruped-22": ["quadruped", 22, "bite"],
      "front-bird-20": ["avian", 20, "fly"],
      "side-serpentine-13": ["serpentine", 13, "coil"],
    };
    expect(RIG_PRESET_OPTIONS.map((entry) => entry.id)).toEqual(Object.keys(expected));
    for (const [preset, [family, count, capability]] of Object.entries(expected)) {
      const draft = createRigDraft(preset);
      const validation = validateRigDraft(draft);
      const profile = rigProfileFromDraft(draft);
      expect(draft).toMatchObject({ schemaVersion: 2, contract: UNIVERSAL_RIG_CONTRACT, family });
      expect(draft.joints).toHaveLength(count);
      expect(validation.valid).toBe(true);
      expect(profile.capabilities).toContain(capability);
      expect(profile.mapping).toHaveProperty(draft.joints[0].slot);
    }
  });

  it("migrates legacy humanoid image coordinates without losing the preset topology", () => {
    const migrated = normalizeRigDraft({
      schemaVersion: 1,
      preset: "front-humanoid-22",
      joints: [{ slot: "leftHand", u: 0.91, v: 0.42 }],
    });
    expect(migrated.joints).toHaveLength(22);
    expect(migrated.joints.find((entry) => entry.slot === "leftHand")).toMatchObject({
      u: 0.91,
      v: 0.42,
      parent: "leftLowerArm",
      role: "hand",
      effector: true,
    });
  });

  it("adds, reparents and removes custom topology non-destructively", () => {
    const human = createRigDraft();
    const added = addRigJoint(human, {
      slot: "antenna",
      name: "Antenna",
      parent: "head",
      role: "tentacleTip",
      chain: "antenna",
    });
    expect(added.joints).toHaveLength(23);
    expect(added.joints.at(-1)).toMatchObject({ slot: "antenna", parent: "head", effector: true });
    const reparented = reparentRigJoint(added, "antenna", "neck");
    expect(reparented.joints.find((entry) => entry.slot === "antenna")?.parent).toBe("neck");
    const removed = removeRigJoint(reparented, "neck");
    expect(removed.joints.find((entry) => entry.slot === "antenna")?.parent).toBe("chest");
    expect(validateRigDraft(removed).valid).toBe(true);
    expect(normalizeRigDraft(JSON.parse(JSON.stringify(removed))).joints).toHaveLength(22);
  });

  it("rejects reparenting that would introduce a topology cycle", () => {
    const rig = createRigDraft("side-serpentine-13");
    expect(() => reparentRigJoint(rig, "root", "head")).toThrow(/父骨骼/u);
    expect(validateRigDraft(rig).valid).toBe(true);
  });

  it("preserves invalid imported parents so validation fails closed", () => {
    const invalid = normalizeRigDraft({
      ...createRigDraft("side-serpentine-13"),
      topologyCustomized: true,
      joints: createRigDraft("side-serpentine-13").joints.map((entry) => entry.slot === "head"
        ? { ...entry, parent: "missing-neck" }
        : entry),
    });
    expect(invalid.joints.find((entry) => entry.slot === "head")?.parent).toBe("missing-neck");
    expect(validateRigDraft(invalid)).toMatchObject({
      valid: false,
      errors: [expect.stringMatching(/父骨骼不存在/u)],
    });
  });

  it("mirrors paired joints and preserves semantic limits", () => {
    const moved = updateRigJoint(createRigDraft(), "leftHand", {
      u: 0.88,
      v: 0.57,
      depthOffset: 0.36,
      limits: { axis: "hinge", minDegrees: 80, maxDegrees: -20 },
    });
    const mirrored = mirrorRigJoint(moved, "leftHand");
    expect(mirrored.joints.find((entry) => entry.slot === "leftHand")?.limits).toEqual({
      axis: "hinge",
      minDegrees: -20,
      maxDegrees: 80,
    });
    expect(mirrored.joints.find((entry) => entry.slot === "rightHand")).toMatchObject({
      u: 0.12,
      v: 0.57,
      depthOffset: 0.36,
      role: "hand",
      chain: "arm.R",
      side: "right",
      effector: true,
    });
  });

  it("mirrors new custom joints with lowercase side suffixes and depth", () => {
    const custom = addRigJoint(createRigDraft("front-bird-20"), {
      slot: "sensor.l",
      name: "Sensor.l",
      parent: "leftWingTip",
      chain: "sensor.l",
      side: "left",
      depthOffset: -0.42,
    });
    const mirrored = mirrorRigJoint(custom, "sensor.l");
    expect(mirrored.joints.at(-1)).toMatchObject({
      name: "Sensor.R",
      parent: "rightWingTip",
      chain: "sensor.R",
      side: "right",
      depthOffset: -0.42,
      mirror: "sensor.l",
    });
  });

  it("creates a capability and IK-chain manifest for arbitrary custom rigs", () => {
    const custom = addRigJoint(createRigDraft("side-serpentine-13"), {
      slot: "gripper",
      name: "Gripper",
      parent: "head",
      role: "gripper",
      chain: "tool",
      effector: true,
    });
    const profile = rigProfileFromDraft(custom);
    expect(profile.capabilities).toEqual(expect.arrayContaining(["coil", "grasp", "look", "slither"]));
    expect(profile.chains.find((entry) => entry.id === "tool")).toMatchObject({
      joints: ["gripper"],
      effector: "gripper",
    });
    expect(profile.jointLimits.gripper).toEqual({ axis: "free", minDegrees: -180, maxDegrees: 180 });
  });
});
