(() => {
  "use strict";

  const PANEL_ID = "elyonJarvisPanel";
  const STYLE_ID = "elyonJarvisDelegationStylesV2A2";
  const VERSION = "jarvis-ui-response-adapter-v4";
  const directAnswers = new Map();

  function text(value, fallback = "") {
    if (value === null || value === undefined) return fallback;
    return String(value).trim();
  }

  function isDirectAnswer(payload = {}) {
    const mode = text(payload?.mode).toLowerCase();
    if (["brain", "direct", "memory_write"].includes(mode) || mode === "brain_auto_delegated") return true;
    if (payload?.plan?.brainHandled === true) return true;
    return payload?.plan?.answerDirectly === true && payload?.plan?.executable !== true;
  }

  function installDelegationStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .elyon-jarvis-specialists{margin-top:10px;padding:10px;border-radius:12px;border:1px solid rgba(125,211,252,.18);background:rgba(2,12,27,.42);display:grid;gap:8px}
      .elyon-jarvis-specialists-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10px;color:#bae6fd}
      .elyon-jarvis-specialists-head strong{font-size:10px;color:#e0f2fe;letter-spacing:.04em}
      .elyon-jarvis-specialists-head span{font-size:9px;color:#7dd3fc}
      .elyon-jarvis-specialist-row{display:grid;grid-template-columns:18px minmax(0,1fr);gap:7px;align-items:start;padding:7px 8px;border-radius:9px;border:1px solid rgba(148,163,184,.1);background:rgba(15,23,42,.36)}
      .elyon-jarvis-specialist-icon{font-size:11px;line-height:1.35;text-align:center}
      .elyon-jarvis-specialist-copy{min-width:0}.elyon-jarvis-specialist-copy b{display:block;color:#e5e7eb;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.elyon-jarvis-specialist-copy small{display:block;margin-top:2px;color:#94a3b8;font-size:9px;line-height:1.35}
      .elyon-jarvis-specialist-row[data-state="working"] .elyon-jarvis-specialist-icon{animation:elyonJarvisDelegatePulse .9s ease-in-out infinite}.elyon-jarvis-specialist-row[data-state="warning"]{border-color:rgba(251,191,36,.2)}.elyon-jarvis-specialist-row[data-state="error"]{border-color:rgba(248,113,113,.2)}.elyon-jarvis-specialist-row[data-state="success"]{border-color:rgba(74,222,128,.17)}
      .elyon-jarvis-live-delegation{margin-top:2px}
      @keyframes elyonJarvisDelegatePulse{0%,100%{opacity:.45;transform:scale(.9)}50%{opacity:1;transform:scale(1.08)}}
      @media(prefers-reduced-motion:reduce){.elyon-jarvis-specialist-row[data-state="working"] .elyon-jarvis-specialist-icon{animation:none}}
    `;
    document.head.appendChild(style);
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
    body.textContent = text(payload.answer) || "Jarvis hat keine Antwort geliefert.";
    body.style.whiteSpace = "pre-wrap";
    message.appendChild(body);
    return true;
  }

  function compactRememberedPayload(payload = {}) {
    return {
      mode: payload?.mode,
      answer: text(payload?.answer),
      autoDelegation: payload?.autoDelegation && typeof payload.autoDelegation === "object" ? payload.autoDelegation : null,
      runs: Array.isArray(payload?.runs) ? payload.runs : [],
      marketScout: payload?.marketScout && typeof payload.marketScout === "object" ? payload.marketScout : null,
    };
  }

  function rememberDirectAnswer(message, payload) {
    const messages = jarvisMessages();
    const index = messages.indexOf(message);
    if (index >= 0) directAnswers.set(index, compactRememberedPayload(payload));
  }

  function runResult(run = {}) {
    return run?.payload?.result || run?.payload?.task?.result || {};
  }

  function runState(run = {}) {
    const result = runResult(run);
    const status = text(result?.status || run?.payload?.task?.status).toLowerCase();
    const blockers = Array.isArray(result?.blockers) ? result.blockers.filter(Boolean) : [];
    if (run?.ok !== true) return "error";
    if (status === "blocked" || blockers.length) return "warning";
    return "success";
  }

  function stateIcon(state) {
    return ({ working: "●", queued: "○", success: "✓", warning: "⚠", error: "✕" })[state] || "•";
  }

  function stateLabel(state) {
    return ({ working: "arbeitet …", queued: "wartet …", success: "abgeschlossen", warning: "Freigabe / Prüfung nötig", error: "fehlgeschlagen" })[state] || "Status unbekannt";
  }

  function capabilityLabel(value) {
    const key = text(value).toLowerCase();
    return ({
      product_data: "Produktdaten",
      compliance: "Compliance",
      profit: "Wirtschaftlichkeit",
      listing: "Listing",
      draft_quality: "Draft-Qualität",
      orders: "Bestellungen",
      support: "Kundenservice",
      workflow: "Workflow",
      market_research: "Marktrecherche",
    })[key] || text(value, "Analyse");
  }

  function specialistRow({ name, capability, state, summary } = {}) {
    const row = document.createElement("div");
    row.className = "elyon-jarvis-specialist-row";
    row.dataset.state = state || "queued";

    const icon = document.createElement("span");
    icon.className = "elyon-jarvis-specialist-icon";
    icon.textContent = stateIcon(state);

    const copy = document.createElement("div");
    copy.className = "elyon-jarvis-specialist-copy";
    const title = document.createElement("b");
    title.textContent = text(name, "Spezialist");
    const detail = document.createElement("small");
    detail.textContent = summary
      ? `${capabilityLabel(capability)} · ${summary}`
      : `${capabilityLabel(capability)} · ${stateLabel(state)}`;
    copy.append(title, detail);
    row.append(icon, copy);
    return row;
  }

  function specialistPanel(titleText, metaText) {
    installDelegationStyles();
    const panel = document.createElement("div");
    panel.className = "elyon-jarvis-specialists";
    const head = document.createElement("div");
    head.className = "elyon-jarvis-specialists-head";
    const title = document.createElement("strong");
    title.textContent = titleText;
    const meta = document.createElement("span");
    meta.textContent = metaText;
    head.append(title, meta);
    panel.appendChild(head);
    return panel;
  }

  function renderPendingDelegation(preview = {}) {
    const specialists = Array.isArray(preview?.specialists) ? preview.specialists : [];
    if (preview?.willAutoDelegate !== true || !specialists.length) return false;
    const feed = document.querySelector(`#${PANEL_ID} [data-jarvis-feed]`);
    if (!feed) return false;
    feed.querySelectorAll("[data-jarvis-auto-live]").forEach((node) => node.remove());

    const article = document.createElement("article");
    article.className = "elyon-jarvis-message jarvis elyon-jarvis-live-delegation";
    article.dataset.jarvisAutoLive = "1";
    const head = document.createElement("div");
    head.className = "elyon-jarvis-message-head";
    const title = document.createElement("strong");
    title.textContent = "Jarvis · Spezialisten";
    const time = document.createElement("small");
    time.textContent = "LIVE";
    head.append(title, time);
    article.appendChild(head);

    const panel = specialistPanel("Automatische Delegation", `${specialists.length} ausgewählt`);
    specialists.forEach((item, index) => {
      panel.appendChild(specialistRow({
        name: item.agentName || item.agentId,
        capability: item.capability,
        state: item.state || (index === 0 ? "working" : "queued"),
      }));
    });
    article.appendChild(panel);
    feed.appendChild(article);
    feed.scrollTop = feed.scrollHeight;
    return true;
  }

  function finalSpecialists(payload = {}) {
    const runs = Array.isArray(payload?.runs) ? payload.runs : [];
    if (runs.length) {
      return runs.map((run) => {
        const result = runResult(run);
        return {
          name: run.agentName || run.agentId,
          capability: run.capability,
          state: runState(run),
          summary: text(result?.summary || run?.message, 500),
        };
      });
    }
    if (payload?.autoDelegation?.executed === true && payload?.autoDelegation?.type === "market_scout") {
      return [{
        name: "Market Scout",
        capability: "market_research",
        state: payload?.autoDelegation?.successful === false ? "error" : "success",
        summary: text(payload?.marketScout?.summary, 500),
      }];
    }
    return [];
  }

  function renderFinalDelegationPanel(message, payload = {}) {
    if (!message) return false;
    message.querySelectorAll("[data-jarvis-specialists-final]").forEach((node) => node.remove());
    const specialists = finalSpecialists(payload);
    if (!specialists.length || payload?.autoDelegation?.executed !== true) return false;

    const successCount = specialists.filter((item) => item.state === "success").length;
    const warningCount = specialists.filter((item) => item.state === "warning").length;
    const errorCount = specialists.filter((item) => item.state === "error").length;
    const meta = [
      successCount ? `${successCount} ✓` : "",
      warningCount ? `${warningCount} ⚠` : "",
      errorCount ? `${errorCount} ✕` : "",
    ].filter(Boolean).join(" · ") || `${specialists.length} abgeschlossen`;

    const panel = specialistPanel("Ausgeführte Spezialisten", meta);
    panel.dataset.jarvisSpecialistsFinal = "1";
    specialists.forEach((item) => panel.appendChild(specialistRow(item)));
    message.appendChild(panel);
    return true;
  }

  function repairRememberedDirectAnswers() {
    const messages = jarvisMessages();
    for (const [index, payload] of directAnswers.entries()) {
      if (!messages[index]) continue;
      replaceMessageBody(messages[index], payload);
      renderFinalDelegationPanel(messages[index], payload);
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

  function decorateAutoMode() {
    const shell = document.getElementById(PANEL_ID);
    if (!shell) return false;
    const primary = shell.querySelector("[data-jarvis-plan]");
    const execute = shell.querySelector("[data-jarvis-execute]");
    const input = shell.querySelector("[data-jarvis-panel-input]");
    const statusHint = shell.querySelector(".elyon-jarvis-status-copy span");
    if (primary) primary.textContent = "Jarvis starten";
    if (execute) execute.textContent = "Direkt ausführen";
    if (input) input.placeholder = "Frag Jarvis oder gib einen Auftrag – sichere interne Aufgaben delegiert er selbst …";
    if (statusHint) statusHint.textContent = "Auto-Delegation intern · externe Aktionen bleiben gesperrt";
    return true;
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
      decorateAutoMode();
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

  window.addEventListener("elyon:jarvis-auto-preview", (event) => {
    renderPendingDelegation(event?.detail?.preview || {});
  });

  window.addEventListener("elyon:jarvis-ui-result", (event) => {
    const payload = event?.detail?.payload || {};
    if (isDirectAnswer(payload)) renderDirectAnswer(payload);
    removeInvalidRunButton(payload);
    repairRememberedDirectAnswers();
    decorateAutoMode();
  });

  window.addEventListener("elyon:jarvis-ready", () => decorateAutoMode());
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
    decorateAutoMode,
    renderPendingDelegation,
    renderFinalDelegationPanel,
  });

  queueMicrotask(() => {
    installDelegationStyles();
    decorateAutoMode();
    refreshSystemStatus();
  });
})();
