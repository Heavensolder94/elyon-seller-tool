const STRUCTURE_VERSION = 2;
const MAIN_AGENT_ID = "elyon-manager";

const AGENT_STRUCTURE = Object.freeze({
  [MAIN_AGENT_ID]: Object.freeze({
    id: MAIN_AGENT_ID,
    name: "Elyon Manager",
    type: "manager",
    icon: "🧠",
    phase: 0,
    backendAgentId: "elyon-operations-manager",
    defaultProvider: "deepseek",
    role: "Steuert den gesamten Seller-Workflow, verteilt interne Aufgaben, erkennt Blocker und legt Raoul die nächste Entscheidung vor.",
    capabilities: [
      "Workflowstatus bewerten",
      "Fachagenten in sinnvoller Reihenfolge empfehlen",
      "Blocker und Widersprüche zusammenführen",
      "Freigaben und nächste Schritte bündeln",
      "Tages- und Prozessbriefings erstellen",
    ],
  }),
  "elyon-product-data-specialist": Object.freeze({
    id: "elyon-product-data-specialist",
    name: "Product Data Specialist",
    type: "specialist",
    icon: "🧩",
    phase: 1,
    backendAgentId: "elyon-product-data-checker",
    defaultProvider: "local",
    role: "Prüft Produktdaten, Varianten, Bilder, Lieferantenangaben und die technische Prozessreife.",
  }),
  "elyon-compliance-specialist": Object.freeze({
    id: "elyon-compliance-specialist",
    name: "Compliance Guard",
    type: "specialist",
    icon: "🛡️",
    phase: 1,
    backendAgentId: "elyon-compliance-guard",
    defaultProvider: "deepseek",
    role: "Prüft GPSR, Hersteller, EU-Verantwortlichen, CE, Pflichtangaben sowie Marken- und VeRO-Risiken.",
  }),
  "elyon-profit-specialist": Object.freeze({
    id: "elyon-profit-specialist",
    name: "Profit Analyst",
    type: "specialist",
    icon: "📊",
    phase: 1,
    backendAgentId: "elyon-profit-analyst",
    defaultProvider: "openai",
    role: "Berechnet Kosten, Gewinn, Marge, Break-even, Reserven und sichere Preisszenarien.",
  }),
  "elyon-listing-specialist": Object.freeze({
    id: "elyon-listing-specialist",
    name: "Listing Specialist",
    type: "specialist",
    icon: "✍️",
    phase: 2,
    backendAgentId: "elyon-listing-pro",
    defaultProvider: "deepseek",
    role: "Erstellt Titel, Beschreibung, SEO, Artikelmerkmale und Variantenbezeichnungen aus belegten Fakten.",
  }),
  "elyon-draft-quality-guard": Object.freeze({
    id: "elyon-draft-quality-guard",
    name: "Draft Quality Guard",
    type: "specialist",
    icon: "🔎",
    phase: 2,
    backendAgentId: "elyon-draft-quality-guard",
    defaultProvider: "local",
    role: "Kontrolliert den fertigen eBay-Entwurf vor der manuellen Freigabe auf Qualität und Widersprüche.",
  }),
  "elyon-order-specialist": Object.freeze({
    id: "elyon-order-specialist",
    name: "Order Coordinator",
    type: "specialist",
    icon: "📦",
    phase: 3,
    backendAgentId: "elyon-order-coordinator",
    defaultProvider: "deepseek",
    role: "Überwacht Bestellungen, Versandfristen, Tracking-Lücken, Verzögerungen und Lieferantenrisiken.",
  }),
  "elyon-customer-support-specialist": Object.freeze({
    id: "elyon-customer-support-specialist",
    name: "Customer Support Specialist",
    type: "specialist",
    icon: "💬",
    phase: 3,
    backendAgentId: "elyon-support-assistant",
    defaultProvider: "openai",
    role: "Erstellt ausschließlich freigabepflichtige Kundenantworten für Fragen, Reklamationen und Retouren.",
  }),
});

const LEGACY_TO_V2 = Object.freeze({
  "elyon-operations-manager": MAIN_AGENT_ID,
  "soul-operations": MAIN_AGENT_ID,
  "elyon-product-data-checker": "elyon-product-data-specialist",
  "soul-scout": "elyon-product-data-specialist",
  "elyon-compliance-guard": "elyon-compliance-specialist",
  "soul-guard": "elyon-compliance-specialist",
  "elyon-profit-analyst": "elyon-profit-specialist",
  "soul-finance": "elyon-profit-specialist",
  "elyon-listing-pro": "elyon-listing-specialist",
  "soul-seo": "elyon-listing-specialist",
  "elyon-order-coordinator": "elyon-order-specialist",
  "elyon-support-assistant": "elyon-customer-support-specialist",
  "soul-support": "elyon-customer-support-specialist",
});

const PRODUCT_WORKFLOW = Object.freeze([
  "elyon-product-data-specialist",
  "elyon-compliance-specialist",
  "elyon-profit-specialist",
  "elyon-listing-specialist",
  "elyon-draft-quality-guard",
]);

const OPERATIONS_WORKFLOW = Object.freeze([
  "elyon-order-specialist",
  "elyon-customer-support-specialist",
]);

const EXTERNAL_ACTIONS_LOCKED = Object.freeze([
  "publish_listing",
  "change_live_price",
  "place_supplier_order",
  "send_customer_message",
  "issue_refund",
  "delete_product",
  "change_legal_data",
]);

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 2000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(typeof value === "string" ? value.replace(",", ".") : value);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonicalV2AgentId(value) {
  const id = text(value, 100).toLowerCase();
  if (AGENT_STRUCTURE[id]) return id;
  return LEGACY_TO_V2[id] || "";
}

function listAgentStructure() {
  return Object.values(AGENT_STRUCTURE).map((agent) => ({ ...agent }));
}

function backendAgentId(value) {
  const id = canonicalV2AgentId(value);
  return id ? AGENT_STRUCTURE[id].backendAgentId : "";
}

function latestTasksByAgent(tasks = []) {
  const map = new Map();
  for (const task of Array.isArray(tasks) ? tasks : []) {
    const id = canonicalV2AgentId(task?.agentId);
    if (!id || map.has(id)) continue;
    map.set(id, task);
  }
  return map;
}

function taskOutcome(task) {
  if (!task) return "pending";
  const taskStatus = text(task.status, 100).toLowerCase();
  const resultStatus = text(task.result?.status, 100).toLowerCase();
  if (["failed", "blocked", "rejected"].includes(taskStatus) || resultStatus === "blocked") return "blocked";
  if (["approved", "completed"].includes(taskStatus) || resultStatus === "passed") return "completed";
  if (["approval_required", "draft_ready"].includes(taskStatus) || ["warning", "manualreviewrequired"].includes(resultStatus)) return "review";
  if (["queued", "analyzing"].includes(taskStatus)) return "running";
  return "pending";
}

function productSnapshot(input = {}) {
  const root = plainObject(input);
  const product = plainObject(root.product || root.selectedProduct || root.context?.product || root);
  const listing = plainObject(root.listingDraft || product.listingDraft || product.listing?.draft || product.listing);
  return {
    product,
    listing,
    title: text(product.title || product.name || listing.title, 500),
    category: text(product.category || product.ebayCategoryName || listing.category, 300),
    purchasePrice: finiteNumber(product.purchasePrice ?? product.costPrice ?? product.buyPrice),
    sellingPrice: finiteNumber(product.sellingPrice ?? product.salePrice ?? listing.price ?? product.price),
    images: Array.isArray(product.images) ? product.images : Array.isArray(root.images) ? root.images : [],
    variants: Array.isArray(product.variants) ? product.variants : Array.isArray(root.variants) ? root.variants : [],
    productFacts: plainObject(product.productFacts || product.facts || product.specifications),
    manufacturer: plainObject(product.manufacturer || product.compliance?.manufacturer),
    gpsr: plainObject(product.gpsr || product.compliance?.gpsr),
    companyOsApproval: plainObject(product.companyOsApproval || product.approval),
  };
}

function readinessFindings(input = {}) {
  const snapshot = productSnapshot(input);
  const blockers = [];
  const warnings = [];
  if (!snapshot.title) blockers.push("Produkttitel fehlt.");
  if (!snapshot.category) warnings.push("eBay-Kategorie ist noch nicht eindeutig dokumentiert.");
  if (!snapshot.images.length) warnings.push("Es sind keine Produktbilder dokumentiert.");
  if (snapshot.purchasePrice === null) blockers.push("Einkaufspreis fehlt.");
  if (snapshot.sellingPrice === null) warnings.push("Verkaufspreis fehlt.");
  if (!Object.keys(snapshot.productFacts).length) warnings.push("Produktmerkmale sind noch unvollständig.");
  const approvalStatus = text(snapshot.companyOsApproval.status, 100).toLowerCase();
  const approved = snapshot.companyOsApproval.approved === true || ["approved", "ready_for_seller_tool", "bereit_manuell_einstellen"].includes(approvalStatus);
  if (!approved) warnings.push("Company-OS-Freigabe ist nicht eindeutig dokumentiert.");
  return { snapshot, blockers, warnings };
}

function assessWorkflow(input = {}) {
  const source = plainObject(input);
  const tasks = Array.isArray(source.tasks) ? source.tasks : [];
  const latest = latestTasksByAgent(tasks);
  const readiness = readinessFindings(source.context || source.input || source);
  const steps = PRODUCT_WORKFLOW.map((agentId, index) => {
    const task = latest.get(agentId);
    let outcome = taskOutcome(task);
    if (index === 0 && outcome === "pending") {
      outcome = readiness.blockers.length ? "blocked" : readiness.warnings.length ? "review" : "pending";
    }
    return {
      agentId,
      name: AGENT_STRUCTURE[agentId].name,
      order: index + 1,
      outcome,
      taskId: text(task?.id, 200),
      summary: text(task?.result?.summary || task?.errors?.[0] || "", 1000),
    };
  });

  const firstBlocked = steps.find((step) => step.outcome === "blocked");
  let nextStep = null;
  if (!firstBlocked) {
    nextStep = steps.find((step) => !["completed", "review", "running"].includes(step.outcome)) || null;
  }
  const pendingReview = steps.find((step) => step.outcome === "review") || null;
  const running = steps.find((step) => step.outcome === "running") || null;
  const allCompleted = steps.every((step) => step.outcome === "completed");
  const blockers = [...readiness.blockers];
  if (firstBlocked?.summary) blockers.push(firstBlocked.summary);
  if (firstBlocked && !blockers.length) blockers.push(`${firstBlocked.name} hat den Workflow blockiert.`);

  let status = "ready";
  let summary = "Der Produktworkflow ist bereit. Der nächste Fachagent kann gestartet werden.";
  if (allCompleted) {
    status = "manual_approval_required";
    summary = "Alle Fachprüfungen sind abgeschlossen. Der eBay-Entwurf benötigt jetzt deine manuelle Freigabe.";
  } else if (firstBlocked || readiness.blockers.length) {
    status = "blocked";
    summary = "Der Produktworkflow ist blockiert. Fehlende oder widersprüchliche Angaben müssen zuerst geklärt werden.";
  } else if (pendingReview) {
    status = "manual_review_required";
    summary = `${pendingReview.name} wartet auf deine Prüfung oder Freigabe.`;
  } else if (running) {
    status = "running";
    summary = `${running.name} bearbeitet aktuell den nächsten internen Schritt.`;
  }

  return {
    version: STRUCTURE_VERSION,
    managerAgentId: MAIN_AGENT_ID,
    status,
    summary,
    nextAgentId: nextStep?.agentId || "",
    nextAgentName: nextStep?.name || "",
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(readiness.warnings)),
    productWorkflow: steps,
    operationsWorkflow: OPERATIONS_WORKFLOW.map((agentId, index) => ({
      agentId,
      name: AGENT_STRUCTURE[agentId].name,
      order: index + 1,
      outcome: taskOutcome(latest.get(agentId)),
    })),
    requiresManualApproval: true,
    automaticDelegationAllowed: true,
    automaticExternalActions: false,
    externalActionsLocked: [...EXTERNAL_ACTIONS_LOCKED],
  };
}

function evaluateDraftQuality(input = {}) {
  const source = plainObject(input);
  const readiness = readinessFindings(source);
  const { snapshot } = readiness;
  const listing = snapshot.listing;
  const title = text(listing.title || snapshot.title, 500);
  const description = text(listing.description || listing.longDescription || listing.shortDescription, 30000);
  const aspects = plainObject(listing.aspects || snapshot.product.ebayAspects || snapshot.product.aspects);
  const supplierTextPattern = /(aliexpress|temu|dropshipping|supplier price|wholesale)/i;
  const checks = [
    { id: "title", label: "Titel vorhanden", passed: Boolean(title), severity: "blocker" },
    { id: "title_length", label: "Titel maximal 80 Zeichen", passed: Boolean(title) && title.length <= 80, severity: "blocker", detail: title ? `${title.length} Zeichen` : "Titel fehlt" },
    { id: "category", label: "eBay-Kategorie vorhanden", passed: Boolean(snapshot.category), severity: "blocker" },
    { id: "price", label: "Verkaufspreis vorhanden", passed: snapshot.sellingPrice !== null, severity: "blocker" },
    { id: "description", label: "Beschreibung vorhanden", passed: Boolean(description), severity: "review" },
    { id: "images", label: "Mindestens ein Bild vorhanden", passed: snapshot.images.length > 0, severity: "review" },
    { id: "aspects", label: "Artikelmerkmale vorhanden", passed: Object.keys(aspects).length > 0, severity: "review" },
    { id: "supplier_text", label: "Keine sichtbaren Lieferantenreste", passed: !supplierTextPattern.test(`${title} ${description}`), severity: "blocker" },
    { id: "manufacturer", label: "Herstellerangaben dokumentiert", passed: Object.keys(snapshot.manufacturer).length > 0, severity: "review" },
    { id: "gpsr", label: "GPSR-Status dokumentiert", passed: Object.keys(snapshot.gpsr).length > 0, severity: "review" },
  ];
  const blockers = checks.filter((check) => !check.passed && check.severity === "blocker").map((check) => check.label);
  const warnings = checks.filter((check) => !check.passed && check.severity === "review").map((check) => check.label);
  const status = blockers.length ? "blocked" : warnings.length ? "manualReviewRequired" : "passed";
  return {
    summary: blockers.length
      ? "Der eBay-Entwurf ist noch nicht freigabefähig. Kritische Qualitätsprüfungen sind fehlgeschlagen."
      : warnings.length
        ? "Der eBay-Entwurf benötigt vor der Freigabe noch eine manuelle Qualitätsprüfung."
        : "Der eBay-Entwurf hat die technische Qualitätsprüfung bestanden und wartet auf deine manuelle Freigabe.",
    status,
    confidence: blockers.length ? 0.95 : warnings.length ? 0.8 : 0.95,
    findings: checks.filter((check) => check.passed).map((check) => check.detail ? `${check.label}: ${check.detail}` : check.label),
    recommendations: [...blockers, ...warnings].map((label) => `${label} prüfen und korrigieren.`),
    missingFacts: [],
    warnings,
    blockers,
    suggestedActions: blockers.length || warnings.length ? ["Entwurf korrigieren und Draft Quality Guard erneut ausführen."] : ["Entwurf manuell prüfen und freigeben."],
    generatedContent: { qualityChecks: checks },
    assumptions: [],
  };
}

export {
  AGENT_STRUCTURE,
  EXTERNAL_ACTIONS_LOCKED,
  LEGACY_TO_V2,
  MAIN_AGENT_ID,
  OPERATIONS_WORKFLOW,
  PRODUCT_WORKFLOW,
  STRUCTURE_VERSION,
  assessWorkflow,
  backendAgentId,
  canonicalV2AgentId,
  evaluateDraftQuality,
  listAgentStructure,
  readinessFindings,
};