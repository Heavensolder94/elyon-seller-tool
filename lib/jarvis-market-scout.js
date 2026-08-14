import { routeAIRequest } from "./ai-provider-router.js";

const MAX_CANDIDATES = 20;
const WEB_SEARCH_TOOLS = [{
  type: "openrouter:web_search",
  parameters: { engine: "auto", max_results: 5, max_total_results: 12, search_context_size: "low" },
}];

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function requestedCount(command) {
  const match = clean(command, 12000).match(/\b(\d{1,3})\b[^.!?\n]{0,60}(?:produkt|ideen|vorschl[aä]ge|kandidaten)/i);
  return Math.min(MAX_CANDIDATES, Math.max(1, Number(match?.[1] || 10)));
}

function parseConstraints(command) {
  const source = clean(command, 12000);
  const category = source.match(/(?:im\s+bereich|in der|in dem|bereich|im)\s+([\p{L}\d][\p{L}\d &/-]{2,50})/iu)?.[1]?.trim() || "nicht festgelegt";
  return {
    requestedCount: requestedCount(source),
    category: clean(category, 80),
    draftOnly: true,
    query: source,
  };
}

function extractJson(content) {
  const raw = clean(content, 60000).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(raw); } catch {}
  const match = raw.match(/\{[\s\S]*\}/);
  try { return match ? JSON.parse(match[0]) : null; } catch { return null; }
}

function normalizeCandidate(candidate, index) {
  const item = candidate && typeof candidate === "object" ? candidate : {};
  const price = (key) => typeof item[key] === "number" && Number.isFinite(item[key]) ? item[key] : null;
  return {
    rank: index + 1,
    productName: clean(item.productName || item.name, 180),
    category: clean(item.category, 100),
    rationale: clean(item.rationale, 700),
    demandSignal: clean(item.demandSignal, 300) || "unknown",
    competitionLevel: clean(item.competitionLevel, 80) || "unknown",
    purchasePrice: price("purchasePrice"),
    sellingPrice: price("sellingPrice"),
    estimatedMarginPercent: price("estimatedMarginPercent"),
    supplierSource: clean(item.supplierSource, 180) || "unknown",
    supplierUrl: /^https:\/\//i.test(clean(item.supplierUrl, 500)) ? clean(item.supplierUrl, 500) : null,
    riskLevel: clean(item.riskLevel, 40) || "unknown",
    risks: Array.isArray(item.risks) ? item.risks.slice(0, 8).map((v) => clean(v, 240)).filter(Boolean) : [],
    evidence: Array.isArray(item.evidence) ? item.evidence.slice(0, 6).map((v) => clean(v, 500)).filter(Boolean) : [],
    status: "research_only",
  };
}

function buildPrompt(constraints) {
  return `Du bist Elyon Market Scout V1. Recherchiere ausschließlich im Draft-/Read-only-Modus. Suche bis zu ${constraints.requestedCount} risikoarme Produktideen für eBay-Dropshipping${constraints.category !== "nicht festgelegt" ? ` im Bereich ${constraints.category}` : ""}. Nutze aktuelle Webquellen über das bereitgestellte Suchwerkzeug. Erfinde niemals Nachfrage, Preise, Margen oder Lieferantenquellen. Wenn ein Wert nicht belegt ist, setze ihn auf null oder unknown. Keine eBay-Listings, Bestellungen oder sonstigen Schreibaktionen. Antworte ausschließlich als JSON mit diesem Schema: {"summary":"string","warnings":["string"],"candidates":[{"productName":"string","category":"string","rationale":"string","demandSignal":"string","competitionLevel":"low|medium|high|unknown","purchasePrice":number|null,"sellingPrice":number|null,"estimatedMarginPercent":number|null,"supplierSource":"string","supplierUrl":"https://...|null","riskLevel":"low|medium|high|unknown","risks":["string"],"evidence":["url oder beleg"],"status":"research_only"}]}. Maximal ${constraints.requestedCount} Kandidaten. Jeder Kandidat muss klar als unverbindliche Recherche gekennzeichnet sein. Ursprünglicher Auftrag: ${constraints.query}`;
}

async function runMarketScout({ command, route = routeAIRequest } = {}) {
  const constraints = parseConstraints(command);
  const result = await route({
    provider: "openrouter",
    model: "openrouter/free",
    task: "jarvis-market-scout-v1",
    prompt: buildPrompt(constraints),
    temperature: 0.1,
    maxTokens: 7000,
    tools: WEB_SEARCH_TOOLS,
    allowFallback: false,
    safety: { securityMode: true, sandboxMode: true, autonomyLocked: true, requiresLiveAction: false },
  });
  if (!result?.ok) return { ok: false, mode: "market_scout_degraded", reason: "market_scout_provider_unavailable", requestedCount: constraints.requestedCount, warnings: ["Keine verlässliche Research-Antwort verfügbar; es wurden keine Kandidaten erfunden."], safety: { draftOnly: true, nothingMutated: true } };
  const parsed = extractJson(result.content);
  if (!parsed || !Array.isArray(parsed.candidates)) return { ok: false, mode: "market_scout_degraded", reason: "market_scout_invalid_response", requestedCount: constraints.requestedCount, warnings: ["Research-Antwort war nicht im erwarteten strukturierten Format."], safety: { draftOnly: true, nothingMutated: true } };
  const candidates = parsed.candidates.slice(0, constraints.requestedCount).map(normalizeCandidate).filter((item) => item.productName);
  return { ok: true, mode: "market_scout", handler: "product-discovery-v1", requestedCount: constraints.requestedCount, count: candidates.length, query: constraints.query, summary: clean(parsed.summary, 2000), warnings: Array.isArray(parsed.warnings) ? parsed.warnings.slice(0, 10).map((v) => clean(v, 400)) : [], candidates, safety: { draftOnly: true, externalActionsLocked: true, nothingMutated: true }, provider: result.provider, model: result.model };
}

function isMarketScoutCommand(command, plan) {
  const value = clean(command, 12000);
  return ["product_discovery", "market_research"].includes(clean(plan?.intent?.id, 100)) || /(?:suche|finde|recherchier|ideen|produktkandidaten|marktanalyse|marktforschung|market scout|produktvorschl[aä]ge).*(?:produkt|ebay|dropship|nachfrage|wettbewerb|konkurrenz)|\b(?:produktideen|produktkandidaten)\b/i.test(value);
}

export { isMarketScoutCommand, parseConstraints, runMarketScout, WEB_SEARCH_TOOLS };
