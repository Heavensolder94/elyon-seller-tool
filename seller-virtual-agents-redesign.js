(() => {
  "use strict";

  const ROOT_ID = "virtualAgentsSettingsRoot";
  const SHELL_ID = "elyonAiWorkforce";
  const STYLE_ID = "elyonVirtualAgentsRedesignStyles";
  const DEFAULT_VIEW = "team";

  let observer = null;
  let observedRoot = null;
  let scheduled = false;

  function text(value) {
    return String(value ?? "").trim();
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #virtualAgentsTab .settings-agents-header{display:none!important}
      #virtualAgentsSettingsRoot{display:block!important;min-width:0}
      #virtualAgentsSettingsRoot>.virtual-agents-shell{display:none!important}

      .aiw-shell.aiw-redesigned{
        margin:0!important;
        padding:0!important;
        overflow:hidden;
        border-radius:28px!important;
        border:1px solid rgba(148,163,184,.16)!important;
        background:linear-gradient(180deg,rgba(15,23,42,.86),rgba(2,6,23,.72))!important;
        box-shadow:0 24px 70px rgba(0,0,0,.24)!important;
      }
      .aiw-redesigned .aiw-head{
        position:relative;
        display:grid!important;
        grid-template-columns:minmax(0,1fr) auto;
        gap:20px!important;
        align-items:start!important;
        padding:26px 28px 22px;
        background:
          radial-gradient(circle at 8% 0%,rgba(59,130,246,.22),transparent 36%),
          radial-gradient(circle at 92% 10%,rgba(139,92,246,.18),transparent 34%),
          rgba(15,23,42,.54);
        border-bottom:1px solid rgba(148,163,184,.12);
      }
      .aiw-redesigned .aiw-head:before{
        content:'KI-TEAMZENTRALE';
        display:inline-flex;
        width:max-content;
        margin-bottom:10px;
        padding:5px 9px;
        border-radius:999px;
        border:1px solid rgba(96,165,250,.24);
        background:rgba(59,130,246,.11);
        color:#bfdbfe;
        font-size:10px;
        font-weight:950;
        letter-spacing:.11em;
      }
      .aiw-redesigned .aiw-head>div:first-child{grid-column:1;min-width:0}
      .aiw-redesigned .aiw-head h2{margin:0 0 8px!important;font-size:clamp(25px,3vw,36px)!important;letter-spacing:-.04em;color:var(--text,#e5e7eb)!important}
      .aiw-redesigned .aiw-head p{max-width:760px!important;font-size:14px!important;line-height:1.6!important;color:#cbd5e1!important}
      .aiw-redesigned .aiw-badges{grid-column:2;grid-row:1 / span 2;justify-content:flex-end;max-width:310px}
      .aiw-redesigned .aiw-badge{padding:7px 10px!important;border-color:rgba(148,163,184,.18)!important;background:rgba(2,6,23,.4)!important;color:#dbeafe!important}

      .aiw-command-center{padding:20px 28px 0}
      .aiw-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
      .aiw-kpi{display:grid;gap:5px;padding:15px 16px;border-radius:18px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.075)}
      .aiw-kpi small{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#94a3b8}
      .aiw-kpi strong{font-size:23px;line-height:1;color:#e2e8f0;letter-spacing:-.04em}
      .aiw-kpi span{font-size:11px;color:#94a3b8;line-height:1.35}
      .aiw-kpi[data-tone="good"] strong{color:#86efac}
      .aiw-kpi[data-tone="warn"] strong{color:#fde68a}
      .aiw-kpi[data-tone="bad"] strong{color:#fca5a5}
      .aiw-view-switch{display:flex;gap:8px;align-items:center;margin-top:18px;padding:6px;border-radius:16px;background:rgba(2,6,23,.42);border:1px solid rgba(148,163,184,.12);width:max-content;max-width:100%}
      .aiw-view-switch button{padding:9px 13px!important;border-radius:11px!important;background:transparent!important;border:0!important;color:#94a3b8!important;font-size:12px!important;box-shadow:none!important;transform:none!important}
      .aiw-view-switch button.active{background:rgba(59,130,246,.16)!important;color:#dbeafe!important;box-shadow:inset 0 0 0 1px rgba(96,165,250,.2)!important}

      .aiw-redesigned .aiw-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:14px!important;margin:0!important;padding:18px 28px 28px}
      .aiw-redesigned .aiw-card{
        position:relative;
        gap:12px!important;
        min-width:0;
        padding:18px!important;
        border-radius:22px!important;
        background:linear-gradient(180deg,rgba(30,41,59,.62),rgba(15,23,42,.58))!important;
        border:1px solid rgba(148,163,184,.14)!important;
        box-shadow:0 14px 36px rgba(0,0,0,.13);
        transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;
      }
      .aiw-redesigned .aiw-card:hover{transform:translateY(-2px);border-color:rgba(96,165,250,.26)!important;box-shadow:0 20px 46px rgba(0,0,0,.19)}
      .aiw-redesigned .aiw-card[data-state="paused"]{opacity:.72;background:rgba(15,23,42,.52)!important}
      .aiw-redesigned .aiw-card-head{display:grid!important;grid-template-columns:48px minmax(0,1fr) auto;gap:12px!important;align-items:start!important}
      .aiw-redesigned .aiw-icon{display:grid;place-items:center;width:48px;height:48px;border-radius:16px;background:linear-gradient(135deg,rgba(59,130,246,.22),rgba(139,92,246,.2));border:1px solid rgba(148,163,184,.15);font-size:22px!important}
      .aiw-redesigned .aiw-card h3{font-size:17px!important;letter-spacing:-.025em!important;margin:1px 0 5px!important}
      .aiw-redesigned .aiw-role{font-size:12px!important;line-height:1.48!important;color:#aebdd0!important}
      .aiw-card-state{display:inline-flex;align-items:center;gap:6px;padding:6px 9px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap}
      .aiw-card-state:before{content:'';width:7px;height:7px;border-radius:999px;background:currentColor;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 15%,transparent)}
      .aiw-card-state.is-active{color:#86efac;background:rgba(34,197,94,.1)}
      .aiw-card-state.is-paused{color:#fde68a;background:rgba(245,158,11,.1)}
      .aiw-redesigned .aiw-meta{gap:7px!important;padding-top:1px}
      .aiw-redesigned .aiw-meta span{padding:5px 8px!important;font-size:10px!important;background:rgba(255,255,255,.045)!important;border:1px solid rgba(255,255,255,.055)}
      .aiw-quickfacts{display:flex;gap:8px;flex-wrap:wrap;padding:11px 12px;border-radius:15px;background:rgba(2,6,23,.3);border:1px solid rgba(148,163,184,.09)}
      .aiw-quickfact{display:flex;gap:5px;align-items:center;font-size:11px;color:#94a3b8}
      .aiw-quickfact strong{font-size:11px;color:#dbeafe;font-weight:850}
      .aiw-redesigned .aiw-actions{display:grid!important;grid-template-columns:minmax(0,1.35fr) minmax(0,.8fr) auto;gap:8px!important}
      .aiw-redesigned .aiw-actions button{min-height:40px;padding:9px 11px!important;border-radius:12px!important;font-size:12px!important}
      .aiw-redesigned .aiw-actions button[data-action="run"]{background:linear-gradient(135deg,#2563eb,#7c3aed)!important}
      .aiw-redesigned .aiw-actions button[data-action="pause"]{min-width:42px}
      .aiw-agent-settings{margin-top:1px;border-radius:15px;background:rgba(2,6,23,.24);border:1px solid rgba(148,163,184,.09);overflow:hidden}
      .aiw-agent-settings>summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 12px;cursor:pointer;list-style:none;color:#bfdbfe;font-size:11px;font-weight:900}
      .aiw-agent-settings>summary::-webkit-details-marker{display:none}
      .aiw-agent-settings>summary:after{content:'⌄';font-size:15px;color:#94a3b8;transition:transform .18s ease}
      .aiw-agent-settings[open]>summary:after{transform:rotate(180deg)}
      .aiw-agent-settings .aiw-fields{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;padding:0 12px 12px}
      .aiw-agent-settings .aiw-fields label{font-size:10px!important;color:#94a3b8!important}
      .aiw-agent-settings .aiw-fields select,.aiw-agent-settings .aiw-fields input{min-width:0;margin-top:5px!important;margin-bottom:0!important;padding:9px 10px!important;border-radius:11px!important;font-size:12px!important}

      .aiw-redesigned .aiw-workbook{margin:0!important;padding:18px 28px 28px!important;border:0!important}
      .aiw-redesigned .aiw-toolbar{padding:16px 18px;border-radius:18px;background:rgba(255,255,255,.04);border:1px solid rgba(148,163,184,.1)}
      .aiw-redesigned .aiw-toolbar strong{font-size:17px;color:#e2e8f0}
      .aiw-redesigned .aiw-toolbar select{min-width:190px!important;padding:10px 12px!important;border-radius:12px!important}
      .aiw-redesigned .aiw-task-list{gap:11px!important;margin-top:12px!important}
      .aiw-redesigned .aiw-task{padding:15px 16px!important;border-radius:17px!important;background:rgba(15,23,42,.54)!important;border-color:rgba(148,163,184,.12)!important}
      .aiw-redesigned .aiw-task-title{font-size:14px!important}
      .aiw-redesigned .aiw-summary{font-size:12px!important;line-height:1.55!important}
      .aiw-redesigned .aiw-empty{padding:34px 20px!important;background:rgba(2,6,23,.22)}

      .aiw-redesigned[data-aiw-view="team"] .aiw-workbook{display:none!important}
      .aiw-redesigned[data-aiw-view="tasks"] .aiw-grid{display:none!important}

      @media(max-width:920px){
        .aiw-redesigned .aiw-head{grid-template-columns:1fr;padding:22px}
        .aiw-redesigned .aiw-badges{grid-column:1;grid-row:auto;justify-content:flex-start;max-width:none}
        .aiw-command-center{padding:18px 22px 0}
        .aiw-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
        .aiw-redesigned .aiw-grid{grid-template-columns:1fr!important;padding:16px 22px 22px}
        .aiw-redesigned .aiw-workbook{padding:16px 22px 22px!important}
      }
      @media(max-width:600px){
        .aiw-redesigned .aiw-head{padding:19px 17px}
        .aiw-command-center{padding:15px 17px 0}
        .aiw-kpis{grid-template-columns:1fr 1fr;gap:8px}
        .aiw-kpi{padding:12px}
        .aiw-kpi strong{font-size:20px}
        .aiw-view-switch{width:100%}
        .aiw-view-switch button{flex:1}
        .aiw-redesigned .aiw-grid,.aiw-redesigned .aiw-workbook{padding:14px 17px 18px!important}
        .aiw-redesigned .aiw-card-head{grid-template-columns:42px minmax(0,1fr)}
        .aiw-redesigned .aiw-icon{width:42px;height:42px;border-radius:14px}
        .aiw-card-state{grid-column:1 / -1;width:max-content}
        .aiw-redesigned .aiw-actions{grid-template-columns:1fr 1fr}
        .aiw-redesigned .aiw-actions button[data-action="pause"]{grid-column:1 / -1}
        .aiw-agent-settings .aiw-fields{grid-template-columns:1fr!important}
        .aiw-redesigned .aiw-toolbar{display:grid!important}
        .aiw-redesigned .aiw-toolbar select{width:100%!important}
      }
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
    try {
      const parsed = JSON.parse(localStorage.getItem("elyon_ai_workforce_tasks") || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function setNodeText(node, value) {
    const next = text(value);
    if (node && node.textContent !== next) node.textContent = next;
  }

  function createCommandCenter(workforce) {
    let center = workforce.querySelector(":scope > .aiw-command-center");
    if (center) return center;

    center = document.createElement("div");
    center.className = "aiw-command-center";
    center.innerHTML = `
      <div class="aiw-kpis" aria-label="Übersicht virtuelle Mitarbeiter">
        <div class="aiw-kpi" data-tone="good"><small>Aktiv</small><strong data-aiw-metric="active">0</strong><span>einsatzbereite Mitarbeiter</span></div>
        <div class="aiw-kpi"><small>Pausiert</small><strong data-aiw-metric="paused">0</strong><span>bewusst angehalten</span></div>
        <div class="aiw-kpi" data-tone="warn"><small>Freigaben</small><strong data-aiw-metric="approvals">0</strong><span>warten auf deine Prüfung</span></div>
        <div class="aiw-kpi" data-tone="bad"><small>Blocker</small><strong data-aiw-metric="blockers">0</strong><span>Fehler oder blockiert</span></div>
      </div>
      <nav class="aiw-view-switch" aria-label="Ansicht virtuelle Mitarbeiter">
        <button type="button" data-aiw-view-button="team">Mitarbeiter</button>
        <button type="button" data-aiw-view-button="tasks">Arbeitsmappe</button>
      </nav>
    `;
    const head = workforce.querySelector(":scope > .aiw-head");
    if (head) head.after(center);
    else workforce.prepend(center);

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

  function currentFieldValue(card, fieldName, fallback = "—") {
    const field = card.querySelector(`[data-field="${fieldName}"]`);
    if (!field) return fallback;
    if (field instanceof HTMLSelectElement) {
      return text(field.selectedOptions[0]?.textContent || field.value) || fallback;
    }
    return text(field.value) || fallback;
  }

  function updateCardFacts(card) {
    const facts = card.querySelector(".aiw-quickfacts");
    if (!facts) return;
    setNodeText(facts.querySelector('[data-aiw-fact="provider"]'), currentFieldValue(card, "provider"));
    setNodeText(facts.querySelector('[data-aiw-fact="model"]'), currentFieldValue(card, "model", "Zentrale Vorgabe"));
    setNodeText(facts.querySelector('[data-aiw-fact="autonomy"]'), currentFieldValue(card, "autonomyLevel"));
  }

  function decorateCard(card) {
    const pauseButton = card.querySelector('[data-action="pause"]');
    const paused = text(pauseButton?.textContent).toLocaleLowerCase("de-DE").includes("aktivieren") ||
      text(card.querySelector(".aiw-meta")?.textContent).toLocaleLowerCase("de-DE").includes("pausiert");
    card.dataset.state = paused ? "paused" : "active";

    if (card.dataset.aiwRedesign !== "1") {
      card.dataset.aiwRedesign = "1";
      const head = card.querySelector(".aiw-card-head");
      if (head && !head.querySelector(".aiw-card-state")) {
        const stateBadge = document.createElement("span");
        stateBadge.className = "aiw-card-state";
        head.appendChild(stateBadge);
      }

      const meta = card.querySelector(".aiw-meta");
      if (meta && !card.querySelector(".aiw-quickfacts")) {
        const facts = document.createElement("div");
        facts.className = "aiw-quickfacts";
        facts.innerHTML = `
          <span class="aiw-quickfact">Provider <strong data-aiw-fact="provider">—</strong></span>
          <span class="aiw-quickfact">Modell <strong data-aiw-fact="model">—</strong></span>
          <span class="aiw-quickfact">Arbeitsmodus <strong data-aiw-fact="autonomy">—</strong></span>
        `;
        meta.after(facts);
      }

      const fields = card.querySelector(":scope > .aiw-fields");
      if (fields && !card.querySelector(":scope > .aiw-agent-settings")) {
        const details = document.createElement("details");
        details.className = "aiw-agent-settings";
        const summary = document.createElement("summary");
        summary.textContent = "Provider, Modell und Budget einstellen";
        fields.before(details);
        details.append(summary, fields);
      }

      const actions = card.querySelector(":scope > .aiw-actions");
      const details = card.querySelector(":scope > .aiw-agent-settings");
      if (actions && details && actions.nextElementSibling !== details) details.before(actions);

      const runButton = card.querySelector('[data-action="run"]');
      const testButton = card.querySelector('[data-action="test"]');
      if (runButton) runButton.textContent = "Aufgabe starten";
      if (testButton) testButton.textContent = "Schnelltest";

      card.addEventListener("change", () => scheduleDecorate());
    }

    const stateBadge = card.querySelector(".aiw-card-state");
    if (stateBadge) {
      stateBadge.classList.toggle("is-active", !paused);
      stateBadge.classList.toggle("is-paused", paused);
      setNodeText(stateBadge, paused ? "Pausiert" : "Aktiv");
    }
    if (pauseButton) {
      pauseButton.title = paused ? "Mitarbeiter wieder aktivieren" : "Mitarbeiter vorübergehend pausieren";
      pauseButton.setAttribute("aria-label", pauseButton.title);
    }
    updateCardFacts(card);
  }

  function updateMetrics(workforce) {
    const cards = [...workforce.querySelectorAll(".aiw-card[data-agent-id]")];
    const active = cards.filter((card) => card.dataset.state !== "paused").length;
    const paused = Math.max(0, cards.length - active);
    const allTasks = tasks();
    const approvals = allTasks.filter((task) => ["approval_required", "draft_ready"].includes(task?.status)).length;
    const blockers = allTasks.filter((task) => ["blocked", "failed"].includes(task?.status)).length;

    setNodeText(workforce.querySelector('[data-aiw-metric="active"]'), active);
    setNodeText(workforce.querySelector('[data-aiw-metric="paused"]'), paused);
    setNodeText(workforce.querySelector('[data-aiw-metric="approvals"]'), approvals);
    setNodeText(workforce.querySelector('[data-aiw-metric="blockers"]'), blockers);
  }

  function updateHeading(workforce) {
    const heading = workforce.querySelector(":scope > .aiw-head h2");
    const description = workforce.querySelector(":scope > .aiw-head p");
    setNodeText(heading, "Virtuelle Mitarbeiter");
    setNodeText(description, "Steuere dein KI-Team wie eine übersichtliche Mitarbeiterzentrale: Aufgaben starten, Ergebnisse prüfen und technische Details nur bei Bedarf öffnen.");

    const badges = workforce.querySelectorAll(":scope > .aiw-head .aiw-badge");
    const labels = ["Manuelle Freigabe", "Sicherheitsmodus aktiv", "Keine automatische Veröffentlichung"];
    badges.forEach((badge, index) => setNodeText(badge, labels[index] || text(badge.textContent)));
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
      updateHeading(workforce);
      createCommandCenter(workforce);
      workforce.querySelectorAll(".aiw-card[data-agent-id]").forEach(decorateCard);
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
        const relevant = mutations.some((mutation) => mutation.type === "childList" &&
          ([...mutation.addedNodes].some((node) => node instanceof Element) || [...mutation.removedNodes].some((node) => node instanceof Element))
        );
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
    window.addEventListener("elyon:ai-settings-normalized", scheduleDecorate);
    window.addEventListener("storage", (event) => {
      if (["elyon_ai_workforce_tasks", "elyon_ai_agents_settings"].includes(event.key)) scheduleDecorate();
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
