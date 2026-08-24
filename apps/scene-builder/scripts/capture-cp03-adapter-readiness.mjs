import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { canonicalJson } from "@layered-redraw/pact-cp03-contracts";

import {
  assert,
  createNetworkRecorder,
  launchCp02Browser,
  viewport,
} from "./smoke-test-cp02.mjs";

const claimCeiling = "zero-network adapter verification; no model-quality result";
const expectedAudit = Object.freeze({
  schemaVersion: "cp03-model-catalog-audit/0.1",
  route: "google",
  model: "gemini-3.7-flash",
  adapterName: "@deepseek-ai/dsh-llm-pi-ai",
  adapterVersion: "0.1.0-rc.6",
  catalogName: "@earendil-works/pi-ai",
  catalogVersion: "0.84.2",
});

const parseArgs = (args) => {
  const parsed = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!["--audit", "--output-dir"].includes(key) || !value || parsed.has(key)) {
      throw new Error("INVALID_ARGUMENTS");
    }
    parsed.set(key, value);
  }
  if (args.length !== 4 || parsed.size !== 2) throw new Error("INVALID_ARGUMENTS");
  return { auditPath: parsed.get("--audit"), outputDir: parsed.get("--output-dir") };
};

const auditHash = (audit) => {
  const { auditSha256: _ignored, ...unsigned } = audit;
  return crypto.createHash("sha256").update(canonicalJson(unsigned), "utf8").digest("hex");
};

const readVerifiedAudit = (auditPath) => {
  const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
  assert(audit.schemaVersion === expectedAudit.schemaVersion, "AUDIT_SCHEMA_INVALID");
  assert(audit.status === "PASS", "AUDIT_NOT_PASS");
  assert(audit.route === expectedAudit.route, "AUDIT_ROUTE_INVALID");
  assert(audit.model === expectedAudit.model, "AUDIT_MODEL_INVALID");
  assert(audit.packages?.name === expectedAudit.adapterName, "AUDIT_ADAPTER_INVALID");
  assert(audit.packages?.version === expectedAudit.adapterVersion, "AUDIT_ADAPTER_VERSION_INVALID");
  assert(audit.packages?.catalogName === expectedAudit.catalogName, "AUDIT_CATALOG_INVALID");
  assert(audit.packages?.catalogVersion === expectedAudit.catalogVersion, "AUDIT_CATALOG_VERSION_INVALID");
  assert(audit.providerRequestsMade === 0, "AUDIT_PROVIDER_REQUESTS_NONZERO");
  assert(Array.isArray(audit.findings) && audit.findings.length === 0, "AUDIT_FINDINGS_PRESENT");
  assert(
    Array.isArray(audit.capability?.inputModalities)
      && audit.capability.inputModalities.includes("text")
      && audit.capability.inputModalities.includes("image"),
    "AUDIT_MODALITIES_INVALID",
  );
  assert(Number.isInteger(audit.capability?.contextWindow) && audit.capability.contextWindow > 0, "AUDIT_CONTEXT_INVALID");
  assert(Number.isInteger(audit.capability?.defaultMaxTokens) && audit.capability.defaultMaxTokens > 0, "AUDIT_OUTPUT_INVALID");
  assert(/^[a-f0-9]{64}$/.test(audit.auditSha256), "AUDIT_HASH_INVALID");
  assert(auditHash(audit) === audit.auditSha256, "AUDIT_HASH_MISMATCH");
  return audit;
};

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const reportHtml = (audit) => {
  const rows = [
    ["ROUTE", audit.route],
    ["MODEL", audit.model],
    ["INPUT", audit.capability.inputModalities.join(" + ")],
    ["CONTEXT", audit.capability.contextWindow.toLocaleString("en-US")],
    ["MAX OUTPUT", audit.capability.defaultMaxTokens.toLocaleString("en-US")],
    ["DSH ADAPTER", `${audit.packages.name}  ${audit.packages.version}`],
    ["CATALOG", `${audit.packages.catalogName}  ${audit.packages.catalogVersion}`],
    ["AUDIT SHA-256", audit.auditSha256],
    ["CLAIM CEILING", claimCeiling],
  ];
  const renderedRows = rows.map(([label, value], index) => `
    <div class="audit-row" data-row="${index}">
      <span class="label">${escapeHtml(label)}</span>
      <span class="value">${escapeHtml(value)}</span>
      <span class="mark">PASS</span>
    </div>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root { color-scheme: dark; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    * { box-sizing: border-box; }
    body { margin: 0; width: 100vw; height: 100vh; overflow: hidden; color: #e8e0d0; background: #090b0b; }
    body::before { content: ""; position: fixed; inset: 0; pointer-events: none; opacity: .16; background: repeating-linear-gradient(0deg, transparent 0 3px, rgba(255,255,255,.045) 4px); }
    main { position: relative; height: 100%; padding: 42px 54px 34px; border: 1px solid #282b28; background: radial-gradient(circle at 78% 18%, rgba(215,148,47,.08), transparent 38%); }
    header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 26px; }
    .eyebrow { color: #d59a3d; font-size: 13px; letter-spacing: .22em; }
    h1 { margin: 8px 0 0; font: 500 29px/1.15 Georgia, serif; letter-spacing: .02em; }
    .badge { border: 1px solid #82622f; color: #f0b252; padding: 9px 12px; font-size: 12px; letter-spacing: .12em; }
    section { border-top: 1px solid #34362f; }
    .audit-row { min-height: 54px; display: grid; grid-template-columns: 155px 1fr 66px; align-items: center; border-bottom: 1px solid #262922; transition: background .24s ease, color .24s ease, transform .24s ease; }
    .audit-row.active { background: linear-gradient(90deg, rgba(229,158,52,.2), rgba(229,158,52,.025)); color: #fff4df; transform: translateX(5px); }
    .label { color: #8e9289; font-size: 12px; letter-spacing: .14em; }
    .value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
    .mark { justify-self: end; color: #71b78b; font-size: 11px; letter-spacing: .12em; }
    footer { display: flex; justify-content: space-between; margin-top: 22px; color: #74786f; font-size: 11px; letter-spacing: .1em; }
    footer strong { color: #d59a3d; font-weight: 500; }
  </style>
</head>
<body>
  <main>
    <header>
      <div><div class="eyebrow">PACT / CP03 / STAGE A</div><h1>Gemini 3.7 adapter readiness audit</h1></div>
      <div class="badge">ENGINEERING EVIDENCE</div>
    </header>
    <section>${renderedRows}</section>
    <footer><span>LOCAL CATALOG INSPECTION</span><strong>PROVIDER REQUESTS 00 / BROWSER NON-LOCAL 00</strong></footer>
  </main>
</body>
</html>`;
};

export async function captureAdapterReadiness({ auditPath, outputDir }) {
  const audit = readVerifiedAudit(auditPath);
  const mediaDir = path.join(outputDir, "media");
  fs.mkdirSync(mediaDir, { recursive: true });
  const screenshotPath = path.join(mediaDir, "catalog-capability.png");
  const videoPath = path.join(mediaDir, "adapter-readiness.webm");
  for (const target of [screenshotPath, videoPath]) {
    assert(!fs.existsSync(target), "CAPTURE_TARGET_ALREADY_EXISTS");
  }

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "pact-cp03-adapter-capture-"));
  const recorder = createNetworkRecorder();
  let browser;
  let context;
  try {
    ({ browser } = await launchCp02Browser({ headless: false }));
    context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      recordVideo: { dir: stagingDir, size: viewport },
    });
    const page = await context.newPage();
    recorder.attach(page, "cp03-adapter-readiness-report");
    const video = page.video();
    await page.setContent(reportHtml(audit), { waitUntil: "load" });
    await page.screenshot({ path: screenshotPath, type: "png" });

    const rows = await page.locator(".audit-row").count();
    assert(rows === 9, "AUDIT_REPORT_ROW_COUNT_INVALID");
    for (let index = 0; index < rows; index += 1) {
      await page.locator(".audit-row").evaluateAll((elements, activeIndex) => {
        elements.forEach((element, elementIndex) => element.classList.toggle("active", elementIndex === activeIndex));
      }, index);
      await page.waitForTimeout(2_000);
    }

    await context.close();
    context = undefined;
    await video.saveAs(videoPath);
  } finally {
    await context?.close();
    await browser?.close();
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }

  assert(fs.existsSync(screenshotPath) && fs.statSync(screenshotPath).size > 0, "SCREENSHOT_MISSING");
  assert(fs.existsSync(videoPath) && fs.statSync(videoPath).size > 0, "VIDEO_MISSING");
  const network = recorder.snapshot();
  assert(network.nonLocalRequestCount === 0, "NON_LOCAL_BROWSER_REQUESTS");
  assert(network.failedRequests.length === 0, "BROWSER_REQUEST_FAILURES");
  assert(network.consoleErrors.length === 0, "BROWSER_CONSOLE_ERRORS");

  return {
    screenshot: "media/catalog-capability.png",
    video: "media/adapter-readiness.webm",
    nonLocalBrowserRequests: 0,
    consoleErrors: [],
  };
}

const main = async () => {
  const result = await captureAdapterReadiness(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result)}\n`);
};

main().catch(() => {
  process.stderr.write("Adapter readiness capture failed safely.\n");
  process.exitCode = 1;
});
