import googleDriveHandler from "./google-drive.js";
import { requireSellerAccess } from "../lib/seller-access.js";

function requestedAction(req) {
  const bodyAction = String(req?.body?.action || req?.body?.endpoint || req?.body?.path || "").trim();
  if (bodyAction) return bodyAction;
  const queryAction = String(req?.query?.action || req?.query?.endpoint || req?.query?.path || "").trim();
  if (queryAction) return queryAction;
  try {
    const url = new URL(req?.url || "/api/google-drive", `https://${req?.headers?.host || "localhost"}`);
    return url.pathname.replace(/^\/api\/google-drive\/?/, "").replace(/\/+$/, "") || "status";
  } catch {
    return "status";
  }
}

export default async function handler(req, res) {
  const action = requestedAction(req);
  if (action !== "callback" && !requireSellerAccess(req, res, { maxBodyBytes: 2 * 1024 * 1024 })) return;
  return googleDriveHandler(req, res);
}
