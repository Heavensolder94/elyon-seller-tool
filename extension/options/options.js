import { DEFAULT_SECURITY_STATE, getSecurityLabel, getSecurityState, setSecurityState } from "../shared/security.js";
import { getBackendUrl, setBackendUrl, pingBackend, getElyonStatus } from "../shared/apiClient.js";
import { DEFAULT_UI_SETTINGS, getUISettings, resetUISettings, setUISettings } from "../shared/uiSettings.js";

const securityIds = ["securityMode", "sandboxMode", "autonomyLocked", "pauseAllAgents", "aiEnabled"];
const uiIds = [
  "overlayEnabled",
  "autoOpenOverlay",
  "showImagePreview",
  "autoSaveResearch",
  "rememberOverlayPosition",
  "showCommandBarHints",
  "showTabCountBadges",
  "notifyOnBackendFallback",
  "compactPopup"
];

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function readCheckbox(id) {
  return document.getElementById(id)?.checked === true;
}

function writeCheckbox(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = value === true;
}

function setSecurityPreview(state) {
  setText("securityPreview", getSecurityLabel(state));
  setText(
    "securityDetail",
    [
      state.securityMode ? "Keine Live-Aktionen" : "Live-Aktionen erlaubt",
      state.sandboxMode ? "Sandbox aktiv" : "Sandbox inaktiv",
      state.autonomyLocked ? "Autonomie gesperrt" : "Autonomie frei",
      state.aiEnabled ? "KI aktiv" : "KI vorbereitet"
    ].join(" | ")
  );
}

async function refreshBackendStatus() {
  const status = await getElyonStatus().catch(() => ({ backendUrl: "", reachable: false, message: "Backend nicht erreichbar" }));
  const backendHint = document.getElementById("backendHint");
  if (backendHint) {
    backendHint.textContent = status.backendUrl
      ? `${status.reachable ? "Verbunden" : "Getrennt"} | ${status.message}`
      : "Backend-URL nicht gesetzt";
  }
  return status;
}

async function load() {
  const security = { ...DEFAULT_SECURITY_STATE, ...(await getSecurityState().catch(() => DEFAULT_SECURITY_STATE)) };
  const ui = { ...DEFAULT_UI_SETTINGS, ...(await getUISettings().catch(() => DEFAULT_UI_SETTINGS)) };

  securityIds.forEach((id) => writeCheckbox(id, security[id]));
  uiIds.forEach((id) => writeCheckbox(id, ui[id]));

  setSecurityPreview(security);
  writeBackendUrl(await getBackendUrl().catch(() => ""));
  await refreshBackendStatus();
}

function writeBackendUrl(value) {
  const backendInput = document.getElementById("backendUrl");
  if (backendInput) backendInput.value = value || "";
}

async function save() {
  const nextSecurity = Object.fromEntries(securityIds.map((id) => [id, readCheckbox(id)]));
  const nextUI = Object.fromEntries(uiIds.map((id) => [id, readCheckbox(id)]));
  const savedSecurity = await setSecurityState(nextSecurity);
  const savedUI = await setUISettings(nextUI);
  const backendInput = document.getElementById("backendUrl");
  if (backendInput) {
    await setBackendUrl(backendInput.value || "");
  }
  setSecurityPreview(savedSecurity);
  setText("saveStatus", `Gespeichert | ${savedUI.overlayEnabled ? "Overlay aktiv" : "Overlay aus"}`);
  await refreshBackendStatus();
}

async function resetSafeDefaults() {
  const safe = {
    ...DEFAULT_SECURITY_STATE,
    securityMode: true,
    sandboxMode: true,
    autonomyLocked: true,
    pauseAllAgents: false,
    aiEnabled: false
  };
  const ui = await resetUISettings();
  securityIds.forEach((id) => writeCheckbox(id, safe[id]));
  uiIds.forEach((id) => writeCheckbox(id, ui[id]));
  setSecurityPreview(safe);
  setText("saveStatus", "Sichere Defaults geladen");
}

document.getElementById("save").addEventListener("click", save);
document.getElementById("resetSafeDefaults").addEventListener("click", resetSafeDefaults);
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
document.getElementById("testBackend").addEventListener("click", async () => {
  const status = await pingBackend().catch(() => ({ reachable: false, message: "Backend nicht erreichbar" }));
  setText("backendHint", status.reachable ? `Verbunden | ${status.message}` : `Getrennt | ${status.message}`);
});

securityIds.concat(uiIds).forEach((id) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("change", async () => {
      const currentSecurity = { ...DEFAULT_SECURITY_STATE, ...(await getSecurityState().catch(() => DEFAULT_SECURITY_STATE)) };
      const currentUI = { ...DEFAULT_UI_SETTINGS, ...(await getUISettings().catch(() => DEFAULT_UI_SETTINGS)) };
      const nextSecurity = { ...currentSecurity };
      const nextUI = { ...currentUI };
      for (const key of securityIds) nextSecurity[key] = readCheckbox(key);
      for (const key of uiIds) nextUI[key] = readCheckbox(key);
      const savedSecurity = await setSecurityState(nextSecurity);
      await setUISettings(nextUI);
      setSecurityPreview(savedSecurity);
    });
  }
});

void load();
