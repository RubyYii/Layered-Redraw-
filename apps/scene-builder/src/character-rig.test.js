import { describe, expect, it } from "vitest";
import {
  autoMapRigBones,
  evaluateRigMapping,
  resolveRigBoneBindings,
} from "./character-rig.js";

const mixamoBones = [
  "mixamorig:Hips", "mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Neck", "mixamorig:Head",
  "mixamorig:LeftArm", "mixamorig:LeftForeArm", "mixamorig:LeftHand",
  "mixamorig:RightArm", "mixamorig:RightForeArm", "mixamorig:RightHand",
  "mixamorig:LeftUpLeg", "mixamorig:LeftLeg", "mixamorig:LeftFoot",
  "mixamorig:RightUpLeg", "mixamorig:RightLeg", "mixamorig:RightFoot",
];

describe("portable character rig profiles", () => {
  it("auto-maps a Mixamo-style full body without reusing bones", () => {
    const result = autoMapRigBones(mixamoBones);

    expect(result.bones).toMatchObject({
      hips: "mixamorig:Hips",
      chest: "mixamorig:Spine1",
      leftUpperArm: "mixamorig:LeftArm",
      rightLowerArm: "mixamorig:RightForeArm",
      leftUpperLeg: "mixamorig:LeftUpLeg",
      rightFoot: "mixamorig:RightFoot",
    });
    expect(new Set(Object.values(result.bones).filter(Boolean)).size)
      .toBe(Object.values(result.bones).filter(Boolean).length);
  });

  it("keeps explicit unmapping and reports required gaps and duplicate bones", () => {
    const resolved = resolveRigBoneBindings({ bones: { head: null, leftHand: "mixamorig:RightHand" } }, mixamoBones);
    const report = evaluateRigMapping({
      ...resolved.bones,
      rightHand: "mixamorig:RightHand",
    }, mixamoBones, { sources: resolved.sources });

    expect(resolved.bones.head).toBeNull();
    expect(report.valid).toBe(false);
    expect(report.missingRequired).toContain("head");
    expect(report.duplicateBones[0]).toMatchObject({ boneName: "mixamorig:RightHand" });
  });
});
