(() => {
  "use strict";

  const STYLE_ID = "elyonAiWorkforceTeamV5Styles";
  const PANEL_ID = "elyonAiWorkforceTeamV5Panel";
  const COMPOSER_ID = "elyonAiWorkforceTeamV5Composer";
  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const TASKS_KEY = "elyon_ai_workforce_tasks";
  const CUSTOM_KEY = "elyon_ai_custom_agents_v1";

  const TEAM = [
    {
      id: "manager",
      name: "Elyon Manager",
      icon: "🧠",
      department: "Teamleitung",
      description: "Nimmt Aufträge entgegen, priorisiert, delegiert, erkennt Blocker und holt nur dort deine Entscheidung ein, wo sie wirklich nötig ist.",
      visibleAgents: ["elyon-manager"],
      skills: ["Orchestrierung", "Priorisierung", "Freigaben", "Eskalation"],
      builderTarget: "elyon-operations-manager",
      colorClass: "manager",
    },
    {
      id: "product",
      name: "Product Manager",
      icon: "📦",
      department: "Produkt & Wirtschaftlichkeit",
      description: "Verantwortet die Produktreife vor dem Listing: vollständige Daten, Compliance, Risiken und Wirtschaftlichkeit.",
      visibleAgents: ["elyon-product-data-specialist", "elyon-compliance-specialist", "elyon-profit-specialist"],
      skills: ["Produktdaten", "Varianten", "Compliance", "GPSR / CE", "Profit", "Risiken"],
      colorClass: "product",
    },
    {
      id: "listing",
      name: "Listing Manager",
      icon: "🛒",
      department: "eBay Listings",
      description: "Erstellt verkaufsfertige Listings aus belegten Fakten und kontrolliert den Entwurf vor der Freigabe.",
      visibleAgents: ["elyon-listing-specialist", "elyon-draft-quality-guard"],
      skills: ["Titel", "SEO", "Beschreibung", "Merkmale", "Varianten", "Draft QA"],
      colorClass: "listing",
    },
    {
      id: "operations",
      name: "Operations Manager",
      icon: "🚚",
      department: "Bestellungen & Fulfillment",
      description: "Überwacht Bestellungen, Lieferantenstatus, Versandfristen, Tracking und operative Ausnahmen.",
      visibleAgents: ["elyon-order-specialist"],
      skills: ["Bestellungen", "Versandfristen", "Tracking", "Lieferantenrisiken"],
      colorClass: "operations",
    },
    {
      id: "care",
      name: "Customer Care",
      icon: "💬",
      department: "Kundenservice",
      description: "Bearbeitet Kundenfälle, Reklamationen und Retouren und bereitet sichere Antworten zur Freigabe vor.",
      visibleAgents: ["elyon-customer-support-specialist"],
      skills: ["Kundenfragen", "Reklamationen", "Retouren", "Antwortentwürfe", "Eskalation"],
      colorClass: "care",
    },
  ];

  const SKILLS = {
    "elyon-manager": { name: "Orchestrierung", icon: "🧠", backendId: "elyon-operations-manager", action: "create_daily_briefing", context: "manager" },
    "elyon-product-data-specialist": { name: "Produktdaten", icon: "🧩", backendId: "elyon-product-data-checker", action: "analyze_product", context: "product" },
    "elyon-compliance-specialist": { name: "Compliance", icon: "🛡️", backendId: "elyon-compliance-guard", action: "analyze_product", context: "product" },
    "elyon-profit-specialist": { name: "Profit", icon: "📊", backendId: "elyon-profit-analyst", action: "analyze_product", context: "product" },
    "elyon-listing-specialist": { name: "Listing", icon: "✍️", backendId: "elyon-listing-pro", action: "analyze_listing", context: "product" },
    "elyon-draft-quality-guard": { name: "Draft QA", icon: "🔎", backendId: "elyon-draft-quality-guard", action: "run_draft_quality", context: "product", deterministic: true },
    "elyon-order-specialist": { name: "Orders", icon: "📦", backendId: "elyon-order-coordinator", action: "analyze_order", context: "order" },
    "elyon-customer-support-specialist": { name: "Support", icon: "💬", backendId: "elyon-support-assistant", action: "analyze_return", context: "return" },
  };

  const SOURCE_TO_VISIBLE = {
    "elyon-operations-manager": "elyon-manager", "soul-operations": "elyon-manager",
    "elyon-product-data-checker": "elyon-product-data-specialist", "soul-scout": "elyon-product-data-specialist",
    "elyon-compliance-guard": "elyon-compliance-specialist", "soul-guard": "elyon-compliance-specialist",
    "elyon-profit-analyst": "elyon-profit-specialist", "soul-finance": "elyon-profit-specialist",
    "elyon-listing-pro": "elyon-listing-specialist", "soul-seo": "elyon-listing-specialist",
    "elyon-order-coordinator": "elyon-order-specialist",
    "elyon-support-assistant": "elyon-customer-support-specialist", "soul-support": "elyon-customer-support-specialist",
  };

  const MODE_LABELS = {
    off: "Aus", manual: "Manuell", assisted: "Assistiert", semi: "Teilautomatisch",
    auto_internal: "Vollautomatisch intern", auto_external: "Vollautomatisch extern",
  };

  const state = { observer: null, queued: false, rendering: false };
  const text = (value, fallback = "") => value === null || value === undefined ? fallback : String(value).trim();
  const escapeHtml = (value) => text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  function readJson(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key) || "null"); return value === null ? fallback : value; }
    catch { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  }

  function tasks() {
    const value = readJson(TASKS_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function customAgents() {
    const value = readJson(CUSTOM_KEY, []);
    return Array.isArray(value) ? value.filter((agent) => agent?.id && agent?.name) : [];
  }

  function visibleTaskAgent(task) {
    return SOURCE_TO_VISIBLE[task?.agentId] || task?.agentId || "";
  }

  function teamById(id) { return TEAM.find((member) => member.id === id) || null; }

  function roleTasks(member) {
    const ids = new Set(member.visibleAgents);
    return tasks().filter((task) => ids.has(visibleTaskAgent(task)));
  }

  function normalizedStatus(task) {
    return text(task?.result?.status || task?.status, "idle");
  }

  function aggregateStatus(member) {
    const list = roleTasks(member);
    if (!list.length) return { id: "idle", label: "Bereit" };
    const statuses = list.slice(0, 12).map(normalizedStatus);
    if (statuses.some((status) => ["analyzing", "running", "queued"].includes(status))) return { id: "running", label: "Arbeitet" };
    if (statuses.some((status) => ["blocked", "failed"].includes(status))) return { id: "bad", label: "Braucht Aufmerksamkeit" };
    if (statuses.some((status) => ["warning", "manualReviewRequired", "approval_required", "draft_ready"].includes(status))) return { id: "warn", label: "Prüfung nötig" };
    if (statuses.some((status) => ["passed", "completed", "approved"].includes(status))) return { id: "good", label: "Aktiv" };
    return { id: "idle", label: "Bereit" };
  }

  function memberMode(member) {
    const settings = readJson(SETTINGS_KEY, {});
    const agents = settings?.agents && typeof settings.agents === "object" ? settings.agents : {};
    const modes = member.visibleAgents.map((id) => text(agents[id]?.autonomyMode || agents[id]?.autonomy?.mode || "manual")).filter(Boolean);
    if (!modes.length) return "Manuell";
    const unique = [...new Set(modes)];
    return unique.length === 1 ? (MODE_LABELS[unique[0]] || unique[0]) : "Gemischte Autonomie";
  }

  function activityCounts(member) {
    const list = roleTasks(member);
    return {
      running: list.filter((task) => ["running", "analyzing", "queued"].includes(normalizedStatus(task))).length,
      attention: list.filter((task) => ["blocked", "failed", "warning", "manualReviewRequired", "approval_required", "draft_ready"].includes(normalizedStatus(task))).length,
      done: list.filter((task) => ["passed", "completed", "approved"].includes(normalizedStatus(task))).length,
    };
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #elyonAiWorkforce.aiw-team-v5 .aiw-v3-nav [data-v3-view="team"]{font-weight:850}
      .aiw-v5-team{display:grid;gap:13px}.aiw-v5-team-head{display:flex;justify-content:space-between;gap:12px;align-items:end;padding-bottom:4px}.aiw-v5-team-head h3{margin:0;font-size:15px}.aiw-v5-team-head p{margin:4px 0 0;color:#8194aa;font-size:10px;max-width:680px;line-height:1.5}.aiw-v5-team-head-actions{display:flex;gap:7px;flex-wrap:wrap}.aiw-v5-team-head-actions button{padding:8px 10px;border-radius:9px;font-size:10px}
      .aiw-v5-manager-card{display:grid;grid-template-columns:minmax(0,1.4fr) auto;gap:14px;padding:17px;border-radius:17px;border:1px solid rgba(96,165,250,.26);background:linear-gradient(130deg,rgba(37,99,235,.13),rgba(7,16,29,.65))}.aiw-v5-manager-card h3{margin:2px 0 5px;font-size:16px}.aiw-v5-manager-card p{margin:0;color:#98aac0;font-size:10px;line-height:1.55}.aiw-v5-manager-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
      .aiw-v5-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.aiw-v5-card{position:relative;display:grid;gap:11px;padding:15px;border:1px solid rgba(148,163,184,.14);border-radius:15px;background:rgba(7,16,29,.48);transition:border-color .15s ease,transform .15s ease,background .15s ease}.aiw-v5-card:hover{transform:translateY(-1px);border-color:rgba(96,165,250,.24);background:rgba(15,31,50,.58)}.aiw-v5-card-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.aiw-v5-identity{display:flex;gap:10px;align-items:flex-start}.aiw-v5-avatar{width:39px;height:39px;display:grid;place-items:center;border-radius:12px;background:rgba(59,130,246,.1);font-size:20px}.aiw-v5-identity h4{margin:0;font-size:13px}.aiw-v5-identity small{display:block;margin-top:3px;color:#7f93aa;font-size:9px}.aiw-v5-card p{margin:0;color:#9aadc1;font-size:10px;line-height:1.5}.aiw-v5-status{display:inline-flex;align-items:center;gap:5px;padding:5px 7px;border-radius:999px;background:rgba(148,163,184,.08);color:#aebdce;font-size:9px;font-weight:800;white-space:nowrap}.aiw-v5-status::before{content:"";width:7px;height:7px;border-radius:50%;background:#64748b}.aiw-v5-status.good::before{background:#22c55e}.aiw-v5-status.running::before{background:#60a5fa}.aiw-v5-status.warn::before{background:#f59e0b}.aiw-v5-status.bad::before{background:#ef4444}.aiw-v5-skills{display:flex;gap:5px;flex-wrap:wrap}.aiw-v5-skill{padding:4px 7px;border-radius:999px;border:1px solid rgba(148,163,184,.11);background:rgba(255,255,255,.03);font-size:8px;color:#aebdce}.aiw-v5-card-footer{display:flex;justify-content:space-between;gap:9px;align-items:center;padding-top:2px}.aiw-v5-meta{display:flex;gap:7px;flex-wrap:wrap;color:#71869e;font-size:8px}.aiw-v5-actions{display:flex;gap:5px}.aiw-v5-actions button,.aiw-v5-manager-actions button{padding:7px 9px;border-radius:9px;font-size:9px}.aiw-v5-primary{background:linear-gradient(135deg,#2563eb,#3b82f6)!important;color:#fff!important;border-color:transparent!important}
      .aiw-v5-custom{margin-top:2px;padding-top:13px;border-top:1px solid rgba(148,163,184,.12)}.aiw-v5-custom-head{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px}.aiw-v5-custom-head h4{margin:0;font-size:11px}.aiw-v5-custom-list{display:grid;gap:7px}.aiw-v5-custom-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 11px;border-radius:12px;background:rgba(255,255,255,.025);border:1px solid rgba(148,163,184,.1)}.aiw-v5-custom-row strong{font-size:10px}.aiw-v5-custom-row small{display:block;margin-top:2px;color:#7f93aa;font-size:8px}.aiw-v5-custom-actions{display:flex;gap:5px}.aiw-v5-custom-actions button{padding:6px 8px;border-radius:8px;font-size:9px}
      .aiw-v5-panel,.aiw-v5-composer{position:fixed;inset:0;z-index:19600;background:rgba(2,6,23,.84);backdrop-filter:blur(7px);display:flex;justify-content:flex-end}.aiw-v5-panel-inner,.aiw-v5-composer-inner{width:min(690px,100%);height:100%;overflow:auto;background:#0b1422;border-left:1px solid rgba(148,163,184,.16);padding:20px;color:#e8eef7}.aiw-v5-panel-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding-bottom:13px;border-bottom:1px solid rgba(148,163,184,.14)}.aiw-v5-panel-head h2{margin:0;font-size:18px}.aiw-v5-panel-head p{margin:5px 0 0;color:#8fa2b8;font-size:10px;line-height:1.5}.aiw-v5-panel-section{margin-top:13px;padding:13px;border:1px solid rgba(148,163,184,.13);border-radius:14px;background:rgba(15,31,50,.48)}.aiw-v5-panel-section h3{margin:0 0 9px;font-size:11px}.aiw-v5-skill-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px;align-items:center;padding:9px;border-radius:10px;background:rgba(255,255,255,.03);margin-top:6px}.aiw-v5-skill-row strong{font-size:10px}.aiw-v5-skill-row small{display:block;margin-top:2px;color:#8093a9;font-size:8px}.aiw-v5-skill-row button{padding:6px 8px;border-radius:8px;font-size:9px}.aiw-v5-activity-list{display:grid;gap:6px}.aiw-v5-activity{padding:8px 9px;border-radius:9px;background:rgba(255,255,255,.025);font-size:9px;color:#aebdce}.aiw-v5-panel-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:13px}.aiw-v5-panel-actions button{padding:8px 10px;border-radius:9px;font-size:9px}
      .aiw-v5-form{display:grid;gap:11px;margin-top:14px}.aiw-v5-field{display:grid;gap:5px;font-size:10px;color:#cbd5e1}.aiw-v5-field input,.aiw-v5-field select,.aiw-v5-field textarea{margin:0;padding:10px 11px;border-radius:10px;border:1px solid rgba(148,163,184,.17);background:#07101d;color:#e8eef7}.aiw-v5-field textarea{min-height:180px;resize:vertical;line-height:1.5}.aiw-v5-composer-note{padding:10px 11px;border-radius:11px;background:rgba(37,99,235,.07);border:1px solid rgba(96,165,250,.16);font-size:9px;line-height:1.5;color:#aabbd0}.aiw-v5-progress{display:none;margin-top:10px;padding:10px;border-radius:10px;background:rgba(34,197,94,.06);border:1px solid rgba(74,222,128,.14);font-size:9px;color:#bbf7d0}.aiw-v5-progress.show{display:block}
      @media(max-width:760px){.aiw-v5-grid{grid-template-columns:1fr}.aiw-v5-manager-card{grid-template-columns:1fr}.aiw-v5-manager-actions{justify-content:flex-start}.aiw-v5-team-head{display:grid}.aiw-v5-card-footer{align-items:flex-start;display:grid}.aiw-v5-actions{flex-wrap:wrap}}
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    document.querySelector(".aiw-v5-toast")?.remove();
    const node = document.createElement("div");
    node.className = "aiw-toast aiw-v5-toast";
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function memberCard(member) {
    const status = aggregateStatus(member);
    const counts = activityCounts(member);
    return `<article class="aiw-v5-card ${member.colorClass}" data-v5-member="${member.id}"><div class="aiw-v5-card-top"><div class="aiw-v5-identity"><span class="aiw-v5-avatar">${member.icon}</span><div><h4>${escapeHtml(member.name)}</h4><small>${escapeHtml(member.department)}</small></div></div><span class="aiw-v5-status ${status.id}">${escapeHtml(status.label)}</span></div><p>${escapeHtml(member.description)}</p><div class="aiw-v5-skills">${member.skills.map((skill) => `<span class="aiw-v5-skill">${escapeHtml(skill)}</span>`).join("")}</div><div class="aiw-v5-card-footer"><div class="aiw-v5-meta"><span>${escapeHtml(memberMode(member))}</span><span>${counts.running} läuft</span><span>${counts.attention} offen</span></div><div class="aiw-v5-actions"><button class="aiw-v5-primary" data-v5-assign="${member.id}">Auftrag geben</button><button class="aiw-secondary" data-v5-details="${member.id}">Details</button></div></div></article>`;
  }

  function customMarkup() {
    const list = customAgents();
    return `<section class="aiw-v5-custom"><div class="aiw-v5-custom-head"><div><h4>Eigene Mitarbeiter</h4></div><button class="aiw-secondary" data-v5-create-custom>＋ Mitarbeiter erstellen</button></div>${list.length ? `<div class="aiw-v5-custom-list">${list.map((agent) => `<div class="aiw-v5-custom-row"><div><strong>${escapeHtml(agent.icon || "🤖")} ${escapeHtml(agent.name)}</strong><small>${escapeHtml(agent.role || "Eigener Mitarbeiter")}</small></div><div class="aiw-v5-custom-actions"><button data-v5-custom-assign="${escapeHtml(agent.id)}">Auftrag</button><button class="aiw-secondary" data-v5-custom-edit="${escapeHtml(agent.id)}">Bearbeiten</button></div></div>`).join("")}</div>` : `<div class="aiw-v5-composer-note">Noch keine eigenen Mitarbeiter. Die fünf Elyon-Kernrollen decken den Standardbetrieb ab; zusätzliche Rollen kannst du nur bei echtem Bedarf ergänzen.</div>`}</section>`;
  }

  function teamMarkup() {
    const manager = TEAM[0];
    const status = aggregateStatus(manager);
    const counts = activityCounts(manager);
    return `<div class="aiw-v5-team"><div class="aiw-v5-team-head"><div><h3>Mein KI-Team</h3><p>Fünf klare Verantwortungsbereiche statt technischer Einzelagenten. Die spezialisierten Prüfungen laufen als Skills im Hintergrund.</p></div><div class="aiw-v5-team-head-actions"><button class="aiw-v5-primary" data-v5-assign="manager">＋ Neuer Auftrag</button><button class="aiw-secondary" data-v5-create-custom>＋ Mitarbeiter</button></div></div><article class="aiw-v5-manager-card"><div><div class="aiw-v5-identity"><span class="aiw-v5-avatar">${manager.icon}</span><div><h3>${manager.name}</h3><small>${manager.department}</small></div></div><p>${manager.description}</p><div class="aiw-v5-skills" style="margin-top:10px">${manager.skills.map((skill) => `<span class="aiw-v5-skill">${skill}</span>`).join("")}</div></div><div class="aiw-v5-manager-actions"><span class="aiw-v5-status ${status.id}">${status.label}</span><span class="aiw-v5-skill">${escapeHtml(memberMode(manager))}</span><button class="aiw-v5-primary" data-v5-assign="manager">Auftrag geben</button><button class="aiw-secondary" data-v5-details="manager">Details</button></div></article><div class="aiw-v5-grid">${TEAM.slice(1).map(memberCard).join("")}</div>${customMarkup()}</div>`;
  }

  function teamSection() {
    const shell = document.getElementById("elyonAiWorkforce");
    const activeTeam = shell?.querySelector('[data-v3-view="team"].active');
    if (!shell || !activeTeam) return null;
    return [...shell.querySelectorAll(".aiw-v3-section")].find((section) => section.querySelector(".aiw-v3-agent-list") || section.querySelector(".aiw-v5-team")) || null;
  }

  function renderTeam() {
    if (state.rendering) return false;
    const shell = document.getElementById("elyonAiWorkforce");
    const section = teamSection();
    if (!shell || !section) return false;
    state.rendering = true;
    try {
      shell.classList.add("aiw-team-v5");
      const nav = shell.querySelector('[data-v3-view="team"]');
      if (nav) nav.innerHTML = "◉ Mein Team";
      section.innerHTML = teamMarkup();
      bindSection(section);
      return true;
    } finally { state.rendering = false; }
  }

  function bindSection(section) {
    section.querySelectorAll("[data-v5-assign]").forEach((button) => button.addEventListener("click", () => openComposer(button.dataset.v5Assign)));
    section.querySelectorAll("[data-v5-details]").forEach((button) => button.addEventListener("click", () => openDetails(button.dataset.v5Details)));
    section.querySelectorAll("[data-v5-create-custom]").forEach((button) => button.addEventListener("click", () => window.ElyonAIAgentBuilder?.open?.()));
    section.querySelectorAll("[data-v5-custom-assign]").forEach((button) => button.addEventListener("click", () => window.ElyonAIAgentBuilder?.assign?.(button.dataset.v5CustomAssign)));
    section.querySelectorAll("[data-v5-custom-edit]").forEach((button) => button.addEventListener("click", () => window.ElyonAIAgentBuilder?.open?.(button.dataset.v5CustomEdit)));
  }

  function openDetails(teamId) {
    const member = teamById(teamId);
    if (!member) return;
    document.getElementById(PANEL_ID)?.remove();
    const list = roleTasks(member).slice(0, 8);
    const counts = activityCounts(member);
    const root = document.createElement("div");
    root.id = PANEL_ID;
    root.className = "aiw-v5-panel";
    root.innerHTML = `<aside class="aiw-v5-panel-inner"><div class="aiw-v5-panel-head"><div><h2>${member.icon} ${escapeHtml(member.name)}</h2><p>${escapeHtml(member.description)}</p></div><button data-v5-close>✕</button></div><section class="aiw-v5-panel-section"><h3>Arbeitsstatus</h3><div class="aiw-v5-skills"><span class="aiw-v5-skill">Autonomie: ${escapeHtml(memberMode(member))}</span><span class="aiw-v5-skill">${counts.running} läuft</span><span class="aiw-v5-skill">${counts.attention} braucht Prüfung</span><span class="aiw-v5-skill">${counts.done} abgeschlossen</span></div></section><section class="aiw-v5-panel-section"><h3>Interne Skills</h3>${member.visibleAgents.map((id) => { const skill = SKILLS[id]; return `<div class="aiw-v5-skill-row"><div><strong>${skill?.icon || "•"} ${escapeHtml(skill?.name || id)}</strong><small>Technischer Skill im Hintergrund – kein separater Mitarbeiter in der Hauptansicht.</small></div><button class="aiw-secondary" data-v5-skill-settings="${id}">Fachregeln</button></div>`; }).join("")}</section><section class="aiw-v5-panel-section"><h3>Letzte Aktivität</h3>${list.length ? `<div class="aiw-v5-activity-list">${list.map((task) => `<div class="aiw-v5-activity"><strong>${escapeHtml(task.title || SKILLS[visibleTaskAgent(task)]?.name || "Aufgabe")}</strong><br>${escapeHtml(normalizedStatus(task))}${task.result?.summary ? ` · ${escapeHtml(task.result.summary).slice(0, 180)}` : ""}</div>`).join("")}</div>` : `<div class="aiw-v5-composer-note">Für diesen Mitarbeiter gibt es noch keine Aktivität.</div>`}</section><div class="aiw-v5-panel-actions"><button class="aiw-v5-primary" data-v5-panel-assign>Auftrag geben</button>${member.visibleAgents.map((id) => `<button class="aiw-secondary" data-v5-skill-autonomy="${id}">${escapeHtml(SKILLS[id]?.name || id)} · Autonomie</button>`).join("")}</div></aside>`;
    root.addEventListener("click", (event) => {
      if (event.target === root || event.target.closest("[data-v5-close]")) root.remove();
      if (event.target.closest("[data-v5-panel-assign]")) { root.remove(); openComposer(teamId); }
      const settings = event.target.closest("[data-v5-skill-settings]");
      if (settings) window.ElyonAIWorkforceV2Settings?.open?.(settings.dataset.v5SkillSettings);
      const autonomy = event.target.closest("[data-v5-skill-autonomy]");
      if (autonomy) window.ElyonAIWorkforceWorkspaceV3?.openAutonomy?.(autonomy.dataset.v5SkillAutonomy);
    });
    document.body.appendChild(root);
  }

  function openComposer(teamId) {
    const member = teamById(teamId);
    if (!member) return;
    if (member.id === "manager") {
      window.ElyonAIAgentBuilder?.assign?.(member.builderTarget);
      return;
    }
    document.getElementById(COMPOSER_ID)?.remove();
    const root = document.createElement("div");
    root.id = COMPOSER_ID;
    root.className = "aiw-v5-composer";
    root.innerHTML = `<aside class="aiw-v5-composer-inner"><div class="aiw-v5-panel-head"><div><h2>${member.icon} ${escapeHtml(member.name)} beauftragen</h2><p>Ein Auftrag an diesen Mitarbeiter wird automatisch über seine internen Skills abgearbeitet.</p></div><button data-v5-close>✕</button></div><div class="aiw-v5-form"><label class="aiw-v5-field"><span>Auftragstitel</span><input data-v5-field="title" placeholder="z. B. Produkt komplett prüfen"></label><label class="aiw-v5-field"><span>Priorität</span><select data-v5-field="priority"><option value="low">Niedrig</option><option value="medium" selected>Normal</option><option value="high">Hoch</option><option value="critical">Kritisch</option></select></label><label class="aiw-v5-field"><span>Arbeitsauftrag / Aufgaben-Prompt *</span><textarea data-v5-field="prompt" placeholder="Was soll ${escapeHtml(member.name)} konkret prüfen, entscheiden oder vorbereiten?"></textarea></label><div class="aiw-v5-composer-note"><strong>Ablauf:</strong> ${member.visibleAgents.map((id) => SKILLS[id]?.name || id).join(" → ")}. Externe Aktionen werden dadurch nicht automatisch freigeschaltet.</div><div class="aiw-v5-progress" data-v5-progress></div><div class="aiw-v5-panel-actions"><button class="aiw-v5-primary" data-v5-run>Auftrag starten</button><button class="aiw-secondary" data-v5-close>Abbrechen</button></div></div></aside>`;
    root.addEventListener("click", async (event) => {
      if (event.target === root || event.target.closest("[data-v5-close]")) root.remove();
      const button = event.target.closest("[data-v5-run]");
      if (!button) return;
      const prompt = text(root.querySelector('[data-v5-field="prompt"]')?.value);
      if (!prompt) return toast("Bitte einen Arbeitsauftrag eingeben.");
      const title = text(root.querySelector('[data-v5-field="title"]')?.value, `${member.name} Auftrag`);
      const priority = text(root.querySelector('[data-v5-field="priority"]')?.value, "medium");
      button.disabled = true;
      const progress = root.querySelector("[data-v5-progress]");
      progress.classList.add("show");
      const result = await runDepartment(member, { title, priority, prompt, progress });
      button.disabled = false;
      if (result.ok) { toast(`${member.name}: Auftrag abgeschlossen.`); root.remove(); queueRender(); }
    });
    document.body.appendChild(root);
  }

  function collection(keys) {
    for (const key of keys) {
      const value = readJson(key, null);
      if (Array.isArray(value) && value.length) return value;
      if (Array.isArray(value?.items) && value.items.length) return value.items;
      if (Array.isArray(value?.products) && value.products.length) return value.products;
    }
    return [];
  }

  function selectedProduct() {
    const list = collection(["elyonProducts", "elyonSellerProducts", "sellerProductMaster", "elyonProductMaster"]);
    const selectedId = text(window.elyonSelectedProductId || localStorage.getItem("elyonSelectedProductId") || localStorage.getItem("elyon_active_product_id"));
    return list.find((item) => selectedId && [item?.id, item?.productId, item?.sku].map(text).includes(selectedId)) || list.find((item) => ["ready_for_seller_tool", "bereit_manuell_einstellen"].includes(item?.status)) || list[0] || {};
  }

  function orderSummary(order = {}) {
    return { id: order.id || order.orderId || order.ebayOrderId || "", status: order.status || order.orderStatus || "", orderDate: order.orderDate || order.createdAt || "", shippingDeadline: order.shippingDeadline || order.shipByDate || "", trackingNumber: order.trackingNumber || order.tracking || "", total: order.total || order.totalAmount || "", currency: order.currency || "EUR", items: Array.isArray(order.items) ? order.items.slice(0, 20).map((item) => ({ sku: item?.sku || "", title: item?.title || item?.name || "", quantity: item?.quantity || 0, price: item?.price || "" })) : [] };
  }

  function returnSummary(item = {}) {
    return { id: item.id || item.returnId || "", orderId: item.orderId || item.ebayOrderId || "", status: item.status || "", reason: item.reason || item.returnReason || item.issue || "", createdAt: item.createdAt || item.date || "", amount: item.amount || item.refundAmount || "" };
  }

  function contextFor(skill) {
    if (skill.context === "product") return { product: selectedProduct() };
    if (skill.context === "order") return { order: orderSummary(collection(["elyonOrders", "ebayOrders", "elyonSales"])[0] || {}) };
    if (skill.context === "return") return { returnCase: returnSummary(collection(["elyonReturns", "elyonShopifyReturns", "ebayReturns"])[0] || {}) };
    return { context: { products: collection(["elyonProducts", "elyonSellerProducts", "sellerProductMaster", "elyonProductMaster"]).slice(0, 40), orders: collection(["elyonOrders", "ebayOrders", "elyonSales"]).slice(0, 20).map(orderSummary), returns: collection(["elyonReturns", "elyonShopifyReturns", "ebayReturns"]).slice(0, 20).map(returnSummary), tasks: tasks().slice(0, 30) } };
  }

  function upsertTask(task) {
    if (!task?.id) return;
    const list = tasks();
    const index = list.findIndex((entry) => entry?.id === task.id);
    if (index >= 0) list[index] = { ...list[index], ...task, updatedAt: task.updatedAt || new Date().toISOString() };
    else list.unshift(task);
    writeJson(TASKS_KEY, list.slice(0, 150));
    window.dispatchEvent(new CustomEvent("elyon:ai-workforce-v2-task-updated", { detail: task }));
  }

  function isHardStop(task) {
    const status = normalizedStatus(task);
    const blockers = Array.isArray(task?.result?.blockers) ? task.result.blockers.filter(Boolean) : [];
    return blockers.length > 0 || ["blocked", "failed"].includes(status);
  }

  async function runDepartment(member, { title, priority, prompt, progress }) {
    let completed = 0;
    for (let index = 0; index < member.visibleAgents.length; index += 1) {
      const visibleId = member.visibleAgents[index];
      const skill = SKILLS[visibleId];
      progress.textContent = `${index + 1}/${member.visibleAgents.length} · ${skill.name} arbeitet …`;
      try {
        if (skill.deterministic) {
          await window.ElyonAIWorkforceV2?.runAgent?.(visibleId);
          const task = tasks().find((entry) => visibleTaskAgent(entry) === visibleId) || null;
          completed += 1;
          if (isHardStop(task)) { progress.textContent = `${skill.name} hat einen Blocker gemeldet. Der Auftrag wurde angehalten.`; return { ok: false, task }; }
          continue;
        }
        const response = await fetch("/api/ai-agent-run-advanced", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: skill.action, agentId: skill.backendId, title: `${title} · ${skill.name}`, priority, taskPrompt: `[Verantwortungsbereich: ${member.name}] ${prompt}`, input: contextFor(skill) }) });
        const payload = await response.json().catch(() => ({}));
        if (payload.task) upsertTask(payload.task);
        if (!response.ok || !payload.task) throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
        completed += 1;
        if (isHardStop(payload.task)) { progress.textContent = `${skill.name} hat einen Blocker gemeldet. Der Auftrag wurde angehalten.`; return { ok: false, task: payload.task }; }
      } catch (error) {
        progress.textContent = `${skill.name}: ${error?.message || "Ausführung fehlgeschlagen."}`;
        return { ok: false, error };
      }
    }
    progress.textContent = `${completed} interne Skills abgeschlossen.`;
    return { ok: true, completed };
  }

  function simplifyGenericComposer() {
    const modal = document.getElementById("elyonAiAgentTaskComposerModal");
    const select = modal?.querySelector('[data-task-field="agent"]');
    if (!modal || !select || select.dataset.v5Simplified === "1") return false;
    [...select.options].forEach((option) => {
      if (option.value.startsWith("builtin:") && option.value !== "builtin:elyon-operations-manager") option.remove();
    });
    const manager = [...select.options].find((option) => option.value === "builtin:elyon-operations-manager");
    if (manager) manager.textContent = "🧠 Elyon Manager – automatisch zuweisen";
    select.dataset.v5Simplified = "1";
    const note = modal.querySelector(".aiw-v4-manager-note");
    if (note) note.innerHTML = "<span>🧠</span><div><strong>Standardauftrag</strong><br>Der Elyon Manager ist dein zentraler Ansprechpartner. Direkte Aufträge an Product Manager, Listing Manager, Operations Manager oder Customer Care gibst du unter „Mein Team“.</div>";
    return true;
  }

  function queueRender() {
    if (state.queued) return;
    state.queued = true;
    requestAnimationFrame(() => {
      state.queued = false;
      installStyles();
      renderTeam();
      simplifyGenericComposer();
    });
  }

  function installObserver() {
    if (state.observer) return;
    const scope = document.getElementById("virtualAgentsTab") || document.getElementById("elyonAiWorkforce");
    if (!scope) return;
    state.observer = new MutationObserver(() => { if (!state.rendering) queueRender(); });
    state.observer.observe(scope, { childList: true, subtree: true });
  }

  function install() {
    installStyles();
    queueRender();
    installObserver();
    document.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest('[data-v3-view="team"]')) setTimeout(queueRender, 0);
    }, true);
    window.addEventListener("elyon:ai-workforce-v2-task-updated", queueRender);
    window.addEventListener("elyon:ai-workforce-custom-task-updated", queueRender);
    window.addEventListener("elyon:runtime-group-loaded", (event) => { if (event.detail?.tabId === "virtualAgentsTab") setTimeout(() => { queueRender(); installObserver(); }, 0); });
    [100, 450, 900].forEach((delay) => setTimeout(() => { queueRender(); installObserver(); }, delay));
  }

  window.ElyonAIWorkforceTeamV5 = { render: queueRender, openDetails, openComposer, runDepartment, team: TEAM, skills: SKILLS };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
