import envCheckHandler from "./env-check.js";
import { requireSellerAccess } from "../lib/seller-access.js";

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 1024 * 1024 })) return;
  return envCheckHandler(req, res);
}
