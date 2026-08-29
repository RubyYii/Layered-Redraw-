import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const portIndex = process.argv.indexOf("--port");
const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 4177;
const shouldOpen = process.argv.includes("--open");
const mime = new Map([
  [".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"], [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"], [".md", "text/markdown; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"], [".png", "image/png"]
]);

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url || "/", `http://127.0.0.1:${port}`);
  if (requestUrl.pathname === "/favicon.ico") {
    response.writeHead(204, { "Cache-Control": "no-store" });
    response.end();
    return;
  }
  const relative = decodeURIComponent(requestUrl.pathname === "/" ? "/web/index.html" : requestUrl.pathname);
  const target = path.resolve(projectRoot, `.${relative}`);
  if (target !== projectRoot && !target.startsWith(`${projectRoot}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  const publicRelative = path.relative(projectRoot, target).replaceAll("\\", "/");
  if (!isPublicRuntimeFile(publicRelative)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    response.end("Forbidden");
    return;
  }
  fs.readFile(target, (error, data) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mime.get(path.extname(target).toLowerCase()) || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'"
    });
    response.end(data);
  });
});

function isPublicRuntimeFile(relativePath) {
  if (relativePath.startsWith("web/") || relativePath.startsWith("src/")) return true;
  if (relativePath === "config/study-config.json") return true;
  if (["data/demo/study-b-manifest.json", "data/frozen/pilot-study-b-manifest.json", "data/frozen/study-b-manifest.json"].includes(relativePath)) return true;
  return /^data\/frozen\/(pilot|study-a|study-b|expert)-(launch-record|package-freeze)\.json$/.test(relativePath);
}

server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}/web/index.html`;
  console.log(`Keeping Futures Contestable is running at ${url}`);
  console.log("Press Ctrl+C to stop. No external network request is required.");
  if (shouldOpen) {
    const child = process.platform === "win32"
      ? spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true })
      : process.platform === "darwin"
        ? spawn("open", [url], { detached: true, stdio: "ignore" })
        : spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
    child.unref();
  }
});
