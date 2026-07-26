import soulHandler from "./elyon-soul.js";
import { requireSellerAccess } from "../lib/seller-access.js";

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 256 * 1024 })) return;
  return soulHandler(req, res);
}
