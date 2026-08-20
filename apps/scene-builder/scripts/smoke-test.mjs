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
].filter(Boolean);

const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error("未找到可用于界面测试的 Chrome 或 Edge。");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
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

  await page.locator("#timeline-play").focus();
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
    objectCount: await page.locator(".hierarchy-row").count(),
    referenceScreenshot,
    directorErrorScreenshot,
    desktopScreenshot,
    tabletScreenshot,
  }, null, 2)}\n`);
} catch (error) {
  await page.screenshot({ path: failureScreenshot, fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
