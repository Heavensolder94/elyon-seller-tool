import mobileSummaryHandler from "./mobile-summary.js";
import { requireSellerAccess } from "../lib/seller-access.js";

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 64 * 1024 })) return;
  return mobileSummaryHandler(req, res);
}
