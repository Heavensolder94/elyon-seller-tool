import { SOUL_AGENTS, getAgentModeLabel, getAgentStatus, getAgentStatusLabel } from "../shared/agents.js";
import { getSecurityState } from "../shared/security.js";

function badgeClass(status) {
  return `badge badge-${String(status || "locked").toLowerCase()}`;
}

function renderPrompt(agent) {
  alert(`${agent.name}\n\n${agent.prompt}`);
}

function renderGuardrails(agent) {
  alert(`${agent.name}\n\n${agent.guardrails.join("\n")}`);
}

async function load() {
  const security = await getSecurityState();
  document.getElementById("agentState").textContent = security.aiEnabled ? "KI aktiv" : "KI-Verbindung nicht aktiv";
  const root = document.getElementById("agentGrid");
  root.innerHTML = SOUL_AGENTS.map((agent) => {
    const status = getAgentStatus(agent, security);
    return `
      <article class="card">
        <div class="top">
          <div>
            <div class="name">${agent.name}</div>
            <div class="role">${agent.role}</div>
          </div>
          <span class="${badgeClass(status)}">${getAgentStatusLabel(agent, security)}</span>
        </div>
        <div class="desc">${agent.description}</div>
        <div class="meta">Mode: ${getAgentModeLabel(agent, security)}</div>
        <div class="meta">Status: ${status}</div>
        <div class="buttons">
          <button type="button" data-open="${agent.id}">Agent öffnen</button>
          <button type="button" data-prompt="${agent.id}">Prompt anzeigen</button>
          <button type="button" data-guardrails="${agent.id}">Guardrails anzeigen</button>
          <button type="button" data-prepare="${agent.id}">Analyse vorbereiten</button>
        </div>
      </article>
    `;
  }).join("");

  root.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", () => {
      const agent = SOUL_AGENTS.find((entry) => entry.id === button.getAttribute("data-open"));
      if (agent) renderPrompt(agent);
    });
  });
  root.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      const agent = SOUL_AGENTS.find((entry) => entry.id === button.getAttribute("data-prompt"));
      if (agent) renderPrompt(agent);
    });
  });
  root.querySelectorAll("[data-guardrails]").forEach((button) => {
    button.addEventListener("click", () => {
      const agent = SOUL_AGENTS.find((entry) => entry.id === button.getAttribute("data-guardrails"));
      if (agent) renderGuardrails(agent);
    });
  });
  root.querySelectorAll("[data-prepare]").forEach((button) => {
    button.addEventListener("click", () => {
      const agent = SOUL_AGENTS.find((entry) => entry.id === button.getAttribute("data-prepare"));
      if (agent) alert(`${agent.name}\n\nVorbereitet, aber gesperrt\nKeine Live-Aktion\nNur Vorschau / Sandbox`);
    });
  });
}

void load();
