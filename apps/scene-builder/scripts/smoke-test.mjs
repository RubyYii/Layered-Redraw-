import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright-core";

const root = process.cwd();
const artifactDir = path.join(root, "artifacts");
fs.mkdirSync(artifactDir, { recursive: true });

const chromeCandidates = [
  process.env.BLOCKOUT_CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error("未找到可用于界面测试的 Chrome 或 Edge。");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const createTinyGlb = () => {
  const binary = Buffer.alloc(96);
  [
    -0.5, -0.5, 0,
    0.5, -0.5, 0,
    0, 0.5, 0,
  ].forEach((value, index) => binary.writeFloatLE(value, index * 4));
  [0, 1, 2].forEach((value, index) => binary.writeUInt16LE(value, 36 + index * 2));
  [
    0, 0, 0,
    0, 0, 0,
    0, 0.25, 0,
  ].forEach((value, index) => binary.writeFloatLE(value, 44 + index * 4));
  [0, 1].forEach((value, index) => binary.writeFloatLE(value, 80 + index * 4));
  [0, 1].forEach((value, index) => binary.writeFloatLE(value, 88 + index * 4));
  const json = {
    asset: { version: "2.0", generator: "Blockout Studio smoke test" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "Root", mesh: 0 }],
    meshes: [{
      weights: [0],
      extras: { targetNames: ["Smile"] },
      primitives: [{ attributes: { POSITION: 0 }, indices: 1, targets: [{ POSITION: 2 }] }],
    }],
    animations: [{
      name: "Idle",
      samplers: [{ input: 3, output: 4, interpolation: "LINEAR" }],
      channels: [{ sampler: 0, target: { node: 0, path: "weights" } }],
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
      { bufferView: 2, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 3, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
      { bufferView: 4, componentType: 5126, count: 2, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 },
      { buffer: 0, byteOffset: 44, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 80, byteLength: 8 },
      { buffer: 0, byteOffset: 88, byteLength: 8 },
    ],
    buffers: [{ byteLength: binary.length }],
  };
  const rawJson = Buffer.from(JSON.stringify(json));
  const jsonPadding = (4 - (rawJson.length % 4)) % 4;
  const jsonChunk = Buffer.concat([rawJson, Buffer.alloc(jsonPadding, 0x20)]);
  const output = Buffer.alloc(12 + 8 + jsonChunk.length + 8 + binary.length);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonChunk.length, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(output, 20);
  const binaryHeader = 20 + jsonChunk.length;
  output.writeUInt32LE(binary.length, binaryHeader);
  output.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binary.copy(output, binaryHeader + 8);
  return output;
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

const createTinyPng = (width, height, pixelAt) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    scanlines[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue, alpha = 255] = pixelAt(x, y);
      const offset = rowStart + 1 + x * 4;
      scanlines[offset] = red;
      scanlines[offset + 1] = green;
      scanlines[offset + 2] = blue;
      scanlines[offset + 3] = alpha;
    }
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND"),
  ]);
};

const createSpatialBridgeFixture = () => {
  const rgb = createTinyPng(4, 2, (x, y) => y === 0
    ? [232 - x * 18, 143 + x * 17, 55 + x * 26]
    : [32 + x * 24, 70 + x * 20, 104 + x * 21]);
  const depth = createTinyPng(4, 2, (x, y) => {
    const nearness = 160 - Math.round(((y * 4 + x) / 7) * 65);
    return [nearness, nearness, nearness];
  });
  const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
  const bridge = {
    kind: "layered-redraw-spatial-bridge",
    schema_version: "1.0",
    source: {
      id: "smoke-rgb",
      role: "primary-rgb",
      label: "Smoke RGB-D",
      width: 4,
      height: 2,
      rgb_artifact: "references/smoke-rgb/rgb.png",
      rgb_sha256: hash(rgb),
    },
    depth: {
      id: "smoke-depth",
      preview_artifact: "references/smoke-rgb/depth/smoke-depth/depth-preview.png",
      artifact_sha256: { preview: hash(depth) },
      orientation: "near-white",
      relative_depth: true,
      metric_scale: false,
    },
    surface: {
      representation: "rgb-depth-heightfield",
      mesh_resolution: 24,
      displacement: 0.65,
      perspective: 0.58,
      near_direction: "+surface-normal",
      texture_fit: "preserve-aspect",
    },
    semantic_layers: { status: "missing", count: 0, layers: [] },
    invariants: {
      raw_depth_immutable: true,
      art_direction_changes_interpretation_only: true,
      relative_depth_must_not_be_treated_as_metres: true,
    },
    handoff: { target: "apps/scene-builder", contract: "depth-heightfield-v1", status: "ready-for-import" },
    contract_sha256: "d".repeat(64),
  };
  return { bridge: Buffer.from(JSON.stringify(bridge)), rgb, depth };
};

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: [
    "--enable-webgl",
    "--use-angle=swiftshader",
    "--disable-gpu-sandbox",
    "--disable-dev-shm-usage",
  ],
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));

const desktopScreenshot = path.join(artifactDir, "blockout-studio-desktop.png");
const tabletScreenshot = path.join(artifactDir, "blockout-studio-tablet.png");
const referenceScreenshot = path.join(artifactDir, "blockout-studio-reference.png");
const directorErrorScreenshot = path.join(artifactDir, "blockout-studio-director-error.png");
const assetScreenshot = path.join(artifactDir, "blockout-studio-asset-runtime.png");
const spatialScreenshot = path.join(artifactDir, "blockout-studio-spatial-bridge.png");
const interactionScreenshot = path.join(artifactDir, "blockout-studio-interaction-simulation.png");
const failureScreenshot = path.join(artifactDir, "blockout-studio-failure.png");

try {
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.waitForSelector("#viewport canvas");
  await page.waitForTimeout(500);

  const canvasState = await page.evaluate(() => {
    const canvas = document.querySelector("#viewport canvas");
    const context = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    const rect = canvas?.getBoundingClientRect();
    return {
      hasContext: Boolean(context),
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
    };
  });
  assert(canvasState.hasContext, "WebGL 上下文未创建。");
  assert(canvasState.width > 600 && canvasState.height > 500, "三维视口尺寸异常。");

  const initialCount = await page.locator(".hierarchy-row").count();
  assert(initialCount === 8, `导演示例场景应包含 8 个物体，实际为 ${initialCount}。`);

  const conceptSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
      <rect width="960" height="540" fill="#19262b"/>
      <circle cx="720" cy="118" r="72" fill="#f0aa46" opacity=".9"/>
      <path d="M0 430 210 230 355 365 505 170 720 430Z" fill="#44565a"/>
      <rect x="348" y="202" width="265" height="260" rx="8" fill="#8f8574"/>
      <rect x="412" y="270" width="138" height="192" rx="69" fill="#243439"/>
      <path d="M0 462h960v78H0z" fill="#4a514d"/>
      <path d="M95 462 360 315M865 462 602 315" stroke="#d4c4a4" stroke-width="9" opacity=".6"/>
    </svg>`;

  await page.locator("#concept-stage").click();
  assert(await page.locator("#reference-dialog").isVisible(), "概念图工作台未打开。");
  await page.locator("#reference-file").setInputFiles({
    name: "station-concept.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(conceptSvg),
  });
  await page.waitForSelector("#reference-full-preview:not([hidden])");
  await page.locator("#reference-prompt").fill("黄昏山谷中的石质入口，远处有暖色太阳");
  await page.locator("#reference-prompt").press("Tab");
  await page.locator("#breakdown-name").fill("入口拱门主体");
  await page.locator("#breakdown-type").selectOption("box");
  await page.locator("#breakdown-form button[type=submit]").click();
  assert(await page.locator(".breakdown-row").count() === 1, "物体拆解项未加入清单。");
  await page.screenshot({ path: referenceScreenshot, fullPage: true });

  await page.getByRole("button", { name: "创建灰模" }).click();
  assert(await page.locator("#reference-dialog").isHidden(), "创建灰模后工作台未关闭。");
  assert(await page.locator(".hierarchy-row").count() === 9, "拆解项未创建对应灰模。");
  assert(await page.locator(".hierarchy-name").filter({ hasText: "入口拱门主体" }).count() === 1, "拆解项名称未同步到场景层级。");

  await page.locator('[data-primitive="sphere"]').click();
  assert(await page.locator(".hierarchy-row").count() === 10, "添加球体后层级数量未更新。");
  assert(await page.locator("#inspector-form").isVisible(), "新增物体后属性面板未显示。");
  assert(await page.locator("#inspector-empty").isHidden(), "选中物体后空属性占位层仍然可见。");

  await page.locator('[data-tool="rotate"]').click();
  assert(await page.locator('[data-tool="rotate"]').getAttribute("aria-pressed") === "true", "旋转工具未激活。");
  await page.locator('[data-camera="top"]').click();
  assert(await page.locator('[data-camera="top"]').getAttribute("aria-pressed") === "true", "顶视图未激活。");

  await page.locator("#object-name").fill("测试细节物体");
  await page.locator("#object-name").press("Enter");
  await page.waitForTimeout(50);
  assert(await page.getByText("测试细节物体", { exact: true }).count() === 1, "物体重命名未同步到层级。");

  const positionX = page.locator('[data-vector="position"] [data-axis="0"]');
  await positionX.fill("3.5");
  await positionX.press("Tab");
  await page.waitForTimeout(50);

  await page.locator("#inspector-entity-tab").click();
  await page.locator("#entity-role").selectOption("character");
  assert(await page.locator("#entity-role-badge").textContent() === "角色", "实体类型未更新为角色。");
  await page.locator("#asset-file").setInputFiles({
    name: "smoke-agent.glb",
    mimeType: "model/gltf-binary",
    buffer: createTinyGlb(),
  });
  await page.waitForFunction(() => document.querySelector("#asset-session-title")?.textContent === "smoke-agent.glb");
  assert((await page.locator("#asset-session-detail").textContent())?.includes("1 网格"), "GLB 模型绑定报告未显示。");
  assert((await page.locator("#asset-session-detail").textContent())?.includes("GLB"), "GLB 格式能力没有显示。");
  assert((await page.locator("#asset-rig-detail").textContent())?.includes("setBonePose"), "骨架控制接口没有显示。");
  assert(!await page.locator("#asset-action-preview").isDisabled(), "GLB 动作预览没有启用。");
  assert(!await page.locator("#play-asset-action").isDisabled(), "GLB 动作重播按钮没有启用。");
  assert(!await page.locator("#asset-expression-preview").isDisabled(), "GLB 表情预览没有启用。");
  await page.locator("#play-asset-action").click();
  assert((await page.locator("#toast").textContent())?.includes("重播动作"), "动作重播没有进入运行时。");
  await page.locator("#asset-expression-weight").evaluate((input) => {
    input.value = "0.65";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert(await page.locator("#asset-expression-output").textContent() === "65%", "表情权重没有进入运行时。");
  await page.locator("#asset-rig-details").evaluate((details) => { details.open = true; });
  await page.locator("#asset-rig-details").scrollIntoViewIfNeeded();
  await page.screenshot({ path: assetScreenshot, fullPage: true });
  await page.locator("#clear-asset-file").click();
  assert(await page.locator("#asset-session-title").textContent() === "使用灰模", "恢复灰模没有清除会话模型。");
  const tinyObj = "v -0.5 0 0\nv 0.5 0 0\nv 0 1 0\nf 1 2 3\n";
  await page.locator("#asset-file").setInputFiles({
    name: "smoke-static.obj",
    mimeType: "model/obj",
    buffer: Buffer.from(tinyObj),
  });
  await page.waitForFunction(() => document.querySelector("#asset-session-title")?.textContent === "smoke-static.obj");
  assert((await page.locator("#asset-session-detail").textContent())?.includes("OBJ"), "OBJ 格式能力没有显示。");
  assert((await page.locator("#asset-rig-detail").textContent())?.includes("静态 OBJ"), "OBJ 静态限制没有显示。");
  assert(await page.locator("#asset-action-preview").isDisabled(), "静态 OBJ 不应启用动作预览。");
  assert(await page.locator("#play-asset-action").isDisabled(), "静态 OBJ 不应启用动作重播。");
  await page.locator("#clear-asset-file").click();
  await page.locator("#inspector-transform-tab").click();
  const positionY = page.locator('[data-vector="position"] [data-axis="1"]');
  await positionY.fill("3");
  await positionY.press("Tab");
  const spatialDimensions = [6, 3.375, 1];
  for (let axis = 0; axis < spatialDimensions.length; axis += 1) {
    const input = page.locator(`[data-vector="dimensions"] [data-axis="${axis}"]`);
    await input.fill(String(spatialDimensions[axis]));
    await input.press("Tab");
  }
  await page.locator("#inspector-entity-tab").click();
  await page.locator("#reference-visible").uncheck();
  await page.locator('[data-camera="perspective"]').click();
  const spatialFixture = createSpatialBridgeFixture();
  await page.locator("#spatial-bridge-files").setInputFiles([
    { name: "spatial-bridge.json", mimeType: "application/json", buffer: spatialFixture.bridge },
    { name: "rgb.png", mimeType: "image/png", buffer: spatialFixture.rgb },
    { name: "depth-preview.png", mimeType: "image/png", buffer: spatialFixture.depth },
  ]);
  await page.waitForFunction(() => document.querySelector("#asset-session-title")?.textContent === "Smoke RGB-D");
  assert((await page.locator("#asset-session-detail").textContent())?.includes("RGB／深度哈希已验证"), "RGB-D 工件哈希未显示为已验证。");
  assert((await page.locator("#asset-session-detail").textContent())?.includes("相对 2.5D"), "RGB-D 相对尺度边界未显示。");
  assert(await page.locator("#asset-runtime-controls").isHidden(), "RGB-D 表面不应显示角色动作／表情控制。");
  assert((await page.locator("#asset-rig-detail").textContent())?.includes("不会自动变成碰撞体"), "RGB-D 碰撞边界没有显示。");
  await page.locator("#asset-rig-details").evaluate((details) => { details.open = true; });
  await page.locator("#asset-rig-details").scrollIntoViewIfNeeded();
  await page.screenshot({ path: spatialScreenshot, fullPage: true });
  await page.locator("#clear-asset-file").click();
  assert(await page.locator("#asset-session-title").textContent() === "使用灰模", "恢复灰模没有清除 RGB-D 会话表面。");
  await page.locator("#interaction-trigger").selectOption("click");
  await page.locator("#interaction-action").selectOption("pulse");

  await page.locator("#duplicate-object").click();
  assert(await page.locator(".hierarchy-row").count() === 11, "创建副本失败。");
  await page.locator("#undo").click();
  assert(await page.locator(".hierarchy-row").count() === 10, "撤销创建副本失败。");

  await page.getByText("测试细节物体", { exact: true }).click();
  await page.locator('[data-camera="perspective"]').click();
  await page.waitForTimeout(380);

  await page.locator('[data-stage="screenplay"]').click();
  assert(await page.locator("#screenplay-panel").isVisible(), "剧本工作区未打开。");
  await page.locator("#compile-screenplay").click();
  await page.waitForTimeout(100);
  assert(await page.locator(".timeline-clip").count() >= 7, "剧本没有生成足够的时间线片段。");
  assert((await page.locator("#timeline-compile-badge").textContent())?.includes("已就绪"), "时间线未进入可播放状态。");

  const validScreenplay = await page.locator("#screenplay-input").inputValue();
  await page.locator("#screenplay-input").fill("不存在的角色 移动到 (1, 1, 1)");
  await page.locator("#compile-screenplay").click();
  assert(await page.locator(".compile-issue.is-error").count() === 1, "非法剧本没有显示逐行错误。");
  assert((await page.locator(".compile-issue.is-error").textContent())?.includes("L1"), "编译错误缺少行号。");
  await page.screenshot({ path: directorErrorScreenshot, fullPage: true });
  await page.locator("#screenplay-input").fill(validScreenplay);
  await page.locator("#compile-screenplay").click();
  assert(await page.locator(".compile-issue.is-error").count() === 0, "恢复正确剧本后仍显示编译错误。");

  await page.locator('[data-director-mode="preview"]').click();
  assert(await page.locator("#preview-indicator").isVisible(), "导演预览模式未开启。");
  assert(await page.locator("#performance-indicator").isVisible(), "预览性能监测没有显示。");
  assert(await page.locator('[data-tool="translate"]').isDisabled(), "预览模式仍允许编辑变换。");
  await page.locator("#timeline-scrubber").evaluate((input) => {
    input.value = String(Number(input.max) * 0.55);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator("#timeline-play").click();
  await page.waitForTimeout(260);
  await page.locator("#timeline-play").click();
  assert(await page.locator("#timeline-timecode").textContent() !== "00:00:00", "播放头没有推进。");

  await page.locator('[data-director-mode="edit"]').click();
  await page.locator("#inspector-transform-tab").click();
  assert(Number(await positionX.inputValue()) === 3.5, "退出预览后原始变换没有完整恢复。");
  await page.locator("#inspector-entity-tab").click();
  await page.locator('[data-director-mode="preview"]').click();

  await page.waitForTimeout(380);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("blockout-studio.project.v3")));
  assert(saved?.schemaVersion === 3, "本地自动保存缺少 schemaVersion 3。");
  assert(saved.reference?.dataUrl?.startsWith("data:image/"), "参考图未进入项目数据。");
  assert(saved.breakdown?.[0]?.objectId, "拆解项没有连接已创建的场景物体。");
  assert(saved.objects.some((object) => object.name === "测试细节物体" && object.position[0] === 3.5), "编辑结果未进入自动保存项目。");
  assert(saved.objects.some((object) => object.name === "测试细节物体" && object.entity.role === "character"), "实体组件未进入项目数据。");
  assert(saved.director?.timeline?.clips?.length >= 7, "编译后的时间线未进入项目数据。");

  await page.locator("#more-menu").click();
  await page.locator("#load-interaction-demo").click();
  await page.waitForSelector("#simulation-indicator:not([hidden])");
  assert(await page.locator("#project-name").inputValue() === "十秒交互仿真实验室", "交互仿真实验室未载入。");
  assert(await page.locator(".hierarchy-row").count() === 19, "交互仿真实验室物体数量异常。");
  assert((await page.locator("#simulation-phase").textContent())?.includes("SIM 60Hz"), "固定 60Hz 仿真状态未显示。");
  assert(await page.locator("#timeline-duration").textContent() === "00:10:00", "十秒验收时间线长度异常。");

  const seekInteraction = async (time) => {
    await page.locator("#timeline-scrubber").evaluate((input, value) => {
      input.value = String(value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, time);
    await page.waitForTimeout(80);
  };

  await seekInteraction(3);
  assert((await page.locator("#simulation-phase").textContent())?.includes("接触约束"), "抓取接触阶段未显示。");
  assert((await page.locator("#simulation-detail").textContent())?.includes("抓取"), "抓取语义未显示。");
  await seekInteraction(4.2);
  assert((await page.locator("#simulation-phase").textContent())?.includes("持续持有"), "角色 A 持有状态未保持。");
  assert((await page.locator("#simulation-detail").textContent())?.includes("角色 A"), "角色 A 所有权未显示。");
  await seekInteraction(5.95);
  assert((await page.locator("#simulation-detail").textContent())?.includes("交接"), "角色交接语义未显示。");
  assert(await page.locator("#simulation-indicator").getAttribute("data-state") === "contact", "交接没有进入接触状态。");
  await page.waitForTimeout(2200);
  await page.screenshot({ path: interactionScreenshot, fullPage: true });
  await seekInteraction(7.2);
  assert((await page.locator("#simulation-detail").textContent())?.includes("角色 B"), "角色 B 所有权未显示。");
  await seekInteraction(8.65);
  assert((await page.locator("#simulation-detail").textContent())?.includes("放置"), "放置语义未显示。");
  await seekInteraction(9.6);
  assert((await page.locator("#simulation-phase").textContent())?.includes("放置完成"), "物品没有稳定释放到接触面。");

  await seekInteraction(0);
  await page.locator("#timeline-play").click();
  await page.waitForTimeout(280);
  await page.locator("#timeline-play").click();
  const fixedStepTime = Number(await page.locator("#timeline-scrubber").inputValue());
  assert(fixedStepTime >= 0.2 && fixedStepTime <= 0.35, `固定步进播放推进异常：${fixedStepTime}s。`);

  await page.waitForTimeout(2400);
  await page.locator("#timeline-play").focus();
  const performanceState = {
    fps: await page.locator("#performance-fps").textContent(),
    quality: await page.locator("#performance-quality").textContent(),
  };
  assert(performanceState.fps?.includes("FPS"), "性能监测没有产出帧率。");
  assert(performanceState.quality?.includes("P95"), "性能监测没有产出帧时分位数。");
  await page.screenshot({ path: desktopScreenshot, fullPage: true });

  await page.setViewportSize({ width: 820, height: 820 });
  await page.waitForTimeout(100);
  await page.locator("#toggle-library").click();
  assert(await page.locator(".workspace").evaluate((element) => element.classList.contains("is-library-open")), "窄屏物体抽屉未打开。");
  await page.waitForTimeout(240);
  await page.screenshot({ path: tabletScreenshot, fullPage: true });

  assert(consoleErrors.length === 0, `浏览器控制台出现错误：${consoleErrors.join(" | ")}`);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    executablePath,
    canvasState,
    performanceState,
    objectCount: await page.locator(".hierarchy-row").count(),
    referenceScreenshot,
    directorErrorScreenshot,
    assetScreenshot,
    spatialScreenshot,
    interactionScreenshot,
    desktopScreenshot,
    tabletScreenshot,
  }, null, 2)}\n`);
} catch (error) {
  await page.screenshot({ path: failureScreenshot, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
