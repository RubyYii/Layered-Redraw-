import fs from "node:fs/promises";
import path from "node:path";

import { csvStringify, prepareCodingUnits, readReturnDirectory, writeJson } from "../src/data-pipeline.mjs";

export async function prepareCodingFromDirectory(inputDirectory, outputCsv, keyOutputPath = null) {
  const entries = await readReturnDirectory(path.resolve(inputDirectory));
  const prepared = prepareCodingUnits(entries);
  const outputPath = path.resolve(outputCsv);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, csvStringify(prepared.units), "utf8");
  const keyPath = keyOutputPath
    ? path.resolve(keyOutputPath)
    : outputPath.replace(/\.csv$/i, ".key.json");
  await writeJson(keyPath, {
    schemaVersion: "kfc-coding-key/0.1",
    synthetic: prepared.synthetic,
    packageVersion: prepared.packageVersion,
    warning: "CONTAINS CONDITION KEYS. DO NOT GIVE TO CODERS BEFORE CODING IS FROZEN.",
    rows: prepared.key
  });
  return { unitCount: prepared.units.length, outputPath, keyPath };
}

if (process.argv[1] && import.meta.url === new URL(`file:///${path.resolve(process.argv[1]).replaceAll("\\", "/")}`).href) {
  const inputDirectory = process.argv[2];
  const outputCsv = process.argv[3];
  const keyOutputPath = process.argv[4] || null;
  if (!inputDirectory || !outputCsv) throw new Error("Usage: node prepare-coding.mjs <returns-dir> <output.csv> [sequestered-key.json]");
  console.log(JSON.stringify(await prepareCodingFromDirectory(inputDirectory, outputCsv, keyOutputPath), null, 2));
}
