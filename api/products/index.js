import { mergeProductLists, normalizeProduct } from "../../lib/product-master.js";
import {
  deleteProductMasterItem,
  getProductMasterRedisConfig,
  readProductMasterList,
  summarizeProductMaster,
  upsertProductMasterItem,
  writeProductMasterList,
} from "../../lib/product-master-store.js";
import { requireSellerAccess } from "../../lib/seller-access.js";

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
      const products = mergeProductLists(masterProducts, browserImports);
      return res.status(200).json({
        ok: true,
        route: "/api/products",
        products,
        summary: summarizeProductMaster(products),
        sources: {
          masterProducts: masterProducts.length,
          browserImports: browserImports.length,
        },
        storage: {
          configured: true,
          mode: "server_persistent",
          source: config.source,
        },
        safety: {
          automaticListing: false,
          automaticOrder: false,
          manualApprovalRequired: true,
        },
      });
    }

    if (req.method === "POST") {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const incoming = body.product || body.item || body.data || body;
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
        message: result.status === "updated" ? "Produkt aktualisiert." : "Produkt im Master gespeichert.",
      });
    }

    if (req.method === "DELETE") {
      const id = String(req.query.id || req.query.url || req.body?.id || req.body?.url || "").trim();
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
