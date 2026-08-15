(() => {
  "use strict";

  const TAB_ID = "jarvisCommandCenterTab";
  const LEGACY_MENU_VALUE = "__elyon_jarvis_panel__";
  const STYLE_ID = "elyonJarvisCommandCenterStyles";
  const TASKS_KEY = "elyon_ai_workforce_tasks";
  const PRODUCT_KEYS = ["elyonProducts", "elyonSellerProducts", "sellerProductMaster", "elyonProductMaster"];
  const MAX_TASKS = 60;
  const MAX_HISTORY = 30;

  const state = {
    mounted: false,
    loading: false,
    commandBusy: false,
    agents: [],
    jarvisStatus: "unknown",
    storage: "unknown",
    safety: {},
    history: [],
    lastRefreshAt: "",
  };

  const text = (value, fallback = "") => value === null || value === undefined ? fallback : String(value).trim();
  const escapeHtml = (value) => text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function collection(keys) {
    for (const key of keys) {
      const value = readJson(key, null);
      if (Array.isArray(value) && value.length) return value;
      if (value && typeof value === "object" && Array.isArray(value.items) && value.items.length) return value.items;
      if (value && typeof value === "object" && Array.isArray(value.products) && value.products.length) return value.products;
    }
    return [];
  }

  function rawTasks() {
    const value = readJson(TASKS_KEY, []);
    const tasks = Array.isArray(value) ? value : Array.isArray(value?.tasks) ? value.tasks : [];
    return tasks.slice(0, MAX_TASKS);
  }

  function taskResult(task = {}) {
    return task?.result && typeof task.result === "object"
      ? task.result
      : task?.output && typeof task.output === "object"
        ? task.output
        : {};
  }

  function taskTime(task = {}) {
    return text(task.updatedAt || task.completedAt || task.createdAt || task.timestamp);
  }

  function timeValue(value) {
    const stamp = Date.parse(text(value));
    return Number.isFinite(stamp) ? stamp : 0;
  }

  function normalizedStatus(task = {}) {
    return text(task.status || taskResult(task).status, "unknown").toLowerCase();
  }

  function isToday(value) {
    const stamp = timeValue(value);
    if (!stamp) return false;
    const date = new Date(stamp);
    const now = new Date();
    return date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate();
  }

  function statusGroup(status) {
    const value = text(status).toLowerCase();
    if (/failed|error|blocked|critical|rejected/.test(value)) return "blocked";
    if (/approval|waiting|review|pending|pause/.test(value)) return "waiting";
    if (/running|working|processing|in_progress|active/.test(value)) return "running";
    if (/done|success|completed|passed|approved|ready/.test(value)) return "done";
    if (/queued|new|open|created|todo|planned/.test(value)) return "queued";
    return "other";
  }

  function selectedProduct() {
    const products = collection(PRODUCT_KEYS);
    if (!products.length) return null;
    const selectedId = text(
      window.elyonSelectedProductId ||
      localStorage.getItem("elyonSelectedProductId") ||
      localStorage.getItem("elyonSelectedSellerProductId") ||
      localStorage.getItem("elyon_active_product_id")
    );
    if (selectedId) {
      const match = products.find((item) => [item?.id, item?.productId, item?.sku, item?.sellerToolMasterProductId]
        .map(text)
        .includes(selectedId));
      if (match) return match;
    }
    return products[0] || null;
  }

  function boundedTask(task = {}) {
    const result = taskResult(task);
    return {
      id: text(task.id, ""),
      agentId: text(task.agentId || task.assigneeId, ""),
      title: text(task.title || task.name || task.taskPrompt, "Auftrag").slice(0, 500),
      status: normalizedStatus(task),
      updatedAt: taskTime(task),
      result: {
        status: text(result.status, ""),
        summary: text(result.summary || result.message, "").slice(0, 1500),
        blockers: (Array.isArray(result.blockers) ? result.blockers : []).slice(0, 12).map((item) => text(item).slice(0, 500)),
        warnings: (Array.isArray(result.warnings) ? result.warnings : []).slice(0, 12).map((item) => text(item).slice(0, 500)),
      },
    };
  }

  function commandContext() {
    const product = selectedProduct();
    const tasks = rawTasks().slice(0, 20).map(boundedTask);
    return {
      ...(product ? { product } : {}),
      ...(tasks.length ? { tasks } : {}),
    };
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${TAB_ID}{display:none}#${TAB_ID}.active{display:block}
      .jarvis-cc{display:grid;gap:16px;padding-bottom:34px}
      .jarvis-cc-hero{position:relative;overflow:hidden;padding:22px;border-radius:28px;border:1px solid rgba(96,165,250,.2);background:radial-gradient(circle at 12% 0,rgba(56,189,248,.16),transparent 30%),linear-gradient(145deg,rgba(8,17,31,.96),rgba(15,23,42,.84));box-shadow:0 24px 70px rgba(2,6,23,.3)}
      .jarvis-cc-hero-grid{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:22px;align-items:center}.jarvis-cc-title{display:flex;gap:15px;align-items:center}.jarvis-cc-core{width:64px;height:64px;border-radius:999px;position:relative;flex:0 0 auto;border:1px solid rgba(125,211,252,.6);background:radial-gradient(circle at 35% 30%,#f0f9ff 0 7%,#38bdf8 10%,#2563eb 42%,#091426 72%);box-shadow:0 0 0 8px rgba(59,130,246,.06),0 0 42px rgba(56,189,248,.38)}.jarvis-cc-core:after{content:"";position:absolute;inset:9px;border:1px solid rgba(255,255,255,.55);border-radius:999px}.jarvis-cc-title h1{margin:0;font-size:30px;letter-spacing:-.04em}.jarvis-cc-title p{margin:7px 0 0;color:#94a3b8;font-size:12px;line-height:1.55}.jarvis-cc-system{display:grid;justify-items:end;gap:7px}.jarvis-cc-online{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border-radius:999px;border:1px solid rgba(34,197,94,.24);background:rgba(34,197,94,.08);color:#bbf7d0;font-size:10px;font-weight:900;letter-spacing:.08em}.jarvis-cc-online.offline{border-color:rgba(248,113,113,.25);background:rgba(127,29,29,.12);color:#fecaca}.jarvis-cc-system small{color:#71849a;font-size:9px}
      .jarvis-cc-command{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;margin-top:20px}.jarvis-cc-command input{margin:0!important;min-width:0;padding:13px 15px!important;border-radius:15px!important;background:rgba(2,6,23,.58)!important}.jarvis-cc-command button{padding:11px 14px;border-radius:13px;font-size:11px}.jarvis-cc-command .plan{background:rgba(255,255,255,.07);border:1px solid rgba(148,163,184,.14);color:#dbeafe}.jarvis-cc-command .execute{background:linear-gradient(135deg,#2563eb,#7c3aed)}
      .jarvis-cc-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.jarvis-cc-metric{padding:16px;border-radius:20px;background:rgba(15,23,42,.62);border:1px solid rgba(148,163,184,.12)}.jarvis-cc-metric small{display:block;color:#8294aa;font-size:10px;text-transform:uppercase;letter-spacing:.08em}.jarvis-cc-metric strong{display:block;margin-top:8px;font-size:26px;letter-spacing:-.04em}.jarvis-cc-metric span{display:block;margin-top:5px;color:#71849a;font-size:9px}
      .jarvis-cc-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(320px,.9fr);gap:16px}.jarvis-cc-card{min-width:0;padding:18px;border-radius:24px;background:rgba(15,23,42,.62);border:1px solid rgba(148,163,184,.12)}.jarvis-cc-card-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:13px}.jarvis-cc-card h2{margin:0;font-size:16px;letter-spacing:-.02em}.jarvis-cc-card-head small{color:#71849a;font-size:9px}.jarvis-cc-empty{padding:22px 14px;text-align:center;border:1px dashed rgba(148,163,184,.18);border-radius:16px;color:#71849a;font-size:10px;line-height:1.55}
      .jarvis-cc-list{display:grid;gap:8px}.jarvis-cc-item{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:start;padding:11px;border-radius:15px;background:rgba(2,6,23,.34);border:1px solid rgba(148,163,184,.09)}.jarvis-cc-item-icon{width:24px;height:24px;border-radius:8px;display:grid;place-items:center;background:rgba(59,130,246,.1);color:#93c5fd;font-size:10px}.jarvis-cc-item strong{display:block;font-size:11px}.jarvis-cc-item p{margin:4px 0 0;color:#8fa2b8;font-size:9px;line-height:1.45}.jarvis-cc-pill{align-self:start;padding:5px 7px;border-radius:999px;font-size:8px;font-weight:900;background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.12);color:#cbd5e1}.jarvis-cc-pill.blocked{color:#fecaca;border-color:rgba(248,113,113,.2);background:rgba(127,29,29,.1)}.jarvis-cc-pill.running{color:#bae6fd;border-color:rgba(56,189,248,.2);background:rgba(14,116,144,.1)}.jarvis-cc-pill.waiting{color:#fde68a;border-color:rgba(250,204,21,.2);background:rgba(161,98,7,.1)}.jarvis-cc-pill.done{color:#bbf7d0;border-color:rgba(34,197,94,.2);background:rgba(20,83,45,.1)}
      .jarvis-cc-agents{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.jarvis-cc-agent{padding:11px;border-radius:15px;background:rgba(2,6,23,.34);border:1px solid rgba(148,163,184,.09)}.jarvis-cc-agent-top{display:flex;justify-content:space-between;gap:8px;align-items:center}.jarvis-cc-agent strong{font-size:10px}.jarvis-cc-agent p{margin:5px 0 0;color:#71849a;font-size:8px;line-height:1.4}.jarvis-cc-dot{width:7px;height:7px;border-radius:999px;background:#22c55e;box-shadow:0 0 10px rgba(34,197,94,.4)}.jarvis-cc-dot.working{background:#38bdf8;box-shadow:0 0 10px rgba(56,189,248,.45)}.jarvis-cc-dot.off{background:#64748b;box-shadow:none}.jarvis-cc-manage{margin-top:10px;width:100%;padding:9px 11px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(148,163,184,.12);color:#dbeafe;font-size:10px}
      .jarvis-cc-pipeline{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}.jarvis-cc-stage{padding:12px 8px;text-align:center;border-radius:15px;background:rgba(2,6,23,.34);border:1px solid rgba(148,163,184,.09)}.jarvis-cc-stage strong{display:block;font-size:20px}.jarvis-cc-stage span{display:block;margin-top:5px;color:#8294aa;font-size:8px}.jarvis-cc-stage.blocked{border-color:rgba(248,113,113,.18)}
      .jarvis-cc-chat{display:grid;gap:9px;max-height:370px;overflow:auto}.jarvis-cc-chat-row{padding:11px 12px;border-radius:15px;background:rgba(2,6,23,.34);border:1px solid rgba(148,163,184,.09)}.jarvis-cc-chat-row.user{border-color:rgba(96,165,250,.16);background:rgba(37,99,235,.07)}.jarvis-cc-chat-row.error{border-color:rgba(248,113,113,.18);background:rgba(127,29,29,.08)}.jarvis-cc-chat-row header{display:flex;justify-content:space-between;gap:8px;margin-bottom:5px}.jarvis-cc-chat-row header strong{font-size:9px}.jarvis-cc-chat-row header small{font-size:8px;color:#64748b}.jarvis-cc-chat-row p{margin:0;color:#aebed0;font-size:10px;line-height:1.55;white-space:pre-wrap}.jarvis-cc-refresh{padding:7px 9px!important;border-radius:10px!important;background:rgba(255,255,255,.06)!important;border:1px solid rgba(148,163,184,.12)!important;color:#cbd5e1!important;font-size:9px!important}
      @media(max-width:980px){.jarvis-cc-grid{grid-template-columns:1fr}.jarvis-cc-metrics{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:650px){.jarvis-cc-hero-grid{grid-template-columns:1fr}.jarvis-cc-system{justify-items:start}.jarvis-cc-command{grid-template-columns:1fr 1fr}.jarvis-cc-command input{grid-column:1/-1}.jarvis-cc-metrics{grid-template-columns:1fr 1fr}.jarvis-cc-agents{grid-template-columns:1fr}.jarvis-cc-pipeline{grid-template-columns:1fr 1fr}.jarvis-cc-title h1{font-size:24px}.jarvis-cc-core{width:52px;height:52px}}
    `;
    document.head.appendChild(style);
  }

  function ensureTab() {
    let tab = document.getElementById(TAB_ID);
    if (tab) return tab;
    tab = document.createElement("section");
    tab.id = TAB_ID;
    tab.className = "tab";
    const agentsTab = document.getElementById("virtualAgentsTab");
    if (agentsTab) agentsTab.insertAdjacentElement("afterend", tab);
    else (document.querySelector("main.container") || document.querySelector(".container") || document.body).appendChild(tab);
    return tab;
  }

  function ensureMenu() {
    const menu = document.getElementById("mainMenu");
    if (!menu) return false;
    menu.querySelector(`option[value="${LEGACY_MENU_VALUE}"]`)?.remove();
    let option = menu.querySelector(`option[value="${TAB_ID}"]`);
    if (!option) {
      option = document.createElement("option");
      option.value = TAB_ID;
      option.textContent = "◉ JARVIS";
      const agents = menu.querySelector('option[value="virtualAgentsTab"]');
      if (agents) agents.insertAdjacentElement("afterend", option);
      else menu.appendChild(option);
    }
    return true;
  }

  function activateTab(tabId) {
    const target = document.getElementById(tabId);
    if (!target) return false;
    if (typeof window.showTab === "function") {
      try { window.showTab(tabId); } catch { /* fallback below */ }
    }
    document.querySelectorAll(".tab").forEach((node) => node.classList.toggle("active", node === target));
    const menu = document.getElementById("mainMenu");
    if (menu) menu.value = tabId;
    return true;
  }

  function openAgents() {
    activateTab("virtualAgentsTab");
    window.dispatchEvent(new CustomEvent("elyon:tab-changed", { detail: { tabId: "virtualAgentsTab" } }));
  }

  function taskCounts(tasks) {
    const counts = { queued: 0, running: 0, waiting: 0, done: 0, blocked: 0, other: 0 };
    for (const task of tasks) counts[statusGroup(normalizedStatus(task))] += 1;
    return counts;
  }

  function attentionItems(tasks) {
    const items = [];
    for (const task of tasks) {
      const result = taskResult(task);
      const blockers = Array.isArray(result.blockers) ? result.blockers : [];
      const warnings = Array.isArray(result.warnings) ? result.warnings : [];
      const group = statusGroup(normalizedStatus(task));
      const title = text(task.title || task.name || task.taskPrompt, "Auftrag");
      if (blockers.length) {
        items.push({ title, detail: text(blockers[0], "Blocker erkannt"), kind: "blocked", label: "BLOCKER" });
      } else if (group === "blocked") {
        items.push({ title, detail: text(result.summary || task.message, "Auftrag ist fehlgeschlagen oder blockiert."), kind: "blocked", label: "FEHLER" });
      } else if (group === "waiting") {
        items.push({ title, detail: text(result.summary, "Wartet auf Prüfung oder Freigabe."), kind: "waiting", label: "FREIGABE" });
      } else if (warnings.length) {
        items.push({ title, detail: text(warnings[0], "Warnung vorhanden"), kind: "waiting", label: "WARNUNG" });
      }
      if (items.length >= 8) break;
    }
    return items;
  }

  function recentActivity(tasks) {
    return [...tasks]
      .filter((task) => taskTime(task))
      .sort((a, b) => timeValue(taskTime(b)) - timeValue(taskTime(a)))
      .slice(0, 8);
  }

  function agentWorkMap(tasks) {
    const map = new Map();
    for (const task of tasks) {
      const agentId = text(task.agentId || task.assigneeId);
      if (!agentId) continue;
      const group = statusGroup(normalizedStatus(task));
      if (group === "running") map.set(agentId, "working");
      else if (!map.has(agentId) && group === "waiting") map.set(agentId, "waiting");
    }
    return map;
  }

  function dateLabel(value) {
    const stamp = timeValue(value);
    if (!stamp) return "ohne Zeit";
    return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(stamp));
  }

  function render() {
    const tab = ensureTab();
    const tasks = rawTasks();
    const today = tasks.filter((task) => isToday(taskTime(task)));
    const counts = taskCounts(tasks);
    const attention = attentionItems(tasks);
    const activity = recentActivity(tasks);
    const workMap = agentWorkMap(tasks);
    const availableAgents = state.agents.filter((agent) => agent.enabled !== false);
    const online = state.jarvisStatus === "ready";

    tab.innerHTML = `
      <div class="jarvis-cc">
        <section class="jarvis-cc-hero">
          <div class="jarvis-cc-hero-grid">
            <div class="jarvis-cc-title"><div class="jarvis-cc-core" aria-hidden="true"></div><div><h1>JARVIS Command Center</h1><p>Deine zentrale Führungs- und Arbeitsoberfläche. Jarvis plant, delegiert und bündelt Ergebnisse – die Mitarbeiterverwaltung bleibt separat unter „Virtuelle Mitarbeiter“.</p></div></div>
            <div class="jarvis-cc-system"><span class="jarvis-cc-online ${online ? "" : "offline"}">${online ? "● SYSTEM BEREIT" : "● STATUS OFFEN"}</span><small>${state.lastRefreshAt ? `Aktualisiert ${escapeHtml(state.lastRefreshAt)}` : "Noch nicht synchronisiert"}</small></div>
          </div>
          <form class="jarvis-cc-command" data-jarvis-cc-form>
            <input data-jarvis-cc-input placeholder="Frag Jarvis oder gib einen Auftrag …" autocomplete="off">
            <button type="button" class="plan" data-jarvis-cc-plan>Planen</button>
            <button type="button" class="execute" data-jarvis-cc-execute>Ausführen</button>
          </form>
        </section>

        <section class="jarvis-cc-metrics">
          <div class="jarvis-cc-metric"><small>Aufträge heute</small><strong>${today.length}</strong><span>mit Zeitstempel von heute</span></div>
          <div class="jarvis-cc-metric"><small>In Arbeit</small><strong>${counts.running}</strong><span>aktuelle Workforce-Tasks</span></div>
          <div class="jarvis-cc-metric"><small>Aufmerksamkeit</small><strong>${attention.length}</strong><span>Blocker, Fehler, Warnungen, Freigaben</span></div>
          <div class="jarvis-cc-metric"><small>Mitarbeiter verfügbar</small><strong>${availableAgents.length}</strong><span>aus der Agent Registry</span></div>
        </section>

        <div class="jarvis-cc-grid">
          <section class="jarvis-cc-card">
            <div class="jarvis-cc-card-head"><h2>Meine Aufmerksamkeit</h2><small>${attention.length ? "Handlungsbedarf erkannt" : "Keine offenen Punkte erkannt"}</small></div>
            <div class="jarvis-cc-list">${attention.length ? attention.map((item) => `
              <article class="jarvis-cc-item"><span class="jarvis-cc-item-icon">!</span><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail)}</p></div><span class="jarvis-cc-pill ${item.kind}">${escapeHtml(item.label)}</span></article>`).join("") : '<div class="jarvis-cc-empty">Aus den aktuell vorhandenen Workforce-Tasks sind keine Blocker, Fehler, Warnungen oder wartenden Freigaben erkennbar.</div>'}</div>
          </section>

          <section class="jarvis-cc-card">
            <div class="jarvis-cc-card-head"><h2>Agenten</h2><small>${availableAgents.length} verfügbar</small></div>
            <div class="jarvis-cc-agents">${state.agents.length ? state.agents.slice(0, 10).map((agent) => {
              const work = workMap.get(text(agent.id));
              const dot = agent.enabled === false ? "off" : work === "working" ? "working" : "";
              const status = agent.enabled === false ? "Deaktiviert" : work === "working" ? "Arbeitet" : work === "waiting" ? "Wartet" : "Verfügbar";
              return `<article class="jarvis-cc-agent"><div class="jarvis-cc-agent-top"><strong>${escapeHtml(agent.name || agent.id)}</strong><span class="jarvis-cc-dot ${dot}" title="${escapeHtml(status)}"></span></div><p>${escapeHtml(status)} · ${escapeHtml(agent.department || agent.kind || "Agent")}</p></article>`;
            }).join("") : '<div class="jarvis-cc-empty">Agent Registry wurde noch nicht geladen.</div>'}</div>
            <button type="button" class="jarvis-cc-manage" data-jarvis-cc-agents>Mitarbeiter verwalten</button>
          </section>

          <section class="jarvis-cc-card">
            <div class="jarvis-cc-card-head"><h2>Live-Aktivität</h2><small>echte vorhandene Task-Ereignisse</small></div>
            <div class="jarvis-cc-list">${activity.length ? activity.map((task) => {
              const group = statusGroup(normalizedStatus(task));
              return `<article class="jarvis-cc-item"><span class="jarvis-cc-item-icon">${group === "done" ? "✓" : group === "blocked" ? "!" : "●"}</span><div><strong>${escapeHtml(text(task.title || task.name || task.taskPrompt, "Auftrag"))}</strong><p>${escapeHtml(text(task.agentName || task.agentId || task.assigneeId, "Agent offen"))} · ${escapeHtml(dateLabel(taskTime(task)))}</p></div><span class="jarvis-cc-pill ${group}">${escapeHtml(normalizedStatus(task).toUpperCase())}</span></article>`;
            }).join("") : '<div class="jarvis-cc-empty">Noch keine Task-Aktivität mit Zeitstempel vorhanden. Es werden keine Demo-Ereignisse erzeugt.</div>'}</div>
          </section>

          <section class="jarvis-cc-card">
            <div class="jarvis-cc-card-head"><h2>Jobs</h2><small>${tasks.length} vorhandene Tasks</small></div>
            <div class="jarvis-cc-list">${tasks.length ? tasks.slice(0, 8).map((task) => {
              const group = statusGroup(normalizedStatus(task));
              return `<article class="jarvis-cc-item"><span class="jarvis-cc-item-icon">#</span><div><strong>${escapeHtml(text(task.title || task.name || task.taskPrompt, "Auftrag"))}</strong><p>${escapeHtml(text(taskResult(task).summary, "Kein Ergebnistext vorhanden"))}</p></div><span class="jarvis-cc-pill ${group}">${escapeHtml(normalizedStatus(task).toUpperCase())}</span></article>`;
            }).join("") : '<div class="jarvis-cc-empty">Aktuell sind keine Workforce-Tasks gespeichert.</div>'}</div>
          </section>
        </div>

        <section class="jarvis-cc-card">
          <div class="jarvis-cc-card-head"><h2>Pipeline</h2><small>aus echten Task-Statuswerten</small></div>
          <div class="jarvis-cc-pipeline">
            <div class="jarvis-cc-stage"><strong>${counts.queued}</strong><span>GEPLANT / QUEUED</span></div>
            <div class="jarvis-cc-stage"><strong>${counts.running}</strong><span>IN ARBEIT</span></div>
            <div class="jarvis-cc-stage"><strong>${counts.waiting}</strong><span>WARTET / FREIGABE</span></div>
            <div class="jarvis-cc-stage"><strong>${counts.done}</strong><span>ABGESCHLOSSEN</span></div>
            <div class="jarvis-cc-stage blocked"><strong>${counts.blocked}</strong><span>BLOCKIERT / FEHLER</span></div>
          </div>
        </section>

        <section class="jarvis-cc-card">
          <div class="jarvis-cc-card-head"><h2>Jarvis Chat & Ergebnisse</h2><button type="button" class="jarvis-cc-refresh" data-jarvis-cc-refresh>Aktualisieren</button></div>
          <div class="jarvis-cc-chat" data-jarvis-cc-chat>${renderHistory()}</div>
        </section>
      </div>`;

    window.dispatchEvent(new CustomEvent("elyon:jarvis-command-center-rendered", { detail: { tabId: TAB_ID } }));
    queueMicrotask(() => {
      window.ElyonJarvisFileManager?.refresh?.();
      window.ElyonJarvisFileManagerActions?.bindRoot?.();
      window.ElyonJarvisFileManagerMountBridge?.reconcile?.();
    });
  }

  function renderHistory() {
    if (!state.history.length) return '<div class="jarvis-cc-empty">Noch keine Jarvis-Unterhaltung in dieser Sitzung. Die Eingabe oben plant standardmäßig sicher; „Ausführen“ startet die ausgewählten Agenten ausdrücklich.</div>';
    return state.history.map((entry) => `<article class="jarvis-cc-chat-row ${escapeHtml(entry.kind)}"><header><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.time)}</small></header><p>${escapeHtml(entry.text)}</p></article>`).join("");
  }

  function updateHistoryView() {
    const host = document.querySelector(`#${TAB_ID} [data-jarvis-cc-chat]`);
    if (host) {
      host.innerHTML = renderHistory();
      host.scrollTop = host.scrollHeight;
    }
  }

  function pushHistory(entry) {
    state.history.push(entry);
    if (state.history.length > MAX_HISTORY) state.history.shift();
    updateHistoryView();
  }

  function nowLabel() {
    return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date());
  }

  function payloadSummary(payload, execute) {
    const summary = payload?.summary;
    if (typeof summary === "string") return summary;
    if (summary && typeof summary === "object" && text(summary.summary)) return text(summary.summary);
    const plan = payload?.plan || {};
    const delegations = Array.isArray(plan.delegations) ? plan.delegations : [];
    if (!execute && delegations.length) return `Plan erstellt: ${delegations.map((item) => item.agentName || item.agentId).filter(Boolean).join(" → ")}.`;
    const runs = Array.isArray(payload?.runs) ? payload.runs : [];
    if (execute && runs.length) return `${runs.filter((run) => run.ok).length} von ${runs.length} Delegationen wurden erfolgreich ausgeführt.`;
    return execute ? "Jarvis hat den Auftrag bearbeitet." : "Jarvis hat einen Plan erstellt.";
  }

  async function runCommand(execute) {
    if (state.commandBusy) return;
    const input = document.querySelector(`#${TAB_ID} [data-jarvis-cc-input]`);
    const command = text(input?.value);
    if (!command) return;
    if (input) input.value = "";
    state.commandBusy = true;
    pushHistory({ kind: "user", title: "Du", text: command, time: nowLabel() });
    try {
      if (!window.ElyonJarvis) throw new Error("Jarvis-Client ist nicht verfügbar.");
      const payload = execute
        ? await window.ElyonJarvis.execute(command, { input: commandContext() })
        : await window.ElyonJarvis.plan(command, { input: commandContext() });
      pushHistory({ kind: "jarvis", title: execute ? "Jarvis · Ergebnis" : "Jarvis · Plan", text: payloadSummary(payload, execute), time: nowLabel() });
      window.dispatchEvent(new CustomEvent("elyon:jarvis-command-center-result", { detail: { execute, command, payload } }));
      await refreshData(false);
    } catch (error) {
      pushHistory({ kind: "error", title: "Jarvis · Fehler", text: error?.message || "Der Auftrag konnte nicht bearbeitet werden.", time: nowLabel() });
    } finally {
      state.commandBusy = false;
    }
  }

  async function refreshData(renderAfter = true) {
    if (state.loading) return;
    state.loading = true;
    try {
      if (!window.ElyonJarvis) throw new Error("Jarvis-Client ist nicht verfügbar.");
      const payload = await window.ElyonJarvis.status();
      state.agents = Array.isArray(payload?.agents) ? payload.agents : [];
      state.jarvisStatus = text(payload?.jarvis, "unknown");
      state.storage = text(payload?.storage, "unknown");
      state.safety = payload?.safety && typeof payload.safety === "object" ? payload.safety : {};
      state.lastRefreshAt = nowLabel();
    } catch {
      state.jarvisStatus = "offline";
      state.lastRefreshAt = nowLabel();
    } finally {
      state.loading = false;
      if (renderAfter) render();
    }
  }

  function bindEvents() {
    if (document.documentElement.dataset.elyonJarvisCommandCenterBound === "1") return;
    document.documentElement.dataset.elyonJarvisCommandCenterBound = "1";

    document.addEventListener("change", (event) => {
      if (event.target?.id !== "mainMenu" || event.target.value !== TAB_ID) return;
      activateTab(TAB_ID);
      refreshData(true);
    }, true);

    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest("[data-jarvis-cc-plan]")) runCommand(false);
      if (target.closest("[data-jarvis-cc-execute]")) runCommand(true);
      if (target.closest("[data-jarvis-cc-refresh]")) refreshData(true);
      if (target.closest("[data-jarvis-cc-agents]")) openAgents();
    });

    document.addEventListener("submit", (event) => {
      if (!event.target?.matches?.("[data-jarvis-cc-form]")) return;
      event.preventDefault();
      runCommand(false);
    });

    window.addEventListener("elyon:jarvis-ui-result", () => refreshData(true));
    window.addEventListener("elyon:seller-authenticated", () => refreshData(true));
    window.addEventListener("storage", (event) => {
      if (event.key === TASKS_KEY || PRODUCT_KEYS.includes(event.key)) render();
    });
  }

  function mount() {
    installStyles();
    ensureTab();
    ensureMenu();
    bindEvents();
    state.mounted = true;
    render();
    refreshData(true);
    return true;
  }

  function refresh() {
    installStyles();
    ensureTab();
    ensureMenu();
    render();
    return true;
  }

  function open() {
    ensureTab();
    ensureMenu();
    activateTab(TAB_ID);
    refreshData(true);
    return true;
  }

  window.ElyonJarvisCommandCenter = Object.freeze({
    mount,
    refresh,
    open,
    status: () => ({ ...state, agents: [...state.agents], history: [...state.history] }),
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();