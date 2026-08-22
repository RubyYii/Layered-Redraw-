import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { evaluateTimeline } from "./director.js";

const appRoot = path.resolve(import.meta.dirname, "..");
const caseRoot = path.join(appRoot, "projects", "window-case");
const project = JSON.parse(fs.readFileSync(
  path.join(caseRoot, "window-that-wasnt-there.blockout.json"),
  "utf8",
));
const manifest = JSON.parse(fs.readFileSync(path.join(caseRoot, "shot-manifest.json"), "utf8"));

describe("window case full screenplay fixture", () => {
  it("locks the updated screenplay timing, source image, and English screen-text contract", () => {
    const sourceDigest = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(caseRoot, "source", "b2-photograph-closed-wall.png")))
      .digest("hex");
    const fiveActions = manifest.shots.filter((shot) => shot.id.startsWith("B7-"));
    const threeEndings = manifest.shots.filter((shot) => shot.id.startsWith("B8-"));

    expect(project.director.timeline.duration).toBe(166);
    expect(manifest.shots).toHaveLength(19);
    expect(manifest.screenText).toHaveLength(30);
    expect(manifest.renderContract).toMatchObject({
      fps: 30,
      resolution: [1280, 720],
      screenLanguage: "en",
      roomContinuity: "one-continuous-world",
    });
    expect(sourceDigest).toBe("c597660e245b599dadb5ecdc9d73720357cc81c75c2c5404376a9a01d36c8dec");
    expect(fiveActions.map((shot) => shot.duration)).toEqual([8, 8, 8, 8, 8]);
    expect(threeEndings.map((shot) => shot.duration)).toEqual([8, 8, 8]);
    expect(manifest.screenText[0].start).toBe(0);
    expect(manifest.screenText.at(-1).end).toBe(166);
    for (let index = 1; index < manifest.screenText.length; index += 1) {
      expect(manifest.screenText[index].start).toBe(manifest.screenText[index - 1].end);
    }
  });

  it("keeps all 4,981 fixed 30 fps samples free of residual proxy penetration", () => {
    let unsafeSamples = 0;
    let maxResidualPenetration = 0;
    let maxInitialPenetration = 0;
    let simulationViolations = 0;

    for (let frameIndex = 0; frameIndex <= 166 * 30; frameIndex += 1) {
      const frame = evaluateTimeline(project, frameIndex / 30);
      const collision = frame.simulation.collision;
      if (!collision.safe) unsafeSamples += 1;
      maxResidualPenetration = Math.max(maxResidualPenetration, collision.residualPenetration);
      maxInitialPenetration = Math.max(maxInitialPenetration, collision.maxPenetration);
      simulationViolations += frame.simulation.violations.length;
    }

    expect(unsafeSamples).toBe(0);
    expect(maxResidualPenetration).toBe(0);
    expect(maxInitialPenetration).toBeLessThan(0.09);
    expect(simulationViolations).toBe(0);
  });
});
