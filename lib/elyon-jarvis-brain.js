import { routeAIRequest } from "./ai-provider-router.js";
import {
  createJarvisPlan,
  summarizeJarvisRuns,
} from "./elyon-jarvis-core.js";

const JARVIS_BRAIN_VERSION = "0.1";

const JARVIS_BRAIN_INTENTS = Object.freeze([
  "conversation",
  "system_question",
  "status_request",
  "product_analysis",
  "market_analysis",
  "supplier_search",
  "listing_task",
  "operations_task",
  "qa_task",
  "unknown",
]);

const DIRECT_INTENTS = new Set([
  "conversation",
  "system_question",
  "status_request",
  "unknown",
]);

const SPECIALIZED_CAPABILITY = Object.freeze({
  product_analysis: "product_data",
  market_analysis: "market_research",
  supplier_search: "supplier_research",
  listing_task: "listing",
  operations_task: "workflow",
  qa_task: "draft_quality",
});

const DYNAMIC_SPECIALIST_TERMS = Object.freeze({
  market_research: ["market research", "marktanalyse", "marktcheck", "ebay markt", "wettbewerb", "nachfrage"],
  supplier_research: ["supplier search", "supplier research", "lieferantensuche", "lieferanten recherche", "bezugsquelle", "beschaffung"],
});

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value, max = 4000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function normalize(value) {
  return text(value, 16000)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function requestId() {
  return `jarvis-brain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function activeAgents(agents = []) {
  return (Array.isArray(agents) ? agents : []).filter((agent) => {
    if (!agent || agent.enabled === false) return false;
    if (agent.availability && agent.availability.available === false) return false;
    if (agent.kind === "custom" && text(agent.autonomyMode, 50).toLowerCase() === "off") return false;
    return true;
  });
}

function hasExplicitDynamicCapability(agent, capability) {
  const terms = DYNAMIC_SPECIALIST_TERMS[capability];
  if (!Array.isArray(terms) || !terms.length) return true;
  const evidence = normalize([
    agent?.id,
    agent?.name,
    ...(Array.isArray(agent?.capabilities) ? agent.capabilities : []),
    ...(Array.isArray(agent?.execution?.capabilities) ? agent.execution.capabilities : []),
  ].map((entry) => text(entry, 1000)).filter(Boolean).join(" "));
  if (!evidence) return false;
  return terms.some((term) => {
    const normalizedTerm = normalize(term);
    return normalizedTerm && evidence.includes(normalizedTerm);
  });
}

function planningAgentsForCapability(agents, capability, explicitAgentId = "") {
  const list = activeAgents(agents);
  if (text(explicitAgentId, 100)) return list;
  if (!DYNAMIC_SPECIALIST_TERMS[capability]) return list;
  return list.filter((agent) => hasExplicitDynamicCapability(agent, capability));
}

function isGreeting(command) {
  const value = normalize(command);
  return /^(hi|hallo|hey|moin|servus|guten morgen|guten tag|guten abend)( jarvis)?$/.test(value);
}

function asksCapabilities(command) {
  const value = normalize(command);
  return /\b(was kannst du|was kannst du alles|deine fahigkeiten|wobei kannst du helfen|was machst du)\b/.test(value);
}

function asksAgents(command) {
  const value = normalize(command);
  return /\b(welche mitarbeiter|welche agenten|deine mitarbeiter|deine agenten|wer arbeitet fur dich|wer steht dir zur verfugung)\b/.test(value);
}

function asksPriority(command) {
  const value = normalize(command);
  return /\b(was soll ich heute machen|was soll ich als nachstes machen|was ist gerade wichtig|was ist aktuell wichtig|was hat prioritat|was hat gerade prioritat)\b/.test(value);
}

function asksSystemStatus(command) {
  const value = normalize(command);
  return /\b(wie sieht mein system aus|systemstatus|status meines systems|wie sieht es aktuell aus|wie sieht es heute aus)\b/.test(value);
}

export function inferJarvisBrainIntent(command) {
  const source = text(command, 12000);
  const value = normalize(source);
  if (!value) return { id: "unknown", confidence: 0.2 };

  if (isGreeting(source) || /\b(danke|dank dir|alles klar jarvis)\b/.test(value)) {
    return { id: "conversation", confidence: 0.99 };
  }
  if (asksCapabilities(source) || asksAgents(source) || /\b(was bist du|wer bist du|jarvis system|jarvis brain)\b/.test(value)) {
    return { id: "system_question", confidence: 0.98 };
  }
  if (asksPriority(source) || asksSystemStatus(source) || /\b(status|prioritat|blocker|offene fehler|offene aufgaben)\b/.test(value)) {
    return { id: "status_request", confidence: 0.94 };
  }
  if (/\b(markt|marktanalyse|marktcheck|market research|konkurrenz|wettbewerb|nachfrage|ebay markt)\b/.test(value)) {
    return { id: "market_analysis", confidence: 0.96 };
  }
  if (/\b(supplier|lieferant|lieferanten|bezugsquelle|beschaffung|aliexpress)\b/.test(value)) {
    return { id: "supplier_search", confidence: 0.96 };
  }
  if (/\b(listing|titel|beschreibung|seo|artikelmerkmale|item specifics|ebay entwurf)\b/.test(value)) {
    return { id: "listing_task", confidence: 0.94 };
  }
  if (/\b(qa|qualitat|qualitatsprufung|draft quality|entwurfsprufung|entwurf prufen)\b/.test(value)) {
    return { id: "qa_task", confidence: 0.94 };
  }
  if (/\b(order|bestellung|bestellungen|tracking|retoure|retouren|reklamation|support|fulfillment|workflow|pipeline|operations)\b/.test(value)) {
    return { id: "operations_task", confidence: 0.92 };
  }
  if (/\b(produkt|artikel|produktdaten|varianten|marge|gewinn|profit|rentabilitat|gpsr|compliance|hersteller|vero)\b/.test(value)) {
    return { id: "product_analysis", confidence: 0.9 };
  }
  if (/\b(hilfe|erklar|warum|wie kann|wie mache|was bedeutet|frage)\b/.test(value)) {
    return { id: "conversation", confidence: 0.7 };
  }
  return { id: "unknown", confidence: 0.45 };
}

export function shouldJarvisAnswerDirectly(intent) {
  return DIRECT_INTENTS.has(text(intent?.id || intent, 80));
}

function productFromInput(input = {}) {
  const source = plainObject(input);
  return plainObject(source.product || source.selectedProduct || source.productData || source.sourceProduct);
}

function listingFromInput(input = {}) {
  const source = plainObject(input);
  return plainObject(source.listingDraft || source.listing || source.draft || productFromInput(source).listingDraft);
}

function missingRequiredContext(intent, command, input = {}) {
  const id = text(intent?.id, 80);
  const value = normalize(command);
  const product = productFromInput(input);
  const listing = listingFromInput(input);
  const hasProduct = Object.keys(product).length > 0;
  const hasListing = Object.keys(listing).length > 0;

  if (["product_analysis", "market_analysis"].includes(id)) {
    const genericReference = /\b(dieses|das|ein|mein) (produkt|artikel)\b/.test(value) || /^(prufe|checke|analysiere) (ein|das|dieses)? ?(produkt|artikel)$/.test(value);
    if (!hasProduct && genericReference) return "product";
  }
  if (id === "qa_task" && !hasListing && /\b(entwurf|draft|listing)\b/.test(value)) return "listingDraft";
  return "";
}

function summarizeContext(input = {}) {
  const source = plainObject(input);
  const product = productFromInput(source);
  const listing = listingFromInput(source);
  const tasks = Array.isArray(source.tasks) ? source.tasks.slice(0, 20) : [];
  const statusCounts = {};
  let blockerCount = 0;
  for (const task of tasks) {
    const status = text(task?.status, 60).toLowerCase() || "unknown";
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    const blockers = Array.isArray(task?.result?.blockers) ? task.result.blockers : [];
    blockerCount += blockers.length;
  }
  return {
    product: Object.keys(product).length ? {
      id: text(product.id || product.productId || product.sku, 200),
      title: text(product.title || product.name, 500),
      status: text(product.status, 100),
    } : null,
    listing: Object.keys(listing).length ? {
      title: text(listing.title, 500),
      status: text(listing.status, 100),
    } : null,
    tasks: {
      count: tasks.length,
      blockerCount,
      statusCounts,
    },
  };
}

function agentListAnswer(agents = []) {
  const list = activeAgents(agents);
  if (!list.length) return "Aktuell ist kein ausführbarer virtueller Mitarbeiter in meiner Registry verfügbar. Ich kann trotzdem im General Mode mit dir sprechen und Anfragen einordnen.";
  const rows = list.slice(0, 20).map((agent) => {
    const role = text(agent.role, 260);
    return `• ${text(agent.name || agent.id, 120)}${role ? ` – ${role}` : ""}`;
  });
  return `Aktuell habe ich ${list.length} aktive Mitarbeiter in meiner Registry:\n${rows.join("\n")}`;
}

function capabilityAnswer(agents = []) {
  const count = activeAgents(agents).length;
  return [
    "Ich bin dein zentraler Elyon-Orchestrator und Gesprächspartner.",
    "Ich kann normale Fragen selbst beantworten, Systemfragen einordnen, Aufgaben planen und spezialisierte Mitarbeiter gezielt einsetzen.",
    `Aktuell sehe ich ${count} aktive Mitarbeiter in der Registry.`,
    "Für V0.1 delegiere ich nur an bekannte Registry-Agenten; unbekannte Anfragen bleiben im General Mode statt einen Agentenfehler auszulösen.",
    "Live-Veröffentlichungen auf eBay bleiben technisch gesperrt; ENTWURF bleibt der sichere Standard.",
  ].join(" ");
}

function statusAnswer(input = {}, agents = []) {
  const context = summarizeContext(input);
  const parts = [`Jarvis Brain V${JARVIS_BRAIN_VERSION} ist aktiv. ${activeAgents(agents).length} Mitarbeiter sind aktuell verfügbar.`];
  if (context.product?.title) parts.push(`Aktuell ausgewähltes Produkt: ${context.product.title}${context.product.status ? ` (${context.product.status})` : ""}.`);
  if (context.tasks.count) parts.push(`Im übergebenen Arbeitskontext sehe ich ${context.tasks.count} Aufgaben und ${context.tasks.blockerCount} dokumentierte Blocker.`);
  else parts.push("Im aktuellen HUD-Kontext wurden mir keine offenen Agentenaufgaben übergeben.");
  parts.push("Den vollständigen Live-Zustand von Company OS, Nova, eBay-Entwürfen und aktiven Listings lädt erst der Context Layer in Brain V0.2; ich erfinde dafür in V0.1 keine Zahlen.");
  return parts.join(" ");
}

function priorityAnswer(input = {}) {
  const context = summarizeContext(input);
  if (context.tasks.blockerCount > 0) {
    return `Als Nächstes würde ich die vorhandenen Blocker priorisieren. Im aktuellen Kontext sehe ich ${context.tasks.blockerCount} dokumentierte Blocker in ${context.tasks.count} Aufgaben. Den vollständigen Elyon-Systemstatus binde ich in V0.2 an die Source-of-Truth-APIs an.`;
  }
  if (context.product?.title) {
    return `Als Nächstes würde ich den Workflow für „${context.product.title}“ weiterführen und zuerst prüfen, ob Produktdaten, Compliance und Marge vollständig sind. Für eine systemweite Tagespriorisierung kommt in V0.2 der Elyon Context Layer dazu.`;
  }
  return "Für eine belastbare Tagespriorisierung brauche ich den systemweiten Elyon Context Layer aus V0.2. In V0.1 kann ich bereits normal mit dir sprechen, Registry-Agenten auswählen und vorhandenen HUD-Kontext auswerten, aber ich erfinde keine offenen Aufgaben.";
}

function deterministicDirectAnswer(command, intent, agents, input) {
  if (isGreeting(command)) return "Hi. Jarvis ist da. Was möchtest du als Nächstes in Elyon prüfen oder erledigen?";
  if (asksCapabilities(command)) return capabilityAnswer(agents);
  if (asksAgents(command)) return agentListAnswer(agents);
  if (asksSystemStatus(command)) return statusAnswer(input, agents);
  if (asksPriority(command)) return priorityAnswer(input);
  if (intent?.id === "system_question" && /\b(jarvis brain|was bist du|wer bist du)\b/.test(normalize(command))) {
    return `Ich bin Elyon Jarvis Brain V${JARVIS_BRAIN_VERSION}: Gesprächspartner, Planner und Orchestrator vor deiner bestehenden Agent Registry. Normale Anfragen beantworte ich selbst; Spezialaufgaben delegiere ich nur an bekannte Mitarbeiter.`;
  }
  return "";
}

function safeGeneralFallback(intent, reason = "") {
  if (reason === "missing_product") return "Ich kann die Produktaufgabe übernehmen, aber im aktuellen Kontext ist kein konkretes Produkt ausgewählt oder mitgegeben. Sobald Produktdaten vorhanden sind, kann ich den passenden Mitarbeiter gezielt einsetzen.";
  if (reason === "missing_listing") return "Ich kann die Qualitätsprüfung übernehmen, aber im aktuellen Kontext ist kein Listing-Entwurf vorhanden. Sobald ein Entwurf mitgegeben wird, kann ich den passenden Quality-Agent einsetzen.";
  if (reason === "no_suitable_agent") return "Für diese spezialisierte Aufgabe ist aktuell kein ausreichend passender aktiver Mitarbeiter registriert. Ich bleibe deshalb im General Mode, statt einen Agentenfehler auszulösen.";
  if (intent?.id === "unknown") return "Ich habe die Anfrage verstanden. Dafür ist kein Spezial-Agent zwingend nötig, deshalb bleibe ich im General Mode.";
  return "Ich kann dir dabei im Jarvis General Mode helfen. Ein Spezial-Agent ist für diese Anfrage nicht erforderlich.";
}

export async function generateGeneralJarvisReply({ command, intent, agents = [], input = {}, reason = "" } = {}) {
  const deterministic = deterministicDirectAnswer(command, intent, agents, input);
  if (deterministic) {
    return {
      answer: deterministic,
      provider: "local",
      model: "deterministic-v0.1",
      fallbackUsed: false,
      usage: null,
    };
  }

  const context = summarizeContext(input);
  const registrySummary = activeAgents(agents).slice(0, 20).map((agent) => ({
    id: text(agent.id, 100),
    name: text(agent.name, 120),
    role: text(agent.role, 300),
    capabilities: (Array.isArray(agent.capabilities) ? agent.capabilities : []).slice(0, 10).map((item) => text(item, 160)),
  }));

  const ai = await routeAIRequest({
    task: "jarvis_general_conversation_v01",
    allowFallback: true,
    temperature: 0.25,
    maxTokens: 900,
    messages: [
      {
        role: "system",
        content: [
          "Du bist Elyon Jarvis Brain, der zentrale Gesprächspartner und Orchestrator des Elyon Seller Tools.",
          "Antworte auf Deutsch, klar, knapp und praktisch.",
          "Normale Gespräche beantwortest du selbst. Spezialagenten sind Werkzeuge, keine Voraussetzung für eine Antwort.",
          "Erfinde niemals Systemstatus, Produktdaten oder ausgeführte Aktionen.",
          "Wenn Kontext fehlt, sage präzise was du weißt und was nicht.",
          "Keine automatische Live-Veröffentlichung auf eBay. ENTWURF bleibt Standard. Keine irreversiblen externen Aktionen ohne Freigabe.",
          `Brain-Version: ${JARVIS_BRAIN_VERSION}. Intent: ${text(intent?.id, 80) || "unknown"}.`,
          `Grund für General Mode: ${reason || "direct"}.`,
          `Verfügbarer Kurzkontext: ${JSON.stringify(context).slice(0, 3000)}.`,
          `Aktive Registry-Mitarbeiter: ${JSON.stringify(registrySummary).slice(0, 5000)}.`,
        ].join("\n"),
      },
      { role: "user", content: text(command, 12000) },
    ],
    safety: {
      securityMode: true,
      sandboxMode: true,
      autonomyLocked: true,
      requiresLiveAction: false,
      userApproved: false,
    },
  });

  if (!ai.ok || ai.provider === "local" || !text(ai.content, 12000)) {
    return {
      answer: safeGeneralFallback(intent, reason),
      provider: ai.provider || "local",
      model: ai.model || "local-fallback",
      fallbackUsed: true,
      usage: ai.usage || null,
    };
  }

  return {
    answer: text(ai.content, 12000),
    provider: ai.provider,
    model: ai.model,
    fallbackUsed: ai.fallbackUsed === true,
    usage: ai.usage || null,
  };
}

function directPlan({ id, command, intent, answer, reason = "", warnings = [] }) {
  return {
    version: 2,
    brainVersion: JARVIS_BRAIN_VERSION,
    correlationId: id,
    objective: text(command, 12000),
    status: "ready",
    intent,
    answerDirectly: true,
    steps: [{ type: "respond", action: "general_reply" }],
    delegations: [],
    blockers: [],
    warnings: [...warnings],
    requiresUserApproval: false,
    executable: false,
    fallbackReason: reason,
    answer: text(answer, 12000),
  };
}

function specializedPlan(basePlan, id, intent) {
  return {
    ...basePlan,
    version: 2,
    brainVersion: JARVIS_BRAIN_VERSION,
    correlationId: basePlan.correlationId || id,
    agentIntent: basePlan.intent,
    intent,
    answerDirectly: false,
    steps: (Array.isArray(basePlan.delegations) ? basePlan.delegations : []).map((delegation) => ({
      type: "agent",
      agent: delegation.agentId,
      action: delegation.action || "run_agent",
      capability: delegation.capability || "",
    })),
  };
}

function brainSummary(answer, status = "completed") {
  return {
    status,
    summary: text(answer, 12000),
    successful: 0,
    failed: 0,
    blockers: [],
    warnings: [],
  };
}

export async function runJarvisBrain({
  command,
  agents = [],
  input = {},
  explicitAgentId = "",
  requestedCapability = "",
  maxAgents = 3,
  execute = false,
  executePlan,
  generalResponder = generateGeneralJarvisReply,
} = {}) {
  const id = requestId();
  const objective = text(command, 12000);
  const intent = inferJarvisBrainIntent(objective);
  const forcedSpecialist = Boolean(text(explicitAgentId, 100) || text(requestedCapability, 100));
  const direct = !forcedSpecialist && shouldJarvisAnswerDirectly(intent);

  if (direct) {
    const response = await generalResponder({ command: objective, intent, agents, input, reason: "direct_intent" });
    const plan = directPlan({ id, command: objective, intent, answer: response.answer, reason: "direct_intent" });
    return {
      statusCode: 200,
      payload: {
        ok: true,
        phase: "brain-v0.1",
        version: 2,
        mode: "direct",
        requestId: id,
        answer: response.answer,
        plan,
        summary: brainSummary(response.answer),
        ai: {
          provider: response.provider,
          model: response.model,
          fallbackUsed: response.fallbackUsed,
          usage: response.usage,
        },
        safety: {
          externalActionsLocked: true,
          livePublishingAllowed: false,
          registryIsSourceOfTruth: true,
          answerDirectly: true,
        },
      },
    };
  }

  const missing = missingRequiredContext(intent, objective, input);
  if (missing) {
    const reason = missing === "listingDraft" ? "missing_listing" : "missing_product";
    const response = await generalResponder({ command: objective, intent, agents, input, reason });
    const plan = directPlan({ id, command: objective, intent, answer: response.answer, reason });
    return {
      statusCode: 200,
      payload: {
        ok: true,
        phase: "brain-v0.1",
        version: 2,
        mode: "direct",
        requestId: id,
        answer: response.answer,
        plan,
        summary: brainSummary(response.answer, "needs_input"),
        safety: {
          externalActionsLocked: true,
          livePublishingAllowed: false,
          registryIsSourceOfTruth: true,
          answerDirectly: true,
        },
      },
    };
  }

  const inferredCapability = requestedCapability || SPECIALIZED_CAPABILITY[intent.id] || "";
  const keepCoreMultiAgentInference = intent.id === "product_analysis" && /\b(komplett|vollstandig|gesamt)\b/.test(normalize(objective));
  const planningAgents = planningAgentsForCapability(agents, inferredCapability, explicitAgentId);
  const basePlan = createJarvisPlan({
    command: objective,
    agents: planningAgents,
    explicitAgentId,
    requestedCapability: keepCoreMultiAgentInference ? "" : inferredCapability,
    maxAgents,
  });
  const plan = specializedPlan(basePlan, id, intent);

  if (basePlan.status === "blocked") {
    const message = "Diese Aktion ist für Jarvis technisch gesperrt. Ich kann stattdessen einen sicheren Entwurfs- oder Prüfpfad vorbereiten.";
    return {
      statusCode: 403,
      payload: {
        ok: false,
        error: "jarvis_action_blocked",
        message,
        phase: "brain-v0.1",
        version: 2,
        mode: "blocked",
        requestId: id,
        answer: message,
        plan,
        summary: { ...brainSummary(message, "blocked"), blockers: [...(basePlan.blockers || [])] },
        safety: { externalActionsLocked: true, livePublishingAllowed: false, registryIsSourceOfTruth: true },
      },
    };
  }

  if (!basePlan.executable) {
    const response = await generalResponder({ command: objective, intent, agents, input, reason: "no_suitable_agent" });
    const fallbackPlan = directPlan({
      id,
      command: objective,
      intent,
      answer: response.answer,
      reason: "no_suitable_agent",
      warnings: basePlan.warnings || [],
    });
    return {
      statusCode: 200,
      payload: {
        ok: true,
        phase: "brain-v0.1",
        version: 2,
        mode: "direct",
        requestId: id,
        answer: response.answer,
        plan: fallbackPlan,
        routing: { attemptedSpecialist: true, fallbackUsed: true },
        summary: brainSummary(response.answer, "completed"),
        ai: {
          provider: response.provider,
          model: response.model,
          fallbackUsed: response.fallbackUsed,
          usage: response.usage,
        },
        safety: {
          externalActionsLocked: true,
          livePublishingAllowed: false,
          registryIsSourceOfTruth: true,
          answerDirectly: true,
        },
      },
    };
  }

  if (!execute) {
    return {
      statusCode: 200,
      payload: {
        ok: true,
        phase: "brain-v0.1",
        version: 2,
        mode: "plan",
        requestId: id,
        plan,
        summary: summarizeJarvisRuns(plan, []),
        safety: {
          externalActionsLocked: true,
          livePublishingAllowed: false,
          registryIsSourceOfTruth: true,
          nothingExecuted: true,
        },
      },
    };
  }

  if (typeof executePlan !== "function") {
    const message = "Der sichere Agenten-Executor ist für diese Anfrage nicht verfügbar.";
    return {
      statusCode: 503,
      payload: {
        ok: false,
        error: "jarvis_executor_unavailable",
        message,
        phase: "brain-v0.1",
        version: 2,
        mode: "execute",
        requestId: id,
        plan,
      },
    };
  }

  const runs = await executePlan(plan);
  const summary = summarizeJarvisRuns(plan, runs);
  const successful = runs.some((run) => run?.ok);
  return {
    statusCode: successful ? 200 : 502,
    payload: {
      ok: successful,
      phase: "brain-v0.1",
      version: 2,
      mode: "execute",
      requestId: id,
      correlationId: plan.correlationId,
      plan,
      runs,
      summary,
      safety: {
        externalActionsLocked: true,
        livePublishingAllowed: false,
        registryIsSourceOfTruth: true,
      },
    },
  };
}

export {
  DIRECT_INTENTS,
  DYNAMIC_SPECIALIST_TERMS,
  JARVIS_BRAIN_INTENTS,
  JARVIS_BRAIN_VERSION,
  SPECIALIZED_CAPABILITY,
  planningAgentsForCapability,
  summarizeContext,
};
