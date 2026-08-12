const MAX_DELEGATIONS = 4;

const BLOCKED_COMMANDS = Object.freeze([
  { id: "publish_listing", pattern: /(?:live|direkt)\s+(?:auf\s+ebay\s+)?(?:veröffentlichen|publizieren|einstellen)|(?:veröffentliche|publiziere)\s+.*(?:live|ebay)/i },
  { id: "place_supplier_order", pattern: /(?:beim|beim\s+lieferanten|supplier).*\b(?:bestellen|bestellung auslösen)\b|\bbestell(?:e)?\s+.*(?:lieferant|supplier)/i },
  { id: "issue_refund", pattern: /\b(?:erstatte|rückerstatte|refund)\b/i },
  { id: "send_customer_message", pattern: /\b(?:sende|schicke)\b.*\b(?:kundennachricht|nachricht an den kunden|kunden)\b/i },
  { id: "delete_product", pattern: /\b(?:lösche|entferne)\b.*\bprodukt\b/i },
  { id: "change_legal_data", pattern: /\b(?:ändere|überschreibe)\b.*\b(?:rechtliche daten|impressum|gpsr-policy|ebay policy|ebay-policy)\b/i },
]);

const CAPABILITY_PROFILES = Object.freeze({
  workflow: {
    preferredAgentIds: ["elyon-manager"],
    terms: ["workflow", "pipeline", "status", "blocker", "priorität", "manager", "orchestrierung", "prozess"],
  },
  product_data: {
    preferredAgentIds: ["elyon-product-data-specialist"],
    terms: ["produktdaten", "produkt", "daten", "varianten", "bilder", "lieferantenangaben", "vollständigkeit", "prozessreife"],
  },
  compliance: {
    preferredAgentIds: ["elyon-compliance-specialist"],
    terms: ["compliance", "gpsr", "hersteller", "eu-verantwortlicher", "ce", "vero", "markenrisiko", "pflichtangaben", "sicherheit"],
  },
  profit: {
    preferredAgentIds: ["elyon-profit-specialist"],
    terms: ["profit", "gewinn", "marge", "kosten", "break-even", "preis", "preisszenario", "rentabilität"],
  },
  listing: {
    preferredAgentIds: ["elyon-listing-specialist"],
    terms: ["listing", "titel", "seo", "beschreibung", "artikelmerkmale", "item specifics", "variantenbezeichnung", "ebay-entwurf"],
  },
  draft_quality: {
    preferredAgentIds: ["elyon-draft-quality-guard"],
    terms: ["draft", "entwurf", "qualität", "quality", "widerspruch", "freigabe", "entwurfsprüfung"],
  },
  orders: {
    preferredAgentIds: ["elyon-order-specialist"],
    terms: ["order", "bestellung", "versandfrist", "tracking", "fulfillment", "lieferung", "lieferantenrisiko"],
  },
  support: {
    preferredAgentIds: ["elyon-customer-support-specialist"],
    terms: ["support", "kunde", "kundendienst", "retoure", "rückgabe", "reklamation", "kundenantwort"],
  },
  product_discovery: {
    preferredAgentIds: [],
    terms: ["produktsuche", "produkt discovery", "product discovery", "produktideen", "trend", "trends", "marktchance", "marktchancen", "scout", "evergreen", "low competition"],
  },
  market_research: {
    preferredAgentIds: [],
    terms: ["marktforschung", "marktanalyse", "market research", "konkurrenz", "wettbewerb", "nachfrage", "ebay markt", "marktcheck"],
  },
  supplier_research: {
    preferredAgentIds: [],
    terms: ["supplier", "lieferant", "lieferanten", "bezugsquelle", "einkauf", "aliexpress", "beschaffung"],
  },
});

const INTENT_RULES = Object.freeze([
  {
    id: "full_product_review",
    pattern: /(?:prüf\w*|check\w*|analys\w*).*(?:produkt|artikel).*(?:komplett|vollständig|gesamt)|(?:komplett|vollständig).*(?:produkt|artikel).*(?:prüf\w*|check\w*|analys\w*)|(?:prüf\w*|check\w*)\s+(?:alle\s+)?(?:neuen?\s+)?(?:produkte|artikel)/i,
    capabilities: ["product_data", "compliance", "profit"],
  },
  { id: "workflow_status", pattern: /\b(?:workflow|pipeline|status|blocker|hängt|haengt|prioritäten|prioritaeten)\b|wie sieht es (?:heute|aktuell) aus/i, capabilities: ["workflow"] },
  { id: "draft_quality", pattern: /(?:entwurf|draft).*(?:prüf|check|qualität|quality)|(?:prüf|check).*(?:entwurf|draft)/i, capabilities: ["draft_quality"] },
  { id: "compliance", pattern: /\b(?:gpsr|compliance|hersteller|vero|markenrisiko|pflichtangaben|eu-verantwortlich|ce)\b/i, capabilities: ["compliance"] },
  { id: "profit", pattern: /\b(?:marge|gewinn|profit|break-even|rentabilität|rentabilitaet|kosten)\b|(?:preis|preise).*(?:prüf|analys|vergleich)/i, capabilities: ["profit"] },
  { id: "listing", pattern: /\b(?:listing|seo|beschreibung|artikelmerkmale|item specifics)\b|(?:titel).*(?:optimier|erstell|prüf)/i, capabilities: ["listing"] },
  { id: "orders", pattern: /\b(?:order|bestellung|bestellungen|tracking|versandfrist|fulfillment)\b/i, capabilities: ["orders"] },
  { id: "support", pattern: /\b(?:support|retoure|retouren|rückgabe|rueckgabe|reklamation|kundenantwort)\b/i, capabilities: ["support"] },
  { id: "product_discovery", pattern: /\b(?:produktsuche|produktideen|product discovery|trends?|evergreen|marktchancen?|scout)\b/i, capabilities: ["product_discovery"] },
  { id: "market_research", pattern: /\b(?:marktforschung|marktanalyse|market research|konkurrenz|wettbewerb|nachfrage|marktcheck)\b/i, capabilities: ["market_research"] },
  { id: "supplier_research", pattern: /\b(?:supplier|lieferant|lieferanten|bezugsquelle|beschaffung|aliexpress)\b/i, capabilities: ["supplier_research"] },
  { id: "product_data", pattern: /\b(?:produktdaten|varianten|bilder|vollständigkeit|vollstaendigkeit)\b|(?:daten).*(?:prüf|check)/i, capabilities: ["product_data"] },
]);

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 4000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function normalize(value) {
  return text(value, 20000)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value) {
  return new Set(normalize(value).split(/\s+/).filter((entry) => entry.length >= 3));
}

function blockedCommand(command) {
  const source = text(command, 12000);
  const match = BLOCKED_COMMANDS.find((entry) => entry.pattern.test(source));
  return match ? { blocked: true, action: match.id } : { blocked: false, action: "" };
}

function inferJarvisIntent(command) {
  const source = text(command, 12000);
  const match = INTENT_RULES.find((rule) => rule.pattern.test(source));
  return match
    ? { id: match.id, capabilities: [...match.capabilities], confidence: 0.95 }
    : { id: "generic", capabilities: [], confidence: 0.45 };
}

function agentSearchText(agent) {
  const source = plainObject(agent);
  const execution = plainObject(source.execution);
  return [
    source.id,
    source.name,
    source.role,
    source.department,
    ...(Array.isArray(source.capabilities) ? source.capabilities : []),
    ...(Array.isArray(execution.capabilities) ? execution.capabilities : []),
  ].map((entry) => text(entry, 2000)).filter(Boolean).join(" ");
}

function isAgentAvailable(agent) {
  if (!agent || agent.enabled === false) return false;
  if (agent.kind === "custom" && text(agent.autonomyMode, 50).toLowerCase() === "off") return false;
  return true;
}

function capabilityScore(agent, capability, command = "") {
  if (!isAgentAvailable(agent)) return -Infinity;
  const profile = CAPABILITY_PROFILES[capability];
  if (!profile) return 0;
  const haystack = normalize(agentSearchText(agent));
  const commandTokens = tokens(command);
  let score = 0;

  if (profile.preferredAgentIds.includes(text(agent.id, 100).toLowerCase())) score += 100;
  for (const term of profile.terms) {
    const normalizedTerm = normalize(term);
    if (normalizedTerm && haystack.includes(normalizedTerm)) score += 12;
  }

  const agentTokens = tokens(haystack);
  for (const token of commandTokens) {
    if (agentTokens.has(token)) score += 2;
  }

  if (agent.kind === "custom" && Array.isArray(agent.capabilities)) {
    const explicit = normalize(agent.capabilities.join(" "));
    for (const term of profile.terms) {
      if (explicit.includes(normalize(term))) score += 8;
    }
  }
  return score;
}

function genericScore(agent, command) {
  if (!isAgentAvailable(agent)) return -Infinity;
  const commandTokens = tokens(command);
  if (!commandTokens.size) return 0;
  const haystackTokens = tokens(agentSearchText(agent));
  let score = 0;
  for (const token of commandTokens) if (haystackTokens.has(token)) score += 6;
  if (agent.kind === "custom" && Array.isArray(agent.capabilities) && agent.capabilities.length) score += 1;
  return score;
}

function resolveAgentById(agents, id) {
  const needle = text(id, 100).toLowerCase();
  return (Array.isArray(agents) ? agents : []).find((agent) => {
    if (!isAgentAvailable(agent)) return false;
    const ids = [agent?.id, agent?.backendAgentId, agent?.execution?.id].map((entry) => text(entry, 100).toLowerCase()).filter(Boolean);
    return ids.includes(needle);
  }) || null;
}

function bestAgentForCapability(agents, capability, command, usedIds = new Set()) {
  const ranked = (Array.isArray(agents) ? agents : [])
    .filter((agent) => isAgentAvailable(agent) && !usedIds.has(agent.id))
    .map((agent) => ({ agent, score: capabilityScore(agent, capability, command) }))
    .filter((entry) => Number.isFinite(entry.score) && entry.score > 0)
    .sort((left, right) => right.score - left.score || String(left.agent.name || "").localeCompare(String(right.agent.name || "")));
  return ranked[0] || null;
}

function createDelegation(agent, { capability = "", score = 0, command = "", reason = "" } = {}) {
  return {
    agentId: text(agent.id, 100),
    agentName: text(agent.name, 160),
    kind: agent.kind === "custom" ? "custom" : "core",
    capability,
    score,
    action: "run_agent",
    taskPrompt: text(command, 8000),
    reason: reason || (capability ? `Passender Mitarbeiter für ${capability}.` : "Passender Mitarbeiter für den Auftrag."),
  };
}

function createJarvisPlan({ command, agents = [], explicitAgentId = "", requestedCapability = "", maxAgents = 3 } = {}) {
  const objective = text(command, 12000);
  const safeMax = Math.max(1, Math.min(MAX_DELEGATIONS, Number(maxAgents) || 3));
  const blocked = blockedCommand(objective);
  const correlationId = `jarvis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (blocked.blocked) {
    return {
      version: 1,
      correlationId,
      objective,
      status: "blocked",
      intent: { id: "blocked_external_action", capabilities: [], confidence: 1 },
      delegations: [],
      blockers: [`Die Aktion ${blocked.action} ist für Jarvis technisch gesperrt.`],
      warnings: [],
      requiresUserApproval: true,
      executable: false,
    };
  }

  const available = (Array.isArray(agents) ? agents : []).filter(isAgentAvailable);
  const explicit = explicitAgentId ? resolveAgentById(available, explicitAgentId) : null;
  if (explicitAgentId && !explicit) {
    return {
      version: 1,
      correlationId,
      objective,
      status: "needs_attention",
      intent: { id: "explicit_agent", capabilities: requestedCapability ? [requestedCapability] : [], confidence: 1 },
      delegations: [],
      blockers: [`Der Mitarbeiter ${text(explicitAgentId, 100)} ist nicht verfügbar.`],
      warnings: [],
      requiresUserApproval: false,
      executable: false,
    };
  }

  if (explicit) {
    return {
      version: 1,
      correlationId,
      objective,
      status: "ready",
      intent: { id: "explicit_agent", capabilities: requestedCapability ? [requestedCapability] : [], confidence: 1 },
      delegations: [createDelegation(explicit, { capability: requestedCapability, score: 999, command: objective, reason: "Vom Auftrag ausdrücklich ausgewählter Mitarbeiter." })],
      blockers: [],
      warnings: [],
      requiresUserApproval: false,
      executable: true,
    };
  }

  const intent = requestedCapability
    ? { id: "explicit_capability", capabilities: [text(requestedCapability, 100)], confidence: 1 }
    : inferJarvisIntent(objective);
  const delegations = [];
  const usedIds = new Set();
  const warnings = [];

  if (intent.capabilities.length) {
    for (const capability of intent.capabilities.slice(0, safeMax)) {
      const best = bestAgentForCapability(available, capability, objective, usedIds);
      if (!best) {
        warnings.push(`Für die Fähigkeit ${capability} ist aktuell kein passender aktiver Mitarbeiter registriert.`);
        continue;
      }
      usedIds.add(best.agent.id);
      delegations.push(createDelegation(best.agent, { capability, score: best.score, command: objective }));
    }
  } else {
    const ranked = available
      .map((agent) => ({ agent, score: genericScore(agent, objective) }))
      .filter((entry) => Number.isFinite(entry.score) && entry.score >= 6)
      .sort((left, right) => right.score - left.score)
      .slice(0, safeMax);
    for (const entry of ranked) delegations.push(createDelegation(entry.agent, { score: entry.score, command: objective }));
  }

  const executable = delegations.length > 0;
  return {
    version: 1,
    correlationId,
    objective,
    status: executable ? "ready" : "needs_attention",
    intent,
    delegations,
    blockers: executable ? [] : ["Jarvis konnte für diesen Auftrag keinen ausreichend passenden aktiven Mitarbeiter bestimmen."],
    warnings,
    requiresUserApproval: false,
    executable,
  };
}

function summarizeJarvisRuns(plan, runs = []) {
  const list = Array.isArray(runs) ? runs : [];
  const blockers = [];
  const warnings = [...(Array.isArray(plan?.warnings) ? plan.warnings : [])];
  let successful = 0;
  let failed = 0;

  for (const run of list) {
    if (run?.ok) successful += 1;
    else failed += 1;
    const result = plainObject(run?.payload?.result || run?.payload?.task?.result);
    for (const blocker of Array.isArray(result.blockers) ? result.blockers : []) blockers.push(text(blocker, 1200));
    for (const warning of Array.isArray(result.warnings) ? result.warnings : []) warnings.push(text(warning, 1200));
    if (!run?.ok && run?.message) warnings.push(text(run.message, 1200));
  }

  const status = blockers.length ? "blocked" : failed ? (successful ? "partial" : "failed") : "completed";
  const total = list.length;
  const summary = total
    ? `Jarvis hat ${total} Mitarbeiter-Auftrag${total === 1 ? "" : "e"} verarbeitet: ${successful} erfolgreich, ${failed} fehlgeschlagen.`
    : "Jarvis hat einen Ausführungsplan erstellt, aber noch keinen Mitarbeiter gestartet.";

  return {
    status,
    summary,
    successful,
    failed,
    blockers: Array.from(new Set(blockers)).filter(Boolean),
    warnings: Array.from(new Set(warnings)).filter(Boolean),
  };
}

export {
  BLOCKED_COMMANDS,
  CAPABILITY_PROFILES,
  INTENT_RULES,
  MAX_DELEGATIONS,
  blockedCommand,
  capabilityScore,
  createJarvisPlan,
  genericScore,
  inferJarvisIntent,
  isAgentAvailable,
  resolveAgentById,
  summarizeJarvisRuns,
};
