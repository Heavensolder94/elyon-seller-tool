const AGENT_RESULT_STATUSES = new Set([
  "passed",
  "warning",
  "blocked",
  "manualReviewRequired",
]);

const TASK_STATUSES = new Set([
  "queued",
  "analyzing",
  "draft_ready",
  "approval_required",
  "approved",
  "rejected",
  "completed",
  "failed",
  "blocked",
]);

const PRIORITIES = new Set(["low", "medium", "high", "critical"]);
const SUPPORTED_PROVIDERS = new Set(["openai", "deepseek", "local"]);

const LEGACY_AGENT_ID_MAP = Object.freeze({
  "soul-seo": "elyon-listing-pro",
  "soul-guard": "elyon-compliance-guard",
  "soul-finance": "elyon-profit-analyst",
  "soul-operations": "elyon-operations-manager",
  "soul-support": "elyon-support-assistant",
  "soul-scout": "elyon-product-data-checker",
});

const AGENT_DEFINITIONS = Object.freeze({
  "elyon-listing-pro": Object.freeze({
    id: "elyon-listing-pro",
    name: "Elyon Listing Pro",
    phase: 1,
    role: "Erstellt faktengebundene eBay-Listing-Entwürfe und SEO-Verbesserungen.",
    defaultProvider: "deepseek",
    actions: ["run_agent", "analyze_product", "analyze_listing", "retry_task"],
    capabilities: [
      "Titel optimieren",
      "Untertitel vorschlagen",
      "Beschreibung erstellen",
      "Produktvorteile strukturieren",
      "SEO und Zeichenlängen prüfen",
    ],
  }),
  "elyon-compliance-guard": Object.freeze({
    id: "elyon-compliance-guard",
    name: "Elyon Compliance Guard",
    phase: 1,
    role: "Prüft Produkt- und Listingdaten auf belegbare Compliance-Risiken und Freigabeblocker.",
    defaultProvider: "deepseek",
    actions: ["run_agent", "analyze_product", "analyze_listing", "retry_task"],
    capabilities: [
      "GPSR-Vollständigkeit prüfen",
      "Herstellerdaten prüfen",
      "Pflichtmerkmale prüfen",
      "VeRO- und Markenrisiken markieren",
      "manuelle Prüfung anfordern",
    ],
  }),
  "elyon-profit-analyst": Object.freeze({
    id: "elyon-profit-analyst",
    name: "Elyon Profit Analyst",
    phase: 1,
    role: "Berechnet Gewinn, Marge, Break-even und Preisszenarien aus belegten Kostendaten.",
    defaultProvider: "openai",
    actions: ["run_agent", "analyze_product", "retry_task"],
    capabilities: [
      "Gewinn berechnen",
      "Marge berechnen",
      "Break-even ermitteln",
      "Preisszenarien vergleichen",
      "Elyon-Mindestregel prüfen",
    ],
  }),
  "elyon-operations-manager": Object.freeze({
    id: "elyon-operations-manager",
    name: "Elyon Operations Manager",
    phase: 2,
    role: "Fasst offene Seller-Aufgaben zusammen und erstellt ein priorisiertes Arbeitsbriefing.",
    defaultProvider: "deepseek",
    actions: ["run_agent", "create_daily_briefing", "retry_task"],
    capabilities: [
      "Blocker zusammenfassen",
      "Tagesprioritäten setzen",
      "offene Orders markieren",
      "fehlendes Tracking erkennen",
      "Agentenergebnisse bündeln",
    ],
  }),
  "elyon-order-coordinator": Object.freeze({
    id: "elyon-order-coordinator",
    name: "Elyon Order Coordinator",
    phase: 3,
    role: "Analysiert Bestellungen und erstellt sichere Fulfillment-Checklisten.",
    defaultProvider: "deepseek",
    actions: ["run_agent", "analyze_order", "retry_task"],
    capabilities: [
      "Bestelldaten prüfen",
      "Versandfristen überwachen",
      "Tracking-Lücken markieren",
      "Lieferanten-Checkliste erstellen",
      "Verzögerungen erkennen",
    ],
  }),
  "elyon-support-assistant": Object.freeze({
    id: "elyon-support-assistant",
    name: "Elyon Support Assistant",
    phase: 3,
    role: "Erstellt ausschließlich freigabepflichtige Antwortentwürfe für Kundenfälle.",
    defaultProvider: "openai",
    actions: ["run_agent", "analyze_return", "retry_task"],
    capabilities: [
      "Antwortentwürfe erstellen",
      "Rückgaben strukturieren",
      "Reklamationen einordnen",
      "fehlende Informationen erkennen",
      "Eskalationen markieren",
    ],
  }),
  "elyon-product-data-checker": Object.freeze({
    id: "elyon-product-data-checker",
    name: "Elyon Produktdaten-Check",
    phase: 1,
    role: "Prüft ausschließlich die Vollständigkeit bereits freigegebener Seller-Produktdaten.",
    defaultProvider: "local",
    actions: ["run_agent", "analyze_product", "retry_task"],
    capabilities: ["fehlende Produktfelder erkennen", "Company-OS-Freigabe prüfen"],
  }),
});

const ALLOWED_ACTIONS = new Set([
  "run_agent",
  "analyze_product",
  "analyze_listing",
  "analyze_order",
  "analyze_return",
  "create_daily_briefing",
  "retry_task",
]);

const EXTERNAL_ACTIONS = new Set([
  "publish_listing",
  "change_live_price",
  "place_supplier_order",
  "send_customer_message",
  "issue_refund",
  "delete_product",
  "change_legal_data",
]);

const FORBIDDEN_FACT_FIELDS = [
  "brand",
  "marke",
  "manufacturer",
  "hersteller",
  "ean",
  "mpn",
  "material",
  "dimensions",
  "masse",
  "power",
  "leistung",
  "certificates",
  "zertifikate",
  "ce",
  "gpsr",
  "packageContents",
  "lieferumfang",
  "safetyInformation",
  "sicherheitsangaben",
];

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 2000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = typeof value === "string" ? value.replace(/\s/g, "").replace(",", ".") : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max, fallback = min) {
  const parsed = finiteNumber(value);
  return parsed === null ? fallback : Math.max(min, Math.min(max, parsed));
}

function roundMoney(value) {
  return Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) / 100 : null;
}

function roundPercent(value) {
  return Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) / 100 : null;
}

function stringList(value, max = 30, itemMax = 1000) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => {
      if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
        return text(entry, itemMax);
      }
      if (entry && typeof entry === "object") {
        return text(entry.message || entry.text || entry.title || JSON.stringify(entry), itemMax);
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, max);
}

function sanitizePrimitiveObject(value, depth = 0, maxDepth = 4) {
  if (depth > maxDepth) return undefined;
  if (value === null) return null;
  if (["string", "number", "boolean"].includes(typeof value)) {
    return typeof value === "string" ? text(value, 12000) : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 60).map((entry) => sanitizePrimitiveObject(entry, depth + 1, maxDepth)).filter((entry) => entry !== undefined);
  }
  if (!value || typeof value !== "object") return undefined;
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 80)
      .map(([key, entry]) => [text(key, 100), sanitizePrimitiveObject(entry, depth + 1, maxDepth)])
      .filter(([key, entry]) => key && entry !== undefined)
  );
}

function canonicalAgentId(value) {
  const id = text(value, 100).toLowerCase();
  if (AGENT_DEFINITIONS[id]) return id;
  return LEGACY_AGENT_ID_MAP[id] || "";
}

function getAgentDefinition(value) {
  const id = canonicalAgentId(value);
  return id ? AGENT_DEFINITIONS[id] : null;
}

function listAgentDefinitions() {
  return Object.values(AGENT_DEFINITIONS).map((definition) => ({
    ...definition,
    actions: definition.actions.slice(),
    capabilities: definition.capabilities.slice(),
  }));
}

function isActionAllowed(action, agentId) {
  const normalizedAction = text(action, 100);
  if (!ALLOWED_ACTIONS.has(normalizedAction) || EXTERNAL_ACTIONS.has(normalizedAction)) return false;
  const definition = getAgentDefinition(agentId);
  return Boolean(definition && definition.actions.includes(normalizedAction));
}

function readFirst(source, names) {
  for (const name of names) {
    const value = source?.[name];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function pickObject(source, allowedKeys, maxText = 5000) {
  const input = plainObject(source);
  const output = {};
  for (const key of allowedKeys) {
    if (!(key in input)) continue;
    const value = input[key];
    if (typeof value === "string") output[key] = text(value, maxText);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) output[key] = value;
    else output[key] = sanitizePrimitiveObject(value);
  }
  return output;
}

function sanitizeVariants(value) {
  return (Array.isArray(value) ? value : []).slice(0, 60).map((entry) => {
    const item = plainObject(entry);
    return pickObject(item, ["id", "sku", "name", "title", "options", "attributes", "price", "cost", "stock", "available", "image"], 1000);
  });
}

function sanitizeImages(value) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => typeof entry === "string" ? text(entry, 2000) : text(entry?.url || entry?.src || entry?.image, 2000))
    .filter((url) => /^https:\/\//i.test(url))
    .slice(0, 12);
}

function buildProductContext(input = {}) {
  const root = plainObject(input);
  const product = plainObject(root.product || root.context || root.source || root);
  const listingDraft = plainObject(root.listingDraft || root.draft || product.listingDraft || product.listing?.draft || product.listing);
  const productFacts = plainObject(root.productFacts || product.productFacts || product.facts || product.specifications || product.specs);
  const gpsr = plainObject(root.gpsr || product.gpsr || product.compliance?.gpsr);
  const manufacturer = plainObject(root.manufacturer || product.manufacturer || product.compliance?.manufacturer);
  const responsiblePerson = plainObject(root.responsiblePerson || product.responsiblePerson || product.compliance?.responsiblePerson);

  return {
    productId: text(readFirst(product, ["productId", "id", "sku", "sourceId"]), 200),
    title: text(readFirst(product, ["title", "name", "productName"]), 500),
    category: text(readFirst(product, ["category", "categoryName", "ebayCategoryName"]), 300),
    supplier: pickObject(plainObject(product.supplier || root.supplier), ["id", "name", "platform", "country", "productUrl"], 1000),
    brand: text(readFirst(product, ["brand", "marke"]), 200),
    ean: text(readFirst(product, ["ean", "gtin", "barcode"]), 100),
    mpn: text(readFirst(product, ["mpn", "manufacturerPartNumber"]), 100),
    purchasePrice: finiteNumber(readFirst(product, ["purchasePrice", "costPrice", "buyPrice", "ekPrice", "pricePurchase"])),
    shippingCost: finiteNumber(readFirst(product, ["shippingCost", "supplierShipping", "deliveryCost"])),
    sellingPrice: finiteNumber(readFirst(product, ["sellingPrice", "salePrice", "price", "ebayPrice"])),
    ebayFeePercent: finiteNumber(readFirst(product, ["ebayFeePercent", "platformFeePercent", "feePercent"])),
    paymentFee: finiteNumber(readFirst(product, ["paymentFee", "paymentCost"])),
    otherCosts: finiteNumber(readFirst(product, ["otherCosts", "additionalCosts", "operatingCostAllocation"])),
    expectedReturnRatePercent: finiteNumber(readFirst(product, ["expectedReturnRatePercent", "returnRatePercent"])),
    returnCost: finiteNumber(readFirst(product, ["returnCost", "expectedReturnCost"])),
    productFacts: sanitizePrimitiveObject(productFacts),
    variants: sanitizeVariants(root.variants || product.variants),
    images: sanitizeImages(root.images || product.images),
    listingDraft: pickObject(listingDraft, [
      "title", "subtitle", "shortDescription", "longDescription", "description", "features", "specs",
      "packageContents", "importantNotes", "shippingText", "returnsText", "serviceText", "keywords",
      "category", "condition", "aspects", "price", "quantity",
    ], 20000),
    gpsr: pickObject(gpsr, ["status", "required", "manufacturer", "responsiblePerson", "warnings", "safetyInformation", "exception", "exceptionReason"], 5000),
    manufacturer: pickObject(manufacturer, ["name", "country", "address", "email", "website", "documented", "source"], 2000),
    responsiblePerson: pickObject(responsiblePerson, ["name", "country", "address", "email", "website", "documented", "source"], 2000),
    safetyInformation: sanitizePrimitiveObject(root.safetyInformation || product.safetyInformation || product.safety || product.warnings),
    ebayCategory: pickObject(plainObject(root.ebayCategory || product.ebayCategory), ["id", "name", "marketplace"], 1000),
    ebayAspects: sanitizePrimitiveObject(root.ebayAspects || product.ebayAspects || product.aspects),
    companyOsApproval: pickObject(plainObject(root.companyOsApproval || product.companyOsApproval || product.approval), ["status", "approved", "approvedAt", "source", "blockers"], 2000),
  };
}

function buildOrderContext(input = {}) {
  const root = plainObject(input);
  const order = plainObject(root.order || root.context || root.source || root);
  return {
    orderId: text(readFirst(order, ["orderId", "id", "ebayOrderId"]), 200),
    orderDate: text(readFirst(order, ["orderDate", "createdAt", "date"]), 100),
    buyerCountry: text(readFirst(order, ["buyerCountry", "shipToCountry", "country"]), 100),
    items: (Array.isArray(order.items) ? order.items : []).slice(0, 50).map((item) => pickObject(plainObject(item), ["itemId", "productId", "sku", "title", "quantity", "price", "supplier", "variant"], 1000)),
    paidStatus: text(readFirst(order, ["paidStatus", "paymentStatus"]), 100),
    supplier: pickObject(plainObject(order.supplier), ["id", "name", "platform", "country", "orderReference"], 1000),
    fulfillmentStatus: text(readFirst(order, ["fulfillmentStatus", "status"]), 100),
    shippingDeadline: text(readFirst(order, ["shippingDeadline", "shipByDate"]), 100),
    trackingNumber: text(readFirst(order, ["trackingNumber", "tracking"]), 300),
    deliveryEstimate: text(readFirst(order, ["deliveryEstimate", "estimatedDelivery"]), 200),
  };
}

function buildReturnContext(input = {}) {
  const root = plainObject(input);
  const returnCase = plainObject(root.returnCase || root.return || root.context || root.source || root);
  return {
    returnId: text(readFirst(returnCase, ["returnId", "id", "caseId"]), 200),
    orderId: text(readFirst(returnCase, ["orderId", "ebayOrderId"]), 200),
    status: text(readFirst(returnCase, ["status", "state"]), 100),
    reason: text(readFirst(returnCase, ["reason", "returnReason"]), 2000),
    customerMessage: text(readFirst(returnCase, ["customerMessage", "message", "description"]), 6000),
    requestedResolution: text(readFirst(returnCase, ["requestedResolution", "resolution"]), 500),
    item: pickObject(plainObject(returnCase.item || returnCase.product), ["productId", "sku", "title", "quantity", "price", "variant"], 1000),
    deadlines: sanitizePrimitiveObject(returnCase.deadlines),
    trackingNumber: text(readFirst(returnCase, ["trackingNumber", "tracking"]), 300),
  };
}

function buildOperationsContext(input = {}) {
  const root = plainObject(input.context || input);
  const collectionSummary = (value) => {
    const list = Array.isArray(value) ? value : [];
    return {
      count: list.length,
      open: list.filter((item) => !["done", "completed", "closed", "delivered", "refunded"].includes(text(item?.status, 100).toLowerCase())).length,
      sample: list.slice(0, 20).map((item) => pickObject(plainObject(item), ["id", "productId", "orderId", "title", "status", "priority", "deadline", "trackingNumber", "blockers", "updatedAt"], 1000)),
    };
  };
  return {
    products: collectionSummary(root.products),
    orders: collectionSummary(root.orders || root.sales),
    returns: collectionSummary(root.returns),
    invoices: collectionSummary(root.invoices),
    tasks: collectionSummary(root.tasks),
    agentResults: collectionSummary(root.agentResults),
  };
}

function buildContextPacket(agentId, input = {}) {
  const id = canonicalAgentId(agentId);
  if (["elyon-listing-pro", "elyon-compliance-guard", "elyon-profit-analyst", "elyon-product-data-checker"].includes(id)) {
    return buildProductContext(input);
  }
  if (id === "elyon-order-coordinator") return buildOrderContext(input);
  if (id === "elyon-support-assistant") return buildReturnContext(input);
  if (id === "elyon-operations-manager") return buildOperationsContext(input);
  return {};
}

function hasValue(value) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function productFactValue(context, field) {
  const aliases = {
    manufacturer: [context.manufacturer, context.productFacts?.manufacturer, context.productFacts?.hersteller],
    hersteller: [context.manufacturer, context.productFacts?.manufacturer, context.productFacts?.hersteller],
    gpsr: [context.gpsr],
    safetyInformation: [context.safetyInformation, context.gpsr?.safetyInformation],
    sicherheitsangaben: [context.safetyInformation, context.gpsr?.safetyInformation],
    packageContents: [context.listingDraft?.packageContents, context.productFacts?.packageContents, context.productFacts?.lieferumfang],
    lieferumfang: [context.listingDraft?.packageContents, context.productFacts?.packageContents, context.productFacts?.lieferumfang],
    brand: [context.brand, context.productFacts?.brand, context.productFacts?.marke],
    marke: [context.brand, context.productFacts?.brand, context.productFacts?.marke],
    ean: [context.ean, context.productFacts?.ean, context.productFacts?.gtin],
    mpn: [context.mpn, context.productFacts?.mpn],
    material: [context.productFacts?.material],
    dimensions: [context.productFacts?.dimensions, context.productFacts?.masse, context.productFacts?.dimensionsCm],
    masse: [context.productFacts?.dimensions, context.productFacts?.masse, context.productFacts?.dimensionsCm],
    power: [context.productFacts?.power, context.productFacts?.leistung],
    leistung: [context.productFacts?.power, context.productFacts?.leistung],
    certificates: [context.productFacts?.certificates, context.productFacts?.zertifikate],
    zertifikate: [context.productFacts?.certificates, context.productFacts?.zertifikate],
    ce: [context.productFacts?.ce, context.productFacts?.ceConformity],
  };
  return (aliases[field] || []).find(hasValue);
}

function sanitizeGeneratedContent(value) {
  const result = sanitizePrimitiveObject(plainObject(value), 0, 5);
  return plainObject(result);
}

function sanitizeAgentResult(value = {}, options = {}) {
  const source = plainObject(value);
  const context = plainObject(options.context);
  const agentId = canonicalAgentId(options.agentId);
  const missingFacts = stringList(source.missingFacts, 40, 500);
  const warnings = stringList(source.warnings, 40, 1000);
  const blockers = stringList(source.blockers, 40, 1000);
  const generatedContent = sanitizeGeneratedContent(source.generatedContent);

  for (const forbiddenField of FORBIDDEN_FACT_FIELDS) {
    if (!(forbiddenField in generatedContent)) continue;
    if (!hasValue(productFactValue(context, forbiddenField))) {
      delete generatedContent[forbiddenField];
      if (!missingFacts.includes(forbiddenField)) missingFacts.push(forbiddenField);
      warnings.push(`Unbelegte Angabe entfernt: ${forbiddenField}.`);
    }
  }

  let status = AGENT_RESULT_STATUSES.has(source.status) ? source.status : "manualReviewRequired";
  if (agentId === "elyon-compliance-guard") {
    const approvalStatus = text(context.companyOsApproval?.status, 100).toLowerCase();
    const approved = context.companyOsApproval?.approved === true || ["ready_for_seller_tool", "bereit_manuell_einstellen", "approved"].includes(approvalStatus);
    if (!approved) blockers.push("Company-OS-Freigabe fehlt oder ist nicht eindeutig dokumentiert.");
    if (!hasValue(context.manufacturer)) missingFacts.push("Herstellerangaben");
    if (!hasValue(context.gpsr)) missingFacts.push("GPSR-Status");
    if (blockers.length) status = "blocked";
    else if (missingFacts.length && status === "passed") status = "manualReviewRequired";
  }

  return {
    summary: text(source.summary, 4000),
    status,
    confidence: clamp(source.confidence, 0, 1, 0),
    findings: stringList(source.findings, 50, 1500),
    recommendations: stringList(source.recommendations, 50, 1500),
    missingFacts: Array.from(new Set(missingFacts)).slice(0, 50),
    warnings: Array.from(new Set(warnings)).slice(0, 50),
    blockers: Array.from(new Set(blockers)).slice(0, 50),
    suggestedActions: stringList(source.suggestedActions, 50, 1500),
    generatedContent,
    assumptions: stringList(source.assumptions, 50, 1000),
  };
}

function parseStructuredAgentResponse(content, options = {}) {
  const raw = text(content, 100000).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("KI-Antwort enthält kein valides JSON-Objekt.");
    parsed = JSON.parse(raw.slice(start, end + 1));
  }
  return sanitizeAgentResult(parsed, options);
}

function calculateProfitAnalysis(context = {}) {
  const input = plainObject(context);
  const assumptions = [];
  const purchasePrice = finiteNumber(input.purchasePrice);
  const shippingCost = finiteNumber(input.shippingCost);
  const sellingPrice = finiteNumber(input.sellingPrice);
  const ebayFeePercent = finiteNumber(input.ebayFeePercent);
  const paymentFee = finiteNumber(input.paymentFee);
  const otherCosts = finiteNumber(input.otherCosts);
  const expectedReturnRatePercent = finiteNumber(input.expectedReturnRatePercent);
  const returnCost = finiteNumber(input.returnCost);

  if (purchasePrice === null) assumptions.push("Einkaufspreis fehlt; eine belastbare Gewinnberechnung ist nicht möglich.");
  if (sellingPrice === null) assumptions.push("Verkaufspreis fehlt; eine belastbare Gewinnberechnung ist nicht möglich.");
  if (shippingCost === null) assumptions.push("Lieferkosten fehlen und werden nicht geschätzt.");
  if (ebayFeePercent === null) assumptions.push("eBay-Gebühr fehlt und wird nicht geschätzt.");
  if (paymentFee === null) assumptions.push("Zahlungsgebühr fehlt und wird nicht geschätzt.");
  if (otherCosts === null) assumptions.push("Weitere Kosten fehlen und werden nicht geschätzt.");
  if (expectedReturnRatePercent === null || returnCost === null) assumptions.push("Retourenrisiko ist nicht vollständig belegt und wird nicht eingerechnet.");

  const requiredInputsPresent = purchasePrice !== null && sellingPrice !== null;
  const fixedCosts = (purchasePrice ?? 0) + (shippingCost ?? 0) + (paymentFee ?? 0) + (otherCosts ?? 0);
  const platformFee = sellingPrice === null || ebayFeePercent === null ? 0 : sellingPrice * (ebayFeePercent / 100);
  const expectedReturnCost = expectedReturnRatePercent === null || returnCost === null ? 0 : returnCost * (expectedReturnRatePercent / 100);
  const totalCosts = fixedCosts + platformFee + expectedReturnCost;
  const profit = sellingPrice === null ? null : sellingPrice - totalCosts;
  const marginPercent = sellingPrice && profit !== null ? (profit / sellingPrice) * 100 : null;
  const feeRate = ebayFeePercent === null ? 0 : ebayFeePercent / 100;
  const breakEvenPrice = feeRate >= 1 ? null : fixedCosts + expectedReturnCost > 0 ? (fixedCosts + expectedReturnCost) / (1 - feeRate) : 0;
  const passesMinimum = requiredInputsPresent && ((marginPercent ?? -Infinity) >= 20 || (profit ?? -Infinity) >= 5);

  const scenarioFactors = [0.95, 1, 1.05, 1.1];
  const scenarios = sellingPrice === null ? [] : scenarioFactors.map((factor) => {
    const price = sellingPrice * factor;
    const fee = ebayFeePercent === null ? 0 : price * feeRate;
    const scenarioProfit = price - fixedCosts - fee - expectedReturnCost;
    return {
      label: factor === 1 ? "Aktueller Preis" : `${factor < 1 ? "-" : "+"}${Math.abs((factor - 1) * 100).toFixed(0)} %`,
      sellingPrice: roundMoney(price),
      profit: roundMoney(scenarioProfit),
      marginPercent: roundPercent(price ? (scenarioProfit / price) * 100 : null),
      passesMinimum: (price ? (scenarioProfit / price) * 100 : -Infinity) >= 20 || scenarioProfit >= 5,
    };
  });

  return {
    currency: "EUR",
    purchasePrice: roundMoney(purchasePrice),
    shippingCost: roundMoney(shippingCost),
    sellingPrice: roundMoney(sellingPrice),
    ebayFeePercent: roundPercent(ebayFeePercent),
    platformFee: roundMoney(platformFee),
    paymentFee: roundMoney(paymentFee),
    otherCosts: roundMoney(otherCosts),
    expectedReturnCost: roundMoney(expectedReturnCost),
    totalCosts: roundMoney(totalCosts),
    profit: roundMoney(profit),
    marginPercent: roundPercent(marginPercent),
    breakEvenPrice: roundMoney(breakEvenPrice),
    passesMinimum,
    minimumRule: "Mindestens 20 % realistische Marge ODER mindestens 5,00 EUR realistischer Gewinn.",
    scenarios,
    assumptions,
  };
}

function buildLocalFallbackResult(agentId, context = {}) {
  const id = canonicalAgentId(agentId);
  if (id === "elyon-profit-analyst") {
    const calculation = calculateProfitAnalysis(context);
    return sanitizeAgentResult({
      summary: calculation.profit === null
        ? "Die Gewinnanalyse ist wegen fehlender Pflichtwerte noch nicht belastbar."
        : `Erwarteter Gewinn: ${calculation.profit.toFixed(2)} EUR; Marge: ${calculation.marginPercent?.toFixed(2) ?? "–"} %.`,
      status: calculation.profit === null ? "manualReviewRequired" : calculation.passesMinimum ? "passed" : "blocked",
      confidence: calculation.assumptions.length ? 0.55 : 0.95,
      findings: [
        `Gesamtkosten: ${calculation.totalCosts?.toFixed(2) ?? "–"} EUR.`,
        `Break-even-Preis: ${calculation.breakEvenPrice?.toFixed(2) ?? "–"} EUR.`,
      ],
      recommendations: calculation.passesMinimum ? ["Mindestregel erfüllt; Listing kann finanziell weiter geprüft werden."] : ["Preis oder Kostenstruktur vor der Freigabe anpassen."],
      warnings: calculation.assumptions,
      blockers: calculation.passesMinimum ? [] : ["Elyon-Mindestregel ist nicht nachweislich erfüllt."],
      assumptions: calculation.assumptions,
      generatedContent: { calculation },
    }, { agentId: id, context });
  }

  if (id === "elyon-compliance-guard") {
    const missing = [];
    if (!hasValue(context.manufacturer)) missing.push("Herstellerangaben");
    if (!hasValue(context.gpsr)) missing.push("GPSR-Status");
    if (!hasValue(context.ebayCategory)) missing.push("eBay-Kategorie");
    if (!hasValue(context.ebayAspects)) missing.push("eBay-Pflichtmerkmale");
    return sanitizeAgentResult({
      summary: missing.length ? "Die Compliance-Prüfung hat offene oder unbelegte Pflichtangaben gefunden." : "Die vorhandenen Compliance-Daten sind vollständig genug für eine manuelle Endprüfung.",
      status: missing.length ? "manualReviewRequired" : "warning",
      confidence: 0.7,
      findings: missing.length ? [] : ["Hersteller-, GPSR-, Kategorie- und Merkmalsdaten sind vorhanden."],
      missingFacts: missing,
      warnings: ["Regelbasierte Vorprüfung ersetzt keine Rechtsberatung oder manuelle Dokumentenprüfung."],
      suggestedActions: missing.map((item) => `${item} mit belastbarer Quelle ergänzen.`),
    }, { agentId: id, context });
  }

  if (id === "elyon-listing-pro") {
    const missing = [];
    if (!context.title) missing.push("Produkttitel");
    if (!hasValue(context.productFacts)) missing.push("Produktmerkmale");
    return sanitizeAgentResult({
      summary: "Listing-Daten wurden lokal auf Vollständigkeit geprüft. Für Textoptimierung ist ein externer KI-Provider erforderlich.",
      status: missing.length ? "manualReviewRequired" : "warning",
      confidence: 0.5,
      findings: context.title ? [`Vorhandener Titel hat ${context.title.length} Zeichen.`] : [],
      missingFacts: missing,
      warnings: ["Kein externer KI-Text wurde erzeugt."],
      generatedContent: {},
    }, { agentId: id, context });
  }

  if (id === "elyon-order-coordinator") {
    const missing = [];
    if (!context.orderId) missing.push("Bestellnummer");
    if (!context.shippingDeadline) missing.push("Versandfrist");
    if (!context.trackingNumber) missing.push("Trackingnummer");
    return sanitizeAgentResult({
      summary: missing.length ? "Die Bestellung benötigt operative Nacharbeit." : "Die wichtigsten Bestelldaten sind dokumentiert.",
      status: missing.includes("Versandfrist") ? "manualReviewRequired" : missing.length ? "warning" : "passed",
      confidence: 0.75,
      missingFacts: missing,
      suggestedActions: missing.map((item) => `${item} prüfen und ergänzen.`),
    }, { agentId: id, context });
  }

  if (id === "elyon-support-assistant") {
    const missing = [];
    if (!context.orderId) missing.push("Bestellnummer");
    if (!context.reason) missing.push("Rückgabe- oder Reklamationsgrund");
    return sanitizeAgentResult({
      summary: "Der Supportfall wurde strukturiert. Eine Nachricht wird erst nach manueller Prüfung freigegeben.",
      status: missing.length ? "manualReviewRequired" : "warning",
      confidence: 0.65,
      missingFacts: missing,
      warnings: ["Keine Kundennachricht wurde automatisch versendet."],
      generatedContent: { messageStatus: "draft_requires_approval" },
    }, { agentId: id, context });
  }

  if (id === "elyon-operations-manager") {
    const sections = {
      critical: [],
      today: [],
      thisWeek: [],
      watch: [],
      noAction: [],
    };
    if (context.orders?.open) sections.today.push(`${context.orders.open} offene Bestellung(en) prüfen.`);
    if (context.returns?.open) sections.today.push(`${context.returns.open} offene Retoure(n) prüfen.`);
    if (context.tasks?.open) sections.thisWeek.push(`${context.tasks.open} offene Aufgabe(n) bearbeiten.`);
    if (!sections.today.length && !sections.thisWeek.length) sections.noAction.push("Keine offenen Vorgänge in den bereitgestellten Daten erkannt.");
    return sanitizeAgentResult({
      summary: "Lokales Operations-Briefing erstellt.",
      status: sections.critical.length ? "blocked" : sections.today.length ? "warning" : "passed",
      confidence: 0.7,
      findings: [...sections.critical, ...sections.today, ...sections.thisWeek],
      generatedContent: { briefing: sections },
    }, { agentId: id, context });
  }

  return sanitizeAgentResult({
    summary: "Produktdaten wurden lokal auf Vollständigkeit geprüft.",
    status: context.title ? "warning" : "manualReviewRequired",
    confidence: 0.6,
    missingFacts: context.title ? [] : ["Produkttitel"],
  }, { agentId: id, context });
}

function buildAgentMessages(agentId, action, context, options = {}) {
  const definition = getAgentDefinition(agentId);
  if (!definition) throw new Error("Unbekannter virtueller Mitarbeiter.");
  const locale = text(options.locale, 20) || "de-DE";
  const schema = {
    summary: "string",
    status: "passed | warning | blocked | manualReviewRequired",
    confidence: "number 0..1",
    findings: ["string"],
    recommendations: ["string"],
    missingFacts: ["string"],
    warnings: ["string"],
    blockers: ["string"],
    suggestedActions: ["string"],
    generatedContent: {},
    assumptions: ["string"],
  };

  const roleRules = {
    "elyon-listing-pro": "Erzeuge nur Listing-Entwürfe aus belegten Fakten. Titel maximal 80 Zeichen. Liefere mehrere Varianten nur innerhalb generatedContent. Fehlende Fakten nicht ergänzen, sondern in missingFacts nennen.",
    "elyon-compliance-guard": "Triff keine verbindliche Rechtsentscheidung. Prüfe Belege, Widersprüche, GPSR, Hersteller, verantwortliche Person, Pflichtmerkmale und Markenrisiken. Bei fehlenden Belegen niemals passed ausgeben.",
    "elyon-profit-analyst": "Nutze ausschließlich bereitgestellte Zahlen und die beigefügte deterministische Kalkulation. Jede Schätzung muss in assumptions stehen. Prüfe die Elyon-Mindestregel: mindestens 20 Prozent Marge ODER mindestens 5,00 EUR Gewinn.",
    "elyon-operations-manager": "Erstelle ein Briefing in generatedContent.briefing mit den Bereichen critical, today, thisWeek, watch und noAction. Verändere keine Daten.",
    "elyon-order-coordinator": "Erstelle nur Checklisten und Handlungsvorschläge. Löse keine Lieferantenbestellung aus und ändere keinen Orderstatus.",
    "elyon-support-assistant": "Erstelle nur einen Antwortentwurf mit generatedContent.messageStatus=draft_requires_approval. Sende niemals eine Nachricht und verspreche keine Erstattung oder Garantie.",
    "elyon-product-data-checker": "Prüfe nur die Vollständigkeit bereits vorhandener Seller-Daten. Führe keine neue Produktbeschaffung oder Lieferantensuche durch.",
  };

  return [
    {
      role: "system",
      content: [
        `Du bist ${definition.name} im Elyon Seller Tool.`,
        definition.role,
        roleRules[definition.id],
        "Antworte ausschließlich als valides JSON-Objekt nach dem vorgegebenen Schema.",
        "Erfinde niemals Marke, EAN, MPN, Hersteller, GPSR, CE, Sicherheitsangaben, Material, Maße, Leistung, Lieferumfang oder Zertifikate.",
        "Keine automatische eBay-Veröffentlichung, Preisänderung, Lieferantenbestellung, Kundennachricht, Rückerstattung, Löschung oder Änderung rechtlicher Daten.",
        "Unbekannte Werte bleiben leer und werden in missingFacts dokumentiert.",
        `Sprache und Zahlenformat: ${locale}.`,
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({
        action,
        agentId: definition.id,
        schema,
        context,
        deterministicCalculation: definition.id === "elyon-profit-analyst" ? calculateProfitAnalysis(context) : undefined,
      }),
    },
  ];
}

function createWorkforceTask(input = {}) {
  const now = new Date().toISOString();
  const agentId = canonicalAgentId(input.agentId);
  if (!agentId) throw new Error("Ungültige Agenten-ID.");
  const status = TASK_STATUSES.has(input.status) ? input.status : "queued";
  return {
    id: text(input.id, 200) || `ai-task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    agentId,
    type: text(input.type, 100) || "analysis",
    title: text(input.title, 500) || getAgentDefinition(agentId).name,
    sourceType: text(input.sourceType, 100) || "manual",
    sourceId: text(input.sourceId, 300),
    priority: PRIORITIES.has(input.priority) ? input.priority : "medium",
    status,
    provider: text(input.provider, 100),
    model: text(input.model, 200),
    inputSnapshot: sanitizePrimitiveObject(plainObject(input.inputSnapshot)),
    result: input.result ? sanitizeAgentResult(input.result, { agentId, context: input.inputSnapshot }) : null,
    warnings: stringList(input.warnings, 50, 1000),
    errors: stringList(input.errors, 50, 1000),
    createdAt: text(input.createdAt, 100) || now,
    updatedAt: text(input.updatedAt, 100) || now,
    approvedAt: text(input.approvedAt, 100) || null,
    approvedBy: text(input.approvedBy, 200) || null,
    usage: sanitizePrimitiveObject(input.usage || null),
    durationMs: finiteNumber(input.durationMs),
    fallbackUsed: input.fallbackUsed === true,
  };
}

function migrateAgentSettings(value = {}) {
  const settings = plainObject(value);
  const migrated = { ...settings, agents: { ...plainObject(settings.agents) } };

  for (const definition of listAgentDefinitions()) {
    const legacyId = Object.keys(LEGACY_AGENT_ID_MAP).find((key) => LEGACY_AGENT_ID_MAP[key] === definition.id);
    const legacy = plainObject(legacyId ? migrated.agents[legacyId] : {});
    const current = plainObject(migrated.agents[definition.id]);
    const source = { ...legacy, ...current };
    const requestedProvider = text(source.provider, 100).toLowerCase();
    const requestedModel = text(source.model, 200);
    const modelProvider = requestedModel.toLowerCase();
    const modelLooksLikeProvider = SUPPORTED_PROVIDERS.has(modelProvider);
    const normalizedProvider = SUPPORTED_PROVIDERS.has(requestedProvider)
      ? requestedProvider
      : modelLooksLikeProvider
        ? modelProvider
        : definition.defaultProvider;
    const normalizedModel = SUPPORTED_PROVIDERS.has(requestedProvider) && !modelLooksLikeProvider
      ? requestedModel
      : "";
    migrated.agents[definition.id] = {
      ...source,
      id: definition.id,
      name: text(source.name, 200) || definition.name,
      description: text(source.description, 1000) || definition.role,
      active: source.active !== false,
      enabled: source.enabled !== false,
      paused: source.paused === true,
      autonomyLevel: Math.min(3, Math.max(0, Math.trunc(finiteNumber(source.autonomyLevel) ?? 1))),
      provider: normalizedProvider,
      model: normalizedModel,
      allowFallback: source.allowFallback !== false,
      temperature: clamp(source.temperature, 0, 2, 0.2),
      maxTokens: Math.trunc(clamp(source.maxTokens, 200, 12000, 4000)),
      dailyLimit: Math.max(0, finiteNumber(source.dailyLimit) ?? 0.25),
      todayUsage: Math.max(0, finiteNumber(source.todayUsage) ?? 0),
      capabilities: Array.isArray(source.capabilities) && source.capabilities.length ? source.capabilities : definition.capabilities,
      phase: definition.phase,
    };
  }

  migrated.agentMigrationVersion = 2;
  migrated.agentAliases = { ...LEGACY_AGENT_ID_MAP };
  if (migrated.autonomyLocked === undefined) migrated.autonomyLocked = true;
  if (migrated.securityMode === undefined) migrated.securityMode = true;
  if (migrated.sandboxMode === undefined) migrated.sandboxMode = true;
  return migrated;
}

function canRunAgent(settings = {}, agentId) {
  const migrated = migrateAgentSettings(settings);
  const id = canonicalAgentId(agentId);
  const agent = plainObject(migrated.agents[id]);
  if (!id || !agent.id) return { ok: false, code: "UNKNOWN_AGENT" };
  if (migrated.pauseAllAgents === true || migrated.pausedAll === true || agent.active === false || agent.enabled === false || agent.paused === true) {
    return { ok: false, code: "AGENT_PAUSED" };
  }
  if (agent.autonomyLevel <= 0) return { ok: false, code: "AUTONOMY_DISABLED" };
  if (agent.dailyLimit > 0 && agent.todayUsage >= agent.dailyLimit) return { ok: false, code: "DAILY_LIMIT_REACHED" };
  return { ok: true, agent };
}

export {
  AGENT_DEFINITIONS,
  AGENT_RESULT_STATUSES,
  ALLOWED_ACTIONS,
  EXTERNAL_ACTIONS,
  LEGACY_AGENT_ID_MAP,
  TASK_STATUSES,
  buildAgentMessages,
  buildContextPacket,
  buildLocalFallbackResult,
  calculateProfitAnalysis,
  canRunAgent,
  canonicalAgentId,
  createWorkforceTask,
  getAgentDefinition,
  isActionAllowed,
  listAgentDefinitions,
  migrateAgentSettings,
  parseStructuredAgentResponse,
  sanitizeAgentResult,
};