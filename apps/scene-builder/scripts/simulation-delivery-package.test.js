import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { buildSimulationDeliveryPackage } from "./simulation-delivery-package.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(scriptDir, "../projects/interaction-lab/interaction-simulation.blockout.json");
const fixtureText = fs.readFileSync(fixturePath, "utf8");
const temporaryRoots = [];

const sha256 = (filePath) => crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");

const setup = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "simulation-delivery-test-"));
  temporaryRoots.push(root);
  const videoPath = path.join(root, "test.webm");
  const threeModulePath = path.join(root, "three.module.min.js");
  const threeLicensePath = path.join(root, "THREE-LICENSE.txt");
  const auditPath = path.join(root, "audit.png");
  fs.writeFileSync(videoPath, Buffer.from("deterministic-video-fixture"));
  fs.writeFileSync(threeModulePath, "export const fixture = true;\n", "utf8");
  fs.writeFileSync(threeLicensePath, "Three.js test license fixture\n", "utf8");
  fs.writeFileSync(auditPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return { root, videoPath, threeModulePath, threeLicensePath, auditPath };
};

const build = (environment, overrides = {}) => {
  const project = overrides.project ?? JSON.parse(fixtureText);
  return buildSimulationDeliveryPackage({
    project,
    projectText: overrides.projectText ?? `${JSON.stringify(project, null, 2)}\n`,
    videoPath: environment.videoPath,
    outputDir: path.join(environment.root, overrides.outputName ?? "delivery"),
    renderReport: {
      ok: true,
      outputPath: path.join(environment.root, "machine-specific", "test.webm"),
      reportPath: path.join(environment.root, "machine-specific", "test.report.json"),
      wallDuration: 4.2,
      fps: 10,
    },
    fps: 10,
    start: 0,
    duration: 10,
    title: "Deterministic fixture",
    threeModulePath: environment.threeModulePath,
    threeLicensePath: environment.threeLicensePath,
    additionalFiles: [{ sourcePath: environment.auditPath, relativePath: "audit/check.png" }],
  });
};

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("reproducible simulation delivery packages", () => {
  it("builds a self-contained PASS package with verifiable hashes", () => {
    const environment = setup();
    const result = build(environment);
    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, "utf8"));
    const trace = fs.readFileSync(path.join(result.packageDir, "simulation.trace.jsonl"), "utf8")
      .trim().split(/\r?\n/).map((line) => JSON.parse(line));
    const portableReport = JSON.parse(fs.readFileSync(path.join(result.packageDir, "render-report.json"), "utf8"));

    expect(result.ok).toBe(true);
    expect(manifest.schema).toBe("simulation-delivery-v1");
    expect(manifest.validation).toMatchObject({ status: "PASS", collisionSafe: true, simulationViolationCount: 0 });
    expect(manifest.timeline).toMatchObject({ fps: 10, frameCount: 100, simulationSampleCount: 101 });
    expect(trace[0]).toMatchObject({ kind: "header", schema: "simulation-trace-v1", sampleCount: 101 });
    expect(trace[1]).toMatchObject({ kind: "frame", frame: 0, fullState: true });
    expect(trace.at(-1)).toMatchObject({ kind: "terminal", frame: 100 });
    expect(Object.keys(trace[1].changes)).toHaveLength(manifest.project.objectCount);
    expect(portableReport).toMatchObject({ outputPath: "final-video.webm", reportPath: "render-report.json" });
    expect(JSON.stringify(portableReport)).not.toContain(environment.root);
    expect(fs.existsSync(path.join(result.packageDir, "audit/check.png"))).toBe(true);
    expect(fs.readFileSync(path.join(result.packageDir, "replay-runtime.js"), "utf8")).not.toMatch(/https?:\/\//i);

    for (const record of manifest.files) {
      expect(sha256(path.join(result.packageDir, ...record.path.split("/")))).toBe(record.sha256);
    }
    const verification = spawnSync(process.execPath, [path.join(result.packageDir, "verify-delivery.mjs")], { encoding: "utf8" });
    expect(verification.status).toBe(0);
    expect(JSON.parse(verification.stdout)).toMatchObject({
      ok: true,
      status: "PASS",
      packageId: result.packageId,
      verifiedFileCount: manifest.files.length,
    });
  });

  it("keeps simulation identity and manifest stable across repeated builds", () => {
    const environment = setup();
    const first = build(environment);
    const firstManifest = fs.readFileSync(first.manifestPath, "utf8");
    const second = build(environment);
    const secondManifest = fs.readFileSync(second.manifestPath, "utf8");

    expect(second.simulationIdentity).toBe(first.simulationIdentity);
    expect(second.packageId).toBe(first.packageId);
    expect(secondManifest).toBe(firstManifest);
    expect(second.previousPackagePath).toBeTruthy();
    expect(fs.existsSync(path.join(second.previousPackagePath, "delivery.manifest.json"))).toBe(true);
  });

  it("locks inline texture bytes in the asset inventory", () => {
    const environment = setup();
    const project = JSON.parse(fixtureText);
    project.objects[0].render.textureDataUrl = "data:text/plain;base64,bG9ja2VkLXRleHR1cmU=";
    const result = build(environment, { project });
    const lock = JSON.parse(fs.readFileSync(path.join(result.packageDir, "assets.lock.json"), "utf8"));
    const record = lock.records.find((entry) => entry.objectId === project.objects[0].id);

    expect(record.inlineTexture).toMatchObject({ mediaType: "text/plain", bytes: 14 });
    expect(record.inlineTexture.sha256).toBe(crypto.createHash("sha256").update("locked-texture").digest("hex"));
  });

  it("preserves a failed package when ownership transitions are invalid", () => {
    const environment = setup();
    const project = JSON.parse(fixtureText);
    const transfer = project.director.timeline.clips.find((clip) => clip.ownershipMode === "transfer");
    transfer.secondaryTargetId = transfer.recipientId;
    const result = build(environment, { project, outputName: "failed-delivery" });
    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, "utf8"));
    const collision = JSON.parse(fs.readFileSync(path.join(result.packageDir, "collision-report.json"), "utf8"));

    expect(result.ok).toBe(false);
    expect(manifest.validation.status).toBe("FAIL");
    expect(manifest.validation.simulationViolationCount).toBeGreaterThan(0);
    expect(collision.violations.some((entry) => entry.mode === "transfer")).toBe(true);
    expect(fs.existsSync(result.replayPath)).toBe(true);
  });

  it("detects a modified file after delivery", () => {
    const environment = setup();
    const result = build(environment);
    fs.appendFileSync(path.join(result.packageDir, "audit/check.png"), Buffer.from("tampered"));
    const verification = spawnSync(process.execPath, [path.join(result.packageDir, "verify-delivery.mjs")], { encoding: "utf8" });
    const report = JSON.parse(verification.stdout);

    expect(verification.status).toBe(2);
    expect(report.status).toBe("FAIL");
    expect(report.failures).toContain("文件哈希或大小不匹配：audit/check.png");
  });

  it("rejects projects without a positive director timeline", () => {
    const environment = setup();
    const project = JSON.parse(fixtureText);
    project.director.timeline.duration = 0;

    expect(() => build(environment, { project })).toThrow("交付包要求大于零的有限导演时间线");
  });
});
