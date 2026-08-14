(() => {
  "use strict";

  const PANEL_ID = "elyonJarvisPanel";
  const VERSION = "jarvis-ui-response-adapter-v2";
  const directAnswers = new Map();

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

  function jarvisMessages() {
    return Array.from(document.querySelectorAll(`#${PANEL_ID} .elyon-jarvis-message.jarvis`));
  }

  function latestJarvisMessage() {
    const messages = jarvisMessages();
    return messages.length ? messages[messages.length - 1] : null;
  }

  function replaceMessageBody(message, payload = {}) {
    if (!message) return false;
    const head = message.querySelector(".elyon-jarvis-message-head");
    const title = head?.querySelector("strong");
    if (title) title.textContent = payload?.mode === "memory_write" ? "Jarvis · Erinnerung" : "Jarvis";

    for (const child of Array.from(message.children)) {
      if (child !== head) child.remove();
    }

    const body = document.createElement("p");
    body.textContent = text(payload?.answer, "Jarvis hat keine Antwort geliefert.");
    body.style.whiteSpace = "pre-wrap";
    message.appendChild(body);
    return true;
  }

  function rememberDirectAnswer(message, payload) {
    const messages = jarvisMessages();
    const index = messages.indexOf(message);
    if (index >= 0) directAnswers.set(index, { mode: payload?.mode, answer: text(payload?.answer) });
  }

  function repairRememberedDirectAnswers() {
    const messages = jarvisMessages();
    for (const [index, payload] of directAnswers.entries()) {
      if (messages[index]) replaceMessageBody(messages[index], payload);
    }
  }

  function renderDirectAnswer(payload = {}) {
    const message = latestJarvisMessage();
    if (!message) return false;
    rememberDirectAnswer(message, payload);
    return replaceMessageBody(message, payload);
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
    repairRememberedDirectAnswers();
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