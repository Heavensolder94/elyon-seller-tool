import mobileHealthHandler from "./mobile-health.js";
import { requireSellerAccess } from "../lib/seller-access.js";

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 64 * 1024 })) return;
  return mobileHealthHandler(req, res);
}
