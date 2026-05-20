import { DEFAULT_SECURITY_STATE, getSecurityLabel, getSecurityState, setSecurityState } from "../shared/security.js";
import { getBackendUrl, setBackendUrl, pingBackend, getElyonStatus } from "../shared/apiClient.js";

const ids = ["securityMode", "sandboxMode", "autonomyLocked", "pauseAllAgents", "aiEnabled"];

function setLabelFromState(state) {
  const label = getSecurityLabel(state);
  document.getElementById("securityPreview").textContent = label;
  document.getElementById("securityDetail").textContent = [
    state.securityMode ? "Keine Live-Aktionen" : "Live-Aktionen erlaubt",
    state.sandboxMode ? "Sandbox aktiv" : "Sandbox inaktiv",
    state.autonomyLocked ? "Autonomie gesperrt" : "Autonomie frei",
    state.aiEnabled ? "AI aktiv" : "AI vorbereitet"
  ].join(" · ");
}

async function load() {
  const state = await getSecurityState().catch(() => DEFAULT_SECURITY_STATE);
  const merged = { ...DEFAULT_SECURITY_STATE, ...state };
  for (const id of ids) {
    const element = document.getElementById(id);
    if (element) element.checked = merged[id] === true;
  }
  setLabelFromState(merged);
  const backendUrl = await getBackendUrl().catch(() => "");
  const backendInput = document.getElementById("backendUrl");
  if (backendInput) backendInput.value = backendUrl || "";
  await refreshBackendStatus();
}

async function save() {
  const next = {};
  for (const id of ids) {
    next[id] = document.getElementById(id)?.checked === true;
  }
  const saved = await setSecurityState(next);
  setLabelFromState(saved);
}

async function refreshBackendStatus() {
  const status = await getElyonStatus().catch(() => ({ reachable: false, message: "Backend nicht erreichbar" }));
  const hint = document.getElementById("backendHint");
  if (hint) {
    hint.textContent = status.backendUrl
      ? `${status.reachable ? "Verbunden" : "Getrennt"} · ${status.message}`
      : "Backend-URL nicht gesetzt";
  }
}

document.getElementById("save").addEventListener("click", save);
document.getElementById("openResearch").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("options/research.html") });
});
document.getElementById("openAgents").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("options/agents.html") });
});
document.getElementById("backendUrl").addEventListener("change", async (event) => {
  await setBackendUrl(event.target.value);
  await refreshBackendStatus();
});
void load();
