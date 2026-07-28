const AGENT_IDS = new Set([
  "elyon-listing-pro",
  "elyon-compliance-guard",
  "elyon-profit-analyst",
  "elyon-operations-manager",
  "elyon-order-coordinator",
  "elyon-support-assistant",
]);

const COMMON_DEFAULTS = Object.freeze({
  outputDetail: "standard",
  confidenceThreshold: 0.65,
  creativity: "precise",
  maxTokens: 4000,
  priority: "medium",
});

const AGENT_DEFAULTS = Object.freeze({
  "elyon-listing-pro": Object.freeze({
    marketplace: "ebay-de",
    language: "de-DE",
    titleMaxLength: 80,
    seoStrength: "balanced",
    writingStyle: "sales-factual",
    descriptionLength: "medium",
    useBullets: true,
    allowHtml: true,
    factsOnly: true,
    includeBrand: true,
    includeModel: true,
    includeColorSize: true,
    normalizeVariants: true,
    unknownFactsAction: "mark-missing",
  }),
  "elyon-compliance-guard": Object.freeze({
    targetMarkets: ["DE", "EU"],
    strictness: "strict",
    checks: ["gpsr", "manufacturer", "responsible-person", "ce", "vero", "category-aspects"],
    requiredDocuments: ["manufacturer-data", "gpsr-data", "safety-information"],
    missingEvidenceAction: "block",
    uncertainCertificateAction: "manual-review",
    brandRiskAction: "block",
  }),
  "elyon-profit-analyst": Object.freeze({
    minimumProfitEur: 5,
    minimumMarginPercent: 20,
    minimumRuleMode: "or",
    returnReservePercent: 7,
    priceBufferPercent: 4,
    advertisingCostPercent: 0,
    scenarioCount: 3,
    priceEnding: "0.99",
    weakResultAction: "block",
  }),
  "elyon-operations-manager": Object.freeze({
    maximumDailyTasks: 10,
    availableMinutes: 240,
    briefingLength: "compact",
    orderPriority: "critical",
    supportPriority: "high",
    compliancePriority: "high",
    listingPriority: "medium",
    delegateInternalDrafts: true,
    preventDuplicateTasks: true,
    showCompletedSummary: true,
  }),
  "elyon-order-coordinator": Object.freeze({
    trackingCheckHours: 48,
    deadlineWarningHours: 24,
    maximumDelayDays: 3,
    includeWeekends: false,
    escalationLevel: "task-and-support-draft",
    detectPriceIncrease: true,
    detectStockLoss: true,
    detectInvalidTracking: true,
    neverOrderAutomatically: true,
  }),
  "elyon-support-assistant": Object.freeze({
    tone: "friendly-professional",
    addressForm: "sie",
    responseLength: "compact",
    languageMode: "detect",
    allowedCases: ["delay", "not-received", "wrong-item", "damaged", "return", "cancellation", "invoice", "product-question"],
    maximumRefundSuggestionEur: 0,
    maximumDiscountSuggestionPercent: 10,
    escalationTriggers: ["legal-threat", "marketplace-case", "safety-incident", "privacy-request", "fraud-suspicion", "negative-feedback"],
    requireApproval: true,
    prohibitBindingPromises: true,
  }),
});

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, fallback = "", max = 500) {
  const result = String(value ?? "").trim();
  return (result || fallback).slice(0, max);
}

function number(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function boolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function choice(value, allowed, fallback) {
  const result = text(value).toLowerCase();
  return allowed.includes(result) ? result : fallback;
}

function stringList(value, allowed, fallback) {
  const list = Array.isArray(value) ? value : fallback;
  const normalized = list.map((entry) => text(entry).toLowerCase()).filter((entry) => allowed.includes(entry));
  return Array.from(new Set(normalized));
}

function normalizeCommon(input = {}) {
  const source = plainObject(input);
  return {
    outputDetail: choice(source.outputDetail, ["compact", "standard", "detailed"], COMMON_DEFAULTS.outputDetail),
    confidenceThreshold: number(source.confidenceThreshold, COMMON_DEFAULTS.confidenceThreshold, 0, 1),
    creativity: choice(source.creativity, ["precise", "balanced", "creative"], COMMON_DEFAULTS.creativity),
    maxTokens: Math.trunc(number(source.maxTokens, COMMON_DEFAULTS.maxTokens, 500, 12000)),
    priority: choice(source.priority, ["low", "medium", "high", "critical"], COMMON_DEFAULTS.priority),
  };
}

function normalizeListing(input = {}) {
  const source = plainObject(input);
  const defaults = AGENT_DEFAULTS["elyon-listing-pro"];
  return {
    marketplace: choice(source.marketplace, ["ebay-de", "ebay-at", "ebay-ch", "shopify-de"], defaults.marketplace),
    language: choice(source.language, ["de-de", "en-gb", "en-us"], defaults.language.toLowerCase()).replace(/^([a-z]{2})-([a-z]{2})$/, (_, a, b) => `${a}-${b.toUpperCase()}`),
    titleMaxLength: Math.trunc(number(source.titleMaxLength, defaults.titleMaxLength, 40, 120)),
    seoStrength: choice(source.seoStrength, ["low", "balanced", "strong"], defaults.seoStrength),
    writingStyle: choice(source.writingStyle, ["factual", "sales-factual", "technical", "friendly"], defaults.writingStyle),
    descriptionLength: choice(source.descriptionLength, ["short", "medium", "detailed"], defaults.descriptionLength),
    useBullets: boolean(source.useBullets, defaults.useBullets),
    allowHtml: boolean(source.allowHtml, defaults.allowHtml),
    factsOnly: boolean(source.factsOnly, defaults.factsOnly),
    includeBrand: boolean(source.includeBrand, defaults.includeBrand),
    includeModel: boolean(source.includeModel, defaults.includeModel),
    includeColorSize: boolean(source.includeColorSize, defaults.includeColorSize),
    normalizeVariants: boolean(source.normalizeVariants, defaults.normalizeVariants),
    unknownFactsAction: choice(source.unknownFactsAction, ["mark-missing", "omit"], defaults.unknownFactsAction),
  };
}

function normalizeCompliance(input = {}) {
  const source = plainObject(input);
  const defaults = AGENT_DEFAULTS["elyon-compliance-guard"];
  return {
    targetMarkets: stringList(source.targetMarkets, ["de", "eu", "uk", "ch"], defaults.targetMarkets.map((entry) => entry.toLowerCase())).map((entry) => entry.toUpperCase()),
    strictness: choice(source.strictness, ["normal", "strict", "maximum"], defaults.strictness),
    checks: stringList(source.checks, ["gpsr", "manufacturer", "responsible-person", "ce", "battery", "weee", "packaging", "textile", "toy", "vero", "category-aspects"], defaults.checks),
    requiredDocuments: stringList(source.requiredDocuments, ["manufacturer-data", "gpsr-data", "safety-information", "declaration-of-conformity", "test-report", "manual", "supplier-invoice"], defaults.requiredDocuments),
    missingEvidenceAction: choice(source.missingEvidenceAction, ["warn", "manual-review", "block"], defaults.missingEvidenceAction),
    uncertainCertificateAction: choice(source.uncertainCertificateAction, ["warn", "manual-review", "block"], defaults.uncertainCertificateAction),
    brandRiskAction: choice(source.brandRiskAction, ["warn", "manual-review", "block"], defaults.brandRiskAction),
  };
}

function normalizeProfit(input = {}) {
  const source = plainObject(input);
  const defaults = AGENT_DEFAULTS["elyon-profit-analyst"];
  return {
    minimumProfitEur: number(source.minimumProfitEur, defaults.minimumProfitEur, 0, 10000),
    minimumMarginPercent: number(source.minimumMarginPercent, defaults.minimumMarginPercent, 0, 100),
    minimumRuleMode: choice(source.minimumRuleMode, ["or", "and"], defaults.minimumRuleMode),
    returnReservePercent: number(source.returnReservePercent, defaults.returnReservePercent, 0, 100),
    priceBufferPercent: number(source.priceBufferPercent, defaults.priceBufferPercent, 0, 100),
    advertisingCostPercent: number(source.advertisingCostPercent, defaults.advertisingCostPercent, 0, 100),
    scenarioCount: Math.trunc(number(source.scenarioCount, defaults.scenarioCount, 3, 5)),
    priceEnding: choice(source.priceEnding, ["none", "0.49", "0.90", "0.99"], defaults.priceEnding),
    weakResultAction: choice(source.weakResultAction, ["warn", "manual-review", "block"], defaults.weakResultAction),
  };
}

function normalizeOperations(input = {}) {
  const source = plainObject(input);
  const defaults = AGENT_DEFAULTS["elyon-operations-manager"];
  return {
    maximumDailyTasks: Math.trunc(number(source.maximumDailyTasks, defaults.maximumDailyTasks, 1, 50)),
    availableMinutes: Math.trunc(number(source.availableMinutes, defaults.availableMinutes, 15, 960)),
    briefingLength: choice(source.briefingLength, ["compact", "standard", "detailed"], defaults.briefingLength),
    orderPriority: choice(source.orderPriority, ["low", "medium", "high", "critical"], defaults.orderPriority),
    supportPriority: choice(source.supportPriority, ["low", "medium", "high", "critical"], defaults.supportPriority),
    compliancePriority: choice(source.compliancePriority, ["low", "medium", "high", "critical"], defaults.compliancePriority),
    listingPriority: choice(source.listingPriority, ["low", "medium", "high", "critical"], defaults.listingPriority),
    delegateInternalDrafts: boolean(source.delegateInternalDrafts, defaults.delegateInternalDrafts),
    preventDuplicateTasks: boolean(source.preventDuplicateTasks, defaults.preventDuplicateTasks),
    showCompletedSummary: boolean(source.showCompletedSummary, defaults.showCompletedSummary),
  };
}

function normalizeOrder(input = {}) {
  const source = plainObject(input);
  const defaults = AGENT_DEFAULTS["elyon-order-coordinator"];
  return {
    trackingCheckHours: Math.trunc(number(source.trackingCheckHours, defaults.trackingCheckHours, 1, 336)),
    deadlineWarningHours: Math.trunc(number(source.deadlineWarningHours, defaults.deadlineWarningHours, 1, 168)),
    maximumDelayDays: Math.trunc(number(source.maximumDelayDays, defaults.maximumDelayDays, 0, 60)),
    includeWeekends: boolean(source.includeWeekends, defaults.includeWeekends),
    escalationLevel: choice(source.escalationLevel, ["notice", "task", "task-and-support-draft"], defaults.escalationLevel),
    detectPriceIncrease: boolean(source.detectPriceIncrease, defaults.detectPriceIncrease),
    detectStockLoss: boolean(source.detectStockLoss, defaults.detectStockLoss),
    detectInvalidTracking: boolean(source.detectInvalidTracking, defaults.detectInvalidTracking),
    neverOrderAutomatically: true,
  };
}

function normalizeSupport(input = {}) {
  const source = plainObject(input);
  const defaults = AGENT_DEFAULTS["elyon-support-assistant"];
  return {
    tone: choice(source.tone, ["friendly-professional", "empathetic", "factual", "brief-direct"], defaults.tone),
    addressForm: choice(source.addressForm, ["sie", "du"], defaults.addressForm),
    responseLength: choice(source.responseLength, ["very-short", "compact", "detailed", "adaptive"], defaults.responseLength),
    languageMode: choice(source.languageMode, ["detect", "de", "en", "bilingual"], defaults.languageMode),
    allowedCases: stringList(source.allowedCases, ["delay", "not-received", "wrong-item", "damaged", "return", "cancellation", "invoice", "product-question", "negative-feedback"], defaults.allowedCases),
    maximumRefundSuggestionEur: number(source.maximumRefundSuggestionEur, defaults.maximumRefundSuggestionEur, 0, 10000),
    maximumDiscountSuggestionPercent: number(source.maximumDiscountSuggestionPercent, defaults.maximumDiscountSuggestionPercent, 0, 100),
    escalationTriggers: stringList(source.escalationTriggers, ["legal-threat", "marketplace-case", "safety-incident", "privacy-request", "fraud-suspicion", "negative-feedback", "high-value-refund"], defaults.escalationTriggers),
    requireApproval: true,
    prohibitBindingPromises: true,
  };
}

function normalizeAdvancedSettings(agentId, input = {}) {
  const id = text(agentId).toLowerCase();
  if (!AGENT_IDS.has(id)) return { version: 1, common: normalizeCommon() };
  const source = plainObject(input);
  const common = normalizeCommon(source.common || source);
  let specialist;
  if (id === "elyon-listing-pro") specialist = normalizeListing(source.listing || source.specialist);
  if (id === "elyon-compliance-guard") specialist = normalizeCompliance(source.compliance || source.specialist);
  if (id === "elyon-profit-analyst") specialist = normalizeProfit(source.profit || source.specialist);
  if (id === "elyon-operations-manager") specialist = normalizeOperations(source.operations || source.specialist);
  if (id === "elyon-order-coordinator") specialist = normalizeOrder(source.order || source.specialist);
  if (id === "elyon-support-assistant") specialist = normalizeSupport(source.support || source.specialist);
  return {
    version: 1,
    common,
    specialist,
    updatedAt: text(source.updatedAt, "", 100) || null,
  };
}

function configuredTemperature(advanced = {}) {
  const creativity = plainObject(advanced.common).creativity;
  if (creativity === "creative") return 0.7;
  if (creativity === "balanced") return 0.35;
  return 0.15;
}

function roundMoney(value) {
  return Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) / 100 : null;
}

function roundPercent(value) {
  return Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) / 100 : null;
}

function calculateConfiguredProfit(context = {}, advanced = {}) {
  const input = plainObject(context);
  const rules = normalizeAdvancedSettings("elyon-profit-analyst", advanced).specialist;
  const purchasePrice = Number(input.purchasePrice);
  const shippingCost = Number(input.shippingCost || 0);
  const sellingPrice = Number(input.sellingPrice);
  const ebayFeePercent = Number(input.ebayFeePercent || 0);
  const paymentFee = Number(input.paymentFee || 0);
  const otherCosts = Number(input.otherCosts || 0);
  const requiredPresent = Number.isFinite(purchasePrice) && Number.isFinite(sellingPrice);
  const costBase = (Number.isFinite(purchasePrice) ? purchasePrice : 0) + (Number.isFinite(shippingCost) ? shippingCost : 0);
  const priceBuffer = costBase * (rules.priceBufferPercent / 100);
  const platformFee = (Number.isFinite(sellingPrice) ? sellingPrice : 0) * (ebayFeePercent / 100);
  const advertisingCost = (Number.isFinite(sellingPrice) ? sellingPrice : 0) * (rules.advertisingCostPercent / 100);
  const returnReserve = (Number.isFinite(sellingPrice) ? sellingPrice : 0) * (rules.returnReservePercent / 100);
  const fixedCosts = costBase + paymentFee + otherCosts + priceBuffer;
  const totalCosts = fixedCosts + platformFee + advertisingCost + returnReserve;
  const profit = Number.isFinite(sellingPrice) ? sellingPrice - totalCosts : null;
  const marginPercent = sellingPrice > 0 && profit !== null ? (profit / sellingPrice) * 100 : null;
  const profitPass = (profit ?? -Infinity) >= rules.minimumProfitEur;
  const marginPass = (marginPercent ?? -Infinity) >= rules.minimumMarginPercent;
  const passesMinimum = requiredPresent && (rules.minimumRuleMode === "and" ? profitPass && marginPass : profitPass || marginPass);
  const variableRate = (ebayFeePercent + rules.advertisingCostPercent + rules.returnReservePercent) / 100;
  const breakEvenPrice = variableRate >= 1 ? null : fixedCosts / (1 - variableRate);
  const factors = rules.scenarioCount === 5 ? [0.9, 0.95, 1, 1.05, 1.1] : rules.scenarioCount === 4 ? [0.95, 1, 1.05, 1.1] : [0.95, 1, 1.05];
  const scenarios = Number.isFinite(sellingPrice) ? factors.map((factor) => {
    const price = sellingPrice * factor;
    const variableCosts = price * variableRate;
    const scenarioProfit = price - fixedCosts - variableCosts;
    const scenarioMargin = price > 0 ? scenarioProfit / price * 100 : null;
    const scenarioPass = rules.minimumRuleMode === "and"
      ? scenarioProfit >= rules.minimumProfitEur && scenarioMargin >= rules.minimumMarginPercent
      : scenarioProfit >= rules.minimumProfitEur || scenarioMargin >= rules.minimumMarginPercent;
    return {
      label: factor === 1 ? "Aktueller Preis" : `${factor < 1 ? "-" : "+"}${Math.abs((factor - 1) * 100).toFixed(0)} %`,
      sellingPrice: roundMoney(price),
      profit: roundMoney(scenarioProfit),
      marginPercent: roundPercent(scenarioMargin),
      passesMinimum: scenarioPass,
    };
  }) : [];
  return {
    currency: "EUR",
    purchasePrice: roundMoney(purchasePrice),
    shippingCost: roundMoney(shippingCost),
    sellingPrice: roundMoney(sellingPrice),
    ebayFeePercent: roundPercent(ebayFeePercent),
    platformFee: roundMoney(platformFee),
    paymentFee: roundMoney(paymentFee),
    otherCosts: roundMoney(otherCosts),
    priceBuffer: roundMoney(priceBuffer),
    advertisingCost: roundMoney(advertisingCost),
    returnReserve: roundMoney(returnReserve),
    totalCosts: roundMoney(totalCosts),
    profit: roundMoney(profit),
    marginPercent: roundPercent(marginPercent),
    breakEvenPrice: roundMoney(breakEvenPrice),
    passesMinimum,
    minimumRule: `${rules.minimumRuleMode === "and" ? "Mindestens" : "Mindestens eines"}: ${rules.minimumMarginPercent.toFixed(2)} % Marge ${rules.minimumRuleMode.toUpperCase()} ${rules.minimumProfitEur.toFixed(2)} EUR Gewinn.`,
    rules,
    scenarios,
    assumptions: requiredPresent ? [] : ["Einkaufs- oder Verkaufspreis fehlt; die konfigurierte Kalkulation ist nicht belastbar."],
  };
}

function applyAdvancedResultPolicy(agentId, result = {}, advanced = {}, context = {}) {
  const id = text(agentId).toLowerCase();
  const normalized = normalizeAdvancedSettings(id, advanced);
  const output = {
    ...plainObject(result),
    warnings: Array.isArray(result.warnings) ? [...result.warnings] : [],
    blockers: Array.isArray(result.blockers) ? [...result.blockers] : [],
    generatedContent: { ...plainObject(result.generatedContent) },
  };
  const confidence = Number(output.confidence);
  if (!Number.isFinite(confidence) || confidence < normalized.common.confidenceThreshold) {
    output.status = output.status === "blocked" ? "blocked" : "manualReviewRequired";
    output.warnings.push(`Konfidenz liegt unter der eingestellten Schwelle von ${normalized.common.confidenceThreshold}.`);
  }
  if (id === "elyon-profit-analyst") {
    const calculation = calculateConfiguredProfit(context, normalized);
    output.generatedContent.calculation = calculation;
    if (!calculation.passesMinimum) {
      const action = normalized.specialist.weakResultAction;
      output.status = action === "block" ? "blocked" : "manualReviewRequired";
      output.blockers.push("Die individuell konfigurierte Mindestregel ist nicht erfüllt.");
    }
  }
  if (id === "elyon-compliance-guard") {
    const missing = Array.isArray(output.missingFacts) && output.missingFacts.length > 0;
    if (missing && normalized.specialist.missingEvidenceAction === "block") output.status = "blocked";
    else if (missing && normalized.specialist.missingEvidenceAction === "manual-review" && output.status !== "blocked") output.status = "manualReviewRequired";
  }
  if (id === "elyon-support-assistant") {
    output.generatedContent.messageStatus = "draft_requires_approval";
    output.warnings.push("Kundennachricht bleibt unabhängig von den Einstellungen freigabepflichtig.");
  }
  output.warnings = Array.from(new Set(output.warnings));
  output.blockers = Array.from(new Set(output.blockers));
  return output;
}

function advancedSettingsPrompt(agentId, advanced = {}) {
  const normalized = normalizeAdvancedSettings(agentId, advanced);
  return [
    "Verbindliche nutzerdefinierte Arbeitskonfiguration:",
    JSON.stringify(normalized),
    "Diese Konfiguration steuert Tiefe, Stil, Prüfschwerpunkte und Schwellenwerte, darf aber keine Sicherheits-, Fakten- oder Freigaberegel lockern.",
  ].join(" ");
}

export {
  AGENT_DEFAULTS,
  AGENT_IDS,
  COMMON_DEFAULTS,
  advancedSettingsPrompt,
  applyAdvancedResultPolicy,
  calculateConfiguredProfit,
  configuredTemperature,
  normalizeAdvancedSettings,
};
