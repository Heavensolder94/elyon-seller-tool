import internalHandler from "../../internal/extension/import-product.js";
import { requireImporterAccess } from "../../lib/importer-request-guard.js";

function directNovaImportEnabled() {
  return ["1", "true", "yes"].includes(String(process.env.ELYON_ALLOW_DIRECT_NOVA_IMPORT || "").trim().toLowerCase());
}

export default async function handler(req, res) {
  if (!directNovaImportEnabled()) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(409).json({
      ok: false,
      active: false,
      error: "direct_nova_import_disabled",
      message: "Direkte Nova-/Browserimporte ins Seller Tool sind deaktiviert. Produkte müssen über Nova Eingang und die finale Company-OS-Produktprüfung übertragen werden.",
      targetRoute: "/api/integrations/company-os/products",
      requiredStatus: "ready_for_seller_tool",
    });
  }

  if (!requireImporterAccess(req, res, { requirePersistentStorage: true, maxBodyBytes: 512 * 1024 })) return;

  return internalHandler(req, res);
}
