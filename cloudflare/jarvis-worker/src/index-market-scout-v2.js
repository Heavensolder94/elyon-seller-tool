import coreWorker, { MarketScoutHandler } from "./index.js";
import { researchMarketScout } from "./market-scout-research.js";

const NO_VERIFIED_CANDIDATES = "market_scout_no_verified_candidates";
const SUPPLIER_FIRST_STRATEGY = "supplier_first_fallback";

const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);

const isNoVerifiedCandidatesError = (error) => error instanceof Error && error.message === NO_VERIFIED_CANDIDATES;

function supplierFirstPayload(payload = {}) {
  const source = object(payload);
  const originalCommand = text(source.command) || "Finde profitable risikoarme Produkte für eBay Dropshipping.";
  const supplierFirstInstruction = [
    "SUPPLIER-FIRST FALLBACK — do not start from generic product ideas.",
    "First identify current suppliers or dropshipping platforms that explicitly support single-order fulfillment for end customers, MOQ 1, and shipping to Germany/EU; prefer EU stock or EU warehouses when verifiable.",
    "Only after supplier fulfillment terms are verified, derive product candidates from those supplier catalogs.",
    "For each derived product, independently validate current market demand, selling-price evidence, purchase-price evidence, gross margin, competition and risk before returning it.",
    "A generic wholesaler, manufacturer page or marketplace listing is not enough. Omit any candidate whose MOQ 1 / per-order dropshipping support cannot be evidenced.",
    "Keep all original risk, price, margin, evidence and safety constraints. Never invent replacement candidates."
  ].join("\n");

  return {
    ...source,
    command: `${originalCommand}\n\n${supplierFirstInstruction}`,
    researchStrategy: SUPPLIER_FIRST_STRATEGY,
    supplierFirstFallback: true,
  };
}

const originalMarketScoutHandle = MarketScoutHandler.handle.bind(MarketScoutHandler);

async function handleMarketScoutWithSupplierFallback(task, env) {
  try {
    return await originalMarketScoutHandle(task, env);
  } catch (error) {
    if (!isNoVerifiedCandidatesError(error)) throw error;
  }

  try {
    const result = await researchMarketScout({
      env,
      payload: supplierFirstPayload(object(task?.payload)),
    });

    return {
      ...result,
      researchStrategy: SUPPLIER_FIRST_STRATEGY,
      fallback: {
        triggered: true,
        reason: NO_VERIFIED_CANDIDATES,
        strategy: SUPPLIER_FIRST_STRATEGY,
      },
      warnings: [
        "Die normale Produktsuche lieferte keine ausreichend belegten Kandidaten. Jarvis hat automatisch eine Supplier-first-Nachrecherche ausgeführt.",
        ...(Array.isArray(result?.warnings) ? result.warnings : []),
      ].slice(0, 12),
    };
  } catch (fallbackError) {
    if (!isNoVerifiedCandidatesError(fallbackError)) throw fallbackError;

    const finalError = new Error(NO_VERIFIED_CANDIDATES);
    finalError.retryable = false;
    finalError.fallbackAttempted = true;
    finalError.researchStrategy = SUPPLIER_FIRST_STRATEGY;
    throw finalError;
  }
}

MarketScoutHandler.handle = handleMarketScoutWithSupplierFallback;

export default coreWorker;
export { MarketScoutHandler, handleMarketScoutWithSupplierFallback, supplierFirstPayload };
