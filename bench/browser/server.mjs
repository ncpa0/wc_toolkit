import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BROWSER_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(BROWSER_DIR, "../..");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
};

// Only these repo subdirectories are exposed over http. The bench page
// needs its own files and the built library, nothing else.
const ALLOWED_ROOTS = ["bench/browser", "dist"];

/**
 * Static file server for the browser bench plus a `/results` sink that
 * receives one JSON blob per bench page run (written to `resultsDir`,
 * which is expected to live outside the repo, e.g. in the OS temp dir).
 *
 * @param {{
 *   resultsDir: string,
 *   onResult?: (result: {
 *     scenario: number,
 *     usPerOp: number,
 *     runs: number[],
 *     error?: string,
 *   }) => void,
 * }} options
 * @returns {Promise<{ port: number, close: () => Promise<void> }>}
 */
export function startServer({ resultsDir, onResult }) {
  const server = http.createServer((req, res) => {
    handleRequest(req, res, resultsDir, onResult).catch(err => {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(String(err?.stack ?? err));
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({
        port: /** @type {{ port: number }} */ (server.address()).port,
        close: () =>
          new Promise(resolveClose => {
            server.closeAllConnections();
            server.close(() => resolveClose());
          }),
      });
    });
  });
}

async function handleRequest(req, res, resultsDir, onResult) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");

  if (req.method === "POST" && url.pathname === "/results") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const result = JSON.parse(body);
    await fs.writeFile(
      path.join(
        resultsDir,
        `run-${result.scenario}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
      ),
      body,
    );
    onResult?.(result);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "content-type": "text/plain" });
    res.end("method not allowed");
    return;
  }

  const rel = url.pathname === "/"
    ? "bench/browser/index.html" // the bench page is the server root
    : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const abs = path.resolve(REPO_ROOT, rel);
  const isAllowed = ALLOWED_ROOTS.some(root => abs === path.resolve(REPO_ROOT, root))
    || ALLOWED_ROOTS.some(root => abs.startsWith(path.resolve(REPO_ROOT, root) + path.sep));
  if (!isAllowed) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }

  let file = abs;
  let stat = await fs.stat(file).catch(() => null);
  if (stat?.isDirectory()) {
    file = path.join(file, "index.html");
    stat = await fs.stat(file).catch(() => null);
  }
  if (!stat?.isFile()) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
    return;
  }

  res.writeHead(200, { "content-type": MIME_TYPES[path.extname(file)] ?? "application/octet-stream" });
  if (req.method === "HEAD") {
    res.end();
  } else {
    res.end(await fs.readFile(file));
  }
}
