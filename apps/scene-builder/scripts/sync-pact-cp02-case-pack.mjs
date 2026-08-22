import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateCasePackManifest } from "../src/case-pack-runtime.js";

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

const listSourceFiles = async (root) => {
  const files = [];
  const walk = async (directory, relativeDirectory = "") => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      const metadata = await fs.lstat(absolutePath);
      if (metadata.isSymbolicLink()) throw new Error(`Case Pack 包含 symlink/symbolic link：${relativePath}`);
      if (metadata.isDirectory()) await walk(absolutePath, relativePath);
      else if (metadata.isFile()) files.push(relativePath);
      else throw new Error(`Case Pack 包含不支持的文件类型：${relativePath}`);
    }
  };
  const rootMetadata = await fs.lstat(root);
  if (rootMetadata.isSymbolicLink()) throw new Error("Case Pack source root 不能是 symlink/symbolic link。 ");
  if (!rootMetadata.isDirectory()) throw new Error("Case Pack source root 不是目录。 ");
  await walk(root);
  return files;
};

const assertTargetAbsent = async (targetRoot) => {
  try {
    const metadata = await fs.lstat(targetRoot);
    if (metadata.isSymbolicLink()) throw new Error("Case Pack target 不能是 symlink/symbolic link。 ");
    throw new Error(`Case Pack target 已存在；拒绝覆盖：${targetRoot}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
};

export async function syncCasePack({ sourceRoot, targetRoot }, options = {}) {
  const source = path.resolve(String(sourceRoot ?? ""));
  const target = path.resolve(String(targetRoot ?? ""));
  const validateManifestImpl = options.validateManifestImpl ?? validateCasePackManifest;
  if (!sourceRoot || !targetRoot) throw new Error("syncCasePack 需要 sourceRoot 与 targetRoot。 ");
  if (typeof validateManifestImpl !== "function") throw new Error("syncCasePack 需要有效的 Case Pack policy 验证器。 ");
  if (source === target || target.startsWith(`${source}${path.sep}`)) {
    throw new Error("Case Pack target 不能位于 source 内部。 ");
  }

  const files = await listSourceFiles(source);
  if (!files.includes("case-pack.json")) throw new Error("Case Pack 缺少 missing case-pack.json。 ");
  const manifestBytes = await fs.readFile(path.join(source, "case-pack.json"));
  let manifestInput;
  try {
    manifestInput = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error("Case Pack case-pack.json 不是有效 JSON。 ");
  }
  const manifest = validateManifestImpl(manifestInput);
  const expectedFiles = new Set(["case-pack.json", ...manifest.assets.map((asset) => asset.path)]);
  const missing = [...expectedFiles].filter((filename) => !files.includes(filename));
  if (missing.length) throw new Error(`Case Pack missing/缺少登记文件：${missing.join(", ")}`);
  const extra = files.filter((filename) => !expectedFiles.has(filename));
  if (extra.length) throw new Error(`Case Pack unexpected extra/未登记文件：${extra.join(", ")}`);

  const verifiedAssets = [];
  for (const asset of manifest.assets) {
    const absolutePath = path.join(source, ...asset.path.split("/"));
    const metadata = await fs.lstat(absolutePath);
    if (metadata.isSymbolicLink()) throw new Error(`Case Pack asset 是 symlink/symbolic link：${asset.path}`);
    const bytes = await fs.readFile(absolutePath);
    if (bytes.byteLength !== asset.bytes) {
      throw new Error(`Case Pack asset ${asset.assetId} size/bytes 大小不匹配。`);
    }
    if (sha256(bytes) !== asset.sha256) throw new Error(`Case Pack asset ${asset.assetId} SHA-256 不匹配。`);
    verifiedAssets.push({ asset, bytes });
  }

  await assertTargetAbsent(target);
  const targetParent = path.dirname(target);
  await fs.mkdir(targetParent, { recursive: true });
  const stage = await fs.mkdtemp(path.join(targetParent, `.${path.basename(target)}-staging-`));
  await fs.writeFile(path.join(stage, "case-pack.json"), manifestBytes);
  for (const { asset, bytes } of verifiedAssets) {
    const destination = path.join(stage, ...asset.path.split("/"));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes);
  }
  await fs.rename(stage, target);

  return {
    casePackId: manifest.casePackId,
    assetCount: manifest.assets.length,
    manifestSha256: sha256(manifestBytes),
    targetRoot: target,
  };
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--source" || !args[1]) {
    process.stderr.write("Usage: node scripts/sync-pact-cp02-case-pack.mjs --source <verified-local-case-pack>\n");
    process.exitCode = 2;
  } else {
    const appRoot = path.resolve(path.dirname(currentFile), "..");
    const targetRoot = path.join(appRoot, "public", "case-packs", "pact-cp02");
    try {
      const result = await syncCasePack({ sourceRoot: args[1], targetRoot });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } catch (error) {
      process.stderr.write(`${error?.message || error}\n`);
      process.exitCode = 1;
    }
  }
}
