import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const root = process.cwd();
const artifactDir = path.join(root, "artifacts", "multi-view-gray");
fs.mkdirSync(artifactDir, { recursive: true });

const chromeCandidates = [
  process.env.BLOCKOUT_CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error("未找到可用于多视角灰模 smoke 的 Chrome 或 Edge。");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--enable-webgl", "--use-angle=swiftshader", "--disable-gpu-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.waitForSelector("#viewport canvas");
  await page.evaluate(() => document.querySelector("#new-project").click());
  await page.locator('[data-primitive="box"]').click();
  await page.locator("#inspector-entity-tab").click();
  await page.locator("#open-multi-view-gray").click();
  await page.waitForSelector("#multi-view-gray-dialog[open]");

  const installed = await page.evaluate(() => window.__BLOCKOUT_MULTI_VIEW_GRAY__.installSyntheticViewsForSmoke());
  assert(installed.viewIds.join(",") === "front,right,top", "多视角 smoke 夹具没有完整安装。");
  await page.waitForFunction(() => !document.querySelector('[data-multi-view-canvas="front"]')?.hidden);
  assert(!await page.locator("#build-multi-view-gray").isDisabled(), "正面与侧面齐备后仍不能生成灰模。");
  assert(await page.locator("#multi-view-preview-mode").inputValue() === "depth", "深度夹具没有切换到相对深度预览。");

  await page.locator("#multi-view-active-view").selectOption("right");
  assert(await page.locator("#multi-view-use-depth").isChecked(), "右侧深度没有默认启用。");
  await page.evaluate(() => document.querySelector("#multi-view-gray-dialog").focus());
  await page.keyboard.press("d");
  assert(!await page.locator("#multi-view-use-depth").isChecked(), "D 快捷键没有停用当前深度。");
  await page.keyboard.press("d");
  assert(await page.locator("#multi-view-use-depth").isChecked(), "D 快捷键没有重新启用当前深度。");
  await page.keyboard.press("i");
  assert(await page.locator("#multi-view-depth-invert").isChecked(), "I 快捷键没有反转当前深度。");
  await page.keyboard.press("i");
  assert(!await page.locator("#multi-view-depth-invert").isChecked(), "I 快捷键没有恢复默认深度方向。");
  await page.locator("#multi-view-threshold").fill("56");
  await page.locator("#multi-view-threshold").dispatchEvent("input");
  await page.locator(".multi-view-advanced-settings summary").click();
  assert(await page.locator(".multi-view-advanced-settings").evaluate((element) => element.open), "高级重建参数没有展开。");
  await page.locator("#multi-view-resolution").fill("32");
  await page.locator("#multi-view-resolution").dispatchEvent("input");
  await page.locator("#multi-view-depth-influence").fill("0.35");
  await page.locator("#multi-view-depth-influence").dispatchEvent("input");
  await page.locator(".multi-view-advanced-settings summary").click();
  assert(!await page.locator("#build-multi-view-baseline").isDisabled(), "纯轮廓基线按钮不可用。");
  await page.locator("#build-multi-view-baseline").click();
  await page.waitForFunction(() => {
    const snapshot = window.__BLOCKOUT_MULTI_VIEW_GRAY__?.snapshot?.();
    return snapshot?.objReady && snapshot.mesh?.depthInfluence === 0;
  }, undefined, { timeout: 60_000 });
  const baseline = await page.evaluate(() => window.__BLOCKOUT_MULTI_VIEW_GRAY__.snapshot());
  assert(baseline.mesh.voxelCount === baseline.mesh.visualHullVoxelCount, "纯轮廓基线仍然应用了深度削减。");
  assert(baseline.mesh.depthViewIds.length === 0, "纯轮廓基线错误记录了有效深度视角。");
  assert((await page.locator("#multi-view-evidence-list").textContent()).includes("纯轮廓基线"), "基线证据摘要没有标明实验条件。");

  await page.locator("#build-multi-view-gray").click();
  await page.waitForFunction(() => {
    const snapshot = window.__BLOCKOUT_MULTI_VIEW_GRAY__?.snapshot?.();
    return snapshot?.objReady && snapshot.mesh?.depthViewIds?.length === 3;
  }, undefined, { timeout: 60_000 });
  const generated = await page.evaluate(() => window.__BLOCKOUT_MULTI_VIEW_GRAY__.snapshot());
  assert(generated.recipeReady && generated.mesh?.faceCount > 0, "OBJ 或可复现配方没有生成。");
  assert(generated.mesh?.depthCarvedVoxelCount > 0, "深度辅助没有从纯轮廓外壳削减任何体素。");
  assert(generated.mesh?.depthViewIds?.join(",") === "front,right,top", "生成结果没有记录全部有效深度视角。");
  assert(Object.values(generated.mesh?.depthRejectedVoxelCounts ?? {}).every((count) => count > 0), "逐视角深度削减计数缺失。");
  const evidenceText = await page.locator("#multi-view-evidence-list").textContent();
  assert(["正面拒绝", "右侧拒绝", "顶部拒绝", "深度总削减"].every((label) => evidenceText.includes(label)), "深度作用证据没有显示逐视角精确计数。");
  assert(generated.traceLength >= 4, "本地操作序列没有记录视角、阈值、精度与生成动作。");
  assert(generated.guidedPairReady, "已生成会话丢失正面/侧面合同。");

  await page.evaluate(() => {
    const dialog = document.querySelector("#multi-view-gray-dialog");
    dialog.scrollLeft = 0;
    dialog.querySelector(".single-image-3d-shell").scrollLeft = 0;
    dialog.querySelector(".multi-view-control-pane").scrollTop = 0;
  });
  await page.locator("#multi-view-gray-dialog").screenshot({ path: path.join(artifactDir, "multi-view-workbench.png") });
  await page.locator("#multi-view-evidence-summary").scrollIntoViewIfNeeded();
  await page.locator("#multi-view-evidence-summary").screenshot({ path: path.join(artifactDir, "multi-view-depth-evidence.png") });
  await page.locator("#close-multi-view-gray").click();
  await page.locator('[data-camera="perspective"]').click();
  await page.waitForTimeout(250);
  await page.locator("#viewport").screenshot({ path: path.join(artifactDir, "multi-view-gray-in-scene.png") });

  await page.waitForFunction(() => document.querySelector("#autosave-status")?.textContent?.includes("恢复库已保存"));
  const persisted = await page.evaluate(() => {
    const project = JSON.parse(localStorage.getItem("blockout-studio.project.v3"));
    const object = project.objects.find((candidate) => candidate.asset?.portable?.kind === "multi-view-gray-model");
    return object ? { objectId: object.id, portable: object.asset.portable } : null;
  });
  const roles = persisted?.portable?.entries?.map((entry) => entry.role).sort() ?? [];
  assert(
    roles.join(",") === "depth-front,depth-right,depth-top,model,recipe,view-front,view-right,view-top",
    `多视角来源绑定不完整：${roles.join(",")}`,
  );

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__BLOCKOUT_PORTABLE_ASSETS__?.snapshot?.().restored === 1);
  await page.locator(`.hierarchy-main[data-object-id="${persisted.objectId}"]`).click();
  await page.locator("#inspector-entity-tab").click();
  await page.locator("#open-multi-view-gray").click();
  await page.waitForFunction(() => window.__BLOCKOUT_MULTI_VIEW_GRAY__?.snapshot?.().recipeReady);
  const restored = await page.evaluate(() => window.__BLOCKOUT_MULTI_VIEW_GRAY__.snapshot());
  assert(restored.viewIds.join(",") === "front,right,top" && restored.mesh?.faceCount > 0, "刷新后没有恢复规范视角与灰模配方。");
  assert(restored.depthViewIds.join(",") === "front,right,top", "刷新后没有恢复全部相对深度工件。");
  assert(restored.mesh?.depthCarvedVoxelCount > 0, "刷新后的灰模没有复现深度削减结果。");
  assert(errors.length === 0, `页面出现错误：${errors.join(" | ")}`);

  process.stdout.write(JSON.stringify({
    status: "PASS",
    mode: "deterministic-local-depth-assisted-visual-hull",
    viewIds: generated.viewIds,
    baseline: baseline.mesh,
    mesh: generated.mesh,
    traceLength: generated.traceLength,
    portableRoles: roles,
    restored: { viewIds: restored.viewIds, depthViewIds: restored.depthViewIds, faceCount: restored.mesh.faceCount },
    screenshots: ["multi-view-workbench.png", "multi-view-depth-evidence.png", "multi-view-gray-in-scene.png"],
  }, null, 2));
} catch (error) {
  await page.screenshot({ path: path.join(artifactDir, "multi-view-gray-failure.png"), fullPage: true }).catch(() => {});
  throw new Error(`${error.message}\nConsole: ${errors.join(" | ") || "none"}`);
} finally {
  await browser.close();
}
