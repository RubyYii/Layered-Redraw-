import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { canonicalJson } from "@layered-redraw/pact-cp03-contracts";

import { createSyntheticSpatialImage } from "../../pact-agent-host/lib/synthetic-spatial-image.js";
import {
  assert,
  createNetworkRecorder,
  launchCp02Browser,
  viewport,
} from "./smoke-test-cp02.mjs";

const roleOrder = Object.freeze([
  "ConductorContinuity",
  "Witness",
  "Archivist",
  "Rewriter",
  "Guardian",
]);

const criteria = Object.freeze([
  "visible-evidence fidelity",
  "spatial coherence",
  "useful uncertainty",
  "poetic/conceptual disturbance",
  "seam/dissent preservation",
  "provenance/rights discipline",
  "PACT visual-direction suitability",
]);

const parseArgs = (args) => {
  const parsed = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || !value || parsed.has(key)) {
      throw new Error("MODEL_BAKEOFF_CAPTURE_ARGUMENTS_INVALID");
    }
    parsed.set(key, value);
  }
  const allowed = ["--mode", "--packet", "--output-dir"];
  assert([...parsed.keys()].every((key) => allowed.includes(key)), "MODEL_BAKEOFF_CAPTURE_ARGUMENTS_INVALID");
  const mode = parsed.get("--mode") ?? "packet";
  const outputDir = parsed.get("--output-dir");
  assert(outputDir, "MODEL_BAKEOFF_CAPTURE_OUTPUT_REQUIRED");
  if (mode === "packet") assert(parsed.get("--packet"), "MODEL_BAKEOFF_CAPTURE_PACKET_REQUIRED");
  if (mode === "local-scripted") assert(!parsed.has("--packet"), "MODEL_BAKEOFF_CAPTURE_PACKET_FORBIDDEN");
  assert(["packet", "local-scripted"].includes(mode), "MODEL_BAKEOFF_CAPTURE_MODE_INVALID");
  return { mode, packetPath: parsed.get("--packet"), outputDir };
};

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const canonicalSha256 = (value) => sha256(canonicalJson(value));

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const localScriptedPacket = () => {
  const candidateCounts = new Map([
    ["ConductorContinuity", 2],
    ["Witness", 3],
    ["Archivist", 2],
    ["Rewriter", 3],
    ["Guardian", 2],
  ]);
  const roleSentence = new Map([
    ["ConductorContinuity", "Hold the two unresolved seams; commit only evidence already present."],
    ["Witness", "The room remains visible as relations, not as a recovered memory."],
    ["Archivist", "Every object stays bound to the synthetic registry and its stated limits."],
    ["Rewriter", "Let the overlap behave like an unfinished cut in an old experimental film."],
    ["Guardian", "Keep dissent visible and withhold authority beyond the registered scene."],
  ]);
  const roles = roleOrder.map((roleDecision, roleIndex) => ({
    roleDecision,
    candidates: Array.from({ length: candidateCounts.get(roleDecision) }, (_, candidateIndex) => ({
      blindLabel: `CAND_${sha256(`${roleIndex}:${candidateIndex}:local-scripted`).slice(0, 12).toUpperCase()}`,
      outputs: [1, 2].map((repetition) => {
        const text = `${roleSentence.get(roleDecision)} Repetition ${repetition}; anonymous local scripted fixture.`;
        return { repetition, text, outputSha256: sha256(text) };
      }),
    })),
    decision: { selectedBlindLabel: null, authorNotes: "" },
  }));
  const unsigned = {
    schemaVersion: "cp03-model-bakeoff-blind-review/0.1",
    runId: "cp03-model-bakeoff-local-scripted-ui",
    createdAt: new Date().toISOString(),
    criteria,
    claimCeiling: "local scripted capture surface; zero provider calls; no model-quality result; no author selection",
    roles,
  };
  return { ...unsigned, packetSha256: canonicalSha256(unsigned) };
};

const verifyPacket = (packet) => {
  assert(packet?.schemaVersion === "cp03-model-bakeoff-blind-review/0.1", "BLIND_PACKET_SCHEMA_INVALID");
  assert(/^[a-f0-9]{64}$/.test(packet.packetSha256), "BLIND_PACKET_HASH_INVALID");
  const { packetSha256, ...unsigned } = packet;
  assert(canonicalSha256(unsigned) === packetSha256, "BLIND_PACKET_HASH_MISMATCH");
  assert(JSON.stringify(packet.criteria) === JSON.stringify(criteria), "BLIND_PACKET_CRITERIA_INVALID");
  assert(Array.isArray(packet.roles) && packet.roles.length === roleOrder.length, "BLIND_PACKET_ROLES_INVALID");
  assert(JSON.stringify(packet.roles.map(({ roleDecision }) => roleDecision)) === JSON.stringify(roleOrder), "BLIND_PACKET_ROLE_ORDER_INVALID");
  for (const role of packet.roles) {
    assert(Array.isArray(role.candidates), "BLIND_PACKET_CANDIDATES_INVALID");
    assert(role.decision?.selectedBlindLabel === null, "BLIND_PACKET_SELECTION_PRESENT");
    assert(role.decision?.authorNotes === "", "BLIND_PACKET_AUTHOR_NOTES_PRESENT");
    for (const candidate of role.candidates) {
      assert(/^CAND_[A-F0-9]{12}$/.test(candidate.blindLabel), "BLIND_PACKET_LABEL_INVALID");
      assert(Array.isArray(candidate.outputs) && candidate.outputs.length === 2, "BLIND_PACKET_REPETITIONS_INVALID");
      for (const output of candidate.outputs) {
        assert([1, 2].includes(output.repetition), "BLIND_PACKET_REPETITION_INVALID");
        assert(sha256(output.text) === output.outputSha256, "BLIND_PACKET_OUTPUT_HASH_INVALID");
      }
    }
  }
  const visible = JSON.stringify(packet).toLowerCase();
  for (const forbidden of [
    "deepseek",
    "gemini",
    "deepseek-official",
    '"route"',
    '"provider"',
    '"model"',
    '"pricing"',
    '"latency"',
    '"inputtokens"',
    '"outputtokens"',
    '"attemptid"',
    '"seedhex"',
  ]) assert(!visible.includes(forbidden), `BLIND_PACKET_IDENTITY_OR_TECHNICAL_LEAK:${forbidden}`);
  return packet;
};

const roleTitle = (role) => ({
  ConductorContinuity: "CONDUCTOR / CONTINUITY",
  Witness: "WITNESS",
  Archivist: "ARCHIVIST",
  Rewriter: "REWRITER",
  Guardian: "GUARDIAN",
})[role];

const technicallyEligiblePairCount = (packet) => packet.roles.reduce(
  (total, role) => total + role.candidates.length,
  0,
);

const captureClaimCeiling = (packet) => technicallyEligiblePairCount(packet) === 0
  ? "no technically eligible role/model pairs; author selection unavailable; partial run preserved as failure evidence"
  : packet.claimCeiling;

const reportHtml = (packet, imageDataUrl, mode) => {
  const eligiblePairCount = technicallyEligiblePairCount(packet);
  const criteriaHtml = packet.criteria.map((entry) => `<li>${escapeHtml(entry)}</li>`).join("");
  const rolesHtml = packet.roles.map((role, roleIndex) => {
    const candidatesHtml = role.candidates.map((candidate) => `
      <article class="candidate">
        <div class="candidate-head"><span>${escapeHtml(candidate.blindLabel)}</span><em>2 / 2</em></div>
        <p>${escapeHtml(candidate.outputs[0].text)}</p>
        <p>${escapeHtml(candidate.outputs[1].text)}</p>
      </article>`).join("");
    return `<section class="role-card" data-role="${roleIndex}">
      <header><span>0${roleIndex + 1}</span><h2>${escapeHtml(roleTitle(role.roleDecision))}</h2></header>
      <div class="candidate-grid">${candidatesHtml}</div>
      <footer><span class="empty-radio"></span><strong>AUTHOR DECISION — EMPTY</strong></footer>
    </section>`;
  }).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root { color-scheme: dark; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    * { box-sizing: border-box; }
    body { margin: 0; width: 100vw; height: 100vh; overflow: hidden; color: #e8dfcf; background: #090a09; }
    body::before { content: ""; position: fixed; inset: 0; z-index: 8; pointer-events: none; opacity: .18; mix-blend-mode: screen; background: repeating-linear-gradient(0deg, transparent 0 3px, rgba(255,244,218,.08) 4px); }
    body::after { content: ""; position: fixed; inset: -20%; z-index: 9; pointer-events: none; opacity: .13; background: radial-gradient(ellipse, transparent 26%, #000 70%), url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='90'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='.72' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.46'/%3E%3C/svg%3E"); animation: grain .7s steps(2) infinite; }
    @keyframes grain { 0% { transform: translate(-2%, 1%); } 50% { transform: translate(2%, -1%); } 100% { transform: translate(-1%, 2%); } }
    main { height: 100%; padding: 26px 34px 22px; background: radial-gradient(circle at 17% 26%, rgba(189,126,52,.13), transparent 32%), linear-gradient(115deg, #11130f, #070807 62%); }
    .mast { display: grid; grid-template-columns: 240px 1fr auto; gap: 25px; align-items: end; padding-bottom: 15px; border-bottom: 1px solid #4f4638; }
    .eyebrow { color: #d49a4a; font-size: 11px; letter-spacing: .22em; }
    h1 { margin: 5px 0 0; font: italic 27px/1.08 Georgia, serif; font-weight: 400; }
    .state { color: #d8ab66; border: 1px solid #7d6036; padding: 8px 10px; font-size: 10px; letter-spacing: .12em; }
    .claim { color: #999487; font-size: 10px; line-height: 1.5; text-align: right; max-width: 285px; }
    .layout { display: grid; grid-template-columns: 255px 1fr; gap: 20px; height: 590px; padding-top: 18px; }
    aside { border-right: 1px solid #3a3931; padding-right: 20px; }
    .image-wrap { position: relative; height: 170px; overflow: hidden; border: 1px solid #6b5740; background: #111; }
    .image-wrap img { width: 100%; height: 100%; object-fit: cover; filter: sepia(.72) saturate(.7) contrast(1.12) blur(.35px); opacity: .82; }
    .image-wrap::after { content: "SYNTHETIC / 384×256"; position: absolute; left: 8px; bottom: 7px; padding: 3px 5px; color: #e2c79e; background: rgba(0,0,0,.68); font-size: 9px; letter-spacing: .1em; }
    h3 { margin: 18px 0 8px; color: #d49a4a; font-size: 10px; letter-spacing: .16em; }
    ul { margin: 0; padding: 0; list-style: none; }
    li { padding: 5px 0; border-bottom: 1px solid #292a24; color: #aaa69a; font-size: 9px; line-height: 1.2; }
    .zero { margin-top: 16px; color: #74a784; font-size: 9px; line-height: 1.5; letter-spacing: .08em; }
    .roles { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: repeat(3, 1fr); gap: 10px; min-width: 0; }
    .role-card { position: relative; min-height: 0; overflow: hidden; border: 1px solid #32342d; padding: 10px 12px 9px; background: rgba(14,16,13,.76); transition: border-color .35s, background .35s, transform .35s, filter .35s; }
    .role-card:last-child { grid-column: 1 / -1; }
    .role-card.active { z-index: 4; border-color: #bf8841; background: rgba(49,39,24,.88); transform: scale(1.018); filter: none; }
    .role-card.dim { filter: blur(.55px); opacity: .62; }
    .role-card > header { display: flex; gap: 9px; align-items: baseline; margin-bottom: 8px; }
    .role-card > header span { color: #8c6535; font-size: 9px; }
    h2 { margin: 0; color: #ded3c0; font-size: 11px; letter-spacing: .12em; }
    .candidate-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 7px; }
    .candidate { min-width: 0; border-left: 1px solid #554937; padding-left: 7px; }
    .candidate-head { display: flex; justify-content: space-between; gap: 5px; color: #d2a765; font-size: 8px; letter-spacing: .05em; }
    .candidate-head em { color: #6aa67d; font-style: normal; }
    .candidate p { margin: 5px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #85867f; font: 8px/1.25 Georgia, serif; }
    .role-card > footer { position: absolute; left: 12px; bottom: 8px; display: flex; gap: 6px; align-items: center; color: #77786f; font-size: 8px; letter-spacing: .08em; }
    .empty-radio { width: 9px; height: 9px; border: 1px solid #706d63; border-radius: 50%; }
    .capture-meta { position: fixed; right: 34px; bottom: 7px; color: #686b61; font-size: 8px; letter-spacing: .1em; }
  </style>
</head>
<body>
  <main>
    <header class="mast">
      <div><div class="eyebrow">PACT / CP03 / STAGE B</div><h1>Blind evidence room</h1></div>
      <div class="claim">${escapeHtml(captureClaimCeiling(packet))}</div>
      <div class="state">${mode === "local-scripted" ? "LOCAL SCRIPTED CAPTURE" : eligiblePairCount === 0 ? "NO ELIGIBLE CANDIDATES" : "ANONYMOUS REVIEW PACKET"}</div>
    </header>
    <div class="layout">
      <aside>
        <div class="image-wrap"><img src="${imageDataUrl}" alt="Synthetic spatial fixture"></div>
        <h3>AUTHOR CRITERIA / 07</h3><ul>${criteriaHtml}</ul>
        <div class="zero">CAPTURE REQUESTS 00<br>ELIGIBLE PAIRS ${String(eligiblePairCount).padStart(2, "0")}<br>SELECTIONS 00<br>SEALED MAPPING NOT LOADED</div>
      </aside>
      <div class="roles">${rolesHtml}</div>
    </div>
    <div class="capture-meta">PACKET ${escapeHtml(packet.packetSha256.slice(0, 16))}… / CONTINUOUS LOCAL CAPTURE</div>
  </main>
</body>
</html>`;
};

export async function captureModelBakeoff({ mode, packetPath, outputDir }) {
  const packet = verifyPacket(mode === "local-scripted"
    ? localScriptedPacket()
    : JSON.parse(fs.readFileSync(packetPath, "utf8")));
  fs.mkdirSync(outputDir, { recursive: true });
  const mediaDir = path.join(outputDir, "media");
  fs.mkdirSync(mediaDir, { recursive: true });
  const packetOutputPath = path.join(outputDir, "blind-review-packet.json");
  const screenshotPath = path.join(mediaDir, "blind-review-contact-sheet.png");
  const videoPath = path.join(mediaDir, "blind-review-continuous.webm");
  const imagePath = path.join(mediaDir, "synthetic-spatial-image-01.png");
  const reportPath = path.join(outputDir, "capture-report.json");
  for (const target of [packetOutputPath, screenshotPath, videoPath, imagePath, reportPath]) {
    assert(!fs.existsSync(target), "MODEL_BAKEOFF_CAPTURE_TARGET_EXISTS");
  }

  const image = Buffer.from(createSyntheticSpatialImage());
  const imageSha256 = sha256(image);
  fs.writeFileSync(packetOutputPath, `${canonicalJson(packet)}\n`, { flag: "wx", mode: 0o600 });
  fs.writeFileSync(imagePath, image, { flag: "wx", mode: 0o600 });
  const imageDataUrl = `data:image/png;base64,${image.toString("base64")}`;
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "pact-cp03-model-bakeoff-capture-"));
  const recorder = createNetworkRecorder();
  let browser;
  let context;
  const startedAt = new Date().toISOString();
  try {
    ({ browser } = await launchCp02Browser({ headless: false }));
    context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      recordVideo: { dir: stagingDir, size: viewport },
    });
    const page = await context.newPage();
    recorder.attach(page, "cp03-model-bakeoff-blind-review");
    const video = page.video();
    await page.setContent(reportHtml(packet, imageDataUrl, mode), { waitUntil: "load" });
    assert(await page.locator(".role-card").count() === 5, "MODEL_BAKEOFF_CAPTURE_ROLE_COUNT_INVALID");
    assert(await page.locator(".empty-radio").count() === 5, "MODEL_BAKEOFF_CAPTURE_DECISION_COUNT_INVALID");
    await page.screenshot({ path: screenshotPath, type: "png" });
    await page.waitForTimeout(2_000);
    for (let index = 0; index < roleOrder.length; index += 1) {
      await page.locator(".role-card").evaluateAll((elements, activeIndex) => {
        elements.forEach((element, elementIndex) => {
          element.classList.toggle("active", elementIndex === activeIndex);
          element.classList.toggle("dim", elementIndex !== activeIndex);
        });
      }, index);
      await page.waitForTimeout(4_000);
    }
    await page.locator(".role-card").evaluateAll((elements) => {
      elements.forEach((element) => element.classList.remove("active", "dim"));
    });
    await page.waitForTimeout(3_000);
    await context.close();
    context = undefined;
    await video.saveAs(videoPath);
  } finally {
    await context?.close();
    await browser?.close();
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }

  assert(fs.statSync(screenshotPath).size > 0, "MODEL_BAKEOFF_SCREENSHOT_MISSING");
  assert(fs.statSync(videoPath).size > 0, "MODEL_BAKEOFF_VIDEO_MISSING");
  const network = recorder.snapshot();
  assert(network.nonLocalRequestCount === 0, "MODEL_BAKEOFF_CAPTURE_NON_LOCAL_REQUEST");
  assert(network.failedRequests.length === 0, "MODEL_BAKEOFF_CAPTURE_REQUEST_FAILURE");
  assert(network.consoleErrors.length === 0, "MODEL_BAKEOFF_CAPTURE_CONSOLE_ERROR");
  const report = {
    schemaVersion: "cp03-model-bakeoff-capture/0.1",
    status: "PASS",
    mode,
    startedAt,
    endedAt: new Date().toISOString(),
    packetSha256: packet.packetSha256,
    syntheticImageSha256: imageSha256,
    providerRequestsMade: 0,
    technicallyEligiblePairs: technicallyEligiblePairCount(packet),
    nonLocalBrowserRequests: 0,
    authorSelections: 0,
    sealedMappingLoaded: false,
    screenshot: "media/blind-review-contact-sheet.png",
    video: "media/blind-review-continuous.webm",
    syntheticImage: "media/synthetic-spatial-image-01.png",
    claimCeiling: mode === "local-scripted"
      ? "local scripted capture surface; no model-quality result"
      : captureClaimCeiling(packet),
  };
  fs.writeFileSync(reportPath, `${canonicalJson({
    ...report,
    reportSha256: canonicalSha256(report),
  })}\n`, { flag: "wx", mode: 0o600 });
  return report;
}

const main = async () => {
  const result = await captureModelBakeoff(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result)}\n`);
};

main().catch((error) => {
  const code = error instanceof Error ? error.message.split(":")[0] : "UNKNOWN";
  process.stderr.write(`Model bakeoff capture failed safely: ${code}.\n`);
  process.exitCode = 1;
});
