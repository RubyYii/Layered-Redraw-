import fs from "node:fs";
import path from "node:path";

import { buildSimulationDeliveryPackage } from "./simulation-delivery-package.mjs";

const args = process.argv.slice(2);
const valueAfter = (flag, fallback = null) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const projectArgument = valueAfter("--project");
const videoArgument = valueAfter("--video");
if (!projectArgument || !videoArgument) {
  throw new Error("用法：node scripts/build-simulation-delivery-package.mjs --project <scene.json> --video <video.webm|mp4> [--report <report.json>] [--audit-dir <png-dir>] [--output <package-dir>] [--fps 30] [--start 0] [--duration seconds] [--title title]");
}

const projectPath = path.resolve(projectArgument);
const videoPath = path.resolve(videoArgument);
if (!fs.existsSync(projectPath)) throw new Error(`场景快照不存在：${projectPath}`);
if (!fs.existsSync(videoPath)) throw new Error(`视频不存在：${videoPath}`);
const projectText = fs.readFileSync(projectPath, "utf8");
const project = JSON.parse(projectText);
const defaultReportPath = path.join(path.dirname(videoPath), `${path.parse(videoPath).name}.report.json`);
const requestedReportPath = valueAfter("--report", defaultReportPath);
const reportPath = requestedReportPath ? path.resolve(requestedReportPath) : null;
const renderReport = reportPath && fs.existsSync(reportPath)
  ? JSON.parse(fs.readFileSync(reportPath, "utf8"))
  : {
      ok: true,
      note: "从已有视频生成交付包；未提供原始渲染报告。",
      sourceVideoName: path.basename(videoPath),
    };
const auditDirectoryArgument = valueAfter("--audit-dir");
const auditDirectory = auditDirectoryArgument ? path.resolve(auditDirectoryArgument) : null;
const additionalFiles = auditDirectory && fs.existsSync(auditDirectory)
  ? fs.readdirSync(auditDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^collision-[a-z0-9_-]+\.png$/i.test(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => ({
        sourcePath: path.join(auditDirectory, entry.name),
        relativePath: `audit/${entry.name}`,
      }))
  : [];

const packageResult = buildSimulationDeliveryPackage({
  project,
  projectText,
  videoPath,
  renderReport,
  outputDir: valueAfter("--output") ? path.resolve(valueAfter("--output")) : undefined,
  fps: Number(valueAfter("--fps", renderReport.fps ?? 30)),
  start: Number(valueAfter("--start", renderReport.start ?? 0)),
  duration: valueAfter("--duration") === null
    ? Number(renderReport.encodedDuration ?? project.director?.timeline?.duration ?? 0)
    : Number(valueAfter("--duration")),
  title: valueAfter("--title", `${project.name ?? "3D 场景"} · 可复现仿真交付`),
  additionalFiles,
});

process.stdout.write(`${JSON.stringify(packageResult, null, 2)}\n`);
if (!packageResult.ok) process.exitCode = 2;
