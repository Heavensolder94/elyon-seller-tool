(() => {
  "use strict";

  const ROOT_ID = "virtualAgentsSettingsRoot";
  const SHELL_ID = "elyonAiWorkforce";
  const STYLE_ID = "elyonVirtualAgentsRedesignStyles";
  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const TASKS_KEY = "elyon_ai_workforce_tasks";
  const DEFAULT_VIEW = "team";
  const VISIBLE_AGENT_IDS = [
    "elyon-manager",
    "elyon-product-data-specialist",
    "elyon-compliance-specialist",
    "elyon-profit-specialist",
    "elyon-listing-specialist",
    "elyon-draft-quality-guard",
    "elyon-order-specialist",
    "elyon-customer-support-specialist",
  ];

  let observer = null;
  let observedRoot = null;
  let scheduled = false;

  const text = (value) => String(value ?? "").trim();

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #virtualAgentsTab .settings-agents-header{display:none!important}
      #virtualAgentsSettingsRoot{display:block!important;min-width:0}
      #virtualAgentsSettingsRoot>.virtual-agents-shell{display:none!important}
      .aiw-shell.aiw-redesigned{margin:0!important;padding:0!important;overflow:hidden;border-radius:28px!important;border:1px solid rgba(148,163,184,.16)!important;background:linear-gradient(180deg,rgba(15,23,42,.86),rgba(2,6,23,.72))!important;box-shadow:0 24px 70px rgba(0,0,0,.24)!important}
      .aiw-redesigned>.aiw-head{display:none!important}
      .aiw-command-center{padding:22px 26px 18px;background:radial-gradient(circle at 10% 0%,rgba(59,130,246,.2),transparent 35%),radial-gradient(circle at 90% 0%,rgba(139,92,246,.16),transparent 32%),rgba(15,23,42,.5);border-bottom:1px solid rgba(148,163,184,.12)}
      .aiw-command-top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex-wrap:wrap}
      .aiw-command-title{min-width:0;max-width:760px}.aiw-command-title small{display:inline-flex;padding:5px 9px;border-radius:999px;border:1px solid rgba(96,165,250,.22);background:rgba(59,130,246,.1);color:#bfdbfe;font-size:10px;font-weight:950;letter-spacing:.1em}.aiw-command-title h2{margin:10px 0 6px;font-size:clamp(25px,3vw,35px);letter-spacing:-.04em;color:#f8fafc}.aiw-command-title p{margin:0;color:#b6c2d1;font-size:13px;line-height:1.55}
      .aiw-view-switch{display:flex;gap:7px;padding:6px;border-radius:15px;background:rgba(2,6,23,.42);border:1px solid rgba(148,163,184,.12)}.aiw-view-switch button{padding:9px 13px!important;border-radius:10px!important;background:transparent!important;border:0!important;color:#94a3b8!important;font-size:12px!important;box-shadow:none!important}.aiw-view-switch button.active{background:rgba(59,130,246,.16)!important;color:#dbeafe!important;box-shadow:inset 0 0 0 1px rgba(96,165,250,.18)!important}
      .aiw-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:18px}.aiw-kpi{display:grid;gap:4px;padding:13px 14px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)}.aiw-kpi small{font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:#94a3b8}.aiw-kpi strong{font-size:22px;line-height:1;color:#e2e8f0}.aiw-kpi span{font-size:10px;color:#7f8da1}.aiw-kpi[data-tone="good"] strong{color:#86efac}.aiw-kpi[data-tone="warn"] strong{color:#fde68a}.aiw-kpi[data-tone="bad"] strong{color:#fca5a5}
      .aiw-redesigned[data-aiw-view="team"] .aiw-workbook{display:none!important}.aiw-redesigned[data-aiw-view="tasks"] #aiwAgentGrid{display:none!important}.aiw-redesigned[data-aiw-view="tasks"] .aiw-workbook{display:block!important}
      .aiw-redesigned .aiw-workbook{margin:0!important;padding:20px 26px 26px!important;border:0!important}.aiw-redesigned .aiw-toolbar{padding:14px 16px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(148,163,184,.1)}.aiw-redesigned .aiw-task-list{gap:10px!important;margin-top:12px!important}.aiw-redesigned .aiw-task{padding:14px 15px!important;border-radius:16px!important;background:rgba(15,23,42,.54)!important;border-color:rgba(148,163,184,.12)!important}
      .aiw-redesigned .aiw-v3-root{padding:16px 20px 22px}.aiw-redesigned .aiw-v3-command{border-radius:20px}.aiw-redesigned .aiw-v3-layout{margin-top:12px}.aiw-redesigned .aiw-v3-side-card,.aiw-redesigned .aiw-v3-agent,.aiw-redesigned .aiw-v3-hero-card,.aiw-redesigned .aiw-v3-current{border-color:rgba(148,163,184,.12)!important}
      .aiw-agent-settings{margin-top:2px;border-radius:14px;background:rgba(2,6,23,.24);border:1px solid rgba(148,163,184,.09);overflow:hidden}.aiw-agent-settings>summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;cursor:pointer;list-style:none;color:#bfdbfe;font-size:11px;font-weight:900}.aiw-agent-settings>summary::-webkit-details-marker{display:none}.aiw-agent-settings>summary:after{content:'⌄';font-size:14px;color:#94a3b8}.aiw-agent-settings[open]>summary:after{transform:rotate(180deg)}.aiw-agent-settings .aiw-fields{padding:0 12px 12px}
      @media(max-width:900px){.aiw-command-center{padding:20px}.aiw-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.aiw-redesigned .aiw-v3-root,.aiw-redesigned .aiw-workbook{padding:14px 18px 20px!important}}
      @media(max-width:600px){.aiw-command-center{padding:17px}.aiw-command-top{display:grid}.aiw-view-switch{width:100%}.aiw-view-switch button{flex:1}.aiw-kpis{grid-template-columns:1fr 1fr;gap:8px}.aiw-kpi{padding:11px}.aiw-kpi strong{font-size:19px}.aiw-redesigned .aiw-v3-root,.aiw-redesigned .aiw-workbook{padding:12px 14px 16px!important}}
    `;
    document.head.appendChild(style);
  }

  function shell() {
    return document.getElementById(SHELL_ID);
  }

  function root() {
    return document.getElementById(ROOT_ID) || document.getElementById("virtualAgentsTab");
  }

  function tasks() {
    const value = readJson(TASKS_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function settingsAgents() {
    const settings = readJson(SETTINGS_KEY, {});
    return settings?.agents && typeof settings.agents === "object" ? settings.agents : {};
  }

  function setNodeText(node, value) {
    const next = text(value);
    if (node && node.textContent !== next) node.textContent = next;
  }

  function createCommandCenter(workforce) {
    let center = workforce.querySelector(":scope > .aiw-command-center");
    if (center) return center;
    center = document.createElement("section");
    center.className = "aiw-command-center";
    center.innerHTML = `
      <div class="aiw-command-top">
        <div class="aiw-command-title"><small>KI-TEAMZENTRALE</small><h2>Virtuelle Mitarbeiter</h2><p>Elyon Manager und Fachmitarbeiter in einer Oberfläche. Aufgaben, Freigaben und Blocker bleiben sichtbar; technische Einstellungen öffnest du nur bei Bedarf.</p></div>
        <nav class="aiw-view-switch" aria-label="Ansicht virtuelle Mitarbeiter"><button type="button" data-aiw-view-button="team">Mitarbeiter</button><button type="button" data-aiw-view-button="tasks">Arbeitsmappe</button></nav>
      </div>
      <div class="aiw-kpis" aria-label="Übersicht virtuelle Mitarbeiter">
        <div class="aiw-kpi" data-tone="good"><small>Aktiv</small><strong data-aiw-metric="active">0</strong><span>einsatzbereit</span></div>
        <div class="aiw-kpi"><small>Pausiert</small><strong data-aiw-metric="paused">0</strong><span>angehalten oder aus</span></div>
        <div class="aiw-kpi" data-tone="warn"><small>Freigaben</small><strong data-aiw-metric="approvals">0</strong><span>warten auf Prüfung</span></div>
        <div class="aiw-kpi" data-tone="bad"><small>Blocker</small><strong data-aiw-metric="blockers">0</strong><span>Fehler oder Blockaden</span></div>
      </div>`;
    workforce.prepend(center);
    center.querySelectorAll("[data-aiw-view-button]").forEach((button) => {
      button.addEventListener("click", () => applyView(workforce, button.dataset.aiwViewButton));
    });
    return center;
  }

  function applyView(workforce, view) {
    const safeView = view === "tasks" ? "tasks" : DEFAULT_VIEW;
    workforce.dataset.aiwView = safeView;
    workforce.querySelectorAll("[data-aiw-view-button]").forEach((button) => {
      const active = button.dataset.aiwViewButton === safeView;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function decorateFallbackCards(workforce) {
    if (workforce.querySelector(".aiw-v3")) return;
    workforce.querySelectorAll(".aiw-card[data-agent-id]").forEach((card) => {
      if (card.dataset.aiwRedesign === "1") return;
      card.dataset.aiwRedesign = "1";
      const fields = card.querySelector(":scope > .aiw-fields");
      if (fields) {
        const details = document.createElement("details");
        details.className = "aiw-agent-settings";
        const summary = document.createElement("summary");
        summary.textContent = "Provider, Modell, Autonomie und Budget";
        fields.before(details);
        details.append(summary, fields);
      }
      const runButton = card.querySelector('[data-action="run"]');
      const testButton = card.querySelector('[data-action="test"]');
      if (runButton) runButton.textContent = "Aufgabe starten";
      if (testButton) testButton.textContent = "Schnelltest";
    });
  }

  function updateMetrics(workforce) {
    const agents = settingsAgents();
    const configured = VISIBLE_AGENT_IDS.map((id) => agents[id]).filter(Boolean);
    let active = 0;
    let paused = 0;
    if (configured.length) {
      configured.forEach((agent) => {
        const isPaused = agent?.autonomyMode === "off" || agent?.paused === true || agent?.enabled === false || agent?.active === false;
        if (isPaused) paused += 1;
        else active += 1;
      });
    } else {
      const cards = [...workforce.querySelectorAll(".aiw-card[data-agent-id]")];
      active = cards.filter((card) => !text(card.querySelector(".aiw-meta")?.textContent).toLocaleLowerCase("de-DE").includes("pausiert")).length;
      paused = Math.max(0, cards.length - active);
    }

    const allTasks = tasks();
    const approvals = allTasks.filter((task) => {
      const status = text(task?.status);
      const resultStatus = text(task?.result?.status);
      return ["approval_required", "draft_ready", "manualReviewRequired"].includes(status) || resultStatus === "manualReviewRequired";
    }).length;
    const blockers = allTasks.filter((task) => {
      const status = text(task?.status);
      const resultStatus = text(task?.result?.status);
      return ["blocked", "failed"].includes(status) || ["blocked", "failed"].includes(resultStatus) || (Array.isArray(task?.result?.blockers) && task.result.blockers.length > 0);
    }).length;

    setNodeText(workforce.querySelector('[data-aiw-metric="active"]'), active);
    setNodeText(workforce.querySelector('[data-aiw-metric="paused"]'), paused);
    setNodeText(workforce.querySelector('[data-aiw-metric="approvals"]'), approvals);
    setNodeText(workforce.querySelector('[data-aiw-metric="blockers"]'), blockers);
  }

  function decorate() {
    scheduled = false;
    const workforce = shell();
    const host = root();
    if (!host || !workforce) {
      observe(host);
      return false;
    }
    observer?.disconnect();
    try {
      workforce.classList.add("aiw-redesigned");
      if (!workforce.dataset.aiwView) workforce.dataset.aiwView = DEFAULT_VIEW;
      createCommandCenter(workforce);
      decorateFallbackCards(workforce);
      applyView(workforce, workforce.dataset.aiwView);
      updateMetrics(workforce);
      host.dataset.elyonVirtualAgentsRedesigned = "1";
    } finally {
      observe(host);
    }
    return true;
  }

  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorate);
  }

  function observe(host = root()) {
    if (!host) return;
    if (!observer) {
      observer = new MutationObserver((mutations) => {
        const relevant = mutations.some((mutation) => mutation.type === "childList" && ([...mutation.addedNodes].some((node) => node instanceof Element) || [...mutation.removedNodes].some((node) => node instanceof Element)));
        if (relevant) scheduleDecorate();
      });
    }
    if (observedRoot !== host) observedRoot = host;
    observer.observe(observedRoot, { childList: true, subtree: true });
  }

  function install() {
    installStyles();
    observe();
    scheduleDecorate();
    window.addEventListener("elyon:runtime-group-loaded", (event) => {
      if (event.detail?.tabId === "virtualAgentsTab") scheduleDecorate();
    });
    window.addEventListener("elyon:ai-workforce-v2-rendered", scheduleDecorate);
    window.addEventListener("elyon:ai-workforce-v2-task-updated", scheduleDecorate);
    window.addEventListener("elyon:ai-settings-normalized", scheduleDecorate);
    window.addEventListener("storage", (event) => {
      if ([TASKS_KEY, SETTINGS_KEY].includes(event.key)) scheduleDecorate();
    });
    window.ElyonVirtualAgentsRedesign = {
      refresh: decorate,
      setView: (view) => {
        const workforce = shell();
        if (workforce) applyView(workforce, view);
      },
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();