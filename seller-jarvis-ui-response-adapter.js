(() => {
  "use strict";

  const PANEL_ID = "elyonJarvisPanel";
  const VERSION = "jarvis-ui-response-adapter-v1";

  function text(value, fallback = "") {
    if (value === null || value === undefined) return fallback;
    return String(value).trim();
  }

  function isDirectAnswer(payload = {}) {
    const mode = text(payload?.mode).toLowerCase();
    if (["brain", "direct", "memory_write"].includes(mode)) return true;
    if (payload?.plan?.brainHandled === true) return true;
    return payload?.plan?.answerDirectly === true && payload?.plan?.executable !== true;
  }

  function latestJarvisMessage() {
    const messages = document.querySelectorAll(`#${PANEL_ID} .elyon-jarvis-message.jarvis`);
    return messages.length ? messages[messages.length - 1] : null;
  }

  function renderDirectAnswer(payload = {}) {
    const message = latestJarvisMessage();
    if (!message) return false;
    const title = message.querySelector(".elyon-jarvis-message-head strong");
    const body = message.querySelector("p");
    if (title) title.textContent = payload?.mode === "memory_write" ? "Jarvis · Erinnerung" : "Jarvis";
    if (body && text(payload?.answer)) {
      body.textContent = text(payload.answer);
      body.style.whiteSpace = "pre-wrap";
    }
    message.querySelectorAll("[data-jarvis-run-last]").forEach((button) => button.remove());
    return true;
  }

  function removeInvalidRunButton(payload = {}) {
    if (payload?.plan?.executable === true && !isDirectAnswer(payload)) return;
    latestJarvisMessage()?.querySelectorAll("[data-jarvis-run-last]").forEach((button) => button.remove());
  }

  function applyStatus(payload = null, error = null) {
    const shell = document.getElementById(PANEL_ID);
    if (!shell) return;
    const liveNodes = shell.querySelectorAll("[data-jarvis-live]");
    const stateNodes = shell.querySelectorAll("[data-jarvis-state]");
    const statusCopy = shell.querySelector(".elyon-jarvis-status-copy strong");
    const healthy = !error && payload?.ok === true && payload?.jarvis === "ready";

    if (healthy) {
      shell.dataset.state = "ready";
      liveNodes.forEach((node) => { node.textContent = "ONLINE"; });
      stateNodes.forEach((node) => { node.textContent = "BEREIT"; });
      const brainVersion = text(payload?.brain?.version);
      if (statusCopy) statusCopy.textContent = brainVersion ? `Jarvis Brain ${brainVersion}` : "Jarvis Command HUD";
      return;
    }

    const status = Number(error?.status || 0);
    if (status === 401 || status === 403) return;
    shell.dataset.state = "offline";
    liveNodes.forEach((node) => { node.textContent = "OFFLINE"; });
    stateNodes.forEach((node) => { node.textContent = "OFFLINE"; });
    if (statusCopy) statusCopy.textContent = "Jarvis Backend nicht erreichbar";
  }

  async function refreshSystemStatus() {
    if (!window.ElyonJarvis?.status) return null;
    try {
      const payload = await window.ElyonJarvis.status();
      applyStatus(payload, null);
      return payload;
    } catch (error) {
      applyStatus(null, error);
      return null;
    }
  }

  window.addEventListener("elyon:jarvis-ui-result", (event) => {
    const payload = event?.detail?.payload || {};
    if (isDirectAnswer(payload)) renderDirectAnswer(payload);
    removeInvalidRunButton(payload);
  });

  window.addEventListener("elyon:seller-authenticated", () => refreshSystemStatus());
  window.addEventListener("elyon:seller-auth-ready", (event) => {
    if (event?.detail?.authenticated) refreshSystemStatus();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshSystemStatus();
  });

  window.ElyonJarvisUIResponseAdapter = Object.freeze({
    version: VERSION,
    isDirectAnswer,
    refreshSystemStatus,
  });

  queueMicrotask(() => refreshSystemStatus());
})();
