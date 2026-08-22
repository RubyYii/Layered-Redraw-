import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateTimeline } from "../src/director.js";

export const SIMULATION_DELIVERY_SCHEMA = "simulation-delivery-v1";
export const SIMULATION_TRACE_SCHEMA = "simulation-trace-v1";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const replayAssetRoot = path.join(appRoot, "replay");
const defaultThreeModulePath = path.join(appRoot, "node_modules", "three", "build", "three.module.min.js");
const defaultThreeLicensePath = path.join(appRoot, "node_modules", "three", "LICENSE");

const round = (value, precision = 6) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const factor = 10 ** precision;
  const result = Math.round(numeric * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
};

const portablePath = (value) => value.replaceAll(path.sep, "/");

const canonicalValue = (value) => {
  if (Array.isArray(value)) return value.map((entry) => canonicalValue(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalValue(entry)]));
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return value;
};

export const canonicalJson = (value, { pretty = true } = {}) => (
  `${JSON.stringify(canonicalValue(value), null, pretty ? 2 : 0)}${pretty ? "\n" : ""}`
);

const sha256Bytes = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

const hashFile = (filePath) => {
  const handle = fs.openSync(filePath, "r");
  const digest = crypto.createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let bytes = 0;
  try {
    while (true) {
      const count = fs.readSync(handle, buffer, 0, buffer.length, null);
      if (!count) break;
      digest.update(buffer.subarray(0, count));
      bytes += count;
    }
  } finally {
    fs.closeSync(handle);
  }
  return { sha256: digest.digest("hex"), bytes };
};

const writeJson = (filePath, value) => fs.writeFileSync(filePath, canonicalJson(value), "utf8");

const assertRelativeArtifactPath = (value) => {
  const candidate = String(value ?? "").replaceAll("\\", "/");
  if (!candidate || candidate.startsWith("/") || candidate.includes(":") || candidate.split("/").includes("..")) {
    throw new Error(`交付包文件路径无效：${value}`);
  }
  return candidate;
};

const assertWithin = (candidate, parent, label) => {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedParent = path.resolve(parent);
  if (resolvedCandidate !== resolvedParent && !resolvedCandidate.startsWith(`${resolvedParent}${path.sep}`)) {
    throw new Error(`${label} 越出预期目录：${resolvedCandidate}`);
  }
  return resolvedCandidate;
};

const mediaTypeFor = (relativePath) => {
  const extension = path.extname(relativePath).toLowerCase();
  return ({
    ".html": "text/html",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".json": "application/json",
    ".jsonl": "application/x-ndjson",
    ".txt": "text/plain",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webm": "video/webm",
    ".mp4": "video/mp4",
  })[extension] ?? "application/octet-stream";
};

const roleFor = (relativePath) => {
  if (relativePath === "scene.blockout.json") return "scene-snapshot";
  if (relativePath === "assets.lock.json") return "asset-lock";
  if (relativePath === "simulation.trace.jsonl") return "simulation-trace";
  if (relativePath === "interactions.json") return "interaction-events";
  if (relativePath === "collision-report.json") return "collision-audit";
  if (relativePath === "render-report.json") return "render-report";
  if (relativePath === "replay.html") return "interactive-replay";
  if (relativePath.startsWith("audit/")) return "audit-evidence";
  if (relativePath.startsWith("vendor/")) return "vendored-runtime";
  if (/^final-video\./.test(relativePath)) return "video";
  return "support";
};

const copyArtifact = (sourcePath, destinationPath) => {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  try {
    fs.copyFileSync(sourcePath, destinationPath, fs.constants.COPYFILE_FICLONE);
  } catch {
    fs.copyFileSync(sourcePath, destinationPath);
  }
  return "independent-copy";
};

const decodeDataUrl = (value) => {
  if (typeof value !== "string") return null;
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(value);
  if (!match) return null;
  const mediaType = match[1] || "text/plain";
  const bytes = match[2]
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]), "utf8");
  return { mediaType, bytes };
};

const buildAssetLock = (project, projectSha256) => {
  const records = [];
  for (const object of project.objects ?? []) {
    const inlineTexture = decodeDataUrl(object.render?.textureDataUrl);
    if (!object.asset && !inlineTexture) continue;
    records.push({
      objectId: object.id,
      objectName: object.name,
      asset: object.asset ? canonicalValue(object.asset) : null,
      inlineTexture: inlineTexture ? {
        mediaType: inlineTexture.mediaType,
        bytes: inlineTexture.bytes.byteLength,
        sha256: sha256Bytes(inlineTexture.bytes),
      } : null,
      resolution: Array.isArray(object.render?.textureResolution)
        ? [...object.render.textureResolution]
        : null,
    });
  }
  return {
    schemaVersion: 1,
    policy: "declarations-and-inline-bytes-v1",
    projectSha256,
    declaredEvidence: project.cp02 ? canonicalValue(project.cp02) : null,
    records,
    unresolvedRuntimeFiles: records
      .filter((record) => record.asset?.url)
      .map((record) => ({ objectId: record.objectId, url: record.asset.url })),
  };
};

const traceObjectState = (state) => ({
  position: state.position?.map((value) => round(value)) ?? [0, 0, 0],
  rotation: state.rotation?.map((value) => round(value)) ?? [0, 0, 0],
  scale: state.scale?.map((value) => round(value)) ?? [1, 1, 1],
  visible: state.visible !== false,
  color: state.color ?? null,
  semanticState: state.semanticState ?? null,
  animationState: state.animationState ?? "idle",
});

const traceCamera = (camera) => camera ? {
  clipId: camera.id,
  preset: camera.preset,
  progress: round(camera.progress),
  framing: round(camera.framing ?? camera.toFraming ?? 1),
} : null;

const traceInteraction = (interaction) => ({
  id: interaction.id,
  actorId: interaction.actorId,
  targetId: interaction.targetId,
  action: interaction.action,
  ownershipMode: interaction.ownershipMode,
  recipientId: interaction.recipientId ?? null,
  placementTargetId: interaction.placementTargetId ?? null,
  phase: interaction.phase ? {
    name: interaction.phase.name,
    progress: round(interaction.phase.progress),
    contactWeight: round(interaction.phase.contactWeight),
  } : null,
});

const traceCollision = (collision) => ({
  backend: collision?.backend ?? null,
  safe: collision?.safe !== false,
  resolvedCount: Number(collision?.resolvedCount ?? 0),
  maxPenetration: round(collision?.maxPenetration ?? 0),
  residualPenetration: round(collision?.residualPenetration ?? 0),
  contacts: (collision?.contacts ?? []).map((contact) => ({
    kind: contact.kind,
    leftId: contact.leftId,
    rightId: contact.rightId,
    penetration: round(contact.penetration ?? 0),
  })),
});

const traceSimulation = (simulation) => ({
  backend: simulation?.backend ?? null,
  hz: Number(simulation?.hz ?? 60),
  ownership: canonicalValue(simulation?.ownership ?? {}),
  contacts: (simulation?.contacts ?? []).map((contact) => canonicalValue(contact)),
  violations: (simulation?.violations ?? []).map((violation) => canonicalValue(violation)),
  collision: traceCollision(simulation?.collision),
});

const eventDefinitionsFor = (project, start, end) => (project.director?.timeline?.clips ?? [])
  .filter((clip) => clip.type === "interaction" && clip.start <= end && clip.start + clip.duration >= start)
  .map((clip) => ({
    clipId: clip.id,
    label: clip.label,
    start: round(clip.start),
    end: round(clip.start + clip.duration),
    actorId: clip.secondaryTargetId,
    targetId: clip.targetId,
    action: clip.action,
    ownershipMode: clip.ownershipMode,
    recipientId: clip.recipientId ?? null,
    placementTargetId: clip.placementTargetId ?? null,
    resultingState: clip.resultingState ?? null,
  }));

const updateCollisionAudit = (audit, frame, sampleKind) => {
  const collision = frame.simulation?.collision ?? {};
  audit.sampleCount += 1;
  audit.maxInitialPenetration = Math.max(audit.maxInitialPenetration, Number(collision.maxPenetration ?? 0));
  audit.maxResidualPenetration = Math.max(audit.maxResidualPenetration, Number(collision.residualPenetration ?? 0));
  audit.totalResolvedContacts += Number(collision.resolvedCount ?? 0);
  if (Number(collision.resolvedCount ?? 0) > 0) audit.correctedSampleCount += 1;
  if (collision.safe === false || Number(collision.residualPenetration ?? 0) > 1e-7) {
    audit.unsafeSamples.push({
      frame: sampleKind === "terminal" ? "terminal" : sampleKind,
      time: round(frame.time),
      residualPenetration: round(collision.residualPenetration ?? 0),
    });
  }
  for (const contact of collision.contacts ?? []) {
    const key = `${contact.kind}:${contact.leftId}:${contact.rightId}`;
    const current = audit.contactPairs.get(key) ?? {
      kind: contact.kind,
      leftId: contact.leftId,
      rightId: contact.rightId,
      observedSamples: 0,
      maxPenetration: 0,
    };
    current.observedSamples += 1;
    current.maxPenetration = Math.max(current.maxPenetration, Number(contact.penetration ?? 0));
    audit.contactPairs.set(key, current);
  }
  for (const violation of frame.simulation?.violations ?? []) {
    const key = `${violation.clipId}:${violation.itemId}:${violation.message}`;
    const current = audit.violationMap.get(key) ?? {
      ...canonicalValue(violation),
      firstTime: round(frame.time),
      lastTime: round(frame.time),
      observedSamples: 0,
    };
    current.lastTime = round(frame.time);
    current.observedSamples += 1;
    audit.violationMap.set(key, current);
  }
};

const listFiles = (root, directory = root) => {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(root, absolutePath));
    else if (entry.isFile()) files.push(portablePath(path.relative(root, absolutePath)));
  }
  return files.sort();
};

const moveTreeFiles = (sourceRoot, destinationRoot, { manifestLast = false } = {}) => {
  fs.mkdirSync(destinationRoot, { recursive: true });
  const files = listFiles(sourceRoot).sort((left, right) => {
    if (!manifestLast) return left.localeCompare(right);
    if (left === "delivery.manifest.json") return 1;
    if (right === "delivery.manifest.json") return -1;
    return left.localeCompare(right);
  });
  for (const relativePath of files) {
    const sourcePath = path.join(sourceRoot, ...relativePath.split("/"));
    const destinationPath = path.join(destinationRoot, ...relativePath.split("/"));
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    try {
      fs.renameSync(sourcePath, destinationPath);
    } catch {
      fs.copyFileSync(sourcePath, destinationPath);
      fs.unlinkSync(sourcePath);
    }
  }
};

const publishDirectory = (stage, outputDir, outputParent) => {
  try {
    fs.renameSync(stage, outputDir);
    return "directory-rename";
  } catch (error) {
    if (fs.existsSync(outputDir)) throw error;
    fs.mkdirSync(outputDir, { recursive: false });
    const incompleteMarker = path.join(outputDir, ".delivery-incomplete");
    fs.writeFileSync(incompleteMarker, "发布尚未完成；delivery.manifest.json 出现后才可验收。\n", "utf8");
    try {
      moveTreeFiles(stage, outputDir, { manifestLast: true });
      fs.rmSync(incompleteMarker, { force: true });
      assertWithin(stage, outputParent, "交付包 staging publish cleanup");
      fs.rmSync(stage, { recursive: true, force: true });
      return "file-promotion";
    } catch (publishError) {
      publishError.cause = publishError.cause ?? error;
      throw publishError;
    }
  }
};

const copyReplayRuntime = (stage, options) => {
  for (const filename of ["replay.html", "replay-runtime.js", "serve-replay.mjs", "verify-delivery.mjs", "README.txt"]) {
    const sourcePath = path.join(replayAssetRoot, filename);
    if (!fs.existsSync(sourcePath)) throw new Error(`缺少回放运行时：${sourcePath}`);
    fs.copyFileSync(sourcePath, path.join(stage, filename));
  }
  const threeModulePath = path.resolve(options.threeModulePath ?? defaultThreeModulePath);
  const threeLicensePath = path.resolve(options.threeLicensePath ?? defaultThreeLicensePath);
  if (!fs.existsSync(threeModulePath) || !fs.existsSync(threeLicensePath)) {
    throw new Error("缺少可离线打包的 Three.js 运行时或许可证。");
  }
  const vendorDir = path.join(stage, "vendor");
  fs.mkdirSync(vendorDir, { recursive: true });
  fs.copyFileSync(threeModulePath, path.join(vendorDir, "three.module.min.js"));
  const threeModuleSource = fs.readFileSync(threeModulePath, "utf8");
  if (threeModuleSource.includes("./three.core.min.js")) {
    const threeCorePath = path.resolve(options.threeCorePath ?? path.join(path.dirname(threeModulePath), "three.core.min.js"));
    if (!fs.existsSync(threeCorePath)) throw new Error(`Three.js 模块依赖缺失：${threeCorePath}`);
    fs.copyFileSync(threeCorePath, path.join(vendorDir, "three.core.min.js"));
  }
  fs.copyFileSync(threeLicensePath, path.join(vendorDir, "THREE-LICENSE.txt"));
};

export function buildSimulationDeliveryPackage(options) {
  const project = options?.project;
  if (!project || !Array.isArray(project.objects)) throw new Error("交付包缺少有效 3D 项目。");
  const videoPath = path.resolve(String(options.videoPath ?? ""));
  if (!options.videoPath || !fs.existsSync(videoPath)) throw new Error(`交付包缺少视频：${videoPath}`);

  const timelineDuration = Number(project.director?.timeline?.duration ?? 0);
  if (!Number.isFinite(timelineDuration) || timelineDuration <= 0) {
    throw new Error("交付包要求大于零的有限导演时间线。");
  }
  const fps = Math.max(1, Math.min(120, Math.round(Number(options.fps) || 30)));
  const start = Math.max(0, Math.min(Number(options.start) || 0, timelineDuration));
  if (start >= timelineDuration) throw new Error("交付包起点必须早于导演时间线终点。");
  const requestedDuration = Number(options.duration ?? timelineDuration - start);
  const duration = Math.max(1 / fps, Math.min(requestedDuration || timelineDuration - start, timelineDuration - start));
  const frameCount = Math.max(1, Math.round(duration * fps));
  const end = Math.min(timelineDuration, start + frameCount / fps);
  const outputDir = path.resolve(options.outputDir
    ?? path.join(path.dirname(videoPath), `${path.parse(videoPath).name}.simulation-package`));
  const outputParent = path.dirname(outputDir);
  fs.mkdirSync(outputParent, { recursive: true });
  const stage = fs.mkdtempSync(path.join(outputParent, `.${path.basename(outputDir)}-staging-`));
  assertWithin(stage, outputParent, "交付包 staging");

  let previousPackagePath = null;
  try {
    const projectText = typeof options.projectText === "string"
      ? options.projectText
      : canonicalJson(project);
    const projectSnapshot = canonicalJson(project);
    const projectSha256 = sha256Bytes(Buffer.from(projectSnapshot, "utf8"));
    const sourceTextSha256 = sha256Bytes(Buffer.from(projectText, "utf8"));
    fs.writeFileSync(path.join(stage, "scene.blockout.json"), projectSnapshot, "utf8");
    const assetLock = buildAssetLock(project, projectSha256);
    writeJson(path.join(stage, "assets.lock.json"), assetLock);

    const tracePath = path.join(stage, "simulation.trace.jsonl");
    const traceHandle = fs.openSync(tracePath, "w");
    const previousObjectStates = new Map();
    const observedOwnershipEvents = [];
    let previousOwnership = {};
    const collisionAudit = {
      sampleCount: 0,
      correctedSampleCount: 0,
      totalResolvedContacts: 0,
      maxInitialPenetration: 0,
      maxResidualPenetration: 0,
      unsafeSamples: [],
      contactPairs: new Map(),
      violationMap: new Map(),
    };

    const writeTraceLine = (value) => fs.writeSync(traceHandle, `${canonicalJson(value, { pretty: false })}\n`, null, "utf8");
    writeTraceLine({
      kind: "header",
      schema: SIMULATION_TRACE_SCHEMA,
      fps,
      start: round(start),
      end: round(end),
      frameCount,
      sampleCount: frameCount + 1,
      objectCount: project.objects.length,
      encoding: "initial-full-state-then-object-deltas",
      precisionDecimals: 6,
    });

    const sampleFrame = (frameIndex, time, terminal = false) => {
      const frame = evaluateTimeline(project, time);
      const changes = {};
      for (const object of project.objects) {
        const state = traceObjectState(frame.objects[object.id] ?? object);
        const encoded = canonicalJson(state, { pretty: false });
        if (frameIndex === 0 || previousObjectStates.get(object.id) !== encoded) changes[object.id] = state;
        previousObjectStates.set(object.id, encoded);
      }

      const simulation = traceSimulation(frame.simulation);
      const ownershipIds = new Set([...Object.keys(previousOwnership), ...Object.keys(simulation.ownership)]);
      for (const itemId of [...ownershipIds].sort()) {
        const before = previousOwnership[itemId] ?? null;
        const after = simulation.ownership[itemId] ?? null;
        if (canonicalJson(before, { pretty: false }) !== canonicalJson(after, { pretty: false })) {
          observedOwnershipEvents.push({
            kind: "ownership-state",
            frame: terminal ? "terminal" : frameIndex,
            time: round(time),
            itemId,
            before,
            after,
          });
        }
      }
      previousOwnership = structuredClone(simulation.ownership);
      updateCollisionAudit(collisionAudit, frame, terminal ? "terminal" : frameIndex);
      writeTraceLine({
        kind: terminal ? "terminal" : "frame",
        frame: terminal ? frameCount : frameIndex,
        time: round(time),
        fullState: frameIndex === 0,
        changes,
        activeClipIds: [...frame.activeClipIds],
        camera: traceCamera(frame.camera),
        dialogue: frame.dialogue ? canonicalValue(frame.dialogue) : null,
        interactions: frame.interactions.map(traceInteraction),
        simulation,
      });
    };

    try {
      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        sampleFrame(frameIndex, Math.min(start + frameIndex / fps, timelineDuration));
      }
      sampleFrame(frameCount, end, true);
    } finally {
      fs.closeSync(traceHandle);
    }

    const interactionDefinitions = eventDefinitionsFor(project, start, end);
    const interactions = {
      schemaVersion: 1,
      timeline: { start: round(start), end: round(end), fps },
      definitions: interactionDefinitions,
      observedOwnershipEvents,
    };
    writeJson(path.join(stage, "interactions.json"), interactions);

    const collisionReport = {
      schemaVersion: 1,
      backend: "collision-proxy-v1",
      timeline: { start: round(start), end: round(end), fps },
      sampleCount: collisionAudit.sampleCount,
      correctedSampleCount: collisionAudit.correctedSampleCount,
      totalResolvedContacts: collisionAudit.totalResolvedContacts,
      maxInitialPenetration: round(collisionAudit.maxInitialPenetration),
      maxResidualPenetration: round(collisionAudit.maxResidualPenetration),
      unsafeSampleCount: collisionAudit.unsafeSamples.length,
      unsafeSamples: collisionAudit.unsafeSamples,
      contactPairs: [...collisionAudit.contactPairs.values()]
        .sort((left, right) => `${left.kind}:${left.leftId}:${left.rightId}`.localeCompare(`${right.kind}:${right.leftId}:${right.rightId}`))
        .map((entry) => ({ ...entry, maxPenetration: round(entry.maxPenetration) })),
      violations: [...collisionAudit.violationMap.values()],
    };
    writeJson(path.join(stage, "collision-report.json"), collisionReport);

    const videoExtension = path.extname(videoPath).toLowerCase() || ".webm";
    const packageVideoName = `final-video${videoExtension}`;
    const videoTransfer = copyArtifact(videoPath, path.join(stage, packageVideoName));
    const {
      outputPath: _sourceOutputPath,
      reportPath: _sourceReportPath,
      auditFrames: _sourceAuditFrames,
      deliveryPackage: _sourceDeliveryPackage,
      audioSource: _sourceAudioSource,
      ...portableSourceReport
    } = options.renderReport ?? {};
    const portableRenderReport = {
      ...portableSourceReport,
      outputPath: packageVideoName,
      reportPath: "render-report.json",
      deliveryVideo: packageVideoName,
      audioIncluded: Boolean(_sourceAudioSource),
      sourceVideoSha256: hashFile(videoPath).sha256,
    };
    writeJson(path.join(stage, "render-report.json"), portableRenderReport);

    for (const entry of options.additionalFiles ?? []) {
      const relativePath = assertRelativeArtifactPath(entry.relativePath);
      const sourcePath = path.resolve(String(entry.sourcePath ?? ""));
      if (!entry.sourcePath || !fs.existsSync(sourcePath)) throw new Error(`交付包附加文件不存在：${sourcePath}`);
      copyArtifact(sourcePath, path.join(stage, ...relativePath.split("/")));
    }

    copyReplayRuntime(stage, options);
    const filesBeforeManifest = listFiles(stage);
    const fileRecords = filesBeforeManifest.map((relativePath) => {
      const digest = hashFile(path.join(stage, ...relativePath.split("/")));
      return {
        path: relativePath,
        role: roleFor(relativePath),
        mediaType: mediaTypeFor(relativePath),
        bytes: digest.bytes,
        sha256: digest.sha256,
      };
    });
    const recordByPath = new Map(fileRecords.map((entry) => [entry.path, entry]));
    const deterministicPaths = [
      "scene.blockout.json",
      "assets.lock.json",
      "simulation.trace.jsonl",
      "interactions.json",
      "collision-report.json",
    ];
    const simulationIdentity = sha256Bytes(Buffer.from(canonicalJson({
      schema: SIMULATION_DELIVERY_SCHEMA,
      fps,
      start: round(start),
      end: round(end),
      files: deterministicPaths.map((relativePath) => ({
        path: relativePath,
        sha256: recordByPath.get(relativePath)?.sha256,
      })),
    }, { pretty: false }), "utf8"));
    const validation = {
      status: collisionReport.unsafeSampleCount === 0 && collisionReport.violations.length === 0 ? "PASS" : "FAIL",
      collisionSafe: collisionReport.unsafeSampleCount === 0,
      simulationViolationCount: collisionReport.violations.length,
      sourceProjectLocked: true,
    };
    const manifest = {
      schema: SIMULATION_DELIVERY_SCHEMA,
      schemaVersion: 1,
      packageId: `sim-${simulationIdentity.slice(0, 16)}`,
      title: String(options.title ?? project.name ?? "3D simulation delivery"),
      simulationIdentity,
      project: {
        id: project.id ?? null,
        name: project.name ?? null,
        sha256: projectSha256,
        sourceTextSha256,
        objectCount: project.objects.length,
      },
      timeline: {
        start: round(start),
        end: round(end),
        duration: round(end - start),
        fps,
        frameCount,
        simulationSampleCount: frameCount + 1,
      },
      backends: {
        simulation: "deterministic-kinematic",
        collision: "collision-proxy-v1",
        trace: SIMULATION_TRACE_SCHEMA,
      },
      validation,
      videoTransfer,
      files: fileRecords,
    };
    writeJson(path.join(stage, "delivery.manifest.json"), manifest);

    if (fs.existsSync(outputDir)) {
      previousPackagePath = `${outputDir}.previous-${Date.now()}-${process.pid}`;
      assertWithin(previousPackagePath, outputParent, "交付包历史");
      try {
        fs.renameSync(outputDir, previousPackagePath);
      } catch {
        moveTreeFiles(outputDir, previousPackagePath);
        assertWithin(outputDir, outputParent, "交付包旧版本 cleanup");
        fs.rmSync(outputDir, { recursive: true, force: true });
      }
    }
    const publishStrategy = publishDirectory(stage, outputDir, outputParent);

    return {
      ok: validation.status === "PASS",
      packageDir: outputDir,
      manifestPath: path.join(outputDir, "delivery.manifest.json"),
      replayPath: path.join(outputDir, "replay.html"),
      videoPath: path.join(outputDir, packageVideoName),
      simulationIdentity,
      packageId: manifest.packageId,
      validation,
      timeline: manifest.timeline,
      previousPackagePath,
      publishStrategy,
    };
  } finally {
    if (fs.existsSync(stage)) {
      assertWithin(stage, outputParent, "交付包 staging cleanup");
      fs.rmSync(stage, { recursive: true, force: true });
    }
  }
}
