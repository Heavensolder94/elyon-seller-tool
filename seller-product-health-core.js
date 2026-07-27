const text = (value) => String(value ?? "").trim();
const positive = (value) => Number(value || 0) > 0;

function hasSupplierReference(product) {
  return Boolean(text(
    product.supplierLink ||
    product.supplierId ||
    product.supplierName ||
    product.supplier ||
    product.sourceProvider ||
    product.sourceDomain
  ));
}

function hasMarketSignal(product) {
  return positive(product.sales) ||
    positive(product.competition) ||
    positive(product.soldCount) ||
    positive(product.sourceOnlineSold) ||
    positive(product.sourceOnlineReviews) ||
    Boolean(text(product.marketCheckedAt || product.sourceOnlineCheckedAt || product.aiDecisionAt)) ||
    Boolean(product.aiDecision && typeof product.aiDecision === "object");
}

export function productHealthReadiness(product = {}) {
  const checks = [
    {
      key: "buy",
      label: "Einkaufspreis",
      ok: positive(product.buy || product.purchasePrice || product.cost),
    },
    {
      key: "sell",
      label: "Verkaufspreis",
      ok: positive(product.sell || product.salePrice || product.price),
    },
    {
      key: "delivery",
      label: "Lieferzeit",
      ok: positive(product.delivery || product.deliveryTime || product.shippingDays),
    },
    {
      key: "supplier",
      label: "Supplier/Produktquelle",
      ok: hasSupplierReference(product),
    },
    {
      key: "market",
      label: "Markt- oder Prüfdaten",
      ok: hasMarketSignal(product),
    },
  ];

  const completed = checks.filter((check) => check.ok);
  const missing = checks.filter((check) => !check.ok);
  const state = completed.length === 0
    ? "unrated"
    : missing.length > 0
      ? "incomplete"
      : "ready";

  return {
    state,
    ready: state === "ready",
    completed: completed.map((check) => check.key),
    missing: missing.map((check) => check.key),
    missingLabels: missing.map((check) => check.label),
    completedCount: completed.length,
    totalCount: checks.length,
  };
}

export function pendingProductHealth(readiness, issues = []) {
  const state = readiness?.state || "unrated";
  const missingLabels = Array.isArray(readiness?.missingLabels) ? readiness.missingLabels : [];

  if (state === "incomplete") {
    return {
      score: "—",
      cls: "info",
      label: "🔵 Unvollständig",
      text: missingLabels.length
        ? `Erst ergänzen: ${missingLabels.join(", ")}.`
        : "Produktdaten erst vollständig ergänzen.",
      issues: Array.isArray(issues) ? issues : [],
      readiness,
    };
  }

  return {
    score: "—",
    cls: "info",
    label: "⚪ Noch nicht bewertet",
    text: "Preise, Lieferzeit, Supplier und Prüfdaten fehlen noch.",
    issues: Array.isArray(issues) ? issues : [],
    readiness,
  };
}
