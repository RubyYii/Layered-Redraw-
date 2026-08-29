import fs from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright-core";

const root = process.cwd();
const liveDepth = process.argv.includes("--live-depth");
const universalRig = process.argv.includes("--universal-rig");
const expectedImageSize = universalRig ? [240, 160] : [160, 240];
const expectedRigJoints = universalRig ? 24 : 22;
const artifactDir = path.join(root, "artifacts", "single-image-3d");
fs.mkdirSync(artifactDir, { recursive: true });

const chromeCandidates = [
  process.env.BLOCKOUT_CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error("未找到可用于单图 3D smoke 的 Chrome 或 Edge。");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

const pngChunk = (type, data = Buffer.alloc(0)) => {
  const name = Buffer.from(type, "ascii");
  const body = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, chunk.length - 4);
  return chunk;
};

const createPortraitPng = (width = 160, height = 240) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  const distanceToSegment = (x, y, x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - (x1 + dx * t), y - (y1 + dy * t));
  };
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    scanlines[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const head = Math.hypot(x - 80, y - 42) < 23;
      const torso = x > 55 && x < 105 && y > 62 && y < 142;
      const leftArm = distanceToSegment(x, y, 58, 75, 30, 145) < 11;
      const rightArm = distanceToSegment(x, y, 102, 75, 130, 145) < 11;
      const leftLeg = distanceToSegment(x, y, 68, 136, 58, 222) < 13;
      const rightLeg = distanceToSegment(x, y, 92, 136, 102, 222) < 13;
      const inside = head || torso || leftArm || rightArm || leftLeg || rightLeg;
      const offset = rowStart + 1 + x * 4;
      scanlines[offset] = inside ? 72 + Math.round(120 * y / height) : 0;
      scanlines[offset + 1] = inside ? 174 : 0;
      scanlines[offset + 2] = inside ? 205 - Math.round(70 * y / height) : 0;
      scanlines[offset + 3] = inside ? 255 : 0;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND"),
  ]);
};

const createQuadrupedPng = (width = 240, height = 160) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  const distanceToSegment = (x, y, x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - (x1 + dx * t), y - (y1 + dy * t));
  };
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    scanlines[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const body = ((x - 120) / 70) ** 2 + ((y - 72) / 34) ** 2 < 1;
      const neck = distanceToSegment(x, y, 168, 66, 190, 47) < 18;
      const head = Math.hypot(x - 202, y - 43) < 23;
      const snout = x > 203 && x < 235 && y > 43 && y < 62;
      const ear = distanceToSegment(x, y, 194, 29, 184, 10) < 7;
      const tail = distanceToSegment(x, y, 57, 62, 18, 25) < 8;
      const frontNear = distanceToSegment(x, y, 165, 87, 170, 148) < 10;
      const frontFar = distanceToSegment(x, y, 150, 88, 145, 146) < 8;
      const hindNear = distanceToSegment(x, y, 82, 88, 72, 148) < 11;
      const hindFar = distanceToSegment(x, y, 98, 89, 104, 146) < 8;
      const inside = body || neck || head || snout || ear || tail || frontNear || frontFar || hindNear || hindFar;
      const offset = rowStart + 1 + x * 4;
      scanlines[offset] = inside ? 105 + Math.round(80 * x / width) : 0;
      scanlines[offset + 1] = inside ? 166 - Math.round(45 * y / height) : 0;
      scanlines[offset + 2] = inside ? 92 + Math.round(85 * y / height) : 0;
      scanlines[offset + 3] = inside ? 255 : 0;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND"),
  ]);
};

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--enable-webgl", "--use-angle=swiftshader", "--disable-gpu-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
const networkEvents = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(error.message));
page.on("response", (response) => {
  if (/huggingface\.co|cdn\.jsdelivr\.net/u.test(response.url())) {
    networkEvents.push(`${response.status()} ${response.url()}`);
  }
});
page.on("requestfailed", (request) => {
  if (/huggingface\.co|cdn\.jsdelivr\.net/u.test(request.url())) {
    networkEvents.push(`FAIL ${request.url()} · ${request.failure()?.errorText ?? "unknown"}`);
  }
});

try {
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.waitForSelector("#viewport canvas");
  await page.evaluate(() => document.querySelector("#new-project").click());
  await page.locator('[data-primitive="box"]').click();
  await page.locator("#inspector-entity-tab").click();
  await page.locator("#entity-role").selectOption("character");
  await page.locator("#open-single-image-3d").click();
  await page.waitForSelector("#single-image-3d-dialog[open]");
  await page.locator("#single-image-file").setInputFiles({
    name: universalRig ? "single-image-quadruped-smoke.png" : "single-image-smoke.png",
    mimeType: "image/png",
    buffer: universalRig ? createQuadrupedPng() : createPortraitPng(),
  });
  await page.waitForFunction(() => !document.querySelector("#single-image-source-canvas")?.hidden);
  if (liveDepth) {
    await page.locator("#estimate-single-image-depth").click();
    await Promise.race([
      page.waitForFunction(
        () => !document.querySelector("#single-image-depth-canvas")?.hidden,
        undefined,
        { timeout: 240_000 },
      ),
      page.waitForFunction(
        () => /深度模型载入失败|HTTP \d+|请求失败/u.test(document.querySelector("#single-image-progress-text")?.textContent ?? ""),
        undefined,
        { timeout: 240_000 },
      ).then(async () => {
        throw new Error(await page.locator("#single-image-progress-text").textContent());
      }),
    ]);
  } else {
    const fixture = await page.evaluate(() => window.__BLOCKOUT_SINGLE_IMAGE_3D__.installSyntheticDepthForSmoke());
    assert(fixture.width === expectedImageSize[0] && fixture.height === expectedImageSize[1], "离线深度夹具尺寸异常。");
  }
  await page.waitForFunction(() => !document.querySelector("#single-image-depth-canvas")?.hidden);

  if (universalRig) {
    await page.locator("#single-image-rig-preset").selectOption("side-quadruped-22");
    await page.waitForFunction(() => window.__BLOCKOUT_SINGLE_IMAGE_3D__?.snapshot?.().rigFamily === "quadruped");
    await page.locator("#single-image-rig-joint").selectOption("head");
    await page.locator("#single-image-add-joint").click();
    await page.locator("#single-image-joint-name").fill("Sensor.L");
    await page.locator("#single-image-joint-name").dispatchEvent("change");
    await page.locator("#single-image-joint-role").fill("tentacleTip");
    await page.locator("#single-image-joint-role").dispatchEvent("change");
    await page.locator("#single-image-joint-chain").fill("sensor.L");
    await page.locator("#single-image-joint-chain").dispatchEvent("change");
    await page.locator("#single-image-mirror-joint").click();
    const edited = await page.evaluate(() => window.__BLOCKOUT_SINGLE_IMAGE_3D__.snapshot());
    assert(edited.rigJointCount === 24 && edited.rigValidation.valid, "非人类骨架的增骨、镜像或拓扑校验失败。");
    assert(edited.rigCapabilities.includes("bite") && edited.rigCapabilities.includes("walk"), "四足能力标签缺失。");
  }

  const canvas = page.locator("#single-image-source-canvas");
  const box = await canvas.boundingBox();
  assert(box, "骨架画布不可见。");
  const dragFrom = universalRig ? [0.69, 0.88] : [0.81, 0.61];
  const dragTo = universalRig ? [0.72, 0.84] : [0.85, 0.58];
  await page.mouse.move(box.x + box.width * dragFrom[0], box.y + box.height * dragFrom[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * dragTo[0], box.y + box.height * dragTo[1], { steps: 5 });
  await page.mouse.up();

  await page.locator("#build-single-image-obj").click();
  await page.waitForFunction(() => document.querySelector("#asset-session-title")?.textContent?.endsWith("-relief.obj"));
  const objSnapshot = await page.evaluate(() => window.__BLOCKOUT_SINGLE_IMAGE_3D__.snapshot());
  assert(objSnapshot.objReady && objSnapshot.mesh?.faceCount > 0, "OBJ 网格没有成功生成。");

  await page.locator("#build-single-image-glb").click();
  await page.waitForFunction(() => document.querySelector("#asset-session-title")?.textContent?.endsWith("-rigged.glb"));
  await page.waitForFunction(
    (count) => document.querySelector("#asset-session-detail")?.textContent?.includes(`${count} 骨骼`),
    expectedRigJoints,
  );
  const glbSnapshot = await page.evaluate(() => window.__BLOCKOUT_SINGLE_IMAGE_3D__.snapshot());
  assert(glbSnapshot.glbReady && glbSnapshot.rigJointCount === expectedRigJoints, "骨架 GLB 没有成功生成。");
  const workbenchScreenshot = universalRig ? "single-image-universal-rig-workbench.png" : "single-image-depth-rig-workbench.png";
  await page.locator("#single-image-3d-dialog").screenshot({ path: path.join(artifactDir, workbenchScreenshot) });

  await page.locator("#close-single-image-3d").click();
  await page.locator('[data-camera="front"]').click();
  await page.waitForTimeout(200);
  const sceneScreenshot = universalRig ? "single-image-quadruped-rigged-in-scene.png" : "single-image-rigged-model-in-scene.png";
  await page.locator("#viewport").screenshot({ path: path.join(artifactDir, sceneScreenshot) });
  assert(!await page.locator("#open-rig-mapping").isDisabled(), "生成的 GLB 未启用骨架映射编辑器。");
  if (!universalRig) {
    await page.locator("#open-rig-mapping").click();
    await page.waitForSelector("#rig-mapping-dialog[open]");
    assert((await page.locator("#rig-mapping-coverage").textContent())?.startsWith("22 /"), "22 骨预设没有进入映射诊断。");
    await page.locator("#rig-mapping-dialog").screenshot({ path: path.join(artifactDir, "single-image-generated-rig-mapping.png") });
    await page.locator("#close-rig-mapping").click();
  }

  await page.waitForFunction(() => document.querySelector("#autosave-status")?.textContent?.includes("恢复库已保存"));
  const persisted = await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem("blockout-studio.project.v3"));
    const object = project.objects.find((candidate) => candidate.asset?.portable?.kind === "single-image-model");
    return object ? { objectId: object.id, portable: object.asset.portable } : null;
  });
  const portable = persisted?.portable;
  assert(portable?.entries?.map((entry) => entry.role).sort().join(",") === "depth,model,rgb,rig", "可复现单图资产没有完整进入工程包合同。");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__BLOCKOUT_PORTABLE_ASSETS__?.snapshot?.().restored === 1);
  await page.locator(`.hierarchy-main[data-object-id="${persisted.objectId}"]`).click();
  await page.locator("#inspector-entity-tab").click();
  await page.locator("#open-single-image-3d").click();
  await page.waitForFunction(() => {
    const snapshot = window.__BLOCKOUT_SINGLE_IMAGE_3D__?.snapshot?.();
    return snapshot?.depthReady && snapshot?.mesh?.faceCount > 0;
  });
  const restoredRecipe = await page.evaluate(() => window.__BLOCKOUT_SINGLE_IMAGE_3D__.snapshot());
  assert(
    restoredRecipe.glbReady
      && restoredRecipe.imageSize.join("x") === expectedImageSize.join("x")
      && restoredRecipe.rigJointCount === expectedRigJoints
      && (!universalRig || restoredRecipe.rigFamily === "quadruped"),
    "刷新后没有恢复 GLB、单图或通用骨架配方。",
  );
  await page.locator("#close-single-image-3d").click();
  if (liveDepth) {
    assert(!networkEvents.some((entry) => entry.includes("cdn.jsdelivr.net")), "WASM 运行时仍从公共 CDN 载入。");
  }
  assert(errors.length === 0, `页面出现错误：${errors.join(" | ")}`);
  process.stdout.write(JSON.stringify({
    status: "PASS",
    depthMode: liveDepth ? "live-depth-anything-v2" : "deterministic-smoke-fixture",
    imageSize: glbSnapshot.imageSize,
    mesh: glbSnapshot.mesh,
    rigJointCount: glbSnapshot.rigJointCount,
    rigPreset: glbSnapshot.rigPreset,
    rigFamily: glbSnapshot.rigFamily,
    rigCapabilities: glbSnapshot.rigCapabilities,
    portableRoles: portable.entries.map((entry) => entry.role).sort(),
    restoredRecipe: {
      imageSize: restoredRecipe.imageSize,
      faceCount: restoredRecipe.mesh.faceCount,
      glbReady: restoredRecipe.glbReady,
    },
    wasmRuntime: liveDepth ? "self-hosted-build-asset" : "not-loaded",
    screenshots: [
      workbenchScreenshot,
      sceneScreenshot,
      ...(!universalRig ? ["single-image-generated-rig-mapping.png"] : []),
    ],
  }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(artifactDir, "single-image-3d-failure.png"), fullPage: true }).catch(() => {});
  throw new Error(`${error.message}\nNetwork: ${networkEvents.join(" | ") || "none"}\nConsole: ${errors.join(" | ") || "none"}`);
} finally {
  await browser.close();
}
