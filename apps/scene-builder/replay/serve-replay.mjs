import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const defaultRoot = path.dirname(scriptPath);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

export function createReplayServer({ rootPath = defaultRoot } = {}) {
  const root = path.resolve(rootPath);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`交付包目录不存在：${root}`);
  const realRoot = fs.realpathSync(root);
  return http.createServer((request, response) => {
    let requestPath;
    try {
      requestPath = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    } catch {
      response.writeHead(400).end("Bad request");
      return;
    }
    const relativePath = requestPath === "/" ? "replay.html" : requestPath.replace(/^\/+/, "");
    const candidate = path.resolve(root, relativePath);
    if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    const realCandidate = fs.realpathSync(candidate);
    if (!realCandidate.startsWith(`${realRoot}${path.sep}`)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const stats = fs.statSync(realCandidate);
    const range = request.headers.range;
    const headers = {
      "Content-Type": contentTypes[path.extname(realCandidate).toLowerCase()] ?? "application/octet-stream",
      "Accept-Ranges": "bytes",
    };
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match?.[1] ? Number(match[1]) : 0;
      const end = Math.min(match?.[2] ? Number(match[2]) : stats.size - 1, stats.size - 1);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= stats.size) {
        response.writeHead(416, { "Content-Range": `bytes */${stats.size}` }).end();
        return;
      }
      response.writeHead(206, { ...headers, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${stats.size}` });
      if (request.method === "HEAD") response.end();
      else fs.createReadStream(realCandidate, { start, end }).pipe(response);
      return;
    }
    response.writeHead(200, { ...headers, "Content-Length": stats.size });
    if (request.method === "HEAD") response.end();
    else fs.createReadStream(realCandidate).pipe(response);
  });
}

export async function startReplayServer({ rootPath = defaultRoot, port = 4177, host = "127.0.0.1" } = {}) {
  const server = createReplayServer({ rootPath });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return { server, root: path.resolve(rootPath), host, port: actualPort, url: `http://${host}:${actualPort}/` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(scriptPath)) {
  const args = process.argv.slice(2);
  const valueAfter = (flag, fallback) => {
    const index = args.indexOf(flag);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
  };
  const requestedPort = Math.max(1, Math.min(65535, Number(valueAfter("--port", 4177)) || 4177));
  const running = await startReplayServer({ port: requestedPort });
  process.stdout.write(`可复现仿真回放已启动：${running.url}\n`);
  process.stdout.write(`交付包目录：${running.root}\n`);
}
