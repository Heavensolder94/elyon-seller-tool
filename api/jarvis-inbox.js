import { requireSellerAccess } from "../lib/seller-access.js";
import { getJarvisInboxItem, listJarvisInbox, updateJarvisInboxState, UUID_PATTERN } from "../lib/jarvis-inbox-store.js";
import { runMarketScout } from "../lib/jarvis-market-scout.js";

const COMPANY_OS_DEFAULT_URL = "https://elyon-company-os.vercel.app";
const ALLOWED_ACTIONS = new Set(["open", "approve", "reject", "archive", "trash", "restore", "delete_permanent", "retry", "transfer_to_nova"]);

function text(value, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function companyOsConfig(env = process.env) {
  const baseUrl = text(env.ELYON_COMPANY_OS_URL || COMPANY_OS_DEFAULT_URL, 1000).replace(/\/+$/, "");
  const syncCode = text(env.ELYON_COMPANY_OS_SYNC_CODE || env.COMPANY_OS_SYNC_CODE, 1000);
  let validUrl = false;
  try {
    const parsed = new URL(baseUrl);
    validUrl = parsed.protocol === "https:";
  } catch {
    validUrl = false;
  }
  return { baseUrl, syncCode, configured: Boolean(validUrl && syncCode) };
}

function novaProductFromItem(item = {}) {
  const candidate = object(item.candidate);
  const evidence = Array.isArray(candidate.evidence) ? candidate.evidence : [];
  const supplierUrl = text(candidate.supplierUrl, 2500);
  return {
    title: text(candidate.productName || "Jarvis Market Scout Produkt", 500),
    url: supplierUrl,
    sourceUrl: supplierUrl,
    source: "jarvis_market_scout",
    sourceProvider: "jarvis",
    sourceType: "market_scout_research",
    supplier: text(candidate.supplierSource, 300),
    supplierUrl,
    sourceRegion: text(candidate.supplierRegion, 120),
    category: text(candidate.category, 300),
    buyPrice: Number(candidate.purchasePrice || 0),
    supplierPrice: Number(candidate.purchasePrice || 0),
    novaPriceIdea: Number(candidate.sellingPrice || 0) || null,
    currency: "EUR",
    status: "nova_inbox",
    reviewStatus: "not_reviewed",
    processingStatus: "new",
    targetArea: "find_nova_inbox",
    companyOsSection: "finden_nova_eingang",
    notes: text(candidate.rationale, 5000),
    raw: {
      source: "jarvis_inbox_v1",
      taskId: text(item.taskId, 120),
      itemKey: text(item.itemKey, 120),
      researchStrategy: text(item.researchStrategy, 120),
      marketScout: {
        riskLevel: text(candidate.riskLevel, 80),
        estimatedMarginPercent: Number(candidate.estimatedMarginPercent || 0),
        demandSignal: text(candidate.demandSignal, 5000),
        competitionLevel: text(candidate.competitionLevel, 120),
        dropshippingSupported: candidate.dropshippingSupported === true,
        supplierShipsPerOrder: candidate.supplierShipsPerOrder === true,
        minimumOrderQuantity: Number(candidate.minimumOrderQuantity || 0),
        fulfillmentEvidence: text(candidate.fulfillmentEvidence, 5000),
        risks: Array.isArray(candidate.risks) ? candidate.risks.slice(0, 20) : [],
        evidence: evidence.slice(0, 30),
      },
    },
  };
}

async function transferToNova(item, env = process.env, fetchImpl = fetch) {
  const config = companyOsConfig(env);
  if (!config.configured) {
    const error = new Error("Die Company-OS-Nova-Brücke ist serverseitig noch nicht konfiguriert.");
    error.code = "jarvis_inbox_nova_bridge_not_configured";
    error.status = 503;
    throw error;
  }
  const product = novaProductFromItem(item);
  if (!product.title || !product.url) {
    const error = new Error("Für die Nova-Übergabe fehlen Produktname oder Supplier-URL.");
    error.code = "jarvis_inbox_nova_required_fields_missing";
    error.status = 400;
    throw error;
  }

  await updateJarvisInboxState({
    taskId: item.taskId,
    itemKey: item.itemKey,
    patch: { novaTransferStatus: "pending", novaTransferError: null },
    env,
  });

  let response;
  try {
    response = await fetchImpl(`${config.baseUrl}/api/nova/import-product-v3`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Elyon-Sync-Code": config.syncCode,
      },
      body: JSON.stringify({ product }),
    });
  } catch (error) {
    await updateJarvisInboxState({
      taskId: item.taskId,
      itemKey: item.itemKey,
      patch: { novaTransferStatus: "failed", novaTransferError: text(error?.message || "nova_network_error", 1000) },
      env,
    });
    throw error;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    const message = text(data?.message || data?.error || `Company OS HTTP ${response.status}`, 1000);
    await updateJarvisInboxState({
      taskId: item.taskId,
      itemKey: item.itemKey,
      patch: { novaTransferStatus: "failed", novaTransferError: message },
      env,
    });
    const error = new Error(message || "Nova-Übergabe fehlgeschlagen.");
    error.code = text(data?.error, 120) || "jarvis_inbox_nova_transfer_failed";
    error.status = response.status || 502;
    throw error;
  }

  const transferredAt = new Date().toISOString();
  const workflow = await updateJarvisInboxState({
    taskId: item.taskId,
    itemKey: item.itemKey,
    patch: {
      state: "approved",
      novaTransferStatus: "transferred",
      novaImportId: text(data?.importId || data?.import?.id, 200),
      novaTransferredAt: transferredAt,
      novaTransferError: null,
    },
    env,
  });
  return { data, workflow };
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method === "GET") {
    try {
      const limit = Number(firstQueryValue(req.query?.limit) || 40);
      const inbox = await listJarvisInbox({ limit, env: process.env });
      const config = companyOsConfig(process.env);
      return res.status(200).json({
        ok: true,
        ...inbox,
        capabilities: {
          novaTransferConfigured: config.configured,
          retryMarketScout: true,
          trash: true,
          permanentInboxDelete: true,
          technicalTaskDelete: false,
        },
      });
    } catch (error) {
      return res.status(502).json({
        ok: false,
        error: "jarvis_inbox_unavailable",
        message: text(error?.message || "Jarvis Inbox konnte nicht geladen werden.", 500),
      });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed", message: "Nur GET und POST sind erlaubt." });
  }

  const body = object(req.body);
  const action = text(body.action, 80);
  const taskId = text(body.taskId, 120);
  const itemKey = text(body.itemKey, 120);
  if (!ALLOWED_ACTIONS.has(action) || !UUID_PATTERN.test(taskId) || !itemKey) {
    return res.status(400).json({ ok: false, error: "jarvis_inbox_invalid_action" });
  }

  try {
    const item = await getJarvisInboxItem({ taskId, itemKey, env: process.env });
    if (!item) return res.status(404).json({ ok: false, error: "jarvis_inbox_item_not_found" });

    if (["open", "approve", "reject", "archive", "trash", "restore", "delete_permanent"].includes(action)) {
      if (action === "restore" && item.state !== "trashed") {
        return res.status(409).json({ ok: false, error: "jarvis_inbox_item_not_trashed", message: "Nur Einträge im Papierkorb können wiederhergestellt werden." });
      }
      if (action === "delete_permanent" && item.state !== "trashed") {
        return res.status(409).json({ ok: false, error: "jarvis_inbox_delete_requires_trash", message: "Ein Eintrag muss zuerst in den Papierkorb verschoben werden." });
      }
      const workflow = await updateJarvisInboxState({ taskId, itemKey, action, env: process.env });
      return res.status(200).json({
        ok: true,
        action,
        workflow,
        audit: {
          technicalTaskRetained: true,
          taskId,
        },
      });
    }

    if (item.state === "trashed") {
      return res.status(409).json({ ok: false, error: "jarvis_inbox_item_trashed", message: "Der Eintrag liegt im Papierkorb. Stelle ihn zuerst wieder her." });
    }

    if (action === "retry") {
      const command = text(item.query, 12000) || "Finde 1 neues risikoarmes Evergreen-Produkt für eBay Dropshipping.";
      const marketScout = await runMarketScout({ command, env: process.env, fetchImpl: fetch });
      if (!marketScout?.ok) {
        return res.status(502).json({ ok: false, error: marketScout?.reason || "market_scout_retry_failed", marketScout });
      }
      return res.status(202).json({ ok: true, action, marketScout });
    }

    if (action === "transfer_to_nova") {
      if (item.kind !== "product") return res.status(400).json({ ok: false, error: "jarvis_inbox_product_required" });
      const result = await transferToNova(item, process.env, fetch);
      return res.status(200).json({
        ok: true,
        action,
        message: "Produkt wurde als Rohimport in den Nova Eingang von Company OS übertragen.",
        nova: {
          importId: text(result.data?.importId || result.data?.import?.id, 200) || null,
          duplicate: result.data?.duplicate === true,
          targetArea: text(result.data?.targetArea, 120) || "find_nova_inbox",
        },
        workflow: result.workflow,
      });
    }

    return res.status(400).json({ ok: false, error: "jarvis_inbox_invalid_action" });
  } catch (error) {
    const status = Number(error?.status || 500);
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      ok: false,
      error: text(error?.code, 120) || "jarvis_inbox_action_failed",
      message: text(error?.message || "Jarvis-Inbox-Aktion fehlgeschlagen.", 1000),
    });
  }
}

export { companyOsConfig, novaProductFromItem, transferToNova };
