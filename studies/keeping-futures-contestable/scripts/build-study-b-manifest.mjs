import fs from "node:fs/promises";
import path from "node:path";

import { buildStudyBManifest, readReturnDirectory, writeJson } from "../src/data-pipeline.mjs";

export async function buildManifestFromDirectory(inputDirectory, outputPath, options = {}) {
  const entries = await readReturnDirectory(path.resolve(inputDirectory));
  const manifest = buildStudyBManifest(entries, options);
  await writeJson(path.resolve(outputPath), manifest);
  return manifest;
}

if (process.argv[1] && import.meta.url === new URL(`file:///${path.resolve(process.argv[1]).replaceAll("\\", "/")}`).href) {
  const inputDirectory = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputDirectory || !outputPath) throw new Error("Usage: node build-study-b-manifest.mjs <returns-dir> <output.json>");
  const manifest = await buildManifestFromDirectory(inputDirectory, outputPath);
  console.log(JSON.stringify({ manifestId: manifest.manifestId, artefactCount: manifest.artefacts.length, sha256: manifest.sha256 }, null, 2));
}
