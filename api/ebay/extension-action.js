import ebayHandler from "./index.js";
import { applyExtensionSellerSession } from "../../lib/seller-extension-bridge.js";

const ALLOWED_ACTIONS = new Set(["setup", "create-draft", "draft", "publish", "withdraw"]);

function text(value) {
  return String(value ?? "").trim();
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (String(req?.method || "").toUpperCase() !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "method_not_allowed",
      message: "Die Extension-Brücke akzeptiert nur POST.",
    });
  }

  const action = text(req?.body?.action).replace(/^\/+/, "");
  if (!ALLOWED_ACTIONS.has(action)) {
    return res.status(400).json({
      ok: false,
      error: "seller_extension_action_not_allowed",
      message: "Diese Seller-Aktion ist für die Extension-Brücke nicht freigegeben.",
    });
  }

  const session = applyExtensionSellerSession(req);
  if (!session.ok) {
    return res.status(403).json({ ok: false, error: session.error, message: session.message });
  }

  const payload = req?.body?.payload && typeof req.body.payload === "object"
    ? req.body.payload
    : {};

  req.query = { ...(req.query || {}), action };
  req.body = payload;
  req.method = "POST";
  return ebayHandler(req, res);
}
