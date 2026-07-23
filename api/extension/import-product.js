import internalHandler from "./import-product-internal.js";
import { requireImporterAccess } from "../../lib/importer-request-guard.js";

export default async function handler(req, res) {
  if (!requireImporterAccess(req, res, { requirePersistentStorage: true, maxBodyBytes: 512 * 1024 })) return;
  return internalHandler(req, res);
}
