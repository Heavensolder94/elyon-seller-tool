import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const publicRoot = path.join(appRoot, "public");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const handlerCache = new Map();

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".gs": "text/plain; charset=utf-8",
};

function setHeaders(res, contentType) {
  if (contentType) {
    res.setHeader("Content-Type", contentType);
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function normalizePathname(pathname) {
  const cleaned = decodeURIComponent(pathname || "/");
  return cleaned === "/" ? "/index.html" : cleaned;
}

function buildRequestAdapter(nodeReq, body, parsedUrl) {
  return {
    method: nodeReq.method,
    url: nodeReq.url,
    headers: nodeReq.headers,
    query: Object.fromEntries(parsedUrl.searchParams.entries()),
    body,
  };
}

function createResponseAdapter(res) {
  const adapter = {
    status(code) {
      res.statusCode = Number(code) || 200;
      return adapter;
    },
    setHeader(name, value) {
      res.setHeader(name, value);
      return adapter;
    },
    getHeader(name) {
      return res.getHeader(name);
    },
    json(payload) {
      if (!res.headersSent) {
        setHeaders(res, "application/json; charset=utf-8");
      }
      res.end(JSON.stringify(payload));
      return adapter;
    },
    send(payload) {
      if (payload === undefined || payload === null) {
        res.end();
        return adapter;
      }
      if (typeof payload === "object" && !Buffer.isBuffer(payload)) {
        if (!res.headersSent) {
          setHeaders(res, "application/json; charset=utf-8");
        }
        res.end(JSON.stringify(payload));
        return adapter;
      }
      if (!res.headersSent) {
        setHeaders(res, "text/plain; charset=utf-8");
      }
      res.end(String(payload));
      return adapter;
    },
    end(payload) {
      if (payload === undefined) {
        res.end();
      } else if (Buffer.isBuffer(payload)) {
        res.end(payload);
      } else {
        res.end(String(payload));
      }
      return adapter;
    },
    writeHead(...args) {
      res.writeHead(...args);
      return adapter;
    },
  };

  Object.defineProperty(adapter, "statusCode", {
    get() {
      return res.statusCode;
    },
    set(value) {
      res.statusCode = Number(value) || 200;
    },
  });

  return adapter;
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) return undefined;

  const raw = Buffer.concat(chunks).toString("utf8");
  const contentType = String(req.headers["content-type"] || "").toLowerCase();

  if (contentType.includes("application/json")) {
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return raw;
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw).entries());
  }

  return raw;
}

async function loadHandler(modulePath) {
  if (!handlerCache.has(modulePath)) {
    const promise = import(pathToFileURL(modulePath).href).then((mod) => mod.default || mod);
    handlerCache.set(modulePath, promise);
  }
  return handlerCache.get(modulePath);
}

function buildApiRoute(pathname, query) {
  const clean = pathname.replace(/\/+$/, "") || "/";

  const routes = [
    { match: /^\/api\/ping$/, module: "api/health.js" },
    { match: /^\/api\/health$/, module: "api/health.js" },
    { match: /^\/api\/env-check$/, module: "api/env-check.js" },
    { match: /^\/api\/google-sheets-sync$/, module: "api/env-check.js" },
    { match: /^\/api\/cj\/status$/, module: "api/cj/status.js" },
    { match: /^\/api\/cj\/search$/, module: "api/cj/search.js" },
    { match: /^\/api\/elyon-soul$/, module: "api/elyon-soul.js" },
    { match: /^\/api\/agent-engine$/, module: "api/agent-engine.js" },
    { match: /^\/api\/ai-router$/, module: "api/ai-router.js" },
    { match: /^\/api\/ai(?:\/(listing-optimizer|product-search))?$/, module: "api/ai.js" },
    { match: /^\/api\/google-drive(?:\/(status|auth-url|upload-backup|oauth\/start|oauth\/callback))?$/, module: "api/google-drive.js" },
    { match: /^\/api\/ebay(?:\/(status|login-url|search|competition|exchange-token|token))?$/, module: "api/ebay/index.js" },
  ];

  for (const route of routes) {
    const match = clean.match(route.match);
    if (!match) continue;

    const nextQuery = { ...query };
    if (route.module === "api/ai.js" && match[1]) {
      nextQuery.task = match[1];
    }
    if (route.module === "api/google-drive.js" && match[1]) {
      nextQuery.action = match[1].split("/").pop();
    }
    if (route.module === "api/ebay/index.js" && match[1]) {
      nextQuery.action = match[1];
    }

    return { modulePath: path.join(appRoot, route.module), query: nextQuery };
  }

  return null;
}

function staticCandidates(pathname) {
  const clean = normalizePathname(pathname);
  const base = clean.replace(/^\/+/, "");
  const candidates = new Set();

  candidates.add(path.join(appRoot, base));
  candidates.add(path.join(publicRoot, base));

  if (!path.extname(base)) {
    candidates.add(path.join(appRoot, base, "index.html"));
    candidates.add(path.join(publicRoot, base, "index.html"));
    candidates.add(path.join(appRoot, `${base}.html`));
    candidates.add(path.join(publicRoot, `${base}.html`));
  }

  if (clean === "/index.html") {
    candidates.add(path.join(appRoot, "index.html"));
    candidates.add(path.join(publicRoot, "index.html"));
  }

  if (clean === "/ebay-callback" || clean === "/ebay-callback/") {
    candidates.add(path.join(appRoot, "ebay-accepted.html"));
    candidates.add(path.join(publicRoot, "ebay-accepted.html"));
  }

  if (clean === "/ebay-declined" || clean === "/ebay-declined/") {
    candidates.add(path.join(appRoot, "ebay-declined.html"));
    candidates.add(path.join(publicRoot, "ebay-declined.html"));
  }

  return Array.from(candidates);
}

async function serveStatic(res, pathname) {
  for (const filePath of staticCandidates(pathname)) {
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) continue;

      const ext = path.extname(filePath).toLowerCase();
      setHeaders(res, mimeTypes[ext] || "application/octet-stream");
      createReadStream(filePath).pipe(res);
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

async function handleApi(req, res, parsedUrl) {
  const route = buildApiRoute(parsedUrl.pathname, Object.fromEntries(parsedUrl.searchParams.entries()));
  if (!route) return false;

  try {
    const handler = await loadHandler(route.modulePath);
    const requestAdapter = buildRequestAdapter(req, req.body, new URL(req.url, `http://${req.headers.host || host}`));
    requestAdapter.query = route.query;
    const responseAdapter = createResponseAdapter(res);
    await handler(requestAdapter, responseAdapter);

    if (!res.writableEnded) {
      res.end();
    }

    return true;
  } catch (error) {
    if (!res.headersSent) {
      setHeaders(res, "application/json; charset=utf-8");
    }
    res.statusCode = 500;
    res.end(
      JSON.stringify({
        ok: false,
        error: error && error.message ? error.message : "API handler failed",
      })
    );
    return true;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || host}`);
    req.body = await readRequestBody(req);

    if (parsedUrl.pathname.startsWith("/api/")) {
      const handled = await handleApi(req, res, parsedUrl);
      if (handled) return;
    }

    const served = await serveStatic(res, parsedUrl.pathname);
    if (served) return;

    res.statusCode = 404;
    setHeaders(res, "text/plain; charset=utf-8");
    res.end("Not Found");
  } catch (error) {
    res.statusCode = 500;
    setHeaders(res, "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        ok: false,
        error: error && error.message ? error.message : "Local server error",
      })
    );
  }
});

server.listen(port, host, () => {
  console.log(`Elyon local server running at http://${host}:${port}`);
  console.log(`Serving app root: ${appRoot}`);
});
