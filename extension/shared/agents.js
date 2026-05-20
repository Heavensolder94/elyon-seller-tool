export const SOUL_AGENTS = [
  {
    id: "soul-scout",
    name: "Soul Scout",
    role: "Research & Produktanalyse",
    description: "Sammelt Signale aus Produktseiten, Research Memory und Marktbeobachtung.",
    mode: "preview",
    prompt: "Analysiere Produktdaten defensiv und bereite eine Zusammenfassung vor.",
    guardrails: ["Keine Live-Aktion", "Nur lokale Daten", "Keine autonomen Schritte"],
    enabled: true
  },
  {
    id: "soul-seo",
    name: "Soul SEO",
    role: "Listing- und Content-Optimierung",
    description: "Bereitet Titel-, Keyword- und Strukturvorschläge vor.",
    mode: "preview",
    prompt: "Erstelle nur Vorschläge für SEO-optimierte Inhalte.",
    guardrails: ["Keine Veröffentlichung", "Kein automatisches Listing", "Nur Vorschau"],
    enabled: true
  },
  {
    id: "soul-guard",
    name: "Soul Guard",
    role: "Security & Policy",
    description: "Prüft Sicherheitsstatus und blockiert riskante Workflows.",
    mode: "locked",
    prompt: "Bewerte Aktionen gegen Sicherheitsregeln und markiere Risiken.",
    guardrails: ["Blockiert Live-Aktionen", "Keine Umgehung", "Freigaben erforderlich"],
    enabled: true
  },
  {
    id: "soul-finance",
    name: "Soul Finance",
    role: "Kalkulation & Marge",
    description: "Bereitet Preis-, Kosten- und Margen-Signale vor.",
    mode: "preview",
    prompt: "Berechne nur vorbereitende Finanz-Signale ohne Ausführung.",
    guardrails: ["Keine Zahlung", "Keine Buchung", "Keine externen Transfers"],
    enabled: true
  },
  {
    id: "soul-operations",
    name: "Soul Operations",
    role: "Workflow & Operationen",
    description: "Organisiert vorbereitende Aufgaben und Statusfolgen.",
    mode: "sandbox",
    prompt: "Plane Arbeitsschritte, aber führe keine autonomen Aktionen aus.",
    guardrails: ["Keine autonomen Schritte", "Keine Live-Operationen", "Sandbox only"],
    enabled: true
  },
  {
    id: "soul-support",
    name: "Soul Support",
    role: "Kundenkommunikation",
    description: "Bereitet Support-Antworten und Kommunikationsentwürfe vor.",
    mode: "locked",
    prompt: "Formuliere nur Antwortvorschläge, sende nichts automatisch.",
    guardrails: ["Kein automatisches Senden", "Keine Kundennachricht", "Nur Entwurf"],
    enabled: true
  }
];

export function getAgentStatus(agent, securityState = {}) {
  const securityMode = securityState.securityMode !== false;
  const sandboxMode = securityState.sandboxMode !== false;
  const aiEnabled = securityState.aiEnabled === true;

  if (!agent?.enabled) return "locked";
  if (!aiEnabled) return "prepared";
  if (securityMode) return "locked";
  if (sandboxMode) return "sandbox";
  return "active";
}

export function getAgentStatusLabel(agent, securityState) {
  const status = getAgentStatus(agent, securityState);
  if (status === "prepared") return "Vorbereitet, aber gesperrt";
  if (status === "sandbox") return "Nur Vorschau / Sandbox";
  if (status === "locked") return "KI-Verbindung nicht aktiv";
  if (status === "active") return "Aktiv";
  return "Keine Live-Aktion";
}

export function getAgentModeLabel(agent, securityState = {}) {
  const aiEnabled = securityState.aiEnabled === true;
  if (!aiEnabled) return "KI-Verbindung nicht aktiv";
  if (securityState.securityMode !== false || securityState.sandboxMode !== false) return "Nur Vorschau / Sandbox";
  return agent?.mode || "preview";
}
