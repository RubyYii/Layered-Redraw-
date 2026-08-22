import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createInteractionDemoProject } from "../src/interaction-demo.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const outputDir = path.join(projectRoot, "projects", "interaction-lab");
const outputPath = path.join(outputDir, "interaction-simulation.blockout.json");
const project = createInteractionDemoProject();
const serialized = `${JSON.stringify(project, null, 2)}\n`;

fs.mkdirSync(outputDir, { recursive: true });
const previous = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : null;
if (previous !== serialized) fs.writeFileSync(outputPath, serialized, "utf8");

process.stdout.write(`${JSON.stringify({
  ok: true,
  outputPath,
  changed: previous !== serialized,
  objectCount: project.objects.length,
  clipCount: project.director.timeline.clips.length,
  duration: project.director.timeline.duration,
}, null, 2)}\n`);
