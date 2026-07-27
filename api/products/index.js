import { normalizeProduct } from "../../lib/product-master-active.js";
import {
  deleteProductMasterItem,
  getProductMasterRedisConfig,
  readProductMasterList,
  summarizeProductMaster,
  upsertProductMasterItem,
  writeProductMasterList,
} from "../../lib/product-master-store.js";
import { requireSellerAccess } from "../../lib/seller-access.js";

function text(value) {
  return String(value ?? "").trim();
}

function includeLegacyImports(req) {
  return ["1", "true", "yes"].includes(text(req?.query?.includeLegacyImports).toLowerCase());
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 512 * 1024 })) return;

  res.setHeader("Cache-Control", "no-store");
  const config = getProductMasterRedisConfig();
  if (!config.url || !config.token) {
    return res.status(503).json({
      ok: false,
      route: "/api/products",
      error: "persistent_storage_required",
      message: "Product Master bleibt gesperrt, bis Upstash/KV persistent konfiguriert ist.",
      storage: { configured: false, mode: "unconfigured", source: config.source },
    });
  }

  try {
    if (req.method === "GET") {
      const [masterProducts, browserImports] = await Promise.all([
        readProductMasterList("elyon_products"),
        readProductMasterList("elyon_browser_imports"),
      ]);
      const products = masterProducts.map(normalizeProduct);
      const payload = {
        ok: true,
        route: "/api/products",
        products,
        summary: summarizeProductMaster(products),
        sources: {
          activeProductMaster: masterProducts.length,
          inactiveLegacyBrowserImports: browserImports.length,
        },
        storage: {
          configured: true,
          mode: "server_persistent",
          source: config.source,
        },
        workflow: {
          sourceOfTruth: "server_product_master",
          acceptedInput: "final_company_os_approval",
          directNovaImportActive: false,
          localStorageRole: "explicit_working_copy_only",
        },
        safety: {
          automaticListing: false,
          automaticOrder: false,
          manualApprovalRequired: true,
        },
      };
      if (includeLegacyImports(req)) {
        payload.legacyBrowserImports = browserImports;
      }
      return res.status(200).json(payload);
    }

    if (req.method === "POST") {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const incoming = body.product || body.item || body.data || body;
      if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
        return res.status(400).json({ ok: false, error: "invalid_product_payload", message: "Produktdatensatz fehlt." });
      }
      const current = await readProductMasterList("elyon_products");
      const result = upsertProductMasterItem(current, incoming);
      const storage = await writeProductMasterList("elyon_products", result.items);
      return res.status(200).json({
        ok: true,
        route: "/api/products",
        status: result.status,
        product: normalizeProduct(result.product),
        total: result.items.length,
        storage,
        message: result.status === "updated" ? "Seller-Produkt aktualisiert." : "Produkt im Seller Product Master gespeichert.",
      });
    }

    if (req.method === "DELETE") {
      const id = text(req.query.id || req.query.url || req.body?.id || req.body?.url);
      if (!id) return res.status(400).json({ ok: false, error: "id oder url fehlt." });
      const current = await readProductMasterList("elyon_products");
      const result = deleteProductMasterItem(current, id);
      const storage = await writeProductMasterList("elyon_products", result.items);
      return res.status(200).json({
        ok: true,
        route: "/api/products",
        deleted: result.deleted,
        total: result.items.length,
        storage,
        message: result.deleted ? "Produkt gelöscht." : "Produkt nicht gefunden.",
      });
    }

    return res.status(405).json({ ok: false, error: "Nur GET, POST und DELETE erlaubt." });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      route: "/api/products",
      error: error && error.message ? error.message : "Product API Fehler",
      storage: {
        configured: true,
        source: config.source,
      },
    });
  }
}
