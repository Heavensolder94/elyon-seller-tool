(() => {
  "use strict";

  const STYLE_ID = "elyonAiWorkforceTeamV6Styles";
  const PANEL_ID = "elyonAiWorkforceTeamV6Panel";
  const COMPOSER_ID = "elyonAiWorkforceTeamV6Composer";
  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const TASKS_KEY = "elyon_ai_workforce_tasks";
  const CUSTOM_KEY = "elyon_ai_custom_agents_v1";

  const TEAM = [
    {
      id: "manager",
      name: "Elyon Manager",
      icon: "🧠",
      department: "Teamleitung",
      description: "Nimmt Aufträge entgegen, priorisiert, delegiert, erkennt Blocker und holt nur dort deine Entscheidung ein, wo sie nötig ist.",
      visibleAgents: ["elyon-manager"],
      skills: ["Orchestrierung", "Priorisierung", "Freigaben", "Eskalation"],
      builderTarget: "elyon-operations-manager",
    },
    {
      id: "product",
      name: "Product Manager",
      icon: "📦",
      department: "Produkt & Wirtschaftlichkeit",
      description: "Prüft Produktdaten, Compliance, Risiken und Wirtschaftlichkeit vor dem Listing.",
      visibleAgents: ["elyon-product-data-specialist", "elyon-compliance-specialist", "elyon-profit-specialist"],
      skills: ["Produktdaten", "Varianten", "Compliance", "GPSR / CE", "Profit", "Risiken"],
    },
    {
      id: "listing",
      name: "Listing Manager",
      icon: "🛒",
      department: "eBay Listings",
      description: "Erstellt verkaufsfertige Listings aus belegten Fakten und kontrolliert den Entwurf vor der Freigabe.",
      visibleAgents: ["elyon-listing-specialist", "elyon-draft-quality-guard"],
      skills: ["Titel", "SEO", "Beschreibung", "Merkmale", "Varianten", "Draft QA"],
    },
    {
      id: "operations",
      name: "Operations Manager",
      icon: "🚚",
      department: "Bestellungen & Fulfillment",
      description: "Überwacht Bestellungen, Lieferantenstatus, Versandfristen, Tracking und operative Ausnahmen.",
      visibleAgents: ["elyon-order-specialist"],
      skills: ["Bestellungen", "Versandfristen", "Tracking", "Lieferantenrisiken"],
    },
    {
      id: "care",
      name: "Customer Care",
      icon: "💬",
      department: "Kundenservice",
      description: "Bearbeitet Kundenfälle, Reklamationen und Retouren und bereitet sichere Antworten zur Freigabe vor.",
      visibleAgents: ["elyon-customer-support-specialist"],
      skills: ["Kundenfragen", "Reklamationen", "Retouren", "Antwortentwürfe", "Eskalation"],
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

  const state = { queued: false, installed: false };
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

  function visibleTaskAgent(task) { return SOURCE_TO_VISIBLE[task?.agentId] || task?.agentId || ""; }
  function teamById(id) { return TEAM.find((member) => member.id === id) || null; }
  function normalizedStatus(task) { return text(task?.result?.status || task?.status, "idle"); }

  function roleTasks(member) {
    const ids = new Set(member.visibleAgents);
    return tasks().filter((task) => ids.has(visibleTaskAgent(task)));
  }

  function aggregateStatus(member) {
    const statuses = roleTasks(member).slice(0, 20).map(normalizedStatus);
    if (statuses.some((status) => ["analyzing", "running", "queued"].includes(status))) return { id: "running", label: "Arbeitet" };
    if (statuses.some((status) => ["blocked", "failed"].includes(status))) return { id: "bad", label: "Braucht Aufmerksamkeit" };
    if (statuses.some((status) => ["warning", "manualReviewRequired", "approval_required", "draft_ready"].includes(status))) return { id: "warn", label: "Prüfung nötig" };
    if (statuses.some((status) => ["passed", "completed", "approved"].includes(status))) return { id: "good", label: "Aktiv" };
    return { id: "idle", label: "Bereit" };
  }

  function activityCounts(member) {
    const list = roleTasks(member);
    return {
      running: list.filter((task) => ["running", "analyzing", "queued"].includes(normalizedStatus(task))).length,
      attention: list.filter((task) => ["blocked", "failed", "warning", "manualReviewRequired", "approval_required", "draft_ready"].includes(normalizedStatus(task))).length,
      done: list.filter((task) => ["passed", "completed", "approved"].includes(normalizedStatus(task))).length,
    };
  }

  function memberMode(member) {
    const settings = readJson(SETTINGS_KEY, {});
    const agents = settings?.agents && typeof settings.agents === "object" ? settings.agents : {};
    const modes = member.visibleAgents.map((id) => text(agents[id]?.autonomyMode || agents[id]?.autonomy?.mode || "manual")).filter(Boolean);
    const unique = [...new Set(modes)];
    return unique.length === 1 ? (MODE_LABELS[unique[0]] || unique[0]) : unique.length ? "Gemischte Autonomie" : "Manuell";
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .aiw-v6-team{display:grid;gap:12px}.aiw-v6-head{display:flex;justify-content:space-between;gap:12px;align-items:end}.aiw-v6-head h3{margin:0;font-size:15px}.aiw-v6-head p{margin:4px 0 0;color:#8194aa;font-size:10px;line-height:1.5}.aiw-v6-head-actions,.aiw-v6-actions{display:flex;gap:6px;flex-wrap:wrap}.aiw-v6-primary{background:linear-gradient(135deg,#2563eb,#3b82f6)!important;color:#fff!important;border-color:transparent!important}.aiw-v6-manager,.aiw-v6-card{border:1px solid rgba(148,163,184,.14);border-radius:15px;background:rgba(7,16,29,.5);padding:15px}.aiw-v6-manager{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;border-color:rgba(96,165,250,.25);background:linear-gradient(130deg,rgba(37,99,235,.13),rgba(7,16,29,.65))}.aiw-v6-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.aiw-v6-card{display:grid;gap:10px}.aiw-v6-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.aiw-v6-id{display:flex;gap:10px}.aiw-v6-avatar{width:39px;height:39px;display:grid;place-items:center;border-radius:12px;background:rgba(59,130,246,.1);font-size:20px}.aiw-v6-id h4,.aiw-v6-manager h3{margin:0;font-size:13px}.aiw-v6-id small{display:block;margin-top:3px;color:#7f93aa;font-size:9px}.aiw-v6-card p,.aiw-v6-manager p{margin:0;color:#9aadc1;font-size:10px;line-height:1.5}.aiw-v6-skills{display:flex;gap:5px;flex-wrap:wrap}.aiw-v6-skill{padding:4px 7px;border-radius:999px;border:1px solid rgba(148,163,184,.11);background:rgba(255,255,255,.03);font-size:8px;color:#aebdce}.aiw-v6-status{display:inline-flex;align-items:center;gap:5px;padding:5px 7px;border-radius:999px;background:rgba(148,163,184,.08);font-size:9px;font-weight:800;color:#aebdce}.aiw-v6-status::before{content:"";width:7px;height:7px;border-radius:50%;background:#64748b}.aiw-v6-status.good::before{background:#22c55e}.aiw-v6-status.running::before{background:#60a5fa}.aiw-v6-status.warn::before{background:#f59e0b}.aiw-v6-status.bad::before{background:#ef4444}.aiw-v6-footer{display:flex;justify-content:space-between;gap:8px;align-items:center}.aiw-v6-meta{display:flex;gap:7px;flex-wrap:wrap;color:#71869e;font-size:8px}.aiw-v6-custom{padding-top:12px;border-top:1px solid rgba(148,163,184,.12)}.aiw-v6-custom-head,.aiw-v6-custom-row{display:flex;justify-content:space-between;gap:10px;align-items:center}.aiw-v6-custom-row{padding:10px 11px;border-radius:12px;background:rgba(255,255,255,.025);border:1px solid rgba(148,163,184,.1);margin-top:7px}.aiw-v6-custom-row small{display:block;color:#7f93aa;font-size:8px}.aiw-v6-panel,.aiw-v6-composer{position:fixed;inset:0;z-index:19620;background:rgba(2,6,23,.84);backdrop-filter:blur(7px);display:flex;justify-content:flex-end}.aiw-v6-panel-inner,.aiw-v6-composer-inner{width:min(690px,100%);height:100%;overflow:auto;background:#0b1422;border-left:1px solid rgba(148,163,184,.16);padding:20px;color:#e8eef7}.aiw-v6-panel-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding-bottom:13px;border-bottom:1px solid rgba(148,163,184,.14)}.aiw-v6-panel-head h2{margin:0;font-size:18px}.aiw-v6-panel-head p{margin:5px 0 0;color:#8fa2b8;font-size:10px;line-height:1.5}.aiw-v6-section{padding:14px 0;border-bottom:1px solid rgba(148,163,184,.1)}.aiw-v6-section h3{font-size:11px;margin:0 0 8px}.aiw-v6-skill-row{display:flex;justify-content:space-between;gap:9px;align-items:center;padding:8px 0}.aiw-v6-skill-row small{display:block;color:#71869e;font-size:8px}.aiw-v6-form{display:grid;gap:11px;margin-top:15px}.aiw-v6-field{display:grid;gap:5px}.aiw-v6-field span{font-size:10px;color:#aebdce;font-weight:750}.aiw-v6-field input,.aiw-v6-field select,.aiw-v6-field textarea{background:#07101d;border:1px solid rgba(148,163,184,.16);border-radius:11px;color:#e8eef7;padding:10px 11px}.aiw-v6-field textarea{min-height:150px;resize:vertical;line-height:1.5}.aiw-v6-note,.aiw-v6-progress{padding:10px 11px;border-radius:11px;background:rgba(37,99,235,.07);border:1px solid rgba(96,165,250,.14);font-size:9px;color:#9fb1c6;line-height:1.5}.aiw-v6-progress:empty{display:none}.aiw-v6-panel-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}.aiw-v6-toast{position:fixed;right:18px;bottom:18px;z-index:21000;padding:10px 12px;border-radius:10px;background:#10233b;color:#e8eef7;box-shadow:0 12px 34px rgba(0,0,0,.35);font-size:10px}@media(max-width:840px){.aiw-v6-grid{grid-template-columns:1fr}.aiw-v6-manager{grid-template-columns:1fr}.aiw-v6-head{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    document.querySelector(".aiw-v6-toast")?.remove();
    const node = document.createElement("div");
    node.className = "aiw-v6-toast";
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 4000);
  }

  function teamSection() {
    const shell = document.getElementById("elyonAiWorkforce");
    if (!shell?.querySelector('[data-v3-view="team"].active')) return null;
    return [...shell.querySelectorAll(".aiw-v3-section")].find((section) => section.querySelector(".aiw-v3-agent-list") || section.querySelector(".aiw-v6-team")) || null;
  }

  function memberCard(member) {
    const status = aggregateStatus(member);
    const counts = activityCounts(member);
    return `<article class="aiw-v6-card"><div class="aiw-v6-top"><div class="aiw-v6-id"><span class="aiw-v6-avatar">${member.icon}</span><div><h4>${escapeHtml(member.name)}</h4><small>${escapeHtml(member.department)}</small></div></div><span class="aiw-v6-status ${status.id}">${escapeHtml(status.label)}</span></div><p>${escapeHtml(member.description)}</p><div class="aiw-v6-skills">${member.skills.map((skill) => `<span class="aiw-v6-skill">${escapeHtml(skill)}</span>`).join("")}</div><div class="aiw-v6-footer"><div class="aiw-v6-meta"><span>${escapeHtml(memberMode(member))}</span><span>${counts.running} läuft</span><span>${counts.attention} offen</span></div><div class="aiw-v6-actions"><button class="aiw-v6-primary" data-v6-assign="${member.id}">Auftrag geben</button><button class="aiw-secondary" data-v6-details="${member.id}">Details</button></div></div></article>`;
  }

  function customMarkup() {
    const list = customAgents();
    return `<section class="aiw-v6-custom"><div class="aiw-v6-custom-head"><h4>Eigene Mitarbeiter</h4><button class="aiw-secondary" data-v6-create-custom>＋ Mitarbeiter erstellen</button></div>${list.length ? list.map((agent) => `<div class="aiw-v6-custom-row"><div><strong>${escapeHtml(agent.icon || "🤖")} ${escapeHtml(agent.name)}</strong><small>${escapeHtml(agent.role || "Eigener Mitarbeiter")}</small></div><div class="aiw-v6-actions"><button data-v6-custom-assign="${escapeHtml(agent.id)}">Auftrag</button><button class="aiw-secondary" data-v6-custom-edit="${escapeHtml(agent.id)}">Bearbeiten</button></div></div>`).join("") : `<div class="aiw-v6-note" style="margin-top:8px">Noch keine eigenen Mitarbeiter. Die fünf Elyon-Kernrollen decken den Standardbetrieb ab.</div>`}</section>`;
  }

  function teamMarkup() {
    const manager = TEAM[0];
    const status = aggregateStatus(manager);
    return `<div class="aiw-v6-team"><div class="aiw-v6-head"><div><h3>Mein KI-Team</h3><p>Fünf klare Verantwortungsbereiche. Technische Spezialprüfungen laufen als Skills im Hintergrund.</p></div><div class="aiw-v6-head-actions"><button class="aiw-v6-primary" data-v6-assign="manager">＋ Neuer Auftrag</button><button class="aiw-secondary" data-v6-create-custom>＋ Mitarbeiter</button></div></div><article class="aiw-v6-manager"><div><div class="aiw-v6-id"><span class="aiw-v6-avatar">${manager.icon}</span><div><h3>${manager.name}</h3><small>${manager.department}</small></div></div><p style="margin-top:8px">${escapeHtml(manager.description)}</p><div class="aiw-v6-skills" style="margin-top:9px">${manager.skills.map((skill) => `<span class="aiw-v6-skill">${escapeHtml(skill)}</span>`).join("")}</div></div><div class="aiw-v6-actions"><span class="aiw-v6-status ${status.id}">${status.label}</span><button class="aiw-v6-primary" data-v6-assign="manager">Auftrag geben</button><button class="aiw-secondary" data-v6-details="manager">Details</button></div></article><div class="aiw-v6-grid">${TEAM.slice(1).map(memberCard).join("")}</div>${customMarkup()}</div>`;
  }

  function signature() {
    const taskState = tasks().slice(0, 60).map((task) => [task.id, task.updatedAt, task.status, task.result?.status]);
    const customState = customAgents().map((agent) => [agent.id, agent.name, agent.role, agent.icon]);
    const modes = TEAM.map((member) => [member.id, memberMode(member)]);
    const raw = JSON.stringify([taskState, customState, modes]);
    let hash = 2166136261;
    for (let index = 0; index < raw.length; index += 1) hash = Math.imul(hash ^ raw.charCodeAt(index), 16777619);
    return (hash >>> 0).toString(36);
  }

  function render() {
    installStyles();
    const section = teamSection();
    if (!section) return false;
    const nextSignature = signature();
    if (section.querySelector(".aiw-v6-team") && section.dataset.aiwV6Signature === nextSignature) return true;
    section.innerHTML = teamMarkup();
    section.dataset.aiwV6Signature = nextSignature;
    document.getElementById("elyonAiWorkforce")?.classList.add("aiw-team-v6");
    const nav = document.querySelector('#elyonAiWorkforce [data-v3-view="team"]');
    if (nav) nav.innerHTML = "◉ Mein Team";
    window.dispatchEvent(new CustomEvent("elyon:ai-workforce-team-v6-rendered"));
    return true;
  }

  function queueRender(delay = 0) {
    if (delay > 0) return setTimeout(() => queueRender(), delay);
    if (state.queued) return;
    state.queued = true;
    requestAnimationFrame(() => { state.queued = false; render(); });
  }

  function openDetails(teamId) {
    const member = teamById(teamId);
    if (!member) return;
    document.getElementById(PANEL_ID)?.remove();
    const counts = activityCounts(member);
    const list = roleTasks(member).slice(0, 8);
    const root = document.createElement("div");
    root.id = PANEL_ID;
    root.className = "aiw-v6-panel";
    root.innerHTML = `<aside class="aiw-v6-panel-inner"><div class="aiw-v6-panel-head"><div><h2>${member.icon} ${escapeHtml(member.name)}</h2><p>${escapeHtml(member.description)}</p></div><button data-v6-close>✕</button></div><section class="aiw-v6-section"><h3>Arbeitsstatus</h3><div class="aiw-v6-skills"><span class="aiw-v6-skill">Autonomie: ${escapeHtml(memberMode(member))}</span><span class="aiw-v6-skill">${counts.running} läuft</span><span class="aiw-v6-skill">${counts.attention} braucht Prüfung</span><span class="aiw-v6-skill">${counts.done} abgeschlossen</span></div></section><section class="aiw-v6-section"><h3>Interne Skills</h3>${member.visibleAgents.map((id) => { const skill = SKILLS[id]; return `<div class="aiw-v6-skill-row"><div><strong>${skill?.icon || "•"} ${escapeHtml(skill?.name || id)}</strong><small>Technischer Skill im Hintergrund.</small></div><div class="aiw-v6-actions"><button class="aiw-secondary" data-v6-skill-settings="${id}">Fachregeln</button><button class="aiw-secondary" data-v6-skill-autonomy="${id}">Autonomie</button></div></div>`; }).join("")}</section><section class="aiw-v6-section"><h3>Letzte Aktivität</h3>${list.length ? list.map((task) => `<div class="aiw-v6-note" style="margin-bottom:6px"><strong>${escapeHtml(task.title || "Aufgabe")}</strong><br>${escapeHtml(normalizedStatus(task))}${task.result?.summary ? ` · ${escapeHtml(task.result.summary).slice(0, 170)}` : ""}</div>`).join("") : `<div class="aiw-v6-note">Noch keine Aktivität für diesen Mitarbeiter.</div>`}</section><div class="aiw-v6-panel-actions"><button class="aiw-v6-primary" data-v6-panel-assign="${member.id}">Auftrag geben</button><button class="aiw-secondary" data-v6-close>Schließen</button></div></aside>`;
    document.body.appendChild(root);
  }

  function openComposer(teamId) {
    const member = teamById(teamId);
    if (!member) return;
    if (member.id === "manager") {
      if (!window.ElyonAIAgentBuilder?.assign) return toast("Agent-Builder ist noch nicht geladen. Bitte den Mitarbeiterbereich einmal neu öffnen.");
      window.ElyonAIAgentBuilder.assign(member.builderTarget);
      return;
    }
    document.getElementById(COMPOSER_ID)?.remove();
    const root = document.createElement("div");
    root.id = COMPOSER_ID;
    root.className = "aiw-v6-composer";
    root.innerHTML = `<aside class="aiw-v6-composer-inner"><div class="aiw-v6-panel-head"><div><h2>${member.icon} ${escapeHtml(member.name)} beauftragen</h2><p>Der Auftrag wird über die internen Skills dieses Mitarbeiters abgearbeitet.</p></div><button data-v6-close>✕</button></div><div class="aiw-v6-form"><label class="aiw-v6-field"><span>Auftragstitel</span><input data-v6-field="title" placeholder="z. B. Produkt komplett prüfen"></label><label class="aiw-v6-field"><span>Priorität</span><select data-v6-field="priority"><option value="low">Niedrig</option><option value="medium" selected>Normal</option><option value="high">Hoch</option><option value="critical">Kritisch</option></select></label><label class="aiw-v6-field"><span>Arbeitsauftrag / Aufgaben-Prompt *</span><textarea data-v6-field="prompt" placeholder="Was soll ${escapeHtml(member.name)} konkret prüfen, entscheiden oder vorbereiten?"></textarea></label><div class="aiw-v6-note"><strong>Ablauf:</strong> ${member.visibleAgents.map((id) => SKILLS[id]?.name || id).join(" → ")}. Externe Aktionen werden dadurch nicht automatisch freigeschaltet.</div><div class="aiw-v6-progress" data-v6-progress></div><div class="aiw-v6-panel-actions"><button class="aiw-v6-primary" data-v6-run="${member.id}">Auftrag starten</button><button class="aiw-secondary" data-v6-close>Abbrechen</button></div></div></aside>`;
    document.body.appendChild(root);
    window.ElyonAITaskPromptHelper?.refresh?.();
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
      if (progress) progress.textContent = `${index + 1}/${member.visibleAgents.length} · ${skill.name} arbeitet …`;
      try {
        if (skill.deterministic) {
          await window.ElyonAIWorkforceV2?.runAgent?.(visibleId);
          const task = tasks().find((entry) => visibleTaskAgent(entry) === visibleId) || null;
          completed += 1;
          if (isHardStop(task)) return { ok: false, task };
          continue;
        }
        const response = await fetch("/api/ai-agent-run-advanced", {
          method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: skill.action, agentId: skill.backendId, title: `${title} · ${skill.name}`, priority, taskPrompt: `[Verantwortungsbereich: ${member.name}] ${prompt}`, input: contextFor(skill) }),
        });
        const payload = await response.json().catch(() => ({}));
        if (payload.task) upsertTask(payload.task);
        if (!response.ok || !payload.task) throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
        completed += 1;
        if (isHardStop(payload.task)) return { ok: false, task: payload.task };
      } catch (error) {
        if (progress) progress.textContent = `${skill.name}: ${error?.message || "Ausführung fehlgeschlagen."}`;
        return { ok: false, error };
      }
    }
    if (progress) progress.textContent = `${completed} interne Skills abgeschlossen.`;
    return { ok: true, completed };
  }

  function handled(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  async function handleClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.id === PANEL_ID || target.id === COMPOSER_ID) {
      handled(event);
      target.remove();
      return;
    }

    const close = target.closest("[data-v6-close]");
    if (close) {
      handled(event);
      close.closest(`#${PANEL_ID},#${COMPOSER_ID}`)?.remove();
      return;
    }

    const assign = target.closest("[data-v6-assign]");
    if (assign) { handled(event); openComposer(assign.dataset.v6Assign); return; }

    const details = target.closest("[data-v6-details]");
    if (details) { handled(event); openDetails(details.dataset.v6Details); return; }

    const create = target.closest("[data-v6-create-custom]");
    if (create) { handled(event); window.ElyonAIAgentBuilder?.open?.(); return; }

    const customAssign = target.closest("[data-v6-custom-assign]");
    if (customAssign) { handled(event); window.ElyonAIAgentBuilder?.assign?.(customAssign.dataset.v6CustomAssign); return; }

    const customEdit = target.closest("[data-v6-custom-edit]");
    if (customEdit) { handled(event); window.ElyonAIAgentBuilder?.open?.(customEdit.dataset.v6CustomEdit); return; }

    const panelAssign = target.closest("[data-v6-panel-assign]");
    if (panelAssign) { handled(event); document.getElementById(PANEL_ID)?.remove(); openComposer(panelAssign.dataset.v6PanelAssign); return; }

    const settings = target.closest("[data-v6-skill-settings]");
    if (settings) { handled(event); window.ElyonAIWorkforceV2Settings?.open?.(settings.dataset.v6SkillSettings); return; }

    const autonomy = target.closest("[data-v6-skill-autonomy]");
    if (autonomy) { handled(event); window.ElyonAIWorkforceWorkspaceV3?.openAutonomy?.(autonomy.dataset.v6SkillAutonomy); return; }

    const run = target.closest("[data-v6-run]");
    if (run) {
      handled(event);
      if (run.disabled) return;
      const member = teamById(run.dataset.v6Run);
      const root = document.getElementById(COMPOSER_ID);
      if (!member || !root) return;
      const prompt = text(root.querySelector('[data-v6-field="prompt"]')?.value);
      if (!prompt) return toast("Bitte einen Arbeitsauftrag eingeben.");
      const title = text(root.querySelector('[data-v6-field="title"]')?.value, `${member.name} Auftrag`);
      const priority = text(root.querySelector('[data-v6-field="priority"]')?.value, "medium");
      const progress = root.querySelector("[data-v6-progress]");
      run.disabled = true;
      const result = await runDepartment(member, { title, priority, prompt, progress });
      run.disabled = false;
      if (result.ok) {
        toast(`${member.name}: Auftrag abgeschlossen.`);
        root.remove();
        queueRender(0);
      } else if (!progress?.textContent) {
        toast(`${member.name}: Auftrag wurde angehalten.`);
      }
    }
  }

  function install() {
    if (state.installed) return;
    state.installed = true;
    installStyles();
    document.addEventListener("click", handleClick, true);
    document.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest('[data-v3-view="team"]')) {
        queueRender(0);
        queueRender(40);
      }
    }, true);
    window.addEventListener("elyon:ai-workforce-v2-task-updated", () => { queueRender(0); queueRender(50); });
    window.addEventListener("elyon:ai-workforce-custom-task-updated", () => { queueRender(0); queueRender(50); });
    window.addEventListener("elyon:runtime-group-loaded", (event) => { if (event.detail?.tabId === "virtualAgentsTab") queueRender(0); });
    [0, 100, 350].forEach((delay) => queueRender(delay));
  }

  const api = { render: queueRender, openDetails, openComposer, runDepartment, team: TEAM, skills: SKILLS };
  window.ElyonAIWorkforceTeamV6 = api;
  window.ElyonAIWorkforceTeam = api;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
