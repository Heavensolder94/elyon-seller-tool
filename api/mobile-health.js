import { applyCors } from "../lib/api-cors.js";

function getOrigin(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "http");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "127.0.0.1:4173");
  return `${proto}://${host}`;
}

async function readJson(url) {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: {
        ok: false,
        error: error?.message || "Request failed",
      },
    };
  }
}

export default async function handler(req, res) {
  if (applyCors(req, res, ["GET", "OPTIONS"])) return;

  const origin = getOrigin(req);
  const [envCheck, ebay, cj, drive] = await Promise.all([
    readJson(`${origin}/api/env-check`),
    readJson(`${origin}/api/ebay/status`),
    readJson(`${origin}/api/cj/status`),
    readJson(`${origin}/api/google-drive/status`),
  ]);

  const readiness = envCheck?.data?.readiness || {};
  const services = [
    {
      key: "backend",
      name: "Backend",
      state: envCheck.ok ? "ok" : "bad",
      detail: envCheck?.data?.message || "Systemstatus",
    },
    {
      key: "ebay",
      name: "eBay",
      state: ebay.ok ? "ok" : "bad",
      detail: ebay?.data?.service || ebay?.data?.error || "eBay API",
    },
    {
      key: "cj",
      name: "CJ",
      state: cj.ok ? "ok" : "bad",
      detail: cj?.data?.message || cj?.data?.service || "CJ API",
    },
    {
      key: "google-drive",
      name: "Google Drive",
      state: drive?.data?.connected ? "ok" : "warn",
      detail: drive?.data?.connected ? "Verbunden" : drive?.data?.error || "Nicht verbunden",
    },
    {
      key: "google-sheets",
      name: "Google Sheets",
      state: readiness.googleSheets?.ready ? "ok" : "warn",
      detail: readiness.googleSheets?.ready
        ? "Sync bereit"
        : readiness.googleSheets?.missing?.length
          ? `Fehlt: ${readiness.googleSheets.missing.join(", ")}`
          : "Sync prüfen",
    },
    {
      key: "openai",
      name: "OpenAI",
      state: readiness.openai?.ready ? "ok" : "warn",
      detail: readiness.openai?.ready ? "API bereit" : "API Key prüfen",
    },
  ];

  const summary = services.reduce((acc, service) => {
    acc.total += 1;
    if (service.state === "ok") acc.ok += 1;
    if (service.state === "warn") acc.warn += 1;
    if (service.state === "bad") acc.bad += 1;
    return acc;
  }, { total: 0, ok: 0, warn: 0, bad: 0 });

  return res.status(200).json({
    ok: true,
    service: "mobile-health",
    checkedAt: new Date().toISOString(),
    summary,
    services,
  });
}
