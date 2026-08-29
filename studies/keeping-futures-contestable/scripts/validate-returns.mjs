import path from "node:path";

import { formatIssues, readReturnDirectory, validateCorpus } from "../src/data-pipeline.mjs";

const directory = path.resolve(process.argv[2] || "data/raw");
const entries = await readReturnDirectory(directory);
const report = validateCorpus(entries);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) {
  console.error(formatIssues(report.issues));
  process.exitCode = 1;
}
