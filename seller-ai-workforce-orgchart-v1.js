(() => {
  "use strict";

  const STYLE_ID = "elyonOrgchartV1Styles";
  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const CUSTOM_KEY = "elyon_ai_custom_agents_v1";
  const TASK_KEYS = ["elyon_ai_workforce_tasks", "elyon_ai_tasks"];
  const EXPANDED_KEY = "elyon_ai_orgchart_expanded_v1";

  const TEAM = [
    { id: "product", name: "Product Manager", icon: "📦", subtitle: "Produktdaten, Compliance & Wirtschaftlichkeit", agents: ["elyon-product-data-specialist", "elyon-compliance-specialist", "elyon-profit-specialist"] },
    { id: "listing", name: "Listing Manager", icon: "🛒", subtitle: "Listings, SEO & Entwurfsprüfung", agents: ["elyon-listing-specialist", "elyon-draft-quality-guard"] },
    { id: "operations", name: "Operations Manager", icon: "🚚", subtitle: "Bestellungen, Versand & Fulfillment", agents: ["elyon-order-specialist"] },
    { id: "care", name: "Customer Care", icon: "💬", subtitle: "Kundenservice, Reklamationen & Retouren", agents: ["elyon-customer-support-specialist"] },
  ];

  const PEOPLE = {
    "elyon-manager": ["🧠", "Elyon Manager"],
    "elyon-product-data-specialist": ["🧩", "Product Data Specialist"],
    "elyon-compliance-specialist": ["🛡️", "Compliance Guard"],
    "elyon-profit-specialist": ["📊", "Profit Analyst"],
    "elyon-listing-specialist": ["✍️", "Listing Specialist"],
    "elyon-draft-quality-guard": ["🔎", "Draft Quality Guard"],
    "elyon-order-specialist": ["📦", "Order Coordinator"],
    "elyon-customer-support-specialist": ["💬", "Customer Support Specialist"],
  };

  const SOURCE = {
    "elyon-operations-manager": "elyon-manager",
    "soul-operations": "elyon-manager",
    "elyon-product-data-checker": "elyon-product-data-specialist",
    "soul-scout": "elyon-product-data-specialist",
    "elyon-compliance-guard": "elyon-compliance-specialist",
    "soul-guard": "elyon-compliance-specialist",
    "elyon-profit-analyst": "elyon-profit-specialist",
    "soul-finance": "elyon-profit-specialist",
    "elyon-listing-pro": "elyon-listing-specialist",
    "soul-seo": "elyon-listing-specialist",
    "elyon-order-coordinator": "elyon-order-specialist",
    "elyon-support-assistant": "elyon-customer-support-specialist",
    "soul-support": "elyon-customer-support-specialist",
  };

  const MODES = {
    off: "Aus",
    manual: "Manuell",
    assisted: "Assistiert",
    semi: "Teilautomatisch",
    auto_internal: "Vollautomatisch intern",
    auto_external: "Vollautomatisch extern",
  };

  const RUNNING = new Set(["analyzing", "running", "queued"]);
  const BAD = new Set(["blocked", "failed", "rejected"]);
  const WARN = new Set(["warning", "manualReviewRequired", "approval_required", "draft_ready"]);
  const GOOD = new Set(["passed", "completed", "approved"]);
  const state = { expanded: new Set(), queued: false, view: "overview", filter: "" };

  const text = (value, fallback = "") => value == null ? fallback : String(value).trim();
  const esc = (value) => text(value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  const read = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  };

  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  };

  const status = (task) => text(task?.result?.status || task?.status, "idle");
  const visibleAgent = (task) => SOURCE[text(task?.agentId)] || text(task?.agentId);
  const timestamp = (task) => Date.parse(task?.updatedAt || task?.completedAt || task?.createdAt || "") || 0;

  function tasks() {
    const seen = new Set();
    const out = [];
    for (const key of TASK_KEYS) {
      const list = read(key, []);
      for (const task of (Array.isArray(list) ? list : [])) {
        const id = text(task?.id) || `${key}:${text(task?.createdAt)}:${text(task?.title)}`;
        if (!task || seen.has(id)) continue;
        seen.add(id);
        out.push(task);
      }
    }
    return out.sort((a, b) => timestamp(b) - timestamp(a));
  }

  function settings() {
    const value = read(SETTINGS_KEY, {});
    return value?.agents && typeof value.agents === "object" ? value.agents : {};
  }

  function rawMode(id) {
    const item = settings()[id] || {};
    return text(item.autonomyMode || item.autonomy?.mode || (id === "elyon-manager" ? "auto_internal" : "manual"));
  }

  function mode(id) {
    const value = rawMode(id);
    return MODES[value] || value;
  }

  function taskSet(ids) {
    const set = new Set(ids);
    return tasks().filter((task) => set.has(visibleAgent(task)));
  }

  function needsDecision(task) {
    const blockers = Array.isArray(task?.result?.blockers) ? task.result.blockers.filter(Boolean) : [];
    return blockers.length > 0 || BAD.has(status(task)) || WARN.has(status(task));
  }

  function statusMeta(list) {
    const values = list.slice(0, 30).map(status);
    if (values.some((value) => RUNNING.has(value))) return ["running", "Arbeitet"];
    if (values.some((value) => BAD.has(value))) return ["bad", "Aufmerksamkeit"];
    if (values.some((value) => WARN.has(value))) return ["warn", "Prüfung nötig"];
    if (values.some((value) => GOOD.has(value))) return ["good", "Bereit"];
    return ["idle", "Bereit"];
  }

  function departmentFor(agentId) {
    return agentId === "elyon-manager" ? "manager" : TEAM.find((item) => item.agents.includes(agentId))?.id || "manager";
  }

  function departmentName(task) {
    const agent = visibleAgent(task);
    if (agent === "elyon-manager") return "Elyon Manager";
    return TEAM.find((item) => item.agents.includes(agent))?.name || (PEOPLE[agent] || ["", "Elyon Mitarbeiter"])[1];
  }

  function statusLabel(task) {
    return ({
      queued: "Wartet", analyzing: "Arbeitet", running: "Arbeitet",
      passed: "Bestanden", completed: "Abgeschlossen", approved: "Freigegeben",
      draft_ready: "Entwurf fertig", warning: "Warnung", manualReviewRequired: "Prüfung nötig",
      approval_required: "Freigabe nötig", blocked: "Blockiert", failed: "Fehler", rejected: "Abgelehnt",
    })[status(task)] || "Bereit";
  }

  function summary(task) {
    const blockers = Array.isArray(task?.result?.blockers) ? task.result.blockers.filter(Boolean) : [];
    return text(task?.result?.summary || blockers[0] || task?.message || task?.description || task?.title, "Keine Zusatzinformation.");
  }

  function clock(task) {
    try {
      return timestamp(task)
        ? new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp(task)))
        : "—";
    } catch {
      return "—";
    }
  }

  function isToday(task) {
    const value = timestamp(task);
    if (!value) return false;
    const date = new Date(value);
    const now = new Date();
    return date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate();
  }

  function customAgents() {
    const list = read(CUSTOM_KEY, []);
    return Array.isArray(list) ? list.filter((item) => item?.id && item?.name) : [];
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #elyonAiWorkforce .aiw-org{display:grid!important;gap:20px!important;width:100%!important;max-width:1280px!important;margin:0 auto!important;color:#f4f6f8}
      #elyonAiWorkforce.aiw-company-view #elyonWorkforceCompanySwitcher{display:none!important}
      .aiw-org-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:2px 2px 0}
      .aiw-org-head h3{margin:0!important;font-size:22px!important;letter-spacing:-.02em}
      .aiw-org-head p{max-width:720px;margin:6px 0 0!important;color:#8d98a7!important;font-size:11px!important;line-height:1.5!important}
      .aiw-org-head-note{display:inline-flex;align-items:center;gap:7px;color:#9aa6b5;font-size:9px;white-space:nowrap;padding-top:4px}
      .aiw-org-head-note:before{content:"";width:7px;height:7px;border-radius:50%;background:#35c46a;box-shadow:0 0 0 4px rgba(53,196,106,.08)}
      .aiw-cockpit-nav{display:flex;gap:6px;align-items:center;overflow:auto;padding:5px;border:1px solid rgba(255,255,255,.07);border-radius:11px;background:#0e151e}
      .aiw-cockpit-nav button{min-height:32px!important;padding:6px 10px!important;border:1px solid transparent!important;border-radius:8px!important;background:transparent!important;color:#8996a6!important;font-size:9px!important;white-space:nowrap;box-shadow:none!important}
      .aiw-cockpit-nav button.active{color:#f5f7fa!important;background:#182331!important;border-color:rgba(79,140,255,.18)!important}
      .aiw-cockpit-nav .aiw-cockpit-settings{margin-left:auto!important;color:#a8b4c2!important}
      .aiw-cockpit-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .aiw-cockpit-metric{padding:13px 14px;border:1px solid rgba(255,255,255,.07);border-radius:11px;background:#111821}
      .aiw-cockpit-metric small{display:block;color:#6f7c8b;font-size:8px;text-transform:uppercase;letter-spacing:.055em}
      .aiw-cockpit-metric strong{display:block;margin-top:5px;color:#f3f6f9;font-size:20px;font-variant-numeric:tabular-nums}
      .aiw-cockpit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .aiw-cockpit-card{display:grid;gap:12px;padding:16px;border:1px solid rgba(255,255,255,.075);border-radius:12px;background:#111821;box-shadow:0 7px 20px rgba(0,0,0,.06)}
      .aiw-cockpit-card:hover{border-color:rgba(79,140,255,.22)}
      .aiw-cockpit-card-top,.aiw-cockpit-card-foot,.aiw-org-panel-head,.aiw-org-custom-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
      .aiw-cockpit-id,.aiw-org-person,.aiw-org-id{display:flex;gap:10px;min-width:0;align-items:flex-start}
      .aiw-org-avatar{width:40px;height:40px;flex:0 0 40px;display:grid;place-items:center;border-radius:10px;background:rgba(79,140,255,.09);border:1px solid rgba(79,140,255,.14);font-size:19px}
      .aiw-org-copy{min-width:0}
      .aiw-org-copy h4{margin:0!important;font-size:13px!important;line-height:1.25!important}
      .aiw-org-copy small{display:block;margin-top:3px;color:#7d8998;font-size:8.5px;line-height:1.45}
      .aiw-org-copy p{margin:6px 0 0!important;color:#9aa6b5!important;font-size:9px!important;line-height:1.5!important}
      .aiw-org-status,.aiw-org-mode{display:inline-flex;align-items:center;gap:6px;min-height:24px;padding:3px 7px;border:1px solid rgba(255,255,255,.075);border-radius:999px;background:rgba(255,255,255,.025);color:#9aa6b5;font-size:8px;white-space:nowrap}
      .aiw-org-status:before{content:"";width:6px;height:6px;border-radius:50%;background:#657181}
      .aiw-org-status.good:before{background:#35c46a}.aiw-org-status.running:before{background:#4f8cff}.aiw-org-status.warn:before{background:#f1ae42}.aiw-org-status.bad:before{background:#ee6464}
      .aiw-cockpit-now{min-height:31px;color:#9ba8b7;font-size:9px;line-height:1.5}
      .aiw-cockpit-now strong{color:#dce3ea}
      .aiw-cockpit-meta{display:flex;gap:9px;flex-wrap:wrap;color:#728091;font-size:8px}
      .aiw-org-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
      .aiw-org-primary{background:#4f8cff!important;color:#fff!important;border-color:#4f8cff!important;font-weight:650!important}
      .aiw-org-actions button{min-height:30px!important;padding:5px 9px!important;border-radius:8px!important;font-size:8.5px!important}
      .aiw-cockpit-card-foot{align-items:center;margin-top:auto}
      .aiw-cockpit-card-foot .aiw-org-actions{margin-left:auto}
      .aiw-org-panel,.aiw-org-custom{padding:15px;border:1px solid rgba(255,255,255,.075);border-radius:12px;background:#111821}
      .aiw-org-panel h4,.aiw-org-custom h4{margin:0!important;font-size:12px!important}
      .aiw-org-panel p,.aiw-org-custom p{margin:4px 0 0!important;color:#657181!important;font-size:8.5px!important;line-height:1.45!important}
      .aiw-org-count{min-width:25px;height:25px;display:grid;place-items:center;border-radius:999px;border:1px solid rgba(255,255,255,.07);font-size:8.5px;color:#9aa6b5}
      .aiw-org-list{display:grid;gap:7px;margin-top:10px}
      .aiw-org-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 10px;border:1px solid rgba(255,255,255,.055);border-radius:8px;background:rgba(255,255,255,.012)}
      .aiw-org-row strong{display:block;color:#dce2e9;font-size:9px;line-height:1.35}
      .aiw-org-row span{display:block;margin-top:3px;color:#788493;font-size:8px;line-height:1.45}
      .aiw-org-row.activity{grid-template-columns:44px minmax(0,1fr) auto;align-items:start}
      .aiw-org-time{color:#657181!important;font-variant-numeric:tabular-nums}
      .aiw-org-row button{min-height:28px!important;padding:4px 8px!important;font-size:8px!important}
      .aiw-org-empty{margin-top:10px;padding:14px;border:1px dashed rgba(255,255,255,.08);border-radius:9px;color:#7f8b9b;font-size:9px;text-align:center;background:rgba(255,255,255,.008)}
      .aiw-cockpit-stack{display:grid;gap:12px}
      .aiw-cockpit-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .aiw-cockpit-filter{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:2px;color:#8190a1;font-size:9px}
      .aiw-cockpit-filter strong{color:#dce3ea}
      .aiw-org-tree{display:grid;gap:0}
      .aiw-org-manager-wrap{position:relative;display:flex;justify-content:center;padding-bottom:28px}
      .aiw-org-manager-wrap:after{content:"";position:absolute;left:50%;bottom:0;width:1px;height:28px;background:rgba(121,149,184,.24)}
      .aiw-org-manager{width:min(800px,100%);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center;padding:17px 19px;border:1px solid rgba(79,140,255,.27);border-radius:12px;background:linear-gradient(135deg,rgba(79,140,255,.09),rgba(17,24,33,.98) 58%)}
      .aiw-org-manager-side{display:grid;gap:8px;justify-items:end}
      .aiw-org-manager-state{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
      .aiw-org-branches{position:relative;display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:18px;padding-top:28px}
      .aiw-org-branches:before{content:"";position:absolute;top:0;left:25%;right:25%;height:1px;background:rgba(121,149,184,.24)}
      .aiw-org-dept{position:relative;min-width:0}
      .aiw-org-dept:before{content:"";position:absolute;left:50%;top:-28px;width:1px;height:28px;background:rgba(121,149,184,.24)}
      .aiw-org-card{display:grid;gap:11px;min-height:160px;padding:15px;border:1px solid rgba(255,255,255,.075);border-radius:11px;background:#111821}
      .aiw-org-card-top,.aiw-org-foot{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      .aiw-org-meta{display:flex;gap:8px;flex-wrap:wrap;color:#7f8b9b;font-size:8px}
      .aiw-org-foot{align-items:center;margin-top:auto}.aiw-org-foot .aiw-org-actions{margin-left:auto}
      .aiw-org-specialists{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:7px;margin:8px 0 0;padding:10px;border:1px solid rgba(255,255,255,.06);border-radius:9px;background:rgba(255,255,255,.012)}
      .aiw-org-specialists[hidden]{display:none!important}
      .aiw-org-specialist{display:grid;grid-template-columns:30px minmax(0,1fr);gap:8px;align-items:center;padding:8px 9px;border:1px solid rgba(255,255,255,.055);border-radius:8px;background:#0f151d}
      .aiw-org-specialist>span:first-child{display:grid;place-items:center;width:30px;height:30px;border-radius:7px;background:rgba(255,255,255,.035)}
      .aiw-org-specialist strong{display:block;font-size:8.5px;color:#dce2e9}.aiw-org-specialist small{display:block;margin-top:3px;color:#657181;font-size:8px}
      .aiw-org-custom-list{display:grid;gap:7px;margin-top:10px}
      .aiw-org-custom-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 10px;border:1px solid rgba(255,255,255,.055);border-radius:8px;background:rgba(255,255,255,.012)}
      .aiw-org-custom-row strong{font-size:9px}.aiw-org-custom-row small{display:block;margin-top:2px;color:#657181;font-size:8px}
      @media(min-width:1500px){#elyonAiWorkforce .aiw-org{max-width:1420px!important}.aiw-cockpit-grid{grid-template-columns:repeat(4,minmax(230px,1fr))}.aiw-org-branches{grid-template-columns:repeat(4,minmax(240px,1fr));gap:14px}.aiw-org-branches:before{left:12.5%;right:12.5%}}
      @media(max-width:900px){.aiw-cockpit-metrics,.aiw-cockpit-grid,.aiw-cockpit-two{grid-template-columns:1fr 1fr}.aiw-org-head{flex-direction:column}.aiw-org-manager{grid-template-columns:1fr}.aiw-org-manager-side{justify-items:start}.aiw-org-manager-state{justify-content:flex-start}.aiw-org-branches{grid-template-columns:1fr;gap:14px;padding:0 0 0 20px;border-left:1px solid rgba(121,149,184,.22)}.aiw-org-branches:before{display:none}.aiw-org-dept:before{left:-20px;top:27px;width:20px;height:1px}.aiw-org-manager-wrap{justify-content:stretch;padding-bottom:22px}.aiw-org-manager-wrap:after{left:20px;height:22px}}
      @media(max-width:620px){.aiw-cockpit-metrics,.aiw-cockpit-grid,.aiw-cockpit-two{grid-template-columns:1fr}.aiw-cockpit-nav .aiw-cockpit-settings{margin-left:0!important}.aiw-cockpit-card-top,.aiw-cockpit-card-foot,.aiw-org-card-top,.aiw-org-foot,.aiw-org-custom-head{flex-direction:column;align-items:stretch}.aiw-cockpit-card-foot .aiw-org-actions,.aiw-org-foot .aiw-org-actions{margin-left:0}.aiw-org-actions button{flex:1}.aiw-org-row.activity{grid-template-columns:40px minmax(0,1fr)}.aiw-org-row.activity button{grid-column:2}.aiw-org-custom-row{grid-template-columns:1fr}.aiw-org-specialists{grid-template-columns:1fr}}
      @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
    `;
    document.head.appendChild(style);
  }

  function person(agentId) {
    const [icon, name] = PEOPLE[agentId] || ["•", agentId];
    const [tone, label] = statusMeta(taskSet([agentId]));
    return `<div class="aiw-org-specialist"><span>${icon}</span><div><strong>${esc(name)}</strong><small><span class="aiw-org-status ${tone}">${esc(label)}</span></small></div></div>`;
  }

  function employeeCard(item) {
    const list = taskSet(item.agents);
    const [tone, label] = statusMeta(list);
    const running = list.filter((task) => RUNNING.has(status(task)));
    const open = list.filter(needsDecision).length;
    const doneToday = list.filter((task) => GOOD.has(status(task)) && isToday(task)).length;
    const current = running[0] || list.find(needsDecision) || null;
    const currentText = current
      ? `<strong>${esc(statusLabel(current))}:</strong> ${esc(text(current.title, summary(current))).slice(0, 125)}`
      : "Keine laufende Aufgabe · bereit für einen neuen Auftrag.";

    return `<article class="aiw-cockpit-card" data-cockpit-employee="${item.id}">
      <div class="aiw-cockpit-card-top">
        <div class="aiw-cockpit-id"><span class="aiw-org-avatar">${item.icon}</span><div class="aiw-org-copy"><h4>${esc(item.name)}</h4><small>${esc(item.subtitle)}</small></div></div>
        <span class="aiw-org-status ${tone}">${esc(label)}</span>
      </div>
      <div class="aiw-cockpit-now">${currentText}</div>
      <div class="aiw-cockpit-meta"><span>${running.length} aktiv</span><span>${open} Entscheidung${open === 1 ? "" : "en"}</span><span>${doneToday} heute erledigt</span></div>
      <div class="aiw-cockpit-card-foot"><span class="aiw-org-mode">${item.agents.length} Skill${item.agents.length === 1 ? "" : "s"}</span><div class="aiw-org-actions">
        <button class="aiw-org-primary" data-v6-assign="${item.id}">Auftrag geben</button>
        <button class="aiw-secondary" data-v6-details="${item.id}">Details</button>
        <button class="aiw-secondary" data-org-view="tasks" data-org-filter="${item.id}">Aktivität</button>
      </div></div>
    </article>`;
  }

  function taskRows(list, emptyText) {
    if (!list.length) return `<div class="aiw-org-empty">${esc(emptyText)}</div>`;
    return `<div class="aiw-org-list">${list.map((task) => {
      const dept = departmentFor(visibleAgent(task));
      return `<div class="aiw-org-row activity"><span class="aiw-org-time">${esc(clock(task))}</span><div><strong>${esc(departmentName(task))} · ${esc(statusLabel(task))}</strong><span>${esc(text(task.title, "Aufgabe"))}: ${esc(summary(task)).slice(0, 180)}</span></div><button class="aiw-secondary" data-v6-details="${dept}">Details</button></div>`;
    }).join("")}</div>`;
  }

  function decisions(limit = 8) {
    return taskRows(tasks().filter(needsDecision).slice(0, limit), "✓ Aktuell ist keine Entscheidung notwendig.");
  }

  function currentWork(limit = 8) {
    return taskRows(tasks().filter((task) => RUNNING.has(status(task))).slice(0, limit), "Aktuell arbeitet kein Mitarbeiter an einer Aufgabe.");
  }

  function completed(limit = 8) {
    return taskRows(tasks().filter((task) => GOOD.has(status(task))).slice(0, limit), "Noch keine abgeschlossenen Aufgaben vorhanden.");
  }

  function overview() {
    const all = tasks();
    const runningCount = all.filter((task) => RUNNING.has(status(task))).length;
    const decisionCount = all.filter(needsDecision).length;
    const doneToday = all.filter((task) => GOOD.has(status(task)) && isToday(task)).length;
    const activeTeam = TEAM.filter((item) => item.agents.some((id) => rawMode(id) !== "off")).length;

    return `<div class="aiw-cockpit-stack">
      <div class="aiw-cockpit-metrics">
        <div class="aiw-cockpit-metric"><small>Mitarbeiter aktiv</small><strong>${activeTeam}/${TEAM.length}</strong></div>
        <div class="aiw-cockpit-metric"><small>Aufgaben laufen</small><strong>${runningCount}</strong></div>
        <div class="aiw-cockpit-metric"><small>Entscheidungen</small><strong>${decisionCount}</strong></div>
        <div class="aiw-cockpit-metric"><small>Heute erledigt</small><strong>${doneToday}</strong></div>
      </div>
      <div class="aiw-cockpit-grid">${TEAM.map(employeeCard).join("")}</div>
      <section class="aiw-org-panel" data-org-anchor="decisions"><div class="aiw-org-panel-head"><div><h4>🚨 Deine Entscheidungen</h4><p>Nur Freigaben, Blocker, Fehler und echte Prüffälle.</p></div><span class="aiw-org-count">${decisionCount}</span></div>${decisions(5)}</section>
      <div class="aiw-cockpit-two">
        <section class="aiw-org-panel"><div class="aiw-org-panel-head"><div><h4>⚡ Gerade in Arbeit</h4><p>Live aus den bestehenden Workforce-Tasks.</p></div><span class="aiw-org-count">${Math.min(runningCount, 8)}</span></div>${currentWork(6)}</section>
        <section class="aiw-org-panel"><div class="aiw-org-panel-head"><div><h4>✅ Zuletzt erledigt</h4><p>Die jüngsten abgeschlossenen Team-Aufgaben.</p></div><span class="aiw-org-count">${Math.min(all.filter((task) => GOOD.has(status(task))).length, 8)}</span></div>${completed(6)}</section>
      </div>
    </div>`;
  }

  function tasksView() {
    const dept = TEAM.find((item) => item.id === state.filter) || null;
    const list = (dept ? taskSet(dept.agents) : tasks()).slice(0, 30);
    return `<section class="aiw-org-panel">
      <div class="aiw-cockpit-filter"><span>${dept ? `Aktivität von <strong>${esc(dept.name)}</strong>` : "<strong>Alle Team-Aufgaben</strong>"}</span>${dept ? '<button class="aiw-secondary" data-org-view="tasks">Alle anzeigen</button>' : ""}</div>
      <div class="aiw-org-panel-head"><div><h4>Aufgaben</h4><p>Laufende, offene und abgeschlossene Arbeit in einer Liste.</p></div><span class="aiw-org-count">${list.length}</span></div>
      ${taskRows(list, "Noch keine Aufgaben im Workforce-Verlauf.")}
    </section>`;
  }

  function decisionsView() {
    const list = tasks().filter(needsDecision);
    return `<section class="aiw-org-panel"><div class="aiw-org-panel-head"><div><h4>Entscheidungen</h4><p>Alle Fälle, die deine Prüfung, Freigabe oder Aufmerksamkeit benötigen.</p></div><span class="aiw-org-count">${list.length}</span></div>${taskRows(list.slice(0, 30), "✓ Keine offenen Entscheidungen.")}</section>`;
  }

  function department(item) {
    const list = taskSet(item.agents);
    const [tone, label] = statusMeta(list);
    const expanded = state.expanded.has(item.id);
    const open = list.filter(needsDecision).length;
    const running = list.filter((task) => RUNNING.has(status(task))).length;
    return `<article class="aiw-org-dept" data-org-department="${item.id}">
      <div class="aiw-org-card">
        <div class="aiw-org-card-top"><div class="aiw-org-id"><span class="aiw-org-avatar">${item.icon}</span><div class="aiw-org-copy"><h4>${esc(item.name)}</h4><small>${esc(item.subtitle)}</small></div></div><span class="aiw-org-status ${tone}">${esc(label)}</span></div>
        <div class="aiw-org-meta"><span>${item.agents.length} Spezialist${item.agents.length === 1 ? "" : "en"}</span><span>${running} aktiv</span><span>${open} offen</span></div>
        <div class="aiw-org-foot"><div class="aiw-org-actions"><button class="aiw-secondary" data-org-toggle="${item.id}" aria-expanded="${expanded}">${expanded ? "Team schließen" : "Team ansehen"}</button><button class="aiw-secondary" data-v6-details="${item.id}">Details</button><button class="aiw-org-primary" data-v6-assign="${item.id}">Auftrag geben</button></div></div>
      </div>
      <div class="aiw-org-specialists" ${expanded ? "" : "hidden"}>${item.agents.map(person).join("")}</div>
    </article>`;
  }

  function custom() {
    const list = customAgents();
    return `<section class="aiw-org-custom"><div class="aiw-org-custom-head"><div><h4>Eigene Mitarbeiter</h4><p>Spezialrollen für Aufgaben außerhalb des Kernteams.</p></div><button class="aiw-secondary" data-v6-create-custom>＋ Mitarbeiter einstellen</button></div>
      ${list.length ? `<div class="aiw-org-custom-list">${list.map((agent) => `<div class="aiw-org-custom-row"><div><strong>${esc(agent.icon || "🤖")} ${esc(agent.name)}</strong><small>${esc(agent.role || "Eigener Mitarbeiter")}</small></div><div class="aiw-org-actions"><button data-v6-custom-assign="${esc(agent.id)}">Auftrag</button><button class="aiw-secondary" data-v6-custom-edit="${esc(agent.id)}">Bearbeiten</button></div></div>`).join("")}</div>` : `<div class="aiw-org-empty">Noch keine eigenen Mitarbeiter eingestellt.</div>`}
    </section>`;
  }

  function teamView() {
    const all = tasks();
    const managerTasks = taskSet(["elyon-manager"]);
    const [tone, label] = statusMeta(managerTasks.length ? managerTasks : all);
    return `<div class="aiw-cockpit-stack">
      <div class="aiw-org-tree">
        <div class="aiw-org-manager-wrap"><article class="aiw-org-manager">
          <div class="aiw-org-person"><span class="aiw-org-avatar">🧠</span><div class="aiw-org-copy"><h4>Elyon Manager</h4><small>Geschäftsleitung · Zentrale Steuerung</small><p>Steuert das digitale Team, verteilt Aufgaben und meldet sich nur bei notwendigen Entscheidungen.</p></div></div>
          <div class="aiw-org-manager-side"><div class="aiw-org-manager-state"><span class="aiw-org-status ${tone}">${esc(label)}</span><span class="aiw-org-mode">${esc(mode("elyon-manager"))}</span></div><div class="aiw-org-actions"><button class="aiw-secondary" data-v6-details="manager">Details</button><button class="aiw-org-primary" data-v6-assign="manager">＋ Auftrag geben</button></div></div>
        </article></div>
        <div class="aiw-org-branches">${TEAM.map(department).join("")}</div>
      </div>
      ${custom()}
    </div>`;
  }

  function viewMarkup() {
    if (state.view === "tasks") return tasksView();
    if (state.view === "decisions") return decisionsView();
    if (state.view === "team") return teamView();
    return overview();
  }

  function markup() {
    const all = tasks();
    const decisionCount = all.filter(needsDecision).length;
    return `<div class="aiw-v6-team aiw-org">
      <header class="aiw-org-head"><div><h3>Virtuelles Team</h3><p>Dein operatives Team-Cockpit: Aufträge verteilen, Arbeit verfolgen und nur dort eingreifen, wo eine echte Entscheidung nötig ist. Technische Agenten und Modelle bleiben eine Ebene tiefer.</p></div><div class="aiw-org-head-note">${decisionCount ? `${decisionCount} Entscheidung${decisionCount === 1 ? "" : "en"} offen` : "Team betriebsbereit"}</div></header>
      <nav class="aiw-cockpit-nav" aria-label="Virtuelles Team Bereiche">
        <button class="${state.view === "overview" ? "active" : ""}" data-org-view="overview">Übersicht</button>
        <button class="${state.view === "tasks" ? "active" : ""}" data-org-view="tasks">Aufgaben</button>
        <button class="${state.view === "decisions" ? "active" : ""}" data-org-view="decisions">Entscheidungen${decisionCount ? ` · ${decisionCount}` : ""}</button>
        <button class="${state.view === "team" ? "active" : ""}" data-org-view="team">Team</button>
        <button class="aiw-cockpit-settings" data-company-view="advanced">⚙ Einstellungen</button>
      </nav>
      ${viewMarkup()}
    </div>`;
  }

  function signature() {
    return JSON.stringify({
      view: state.view,
      filter: state.filter,
      expanded: [...state.expanded].sort(),
      tasks: tasks().slice(0, 80).map((task) => [task.id, task.updatedAt, task.status, task.result?.status, task.result?.summary]),
      custom: customAgents().map((item) => [item.id, item.name, item.role, item.updatedAt]),
      modes: ["elyon-manager", ...TEAM.flatMap((item) => item.agents)].map((id) => [id, rawMode(id)]),
    });
  }

  function render() {
    installStyles();
    const root = document.querySelector("#elyonAiWorkforce .aiw-v6-team");
    if (!root) return false;
    const sig = signature();
    if (root.classList.contains("aiw-org") && root.dataset.orgSignature === sig) return true;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = markup();
    const replacement = wrapper.firstElementChild;
    if (!replacement) return false;
    replacement.dataset.orgSignature = sig;
    root.replaceWith(replacement);
    const nav = document.querySelector('#elyonAiWorkforce [data-v3-view="team"]');
    if (nav) nav.innerHTML = "◉ Team-Cockpit";
    return true;
  }

  function queueRender() {
    if (state.queued) return;
    state.queued = true;
    requestAnimationFrame(() => {
      state.queued = false;
      render();
    });
  }

  function click(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const view = target.closest("[data-org-view]");
    if (view) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const next = text(view.dataset.orgView, "overview");
      state.view = ["overview", "tasks", "decisions", "team"].includes(next) ? next : "overview";
      state.filter = state.view === "tasks" ? text(view.dataset.orgFilter) : "";
      queueRender();
      return;
    }

    const toggle = target.closest("[data-org-toggle]");
    if (toggle) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const id = text(toggle.dataset.orgToggle);
      state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id);
      write(EXPANDED_KEY, [...state.expanded]);
      queueRender();
    }
  }

  function install() {
    const stored = read(EXPANDED_KEY, []);
    state.expanded = new Set(Array.isArray(stored) ? stored : []);
    installStyles();
    document.addEventListener("click", click, true);
    window.addEventListener("elyon:ai-workforce-team-v6-rendered", queueRender);
    window.addEventListener("elyon:ai-workforce-v2-task-updated", queueRender);
    window.addEventListener("elyon:ai-workforce-custom-task-updated", queueRender);
    window.addEventListener("elyon:tab-changed", (event) => {
      const tabId = event.detail?.tabId || event.detail;
      if (tabId === "virtualAgentsTab") {
        state.view = "overview";
        state.filter = "";
        queueRender();
      }
    });
    window.addEventListener("storage", (event) => {
      if ([SETTINGS_KEY, CUSTOM_KEY, EXPANDED_KEY, ...TASK_KEYS].includes(event.key)) queueRender();
    });
    queueRender();
  }

  window.ElyonAIWorkforceOrgchartV1 = { render: queueRender, team: TEAM };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();