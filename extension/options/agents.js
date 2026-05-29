import { SOUL_AGENTS, getAgentModeLabel, getAgentStatus, getAgentStatusLabel } from "../shared/agents.js";
import { getSecurityState } from "../shared/security.js";

function badgeClass(status) {
  return `badge badge-${String(status || "locked").toLowerCase()}`;
}

function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  const storage = await chrome.storage.local.get("elyon_current_product").catch(() => ({}));
  const currentProduct = storage?.elyon_current_product || {};
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
            <div class="name">${escapeHtml(agent.name)}</div>
            <div class="role">${escapeHtml(agent.role)}</div>
          </div>
          <span class="${escapeHtml(badgeClass(status))}">${escapeHtml(getAgentStatusLabel(agent, security))}</span>
        </div>
        <div class="desc">${escapeHtml(agent.description)}</div>
        <div class="meta">Mode: ${escapeHtml(getAgentModeLabel(agent, security))}</div>
        <div class="meta">Status: ${escapeHtml(status)}</div>
        <div class="buttons">
          <button type="button" data-open="${escapeHtml(agent.id)}">Agent öffnen</button>
          <button type="button" data-prompt="${escapeHtml(agent.id)}">Prompt anzeigen</button>
          <button type="button" data-guardrails="${escapeHtml(agent.id)}">Guardrails anzeigen</button>
          <button type="button" data-prepare="${escapeHtml(agent.id)}">Analyse vorbereiten</button>
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
      const result = await sendBackgroundMessage(agent.id === "soul-scout"
        ? {
            type: "ELYON_RUN_AGENT_ANALYSIS",
            agentId: agent.id,
            product: currentProduct,
            context: { title: `${agent.name}: ${currentProduct.title || "Analyse"}`, url: currentProduct.url || "", notes: "Aus Agenten-Optionen gestartet. Keine Live-Aktion." }
          }
        : {
            type: "ELYON_PREPARE_AGENT_WORKFLOW",
            agentId: agent.id,
            context: { title: `${agent.name} vorbereitet` }
          });
      if (result?.ok) {
        document.getElementById("agentState").textContent = result.preparedOnly ? "Workflow vorbereitet" : "Analyse vorbereitet";
        renderWorkflowState(result.workflows || []);
        alert(`${agent.name}\n\n${result.message || "Workflow vorbereitet"}\nKeine Live-Aktion\nNur Vorschau / Sandbox`);
      } else {
        alert(result?.error || "Workflow konnte nicht vorbereitet werden");
      }
    });
  });
}

void load();
