import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { humanResearchConfigErrors } from "../src/experiment-core.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { stage, manifestArgument, outputArgument } = parseArguments(process.argv.slice(2));
const allowedStages = new Set(["demo", "cognitive-pilot", "study-a", "study-b", "expert"]);
if (!allowedStages.has(stage)) throw new Error(`Unknown freeze stage: ${stage}`);
if (!outputArgument) throw new Error("Usage: node freeze-package.mjs --stage <demo|cognitive-pilot|study-a|study-b|expert> --out <package-freeze.json> [--manifest <manifest.json>]");
if (["study-b", "expert"].includes(stage) && !manifestArgument) throw new Error(`${stage} freeze requires --manifest`);

const manifestPath = manifestArgument ? path.resolve(projectRoot, manifestArgument) : null;
const outputPath = path.resolve(projectRoot, outputArgument);
const configPath = path.join(projectRoot, "config", "study-config.json");
const config = JSON.parse(await fs.readFile(configPath, "utf8"));
if (config.data_mode === "human_research") {
  const errors = humanResearchConfigErrors(config);
  if (errors.length) throw new Error(`Human-research config is incomplete:\n${errors.join("\n")}`);
  const expectedPhase = stage === "cognitive-pilot" ? "cognitive_pilot" : "main";
  if (stage !== "demo" && config.collection_phase !== expectedPhase) {
    throw new Error(`${stage} freeze requires collection_phase ${expectedPhase}`);
  }
}

const fixedFiles = [
  ".gitignore",
  "README.md",
  "STATUS.md",
  "PROTOCOL.md",
  "PREREGISTRATION.md",
  "CODEBOOK.md",
  "ETHICS_HANDOFF.md",
  "PILOT_CHECKLIST.md",
  "FACILITATOR_GUIDE.md",
  "STIMULUS_AUDIT.md",
  "RUNBOOK.md",
  "data/.gitignore",
  "data/README.md",
  "package.json",
  "START_EXPERIMENT.cmd",
  "config/study-config.json"
];
const governanceArchiveFiles = [
  "data/frozen/governance/approval-record.json",
  "data/frozen/governance/participant-information-sheet.md",
  "data/frozen/governance/consent-form.md",
  "data/frozen/governance/debrief.md",
  "data/frozen/governance/recruitment-notice.md",
  "data/frozen/governance/data-management-plan.md"
];
const mainPlanningFiles = [
  "data/frozen/pilot-summary.json",
  "data/frozen/sample-plan.json",
  "data/frozen/study-b-power-input.json",
  "data/frozen/study-b-power-report.json",
  "data/frozen/study-b-model-config.json"
];
const stageArchiveFiles = {
  demo: [],
  "cognitive-pilot": [...governanceArchiveFiles, "data/frozen/pilot-study-b-manifest.json", "data/frozen/pilot-study-a-ids.csv", "data/frozen/pilot-study-b-ids.csv", "data/frozen/pilot-expert-ids.csv"],
  "study-a": [...governanceArchiveFiles, ...mainPlanningFiles, "data/frozen/study-a-ids.csv"],
  "study-b": [...governanceArchiveFiles, ...mainPlanningFiles, "data/frozen/study-b-manifest.json", "data/frozen/study-b-ids.csv"],
  expert: [...governanceArchiveFiles, ...mainPlanningFiles, "data/frozen/study-b-manifest.json", "data/frozen/expert-ids.csv"]
};
const discovered = [];
for (const directory of ["src", "web", "scripts", "analysis", "tests", "evidence", "materials", "templates"]) {
  const root = path.join(projectRoot, directory);
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (entry.isFile() && !entry.name.endsWith(".pyc")) discovered.push(path.relative(projectRoot, path.join(root, entry.name)).replaceAll("\\", "/"));
  }
}
const manifestRelative = manifestPath ? path.relative(projectRoot, manifestPath).replaceAll("\\", "/") : null;
const files = [...new Set([...fixedFiles, ...discovered, ...stageArchiveFiles[stage], ...(manifestRelative ? [manifestRelative] : [])])].sort();
const fileRecords = [];
for (const relativePath of files) {
  const absolutePath = path.resolve(projectRoot, relativePath);
  if (!absolutePath.startsWith(`${projectRoot}${path.sep}`)) throw new Error(`Refusing path outside project: ${relativePath}`);
  const bytes = await fs.readFile(absolutePath);
  fileRecords.push({ path: relativePath, bytes: bytes.length, sha256: digest(bytes) });
}
const freeze = {
  schemaVersion: "kfc-package-freeze/0.2",
  generatedAt: new Date().toISOString(),
  stage,
  packageVersion: config.package_version,
  dataMode: config.data_mode,
  collectionPhase: config.collection_phase,
  ethicsStatus: config.ethics_status,
  manifestPath: manifestRelative,
  files: fileRecords
};
freeze.bundleSha256 = digest(Buffer.from(JSON.stringify(freeze)));
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(freeze, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ok: true, files: fileRecords.length, bundleSha256: freeze.bundleSha256, output: outputPath }, null, 2));

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseArguments(args) {
  if (args.length >= 2 && !args[0].startsWith("--")) {
    return { stage: "demo", manifestArgument: args[0], outputArgument: args[1] };
  }
  const parsed = { stage: "demo", manifestArgument: null, outputArgument: null };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (!["--stage", "--manifest", "--out"].includes(flag) || !value) throw new Error(`Invalid freeze argument: ${flag || "<missing>"}`);
    if (flag === "--stage") parsed.stage = value;
    if (flag === "--manifest") parsed.manifestArgument = value;
    if (flag === "--out") parsed.outputArgument = value;
    index += 1;
  }
  return parsed;
}
