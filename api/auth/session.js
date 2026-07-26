import {
  clearSellerSession,
  createSellerSession,
  isSellerAuthenticated,
  sellerAccessConfigured,
  setSellerSecurityHeaders,
} from "../../lib/seller-access.js";

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

export default async function handler(req, res) {
  setSellerSecurityHeaders(res);

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      configured: sellerAccessConfigured(),
      authenticated: isSellerAuthenticated(req),
    });
  }

  if (req.method === "POST") {
    if (!sellerAccessConfigured()) {
      return res.status(503).json({
        ok: false,
        configured: false,
        authenticated: false,
        error: "seller_access_not_configured",
        message: "ELYON_SELLER_ACCESS_TOKEN fehlt in der Serverkonfiguration.",
      });
    }

    const body = readBody(req);
    const token = String(body.token || body.accessToken || "").trim();
    const result = createSellerSession(req, res, token);
    if (!result.ok) {
      return res.status(403).json({
        ok: false,
        configured: true,
        authenticated: false,
        error: result.error,
        message: "Sicherheitscode ist ungültig.",
      });
    }

    return res.status(200).json({
      ok: true,
      configured: true,
      authenticated: true,
      expiresIn: result.expiresIn,
    });
  }

  if (req.method === "DELETE") {
    clearSellerSession(req, res);
    return res.status(200).json({ ok: true, configured: sellerAccessConfigured(), authenticated: false });
  }

  res.setHeader("Allow", ["GET", "POST", "DELETE"]);
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}
