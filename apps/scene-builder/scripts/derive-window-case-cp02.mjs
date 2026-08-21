import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const cp02Root = path.join(projectRoot, "projects", "window-case-cp02");
const sourceLockPath = path.join(cp02Root, "source-lock.json");
const outputPath = path.join(cp02Root, "cp02-mutable-room.blockout.json");

const RECOGNIZED_STATES = new Set([
  "SOURCE_LOCKED",
  "EVIDENCE_LOCKED",
  "STAGE_LOCKED",
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function resolveLockedPath(relativePath) {
  const resolved = path.resolve(cp02Root, relativePath);
  const projectsRoot = path.resolve(projectRoot, "projects");
  if (!resolved.startsWith(`${projectsRoot}${path.sep}`)) {
    throw new Error(`Locked input escapes projects directory: ${relativePath}`);
  }
  return resolved;
}

function assertPinnedFile(record, label) {
  const filePath = resolveLockedPath(record.path);
  const actual = sha256File(filePath);
  if (actual !== record.sha256) {
    throw new Error(`${label} SHA-256 mismatch: expected ${record.sha256}, received ${actual}`);
  }
  return filePath;
}

export function verifyPinnedInputs(sourceLock) {
  if (sourceLock?.runtimeCommit !== "24b4c3b4c6c287378eb20d8b586e5064b59df256") {
    throw new Error("Unexpected collaborator runtime commit");
  }

  const baseProjectPath = assertPinnedFile(sourceLock.baseProject, "base project");
  assertPinnedFile(sourceLock.shotManifest, "shot manifest");
  assertPinnedFile(sourceLock.b2Source, "B2 source");

  const baseProject = readJson(baseProjectPath);
  if (baseProject.objects?.length !== sourceLock.baseProject.objectCount) {
    throw new Error("Base project object count does not match source lock");
  }
  if (baseProject.director?.timeline?.duration !== sourceLock.baseProject.durationSeconds) {
    throw new Error("Base project duration does not match source lock");
  }
  return baseProject;
}

export function deriveCp02Project(baseProject, sourceLock) {
  const result = structuredClone(baseProject);
  const evidenceIds = new Set(sourceLock.evidenceObjectIds);

  result.objects = result.objects.map((object) => ({
    ...object,
    governance: {
      state: object.id === sourceLock.b2Source.objectId
        ? "SOURCE_LOCKED"
        : evidenceIds.has(object.id) ? "EVIDENCE_LOCKED" : "STAGE_LOCKED",
      sourceId: object.id === sourceLock.b2Source.objectId
        ? "B2-SOURCE-001"
        : sourceLock.runtimeCommit,
    },
  }));
  result.name = "不存在的窗 · CP02 Mutable Room";
  result.director = {
    ...result.director,
    screenplay: "",
    issues: [],
    timeline: { duration: 60, clips: [], compiledScript: "" },
  };
  result.cp02 = {
    sourceRuntimeCommit: sourceLock.runtimeCommit,
    sourceProjectSha256: sourceLock.baseProject.sha256,
    sourcePhotoSha256: sourceLock.b2Source.sha256,
    evidenceObjectIds: [...sourceLock.evidenceObjectIds],
  };
  return result;
}

function verifyDerivedOutput(project, sourceLock) {
  if (project.objects?.length !== sourceLock.baseProject.objectCount) {
    throw new Error("Derived project object count is invalid");
  }
  if (project.director?.timeline?.duration !== 60 || project.director.timeline.clips?.length !== 0) {
    throw new Error("Derived project timeline is invalid");
  }
  if (project.cp02?.sourceRuntimeCommit !== sourceLock.runtimeCommit) {
    throw new Error("Derived project source commit is invalid");
  }
  if (!project.objects.every((object) => RECOGNIZED_STATES.has(object.governance?.state))) {
    throw new Error("Derived project contains an unclassified object");
  }
}

function writeJsonAtomically(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath);
  }
}

export function buildCp02Project() {
  const sourceLock = readJson(sourceLockPath);
  const baseProject = verifyPinnedInputs(sourceLock);
  const derived = deriveCp02Project(baseProject, sourceLock);
  verifyDerivedOutput(derived, sourceLock);
  writeJsonAtomically(outputPath, derived);

  const written = readJson(outputPath);
  verifyDerivedOutput(written, sourceLock);
  return {
    outputPath,
    objects: written.objects.length,
    duration: written.director.timeline.duration,
  };
}

const isDirectInvocation = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectInvocation) {
  process.stdout.write(`${JSON.stringify({ ok: true, ...buildCp02Project() }, null, 2)}\n`);
}
