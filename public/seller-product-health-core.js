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

function statusKey(status = {}) {
  const key = text(status.key).toLowerCase();
  if (["go", "test", "no"].includes(key)) return key;
  const label = text(status.label).toLowerCase();
  const cls = text(status.cls).toLowerCase();
  if (key === "ready" || cls === "good" || label.includes("kandidat") || label.includes("geeignet")) return "go";
  if (cls === "bad" || label.includes("nicht geeignet") || label.includes("kritisch")) return "no";
  return "test";
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

export function productDecisionStatus(product = {}, scoredStatus = {}) {
  const readiness = productHealthReadiness(product);
  const common = {
    advisory: true,
    blocking: false,
    canEdit: true,
    canPrepareListing: true,
    canOpenListingPackage: true,
    canPublishManually: true,
    requiresFinalComplianceCheck: true,
    readiness,
    publicationNote: "Die Bewertung sperrt den Artikel nicht. eBay-Pflichtangaben und rechtliche Angaben müssen vor dem manuellen Einstellen vollständig sein.",
  };

  if (readiness.state === "unrated") {
    return {
      ...common,
      key: "unrated",
      cls: "info",
      label: "⚪ Noch nicht bewertet",
      text: "Noch keine belastbaren Bewertungsdaten. Bearbeiten und Listing vorbereiten bleiben möglich.",
    };
  }

  if (readiness.state === "incomplete") {
    return {
      ...common,
      key: "incomplete",
      cls: "info",
      label: "🔵 Unvollständig",
      text: readiness.missingLabels.length
        ? `Für eine belastbare Bewertung fehlen: ${readiness.missingLabels.join(", ")}. Bearbeiten und Listing vorbereiten bleiben möglich.`
        : "Produktdaten sind noch unvollständig. Bearbeiten und Listing vorbereiten bleiben möglich.",
    };
  }

  const key = statusKey(scoredStatus);
  if (key === "go") {
    return {
      ...common,
      ...scoredStatus,
      key: "go",
      cls: "good",
      label: "🟢 Guter Kandidat",
      text: "Die Kennzahlen wirken grundsätzlich geeignet. Angaben vor dem Einstellen trotzdem kontrollieren.",
    };
  }

  if (key === "no") {
    return {
      ...common,
      ...scoredStatus,
      key: "no",
      cls: "bad",
      label: "🔴 Rechnerisch schwach",
      text: "Der Score warnt vor Marge, Nachfrage, Lieferzeit oder Risiko. Das ist eine Empfehlung und keine technische Sperre.",
    };
  }

  return {
    ...common,
    ...scoredStatus,
    key: "test",
    cls: "warn",
    label: "🟡 Weiter prüfen",
    text: "Die Daten sind vollständig, aber die Entscheidung ist noch nicht eindeutig. Bewusst prüfen oder klein testen.",
  };
}
