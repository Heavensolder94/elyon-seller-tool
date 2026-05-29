import envCheckHandler from "./env-check.js";
import { applyCors } from "../lib/api-cors.js";

export default async function handler(req, res) {
  if (applyCors(req, res, ["GET", "POST", "OPTIONS"])) return;
  req.query = { ...(req.query || {}), action: "google-sheets-sync-settings" };
  return envCheckHandler(req, res);
}
