import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const artifactDir = path.join(root, "artifacts");
fs.mkdirSync(artifactDir, { recursive: true });

const chromeCandidates = [
  process.env.BLOCKOUT_CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error("未找到可用于骨架编辑器 smoke 的 Chrome 或 Edge。");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const createRiggedGlb = () => {
  const boneNodes = [
    { name: "mixamorig:Hips", translation: [0, 0, 0], children: [2, 12, 15] },
    { name: "mixamorig:Spine", translation: [0, 0.45, 0], children: [3] },
    { name: "mixamorig:Spine1", translation: [0, 0.42, 0], children: [4, 6, 9] },
    { name: "mixamorig:Neck", translation: [0, 0.28, 0], children: [5] },
    { name: "mixamorig:Head", translation: [0, 0.25, 0] },
    { name: "mixamorig:LeftArm", translation: [-0.18, 0.16, 0], children: [7] },
    { name: "mixamorig:LeftForeArm", translation: [-0.48, 0, 0], children: [8] },
    { name: "mixamorig:LeftHand", translation: [-0.42, 0, 0] },
    { name: "mixamorig:RightArm", translation: [0.18, 0.16, 0], children: [10] },
    { name: "mixamorig:RightForeArm", translation: [0.48, 0, 0], children: [11] },
    { name: "mixamorig:RightHand", translation: [0.42, 0, 0] },
    { name: "mixamorig:LeftUpLeg", translation: [-0.18, -0.08, 0], children: [13] },
    { name: "mixamorig:LeftLeg", translation: [0, -0.58, 0], children: [14] },
    { name: "mixamorig:LeftFoot", translation: [0, -0.55, 0.12] },
    { name: "mixamorig:RightUpLeg", translation: [0.18, -0.08, 0], children: [16] },
    { name: "mixamorig:RightLeg", translation: [0, -0.58, 0], children: [17] },
    { name: "mixamorig:RightFoot", translation: [0, -0.55, 0.12] },
  ];
  const chunks = [];
  let byteLength = 0;
  const append = (typedArray, alignment = 4) => {
    const padding = (alignment - (byteLength % alignment)) % alignment;
    if (padding) {
      chunks.push(Buffer.alloc(padding));
      byteLength += padding;
    }
    const buffer = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const offset = byteLength;
    chunks.push(buffer);
    byteLength += buffer.length;
    return { offset, length: buffer.length };
  };
  const positions = append(new Float32Array([-0.35, 0, 0, 0.35, 0, 0, 0, 1.7, 0]));
  const indices = append(new Uint16Array([0, 1, 2]));
  const joints = append(new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  const weights = append(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]));
  const inverseBindValues = new Float32Array(boneNodes.length * 16);
  for (let index = 0; index < boneNodes.length; index += 1) {
    inverseBindValues[index * 16] = 1;
    inverseBindValues[index * 16 + 5] = 1;
    inverseBindValues[index * 16 + 10] = 1;
    inverseBindValues[index * 16 + 15] = 1;
  }
  const inverseBind = append(inverseBindValues);
  const binary = Buffer.concat(chunks);
  const view = (entry, target) => ({ buffer: 0, byteOffset: entry.offset, byteLength: entry.length, ...(target ? { target } : {}) });
  const document = {
    asset: { version: "2.0", generator: "Blockout Studio rig editor smoke" },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [
      { name: "RiggedSmokeMesh", mesh: 0, skin: 0 },
      ...boneNodes.map((node) => ({ ...node, ...(node.children ? { children: node.children } : {}) })),
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 2, WEIGHTS_0: 3 }, indices: 1 }] }],
    skins: [{ inverseBindMatrices: 4, joints: boneNodes.map((_, index) => index + 1), skeleton: 1 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.35, 0, 0], max: [0.35, 1.7, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
      { bufferView: 2, componentType: 5123, count: 3, type: "VEC4" },
      { bufferView: 3, componentType: 5126, count: 3, type: "VEC4" },
      { bufferView: 4, componentType: 5126, count: boneNodes.length, type: "MAT4" },
    ],
    bufferViews: [
      view(positions, 34962),
      view(indices, 34963),
      view(joints, 34962),
      view(weights, 34962),
      view(inverseBind),
    ],
    buffers: [{ byteLength: binary.length }],
  };
  const rawJson = Buffer.from(JSON.stringify(document));
  const jsonPadding = (4 - (rawJson.length % 4)) % 4;
  const jsonChunk = Buffer.concat([rawJson, Buffer.alloc(jsonPadding, 0x20)]);
  const binPadding = (4 - (binary.length % 4)) % 4;
  const binChunk = Buffer.concat([binary, Buffer.alloc(binPadding)]);
  const output = Buffer.alloc(12 + 8 + jsonChunk.length + 8 + binChunk.length);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonChunk.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(output, 20);
  const binHeader = 20 + jsonChunk.length;
  output.writeUInt32LE(binChunk.length, binHeader);
  output.writeUInt32LE(0x004e4942, binHeader + 4);
  binChunk.copy(output, binHeader + 8);
  return output;
};

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--enable-webgl", "--use-angle=swiftshader", "--disable-gpu-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.waitForSelector("#viewport canvas");
  await page.locator('[data-primitive="box"]').click();
  await page.locator("#inspector-entity-tab").click();
  await page.locator("#entity-role").selectOption("character");
  await page.locator("#asset-file").setInputFiles({
    name: "rig-editor-smoke.glb",
    mimeType: "model/gltf-binary",
    buffer: createRiggedGlb(),
  });
  await page.waitForFunction(() => document.querySelector("#asset-session-title")?.textContent === "rig-editor-smoke.glb");
  assert((await page.locator("#asset-session-detail").textContent())?.includes("17 骨骼"), "测试 GLB 骨骼未载入。");
  assert(!await page.locator("#open-rig-mapping").isDisabled(), "骨架映射按钮未启用。");
  await page.locator("#open-rig-mapping").click();
  await page.waitForSelector("#rig-mapping-dialog[open]");
  assert(await page.locator(".rig-mapping-row").count() === 25, "骨架语义槽位数量异常。");
  assert((await page.locator("#rig-mapping-warning").textContent())?.includes("必需骨骼映射完整"), "自动映射没有通过完整性诊断。");
  assert(await page.locator("#rig-mapping-capability").textContent() === "可用", "全身 IK 能力未就绪。");
  await page.locator('[data-rig-test="pose"]').click();
  await page.locator('[data-rig-test="hands"]').click();
  await page.locator('[data-rig-test="feet"]').click();
  await page.screenshot({ path: path.join(artifactDir, "blockout-studio-rig-mapping.png"), fullPage: true });
  await page.locator("#rig-mapping-dialog").screenshot({ path: path.join(artifactDir, "blockout-studio-rig-mapping-panel.png") });
  await page.locator("#save-rig-mapping").click();
  await page.locator("#rig-mapping-dialog").waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.querySelector("#autosave-status")?.textContent?.includes("恢复库已保存"));
  await page.waitForTimeout(500);
  const persisted = await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem("blockout-studio.project.v3"));
    return project.objects.find((object) => object.asset?.bones?.leftHand)?.asset?.bones;
  });
  assert(persisted?.leftHand?.endsWith("LeftHand"), "左手映射没有进入项目 JSON。");
  assert(persisted?.rightFoot?.endsWith("RightFoot"), "右脚映射没有进入项目 JSON。");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#open-rig-mapping").click();
  await page.waitForSelector("#rig-mapping-dialog[open]");
  const mobileRect = await page.locator("#rig-mapping-dialog").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height, bottom: window.innerHeight - rect.bottom };
  });
  assert(mobileRect.width === 390 && mobileRect.height <= 720 && Math.abs(mobileRect.bottom) < 1, "移动端骨架编辑器不是底部抽屉。");
  await page.screenshot({ path: path.join(artifactDir, "blockout-studio-rig-mapping-mobile.png"), fullPage: true });

  const contract = await page.evaluate(() => window.__BLOCKOUT_AGENT_BEHAVIOR__?.contract);
  assert(JSON.stringify(contract?.allowedActions) === JSON.stringify(["approach", "look", "reach", "grasp", "transfer", "release", "speak"]), "Agent 七动作合同未暴露。" );
  assert(contract?.authority?.runtime?.includes("IK"), "Agent 合同没有声明仿真运行时权威。" );
  assert(errors.length === 0, `页面出现错误：${errors.join(" | ")}`);
  process.stdout.write(JSON.stringify({
    status: "PASS",
    boneSlots: 25,
    persistedMappings: Object.values(persisted).filter(Boolean).length,
    agentActions: contract.allowedActions,
    screenshots: ["blockout-studio-rig-mapping.png", "blockout-studio-rig-mapping-panel.png", "blockout-studio-rig-mapping-mobile.png"],
  }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(artifactDir, "blockout-studio-rig-mapping-failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
