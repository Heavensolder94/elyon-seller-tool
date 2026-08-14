import { routeAIRequest } from "./ai-provider-router.js";

function text(value, max = 4000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function normalize(value) {
  return text(value, 12000)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function activeAgents(agents = []) {
  return (Array.isArray(agents) ? agents : []).filter((agent) => agent && agent.enabled !== false);
}

function deterministicReply(command, agents = []) {
  const value = normalize(command);
  if (/^(jarvis|jarvis bist du da|bist du da jarvis|hey jarvis|hallo jarvis)$/.test(value)) {
    return "Ja, ich bin da. Was möchtest du als Nächstes in Elyon prüfen oder erledigen?";
  }
  if (/^(hi|hallo|hey|moin|servus)( jarvis)?$/.test(value)) {
    return "Hi. Jarvis ist da. Was möchtest du als Nächstes in Elyon prüfen oder erledigen?";
  }
  if (/\b(was kannst du|was kannst du alles|wobei kannst du helfen|wer bist du|was bist du)\b/.test(value)) {
    return `Ich bin dein zentraler Elyon-Jarvis. Ich kann mit dir normal sprechen, Aufgaben einordnen und passende virtuelle Mitarbeiter einsetzen. Aktuell sind ${activeAgents(agents).length} Mitarbeiter in der Registry aktiv. Live-Veröffentlichungen und andere irreversible externe Aktionen bleiben gesperrt.`;
  }
  return "";
}

async function createGeneralJarvisReply({ command, agents = [], reason = "no_suitable_agent" } = {}) {
  const deterministic = deterministicReply(command, agents);
  if (deterministic) {
    return {
      answer: deterministic,
      provider: "local",
      model: "deterministic-general-v1",
      fallbackUsed: false,
    };
  }

  const registrySummary = activeAgents(agents).slice(0, 20).map((agent) => ({
    id: text(agent.id, 100),
    name: text(agent.name, 120),
    role: text(agent.role, 300),
    capabilities: (Array.isArray(agent.capabilities) ? agent.capabilities : []).slice(0, 10).map((item) => text(item, 160)),
  }));

  const result = await routeAIRequest({
    task: "jarvis_general_conversation",
    model: "openrouter/free",
    allowFallback: true,
    temperature: 0.25,
    maxTokens: 700,
    messages: [
      {
        role: "system",
        content: [
          "Du bist Elyon Jarvis, der zentrale Gesprächspartner und Orchestrator des Elyon Seller Tools.",
          "Antworte auf Deutsch, klar, knapp und praktisch.",
          "Normale Gespräche beantwortest du selbst. Spezialagenten sind Werkzeuge und keine Voraussetzung für eine Antwort.",
          "Erfinde niemals Systemstatus, Produktdaten oder ausgeführte Aktionen.",
          "Wenn Kontext fehlt, sage das klar.",
          "Keine automatische eBay-Live-Veröffentlichung und keine irreversiblen externen Aktionen ohne Freigabe.",
          `General-Mode-Grund: ${text(reason, 100)}.`,
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

  const content = text(result?.content, 12000);
  if (result?.ok && result?.provider !== "local" && content) {
    return {
      answer: content,
      provider: result.provider,
      model: result.model,
      fallbackUsed: result.fallbackUsed === true,
    };
  }

  return {
    answer: "Ich bin da. Für diese Anfrage brauche ich keinen Spezial-Agenten. Sag mir einfach, was du wissen, prüfen oder erledigen möchtest.",
    provider: result?.provider || "local",
    model: result?.model || "local-fallback",
    fallbackUsed: true,
  };
}

export { createGeneralJarvisReply, deterministicReply, normalize };
