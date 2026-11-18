import { fetchTransactions } from "../internal/finance/index.js";
import { readFinanceState, writeFinanceState, getFinanceStoreDescription } from "./finance-store.js";
import { normalizeEbayApiTransactions } from "../seller-finance-core.js";

const AUTO_SOURCE = "ebay_finances_auto";
const DEFAULT_DAYS = 90;
const MAX_ATTEMPTS = 3;

function error(code, message, status = 503) {
  const result = new Error(message);
  result.code = code;
  result.status = status;
  return result;
}

// A closed Finance month is based on the seller's German calendar, not UTC.
export function berlinMonthKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : "";
}

export function selectNewAutoTransactions(state = {}, normalized = []) {
  const existingKeys = new Set((state.transactions || []).map((item) => item.dedupeKey).filter(Boolean));
  const closed = state.monthClosures || {};
  const transactions = [];
  let blockedLockedMonths = 0;
  let duplicates = 0;
  for (const entry of normalized) {
    if (closed[berlinMonthKey(entry.transactionDate)]?.closedAt) {
      blockedLockedMonths += 1;
    } else if (existingKeys.has(entry.dedupeKey)) {
      duplicates += 1;
    } else {
      existingKeys.add(entry.dedupeKey);
      transactions.push(entry);
    }
  }
  return { transactions, blockedLockedMonths, duplicates };
}

/**
 * Read-only eBay API; writes only to Elyon's existing persistent Finance store.
 * Revision-checked retries re-evaluate closed months and existing transactions,
 * and never replace manually reviewed or voided rows.
 */
export async function runAutomaticEbayFinanceSync({
  fetchTransactionsImpl = fetchTransactions,
  readStateImpl = readFinanceState,
  writeStateImpl = writeFinanceState,
  storeDescriptionImpl = getFinanceStoreDescription,
  now = () => new Date(),
} = {}) {
  if (String(process.env.ELYON_FINANCE_AUTO_SYNC_ENABLED || "").toLowerCase() === "false") {
    return { ok: true, disabled: true, source: AUTO_SOURCE };
  }
  const store = storeDescriptionImpl();
  if (!store?.persistent || store.configured === false) {
    throw error("finance_auto_store_unavailable", "Automatischer Import benötigt einen konfigurierten, persistenten Finance-Cloudspeicher.");
  }

  // Never take environment, lookback or target account from a public URL.
  const raw = await fetchTransactionsImpl("production", DEFAULT_DAYS);
  if (raw.environment !== "production") {
    throw error("finance_auto_environment_invalid", "Automatischer eBay-Import ist ausschließlich für Production erlaubt.");
  }
  const normalized = normalizeEbayApiTransactions(raw);
  const stamp = now().toISOString();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const current = await readStateImpl();
    const selection = selectNewAutoTransactions(current, normalized);
    const importRecord = {
      id: `ebay_api_auto_${stamp}`,
      source: AUTO_SOURCE,
      environment: "production",
      days: DEFAULT_DAYS,
      rawCount: raw.transactions?.length || 0,
      normalizedCount: normalized.length,
      inserted: selection.transactions.length,
      duplicates: selection.duplicates,
      blockedLockedMonths: selection.blockedLockedMonths,
      createdAt: stamp,
      automatic: true,
    };
    const result = await writeStateImpl({
      ...current,
      transactions: [...current.transactions, ...selection.transactions],
      imports: [...current.imports, importRecord],
    }, {
      action: "ebay_finances_auto_import",
      actor: "finance_cron",
      source: AUTO_SOURCE,
      summary: `Automatischer eBay-Abgleich: ${selection.transactions.length} neu, ${selection.duplicates} bekannt, ${selection.blockedLockedMonths} aus geschlossenen Monaten blockiert.`,
    }, { expectedRevision: current.revision });

    if (result.ok) {
      return {
        ok: true,
        source: AUTO_SOURCE,
        executedAt: stamp,
        inserted: selection.transactions.length,
        duplicates: selection.duplicates,
        blockedLockedMonths: selection.blockedLockedMonths,
        rawCount: importRecord.rawCount,
        revision: result.state?.revision,
      };
    }
    if (!result.conflict) {
      throw error("finance_auto_write_failed", result.error || "Finanzdaten konnten nicht gespeichert werden.");
    }
  }
  throw error("finance_auto_revision_conflict", "Zeitgleiche Änderungen: Der automatische Import wurde ohne Überschreiben abgebrochen.", 409);
}
