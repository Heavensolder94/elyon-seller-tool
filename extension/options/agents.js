import { SOUL_AGENTS, getAgentModeLabel, getAgentStatus, getAgentStatusLabel } from "../shared/agents.js";
import { getSecurityState } from "../shared/security.js";

function badgeClass(status) {
  return `badge badge-${String(status || "locked").toLowerCase()}`;
}

async function sendBackgroundMessage(payload) {
  try {
    return await chrome.runtime.sendMessage(payload);
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

function renderPrompt(agent) {
  alert(`${agent.name}\n\n${agent.prompt}`);
}

function renderGuardrails(agent) {
  alert(`${agent.name}\n\n${agent.guardrails.join("\n")}`);
}

function renderWorkflowState(workflows = []) {
  const latest = Array.isArray(workflows) && workflows.length ? workflows[0] : null;
  const state = document.getElementById("workflowState");
  const hint = document.getElementById("workflowHint");
  if (state) {
    state.textContent = latest ? `${latest.agentName} · ${latest.status}` : "Noch kein Workflow vorbereitet";
  }
  if (hint) {
    hint.textContent = latest
      ? `${latest.title || "Vorbereitung"} | ${latest.notes || "Analyse vorbereitet"}`
      : "Klicke bei einem Agenten auf Analyse vorbereiten, um einen Workflow lokal zu speichern.";
  }
}

async function load() {
  const security = await getSecurityState();
  document.getElementById("agentState").textContent = security.aiEnabled ? "KI aktiv" : "KI-Verbindung nicht aktiv";
  const workflowsResult = await sendBackgroundMessage({ type: "ELYON_AGENT_WORKFLOWS_LIST" });
  renderWorkflowState(Array.isArray(workflowsResult?.workflows) ? workflowsResult.workflows : []);
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
    button.addEventListener("click", async () => {
      const agent = SOUL_AGENTS.find((entry) => entry.id === button.getAttribute("data-prepare"));
      if (!agent) return;
      const result = await sendBackgroundMessage({
        type: "ELYON_PREPARE_AGENT_WORKFLOW",
        agentId: agent.id,
        context: { title: `${agent.name} vorbereitet` }
      });
      if (result?.ok) {
        document.getElementById("agentState").textContent = "Workflow vorbereitet";
        renderWorkflowState(result.workflows || []);
        alert(`${agent.name}\n\nWorkflow vorbereitet\nKeine Live-Aktion\nNur Vorschau / Sandbox`);
      } else {
        alert(result?.error || "Workflow konnte nicht vorbereitet werden");
      }
    });
  });
}

void load();
