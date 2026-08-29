import fs from "node:fs/promises";
import path from "node:path";

import { STUDY_B_BLOCK, assignStudyA } from "../src/experiment-core.mjs";
import { csvStringify } from "../src/data-pipeline.mjs";

const PREFIX = {
  "study-a": "A",
  "study-b": "B",
  expert: "E",
  "pilot-study-a": "PILOT-A",
  "pilot-study-b": "PILOT-B",
  "pilot-expert": "PILOT-E"
};

export function generateParticipantIds(study, start, count) {
  if (!(study in PREFIX)) throw new Error("study must be study-a, study-b, expert, pilot-study-a, pilot-study-b, or pilot-expert");
  if (!Number.isSafeInteger(start) || start < 1) throw new Error("start must be a positive integer");
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("count must be a positive integer");
  const baseStudy = study.replace(/^pilot-/, "");
  const isPilot = study.startsWith("pilot-");
  if (isPilot && study === "pilot-study-a" && (count < 4 || count > 6)) throw new Error("Initial Study A pilot IDs must contain 4–6 sessions");
  if (isPilot && study === "pilot-study-b" && ![8, 12].includes(count)) throw new Error("Initial Study B pilot IDs must contain 8 or 12 sessions");
  if (isPilot && study === "pilot-expert" && count !== 2) throw new Error("Initial expert pilot IDs must contain exactly 2 sessions");
  if (isPilot && start !== 1) throw new Error("Initial pilot ID sheets must start at 1; issue a versioned replacement sheet for a rerun");
  if (!isPilot && baseStudy === "study-a" && count % 6 !== 0) throw new Error("Study A IDs must be issued in complete blocks of six");
  if (!isPilot && baseStudy === "study-b" && count % 4 !== 0) throw new Error("Study B IDs must be issued in complete blocks of four");
  if (!isPilot && baseStudy === "study-a" && (start - 1) % 6 !== 0) throw new Error("Study A start must align with the first ID of a six-person block");
  if (!isPilot && baseStudy === "study-b" && (start - 1) % 4 !== 0) throw new Error("Study B start must align with the first ID of a four-person block");
  return Array.from({ length: count }, (_, index) => {
    const ordinal = start + index;
    const participantId = `${PREFIX[study]}-${String(ordinal).padStart(3, "0")}`;
    if (baseStudy === "study-a") {
      return {
        participant_id: participantId,
        allocation_block_id: `${isPilot ? "PILOT-" : ""}A-BLOCK-${Math.floor((ordinal - 1) / 6) + 1}`,
        internal_assignment: assignStudyA(participantId).sequenceId,
        status: "UNUSED"
      };
    }
    if (baseStudy === "study-b") {
      const block = STUDY_B_BLOCK[(ordinal - 1) % STUDY_B_BLOCK.length];
      return {
        participant_id: participantId,
        allocation_block_id: `${isPilot ? "PILOT-" : ""}B-BLOCK-${Math.floor((ordinal - 1) / 4) + 1}`,
        internal_assignment: `${block.protocol}:${block.workflowPattern.join("-")}`,
        status: "UNUSED"
      };
    }
    return {
      participant_id: participantId,
      allocation_block_id: isPilot ? "PILOT-EXPERT-NOT-BLOCKED" : "EXPERT-NOT-BLOCKED",
      internal_assignment: "BLINDED_ARTEFACT_SAMPLE",
      status: "UNUSED"
    };
  });
}

if (process.argv[1] && import.meta.url === new URL(`file:///${path.resolve(process.argv[1]).replaceAll("\\", "/")}`).href) {
  const study = process.argv[2];
  const start = Number(process.argv[3]);
  const count = Number(process.argv[4]);
  const outputPath = process.argv[5];
  if (!study || !outputPath) {
    throw new Error("Usage: node generate-participant-ids.mjs <study-a|study-b|expert|pilot-study-a|pilot-study-b|pilot-expert> <start> <count> <output.csv>");
  }
  const rows = generateParticipantIds(study, start, count);
  const resolved = path.resolve(outputPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, csvStringify(rows), "utf8");
  console.log(JSON.stringify({ ok: true, study, count: rows.length, output: resolved }, null, 2));
}
