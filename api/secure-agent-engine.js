import agentHandler from "./agent-engine.js";
import { requireCronOrSellerAccess } from "../lib/seller-access.js";

export default async function handler(req, res) {
  if (!requireCronOrSellerAccess(req, res, { maxBodyBytes: 512 * 1024 })) return;
  return agentHandler(req, res);
}
