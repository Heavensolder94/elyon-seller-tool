(() => {
  "use strict";

  const STYLE_ID = "elyonAiWorkforceInterfaceV4Styles";
  const TAB_ID = "virtualAgentsTab";
  const LEGACY_MANAGER_ID = "soul-operations";
  const BUILDER_MANAGER_ID = "elyon-operations-manager";
  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const CUSTOM_KEY = "elyon_ai_custom_agents_v1";
  const TASK_KEYS = ["elyon_ai_workforce_tasks", "elyon_ai_tasks"];

  const LEGACY_AGENT_LABELS = Object.freeze({
    "soul-operations": "🧠 Elyon Manager – automatisch zuweisen",
    "soul-scout": "🧩 Product Data Specialist",
    "soul-guard": "🛡️ Compliance Guard",
    "soul-finance": "📊 Profit Analyst",
    "soul-seo": "✍️ Listing Specialist",
    "soul-support": "💬 Customer Support Specialist",
  });

  const TYPE_LABELS = Object.freeze({
    product_analysis: "Produktanalyse",
    listing_review: "Listing prüfen",
    margin_check: "Marge prüfen",
    customer_reply_draft: "Kundenantwort vorbereiten",
    supplier_check: "Lieferant prüfen",
    research: "Recherche",
    seo_audit: "SEO-Audit",
    risk_audit: "Risiko-Check",
    support_summary: "Support-Zusammenfassung",
    operations_check: "Betriebs-Check",
  });

  const PRIORITY_LABELS = Object.freeze({
    low: "Niedrig",
    normal: "Normal",
    medium: "Normal",
    high: "Hoch",
    critical: "Kritisch",
  });

  const MODE_LABELS = Object.freeze({
    off: "Aus",
    manual: "Manuell",
    assisted: "Assistiert",
    semi: "Teilautomatisch",
    auto_internal: "Vollautomatisch intern",
    auto_external: "Vollautomatisch extern",
  });

  const state = { observer: null, queued: false };

  function text(value, fallback = "") {
    return value === null || value === undefined ? fallback : String(value).trim();
  }

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function listFromStorage(key) {
    const value = readJson(key, []);
    return Array.isArray(value) ? value : [];
  }

  function customAgentCount() {
    return listFromStorage(CUSTOM_KEY).filter((agent) => agent?.id && agent?.name).length;
  }

  function openTaskCount() {
    const seen = new Set();
    let count = 0;
    for (const key of TASK_KEYS) {
      for (const task of listFromStorage(key)) {
        const id = text(task?.id) || `${key}:${count}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const status = text(task?.status, "queued").toLowerCase();
        if (!["completed", "done", "approved", "rejected", "failed", "blocked"].includes(status)) count += 1;
      }
    }
    return count;
  }

  function managerMode() {
    const settings = readJson(SETTINGS_KEY, {});
    const agents = settings?.agents && typeof settings.agents === "object" ? settings.agents : {};
    const manager = agents["elyon-manager"] || agents[BUILDER_MANAGER_ID] || agents[LEGACY_MANAGER_ID] || {};
    const mode = text(manager.autonomyMode || manager.autonomy?.mode || "auto_internal");
    return MODE_LABELS[mode] || "Vollautomatisch intern";
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #elyonAiWorkforce.aiw-interface-v4 .aiw-v3-command{border-radius:18px 18px 12px 12px}
      .aiw-v4-workbar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;padding:13px 15px;border:1px solid rgba(96,165,250,.18);border-top:0;border-radius:0 0 16px 16px;background:linear-gradient(100deg,rgba(37,99,235,.08),rgba(7,16,29,.75));margin-top:-14px}
      .aiw-v4-workbar-main{display:grid;gap:8px;min-width:0}.aiw-v4-workbar-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.aiw-v4-workbar-title strong{font-size:12px;color:#e5edf8}.aiw-v4-workbar-title span{font-size:10px;color:#8fa2b8}
      .aiw-v4-flow{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.aiw-v4-flow-step{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;background:rgba(255,255,255,.045);border:1px solid rgba(148,163,184,.11);font-size:9px;color:#b9c8d9}.aiw-v4-flow-arrow{color:#4f6c8d;font-size:10px}
      .aiw-v4-workbar-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.aiw-v4-workbar-actions button{padding:9px 11px;border-radius:10px;font-size:10px;white-space:nowrap}.aiw-v4-workbar-actions .primary{background:linear-gradient(135deg,#2563eb,#3b82f6)!important;color:#fff!important;border-color:transparent!important}
      .aiw-v4-stats{display:flex;gap:6px;flex-wrap:wrap}.aiw-v4-stat{padding:5px 8px;border-radius:9px;background:rgba(2,6,23,.32);border:1px solid rgba(148,163,184,.1);font-size:9px;color:#8fa2b8}.aiw-v4-stat strong{color:#dbe7f4;margin-left:3px}
      .aiw-v4-manager-note{display:flex;gap:8px;align-items:flex-start;margin-top:9px;padding:9px 10px;border-radius:10px;background:rgba(37,99,235,.08);border:1px solid rgba(96,165,250,.16);color:#aebfd2;font-size:10px;line-height:1.45}.aiw-v4-manager-note strong{color:#dbeafe}
      .aiw-task-composer-v4{padding:16px!important;border-radius:16px!important;border-color:rgba(96,165,250,.18)!important;background:linear-gradient(135deg,rgba(15,31,50,.78),rgba(7,16,29,.72))!important}.aiw-task-composer-v4>h4{font-size:14px!important;margin-bottom:4px!important}.aiw-task-composer-v4 .aiw-v4-subtitle{margin:0 0 13px;color:#8fa2b8;font-size:10px;line-height:1.45}.aiw-task-composer-v4 .row{gap:10px!important}.aiw-task-composer-v4 label{font-size:10px!important;color:#aebdce!important;font-weight:750}.aiw-task-composer-v4 input,.aiw-task-composer-v4 select,.aiw-task-composer-v4 textarea{background:#07101d!important;border:1px solid rgba(148,163,184,.16)!important;border-radius:11px!important;color:#e8eef7!important;padding:10px 11px!important}.aiw-task-composer-v4 textarea#aiTaskDescriptionInput{width:100%;min-height:94px;resize:vertical;line-height:1.45}.aiw-task-composer-v4 [data-task-action="create-task"]{background:linear-gradient(135deg,#2563eb,#3b82f6)!important;color:#fff!important;border-color:transparent!important;padding:10px 13px!important}
      #elyonAiAgentTaskComposerModal .aiw-v4-manager-note{margin:10px 0 0}
      #elyonAiWorkforce.aiw-interface-v4 .aiw-v3-nav{box-shadow:inset -1px 0 rgba(148,163,184,.06)}#elyonAiWorkforce.aiw-interface-v4 .aiw-v3-nav button{transition:background .15s ease,color .15s ease,transform .15s ease}#elyonAiWorkforce.aiw-interface-v4 .aiw-v3-nav button:hover{transform:translateX(2px);background:rgba(59,130,246,.08)!important;color:#dbeafe!important}
      #elyonAiWorkforce.aiw-interface-v4 .aiw-v3-agent{transition:border-color .15s ease,background .15s ease}#elyonAiWorkforce.aiw-interface-v4 .aiw-v3-agent:hover{border-color:rgba(96,165,250,.22);background:rgba(15,31,50,.62)}
      @media(max-width:860px){.aiw-v4-workbar{grid-template-columns:1fr}.aiw-v4-workbar-actions{justify-content:flex-start}}@media(max-width:560px){.aiw-v4-workbar-actions{display:grid;grid-template-columns:1fr 1fr}.aiw-v4-workbar-actions button{width:100%}.aiw-v4-flow-arrow{display:none}.aiw-v4-flow-step{flex:1 1 45%;justify-content:center}}
    `;
    document.head.appendChild(style);
  }

  function setOptionLabels(select, labels) {
    if (!select) return;
    [...select.options].forEach((option) => {
      const label = labels[option.value];
      if (label) option.textContent = label;
    });
  }

  function modernizeLegacyManagerSelect(select) {
    if (!select) return;
    const previousValue = select.value;
    const options = [...select.options];
    let managerOption = options.find((option) => option.value === LEGACY_MANAGER_ID) || null;
    const blankOption = options.find((option) => option.value === "") || null;

    if (blankOption) {
      if (managerOption && managerOption !== blankOption) managerOption.remove();
      blankOption.value = LEGACY_MANAGER_ID;
      managerOption = blankOption;
    }
    if (!managerOption) {
      managerOption = document.createElement("option");
      managerOption.value = LEGACY_MANAGER_ID;
      select.prepend(managerOption);
    }
    managerOption.textContent = LEGACY_AGENT_LABELS[LEGACY_MANAGER_ID];
    setOptionLabels(select, LEGACY_AGENT_LABELS);

    if (!previousValue || previousValue === LEGACY_MANAGER_ID) select.value = LEGACY_MANAGER_ID;
  }

  function replaceDescriptionInput(container) {
    const input = container?.querySelector("#aiTaskDescriptionInput");
    if (!input || input.tagName === "TEXTAREA") return input;
    const textarea = document.createElement("textarea");
    [...input.attributes].forEach((attribute) => {
      if (attribute.name !== "type") textarea.setAttribute(attribute.name, attribute.value);
    });
    textarea.value = input.value || "";
    textarea.rows = 4;
    textarea.placeholder = "Beschreibe den konkreten Arbeitsauftrag. Was soll geprüft, bewertet oder vorbereitet werden?";
    input.replaceWith(textarea);
    return textarea;
  }

  function labelText(container, original, replacement) {
    [...(container?.querySelectorAll("label") || [])].forEach((label) => {
      if (text(label.textContent) === original) label.textContent = replacement;
    });
  }

  function decorateLegacyTaskComposer() {
    const select = document.getElementById("aiTaskAgentSelect");
    if (!select) return false;
    const container = select.closest("section") || select.closest(".settings-section") || select.parentElement?.parentElement;
    if (!container) return false;

    modernizeLegacyManagerSelect(select);
    setOptionLabels(document.getElementById("aiTaskTypeSelect"), TYPE_LABELS);
    setOptionLabels(document.getElementById("aiTaskPrioritySelect"), PRIORITY_LABELS);
    replaceDescriptionInput(container);

    const heading = [...container.querySelectorAll("h2,h3,h4")].find((node) => ["Neue Aufgabe", "Mitarbeiter beauftragen"].includes(text(node.textContent)));
    if (heading) heading.textContent = "Mitarbeiter beauftragen";
    labelText(container, "Titel", "Auftragstitel");
    labelText(container, "Beschreibung", "Arbeitsauftrag / Aufgaben-Prompt");
    labelText(container, "Agent", "Zuständigkeit");
    labelText(container, "Typ", "Aufgabentyp");

    const button = container.querySelector('[data-task-action="create-task"]');
    if (button) button.textContent = "Auftrag erstellen";

    container.classList.add("aiw-task-composer-v4");
    if (!container.querySelector(".aiw-v4-subtitle") && heading) {
      const subtitle = document.createElement("p");
      subtitle.className = "aiw-v4-subtitle";
      subtitle.textContent = "Standardmäßig übernimmt der Elyon Manager den Auftrag und weist ihn dem passenden Fachagenten zu.";
      heading.insertAdjacentElement("afterend", subtitle);
    }
    if (!container.querySelector(".aiw-v4-manager-note")) {
      const note = document.createElement("div");
      note.className = "aiw-v4-manager-note";
      note.innerHTML = "<span>🧠</span><div><strong>Automatische Zuweisung</strong><br>Du musst keinen Fachagenten kennen. Lass „Elyon Manager – automatisch zuweisen“ ausgewählt, wenn der Manager die Zuständigkeit entscheiden soll.</div>";
      select.closest("div")?.appendChild(note);
    }
    return true;
  }

  function decorateBuilderComposer() {
    const modal = document.getElementById("elyonAiAgentTaskComposerModal");
    const select = modal?.querySelector('[data-task-field="agent"]');
    if (!modal || !select) return false;
    const manager = [...select.options].find((option) => option.value === `builtin:${BUILDER_MANAGER_ID}`);
    if (manager) manager.textContent = "🧠 Elyon Manager – automatisch zuweisen";
    if (!modal.querySelector(".aiw-v4-manager-note")) {
      const field = select.closest("label") || select.parentElement;
      const note = document.createElement("div");
      note.className = "aiw-v4-manager-note";
      note.innerHTML = "<span>🧠</span><div><strong>Empfohlen</strong><br>Der Elyon Manager versteht den Auftrag und leitet ihn an den passenden Fachmitarbeiter weiter.</div>";
      field?.insertAdjacentElement("afterend", note);
    }
    return true;
  }

  function workspaceStatsMarkup() {
    return `<div class="aiw-v4-stats"><span class="aiw-v4-stat">Offene Aufgaben <strong data-v4-stat="tasks">${openTaskCount()}</strong></span><span class="aiw-v4-stat">Eigene Mitarbeiter <strong data-v4-stat="custom">${customAgentCount()}</strong></span><span class="aiw-v4-stat">Manager <strong data-v4-stat="mode">${managerMode()}</strong></span></div>`;
  }

  function decorateWorkspace() {
    const shell = document.getElementById("elyonAiWorkforce");
    const workspace = shell?.querySelector(".aiw-v3");
    const command = workspace?.querySelector(".aiw-v3-command");
    if (!shell || !workspace || !command) return false;
    shell.classList.add("aiw-interface-v4");

    let bar = workspace.querySelector(".aiw-v4-workbar");
    if (!bar) {
      bar = document.createElement("section");
      bar.className = "aiw-v4-workbar";
      bar.innerHTML = `<div class="aiw-v4-workbar-main"><div class="aiw-v4-workbar-title"><strong>Arbeitsablauf</strong><span>Auftrag geben, Manager verteilen lassen, nur bei echten Entscheidungen eingreifen.</span></div><div class="aiw-v4-flow"><span class="aiw-v4-flow-step">1 · Auftrag geben</span><span class="aiw-v4-flow-arrow">→</span><span class="aiw-v4-flow-step">2 · Manager verteilt</span><span class="aiw-v4-flow-arrow">→</span><span class="aiw-v4-flow-step">3 · Fachagent arbeitet</span><span class="aiw-v4-flow-arrow">→</span><span class="aiw-v4-flow-step">4 · Freigaben prüfen</span></div>${workspaceStatsMarkup()}</div><div class="aiw-v4-workbar-actions"><button class="primary" data-v4-action="assign">＋ Neuer Auftrag</button><button class="aiw-secondary" data-v4-action="create">＋ Mitarbeiter</button><button class="aiw-secondary" data-v4-action="team">Team anzeigen</button></div>`;
      command.insertAdjacentElement("afterend", bar);
    } else {
      const taskNode = bar.querySelector('[data-v4-stat="tasks"]');
      const customNode = bar.querySelector('[data-v4-stat="custom"]');
      const modeNode = bar.querySelector('[data-v4-stat="mode"]');
      if (taskNode) taskNode.textContent = String(openTaskCount());
      if (customNode) customNode.textContent = String(customAgentCount());
      if (modeNode) modeNode.textContent = managerMode();
    }
    return true;
  }

  function refresh() {
    installStyles();
    decorateWorkspace();
    decorateLegacyTaskComposer();
    decorateBuilderComposer();
  }

  function queueRefresh() {
    if (state.queued) return;
    state.queued = true;
    requestAnimationFrame(() => {
      state.queued = false;
      refresh();
    });
  }

  function openManagerTaskComposer() {
    window.ElyonAIAgentBuilder?.assign?.(BUILDER_MANAGER_ID);
    queueMicrotask(decorateBuilderComposer);
  }

  function handleClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const v4Action = target.closest("[data-v4-action]");
    if (v4Action) {
      const action = v4Action.dataset.v4Action;
      if (action === "assign") openManagerTaskComposer();
      if (action === "create") window.ElyonAIAgentBuilder?.open?.();
      if (action === "team") document.querySelector('#elyonAiWorkforce [data-v3-view="team"]')?.click();
      return;
    }

    const defaultAssign = target.closest("[data-agent-builder-assign]");
    if (defaultAssign) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openManagerTaskComposer();
    }
  }

  function installObserver() {
    if (state.observer) return;
    const scope = document.getElementById(TAB_ID) || document.getElementById("elyonAiWorkforce");
    if (!scope) return;
    state.observer = new MutationObserver(queueRefresh);
    state.observer.observe(scope, { childList: true, subtree: true });
  }

  function install() {
    refresh();
    installObserver();
    document.addEventListener("click", handleClick, true);
    window.addEventListener("elyon:ai-workforce-v2-task-updated", queueRefresh);
    window.addEventListener("elyon:ai-workforce-custom-task-updated", queueRefresh);
    window.addEventListener("elyon:runtime-group-loaded", (event) => {
      if (event.detail?.tabId === TAB_ID) setTimeout(() => { refresh(); installObserver(); }, 0);
    });
    [80, 300, 800].forEach((delay) => setTimeout(() => { refresh(); installObserver(); }, delay));
  }

  window.ElyonAIWorkforceInterfaceV4 = {
    refresh,
    decorateLegacyTaskComposer,
    decorateBuilderComposer,
    openManagerTaskComposer,
    legacyManagerId: LEGACY_MANAGER_ID,
    builderManagerId: BUILDER_MANAGER_ID,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
