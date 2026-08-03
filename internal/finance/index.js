import { requireSellerAccess } from "../../lib/seller-access.js";
import { ebayUserSession, callEbayJson, publicEbayError } from "../../lib/ebay-production.js";
import { readFinanceState, writeFinanceState, getFinanceStoreDescription } from "../../lib/finance-store.js";
import { normalizeEbayApiTransactions, mergeTransactions, calculateMetrics, buildEurSummary } from "../../seller-finance-core.js";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function actionFrom(req) {
  const explicit = text(req?.query?.action || req?.query?.endpoint || req?.query?.path);
  if (explicit) return explicit.replace(/^\/+/, "");
  try {
    const url = new URL(req?.url || "/api/finance", `https://${req?.headers?.host || "localhost"}`);
    return url.pathname.replace(/^\/api\/finance\/?/, "") || "status";
  } catch {
    return "status";
  }
}

function environmentFrom(req) {
  const raw = req?.method === "POST" ? req?.body?.environment : req?.query?.environment;
  return text(raw || process.env.EBAY_ENV).toLowerCase() === "sandbox" ? "sandbox" : "production";
}

function financesRoot(environment) {
  return environment === "sandbox" ? "https://apiz.sandbox.ebay.com" : "https://apiz.ebay.com";
}

function daysAgoIso(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - Math.max(1, Math.min(Number(days || 90), 730)));
  return date.toISOString();
}

function ebayHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Accept-Language": "de-DE",
    "X-EBAY-C-MARKETPLACE-ID": "EBAY_DE",
  };
}

async function fetchTransactions(environment, days = 90) {
  const session = await ebayUserSession(environment);
  const limit = 1000;
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  const transactions = [];
  const from = daysAgoIso(days);
  const to = new Date().toISOString();
  const filter = `transactionDate:[${from}..${to}]`;

  while (offset < total && offset < 10000) {
    const url = new URL(`${financesRoot(session.environment)}/sell/finances/v1/transaction`);
    url.searchParams.set("filter", filter);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    const data = await callEbayJson(url.toString(), { headers: ebayHeaders(session.accessToken) });
    const page = Array.isArray(data.transactions) ? data.transactions : [];
    transactions.push(...page);
    total = Number.isFinite(Number(data.total)) ? Number(data.total) : transactions.length;
    if (!page.length || page.length < limit) break;
    offset += page.length;
  }

  return {
    environment: session.environment,
    days: Number(days),
    from,
    to,
    total: transactions.length,
    transactions,
    scopes: session.scopes,
  };
}

async function fetchPayouts(environment, days = 90) {
  const session = await ebayUserSession(environment);
  const from = daysAgoIso(days);
  const to = new Date().toISOString();
  const url = new URL(`${financesRoot(session.environment)}/sell/finances/v1/payout`);
  url.searchParams.set("filter", `payoutDate:[${from}..${to}]`);
  url.searchParams.set("limit", "200");
  const data = await callEbayJson(url.toString(), { headers: ebayHeaders(session.accessToken) });
  return {
    environment: session.environment,
    days: Number(days),
    from,
    to,
    total: Number(data.total || data.payouts?.length || 0),
    payouts: Array.isArray(data.payouts) ? data.payouts : [],
  };
}

async function handleStatus(req, res) {
  const state = await readFinanceState();
  const metrics = calculateMetrics(state.transactions);
  return res.status(200).json({
    ok: true,
    service: "Elyon Finance",
    version: 1,
    store: getFinanceStoreDescription(),
    counts: {
      transactions: state.transactions.length,
      documents: state.documents.length,
      imports: state.imports.length,
      auditEvents: state.auditLog.length,
    },
    metrics,
    safety: {
      readOnlyEbayApi: true,
      automaticTaxFiling: false,
      automaticPosting: false,
      manualReviewRequired: true,
      destructiveDelete: false,
    },
  });
}

async function handleLoad(req, res) {
  const state = await readFinanceState();
  return res.status(200).json({ ok: true, state, store: getFinanceStoreDescription() });
}

async function handleSave(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Nur POST erlaubt." });
  const body = object(req.body);
  if (!body.state || typeof body.state !== "object") return res.status(400).json({ ok: false, error: "state fehlt." });
  const result = await writeFinanceState(body.state, {
    action: text(body.action) || "finance_manual_sync",
    actor: "seller",
    source: text(body.source) || "seller_finance_ui",
    summary: text(body.summary) || "Finanzdaten aus dem Seller Tool synchronisiert.",
  });
  if (!result.ok) return res.status(503).json({ ok: false, error: "finance_store_unavailable", message: result.error, store: getFinanceStoreDescription() });
  return res.status(200).json({ ok: true, state: result.state, merge: result.merge, store: getFinanceStoreDescription() });
}

async function handleEbayPreview(req, res) {
  const environment = environmentFrom(req);
  const days = Math.max(1, Math.min(Number(req?.query?.days || req?.body?.days || 90), 730));
  const raw = await fetchTransactions(environment, days);
  const transactions = normalizeEbayApiTransactions(raw);
  return res.status(200).json({
    ok: true,
    environment,
    days,
    count: transactions.length,
    transactions,
    rawCount: raw.transactions.length,
    scopes: raw.scopes,
    persisted: false,
  });
}

async function handleEbaySync(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Nur POST erlaubt." });
  const body = object(req.body);
  if (body.confirm !== true) {
    return res.status(400).json({
      ok: false,
      error: "confirmation_required",
      message: "Der lesende eBay-Abruf darf erst nach ausdrücklicher Bestätigung in Elyon gespeichert werden.",
    });
  }
  const environment = environmentFrom(req);
  const days = Math.max(1, Math.min(Number(body.days || 90), 730));
  const raw = await fetchTransactions(environment, days);
  const incoming = normalizeEbayApiTransactions(raw);
  const current = await readFinanceState();
  const merged = mergeTransactions(current.transactions, incoming);
  const importId = `ebay_api_${new Date().toISOString()}`;
  const next = {
    ...current,
    transactions: merged.transactions,
    imports: [
      ...current.imports,
      {
        id: importId,
        source: "ebay_finances_api",
        environment,
        days,
        rawCount: raw.transactions.length,
        normalizedCount: incoming.length,
        inserted: merged.inserted,
        duplicates: merged.duplicates,
        createdAt: new Date().toISOString(),
      },
    ],
  };
  const result = await writeFinanceState(next, {
    action: "ebay_finances_import",
    actor: "seller",
    source: "ebay_finances_api",
    summary: `eBay-Finanzdaten importiert: ${merged.inserted} neue Datensätze, ${merged.duplicates} bereits bekannt.`,
  });
  if (!result.ok) return res.status(503).json({ ok: false, error: "finance_store_unavailable", message: result.error, preview: incoming });
  return res.status(200).json({
    ok: true,
    environment,
    days,
    state: result.state,
    merge: merged,
    store: getFinanceStoreDescription(),
    readOnlyEbayApi: true,
  });
}

async function handlePayouts(req, res) {
  const environment = environmentFrom(req);
  const days = Math.max(1, Math.min(Number(req?.query?.days || 90), 730));
  const data = await fetchPayouts(environment, days);
  return res.status(200).json({ ok: true, ...data, persisted: false });
}

async function handleEur(req, res) {
  const state = await readFinanceState();
  return res.status(200).json({ ok: true, summary: buildEurSummary(state.transactions), generatedAt: new Date().toISOString() });
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: 4 * 1024 * 1024 })) return;
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    const action = actionFrom(req);
    if (action === "status") return handleStatus(req, res);
    if (action === "load") return handleLoad(req, res);
    if (action === "save") return handleSave(req, res);
    if (action === "ebay-preview" || action === "ebay-transactions") return handleEbayPreview(req, res);
    if (action === "ebay-sync") return handleEbaySync(req, res);
    if (action === "payouts") return handlePayouts(req, res);
    if (action === "eur") return handleEur(req, res);
    return res.status(404).json({ ok: false, error: `Unbekannte Finance-Route: ${action}` });
  } catch (error) {
    if (error?.code?.startsWith?.("ebay_")) return res.status(Number(error.status || 500)).json(publicEbayError(error));
    return res.status(Number(error?.status || 500)).json({ ok: false, error: "finance_api_failed", message: error?.message || "Elyon Finance Fehler" });
  }
}
