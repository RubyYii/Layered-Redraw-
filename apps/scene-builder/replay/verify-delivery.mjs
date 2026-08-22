import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const canonicalValue = (value) => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalValue(entry)]));
  }
  return value;
};
const canonicalJson = (value) => JSON.stringify(canonicalValue(value));
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
  return { bytes, sha256: digest.digest("hex") };
};
const sha256Bytes = (value) => crypto.createHash("sha256").update(value).digest("hex");
const listFiles = (directory = root) => {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(absolutePath));
    else if (entry.isFile()) files.push(path.relative(root, absolutePath).replaceAll(path.sep, "/"));
  }
  return files.sort();
};

const failures = [];
if (fs.existsSync(path.join(root, ".delivery-incomplete"))) failures.push("交付包带有未完成发布标记。");
const manifestPath = path.join(root, "delivery.manifest.json");
if (!fs.existsSync(manifestPath)) failures.push("缺少 delivery.manifest.json。");
const manifest = failures.length ? null : JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const verifiedFiles = [];
if (manifest) {
  const declaredPaths = new Set(manifest.files.map((entry) => entry.path));
  if (declaredPaths.size !== manifest.files.length) failures.push("清单含重复文件路径。");
  const actualPaths = listFiles().filter((entry) => entry !== "delivery.manifest.json");
  for (const actualPath of actualPaths) {
    if (!declaredPaths.has(actualPath)) failures.push(`存在清单外文件：${actualPath}`);
  }
  for (const record of manifest.files) {
    const filePath = path.resolve(root, ...record.path.split("/"));
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      failures.push(`清单路径越界：${record.path}`);
      continue;
    }
    if (!fs.existsSync(filePath)) {
      failures.push(`缺少文件：${record.path}`);
      continue;
    }
    const digest = hashFile(filePath);
    if (digest.sha256 !== record.sha256 || digest.bytes !== record.bytes) {
      failures.push(`文件哈希或大小不匹配：${record.path}`);
    } else {
      verifiedFiles.push(record.path);
    }
  }
  const deterministicPaths = [
    "scene.blockout.json",
    "assets.lock.json",
    "simulation.trace.jsonl",
    "interactions.json",
    "collision-report.json",
  ];
  const recordByPath = new Map(manifest.files.map((entry) => [entry.path, entry]));
  const identity = sha256Bytes(Buffer.from(canonicalJson({
    schema: manifest.schema,
    fps: manifest.timeline.fps,
    start: manifest.timeline.start,
    end: manifest.timeline.end,
    files: deterministicPaths.map((filePath) => ({ path: filePath, sha256: recordByPath.get(filePath)?.sha256 })),
  }), "utf8"));
  if (identity !== manifest.simulationIdentity) failures.push("simulationIdentity 与确定性输入不匹配。");
  if (manifest.packageId !== `sim-${identity.slice(0, 16)}`) failures.push("packageId 与 simulationIdentity 不匹配。");
  const projectDigest = recordByPath.get("scene.blockout.json")?.sha256;
  if (projectDigest !== manifest.project.sha256) failures.push("场景快照哈希与 project.sha256 不匹配。");
}

const result = {
  ok: failures.length === 0,
  status: failures.length === 0 ? "PASS" : "FAIL",
  packageId: manifest?.packageId ?? null,
  simulationIdentity: manifest?.simulationIdentity ?? null,
  declaredFileCount: manifest?.files?.length ?? 0,
  verifiedFileCount: verifiedFiles.length,
  validationStatus: manifest?.validation?.status ?? null,
  failures,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 2;
