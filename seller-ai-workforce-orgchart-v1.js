(() => {
  "use strict";

  const STYLE_ID = "elyonOrgchartV1Styles";
  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const CUSTOM_KEY = "elyon_ai_custom_agents_v1";
  const TASK_KEYS = ["elyon_ai_workforce_tasks", "elyon_ai_tasks"];
  const EXPANDED_KEY = "elyon_ai_orgchart_expanded_v1";

  const TEAM = [
    {
      id: "product",
      name: "Product Manager",
      icon: "📦",
      subtitle: "Produktdaten, Compliance & Wirtschaftlichkeit",
      agents: ["elyon-product-data-specialist", "elyon-compliance-specialist", "elyon-profit-specialist"],
    },
    {
      id: "listing",
      name: "Listing Manager",
      icon: "🛒",
      subtitle: "Listings, SEO & Entwurfsprüfung",
      agents: ["elyon-listing-specialist", "elyon-draft-quality-guard"],
    },
    {
      id: "operations",
      name: "Operations Manager",
      icon: "🚚",
      subtitle: "Bestellungen, Versand & Fulfillment",
      agents: ["elyon-order-specialist"],
    },
    {
      id: "care",
      name: "Customer Care",
      icon: "💬",
      subtitle: "Kundenservice, Reklamationen & Retouren",
      agents: ["elyon-customer-support-specialist"],
    },
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
  const state = { expanded: new Set(), queued: false };

  const text = (value, fallback = "") => value == null ? fallback : String(value).trim();
  const esc = (value) => text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const read = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  };

  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
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

  function mode(id) {
    const item = settings()[id] || {};
    const value = text(item.autonomyMode || item.autonomy?.mode || (id === "elyon-manager" ? "auto_internal" : "manual"));
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

  function statusLabel(task) {
    return ({
      queued: "Wartet",
      analyzing: "Arbeitet",
      running: "Arbeitet",
      passed: "Bestanden",
      completed: "Abgeschlossen",
      approved: "Freigegeben",
      draft_ready: "Entwurf fertig",
      warning: "Warnung",
      manualReviewRequired: "Prüfung nötig",
      approval_required: "Freigabe nötig",
      blocked: "Blockiert",
      failed: "Fehler",
      rejected: "Abgelehnt",
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

  function customAgents() {
    const list = read(CUSTOM_KEY, []);
    return Array.isArray(list) ? list.filter((item) => item?.id && item?.name) : [];
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #elyonAiWorkforce .aiw-org{
        display:grid!important;
        gap:28px!important;
        width:100%!important;
        max-width:1240px!important;
        margin:0 auto!important;
        color:#f4f6f8;
      }
      .aiw-org-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding:2px 2px 0}
      .aiw-org-head h3{margin:0!important;font-size:22px!important;line-height:1.2!important;letter-spacing:-.02em}
      .aiw-org-head p{max-width:650px;margin:7px 0 0!important;color:#8d98a7!important;font-size:12px!important;line-height:1.5!important}
      .aiw-org-head-note{display:flex;align-items:center;gap:7px;color:#8d98a7;font-size:10px;white-space:nowrap;padding-top:4px}
      .aiw-org-head-note:before{content:"";width:7px;height:7px;border-radius:50%;background:#35c46a;box-shadow:0 0 0 4px rgba(53,196,106,.08)}
      .aiw-org-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .aiw-org-primary{background:#4f8cff!important;color:#fff!important;border-color:#4f8cff!important;font-weight:650!important}
      .aiw-org-primary:hover{filter:brightness(1.06)}

      .aiw-org-tree{display:grid;gap:0}
      .aiw-org-manager-wrap{position:relative;display:flex;justify-content:center;padding-bottom:34px}
      .aiw-org-manager-wrap:after{content:"";position:absolute;left:50%;bottom:0;width:1px;height:34px;background:rgba(121,149,184,.26)}
      .aiw-org-manager{
        width:min(820px,100%);
        display:grid;
        grid-template-columns:minmax(0,1fr) auto;
        gap:22px;
        align-items:center;
        padding:22px 24px;
        border:1px solid rgba(79,140,255,.32);
        border-radius:16px;
        background:linear-gradient(135deg,rgba(79,140,255,.11),rgba(17,24,33,.98) 58%);
        box-shadow:0 14px 42px rgba(0,0,0,.14);
      }
      .aiw-org-person{display:flex;gap:14px;align-items:flex-start;min-width:0}
      .aiw-org-avatar{width:46px;height:46px;flex:0 0 46px;display:grid;place-items:center;border-radius:12px;background:rgba(79,140,255,.1);border:1px solid rgba(79,140,255,.16);font-size:22px}
      .aiw-org-copy{min-width:0}
      .aiw-org-copy h4{margin:0!important;font-size:15px!important;line-height:1.25!important}
      .aiw-org-copy small{display:block;margin-top:3px;color:#657181;font-size:9px;text-transform:uppercase;letter-spacing:.06em}
      .aiw-org-copy p{max-width:520px;margin:8px 0 0!important;color:#9aa6b5!important;font-size:11px!important;line-height:1.55!important}
      .aiw-org-manager-side{display:grid;gap:10px;justify-items:end}
      .aiw-org-manager-state{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}
      .aiw-org-status,.aiw-org-mode{display:inline-flex;align-items:center;gap:6px;min-height:27px;padding:4px 8px;border:1px solid rgba(255,255,255,.075);border-radius:999px;background:rgba(255,255,255,.025);color:#9aa6b5;font-size:9px;white-space:nowrap}
      .aiw-org-status:before{content:"";width:7px;height:7px;border-radius:50%;background:#657181}
      .aiw-org-status.good:before{background:#35c46a}.aiw-org-status.running:before{background:#4f8cff}.aiw-org-status.warn:before{background:#f1ae42}.aiw-org-status.bad:before{background:#ee6464}

      .aiw-org-branches{
        position:relative;
        display:grid;
        grid-template-columns:repeat(2,minmax(280px,1fr));
        gap:24px;
        padding-top:34px;
      }
      .aiw-org-branches:before{content:"";position:absolute;top:0;left:25%;right:25%;height:1px;background:rgba(121,149,184,.26)}
      .aiw-org-dept{position:relative;min-width:0}
      .aiw-org-dept:before{content:"";position:absolute;left:50%;top:-34px;width:1px;height:34px;background:rgba(121,149,184,.26)}
      .aiw-org-card{
        display:grid;
        grid-template-rows:auto auto auto;
        gap:14px;
        min-height:190px;
        padding:20px;
        border:1px solid rgba(255,255,255,.075);
        border-radius:14px;
        background:#111821;
        box-shadow:0 10px 28px rgba(0,0,0,.09);
      }
      .aiw-org-card:hover{border-color:rgba(79,140,255,.22);transform:translateY(-1px);transition:border-color .16s ease,transform .16s ease}
      .aiw-org-card-top,.aiw-org-foot,.aiw-org-panel-head,.aiw-org-custom-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
      .aiw-org-id{display:flex;gap:11px;min-width:0;align-items:flex-start}
      .aiw-org-id .aiw-org-avatar{width:40px;height:40px;flex-basis:40px;font-size:19px;background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.06)}
      .aiw-org-card .aiw-org-copy h4{font-size:14px!important}
      .aiw-org-card .aiw-org-copy small{font-size:9px!important;line-height:1.45!important;text-transform:none;letter-spacing:0;color:#8d98a7}
      .aiw-org-meta{display:flex;gap:10px;flex-wrap:wrap;align-items:center;color:#7f8b9b;font-size:9px}
      .aiw-org-meta span{display:inline-flex;align-items:center;gap:5px}
      .aiw-org-meta span+span:before{content:"·";color:#4d5968;margin-right:3px}
      .aiw-org-foot{align-items:center;margin-top:auto}
      .aiw-org-foot .aiw-org-actions{margin-left:auto}
      .aiw-org-toggle{min-height:33px!important;padding:6px 10px!important;font-size:9px!important}
      .aiw-org-card .aiw-org-primary{min-height:33px!important;padding:6px 11px!important;font-size:9px!important}

      .aiw-org-specialists{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin:10px 0 0;padding:12px;border:1px solid rgba(255,255,255,.06);border-radius:11px;background:rgba(255,255,255,.012)}
      .aiw-org-specialists[hidden]{display:none!important}
      .aiw-org-specialist{display:grid;grid-template-columns:32px minmax(0,1fr);gap:9px;align-items:center;padding:9px 10px;border:1px solid rgba(255,255,255,.055);border-radius:9px;background:#0f151d}
      .aiw-org-specialist>span:first-child{display:grid;place-items:center;width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,.035)}
      .aiw-org-specialist strong{display:block;font-size:9px;color:#dce2e9;line-height:1.3}
      .aiw-org-specialist small{display:block;margin-top:4px;color:#657181;font-size:8px}
      .aiw-org-specialist .aiw-org-status{min-height:20px;padding:2px 6px;font-size:8px}

      .aiw-org-work{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
      .aiw-org-panel,.aiw-org-custom{padding:18px;border:1px solid rgba(255,255,255,.075);border-radius:14px;background:#111821}
      .aiw-org-panel h4,.aiw-org-custom h4{margin:0!important;font-size:13px!important}
      .aiw-org-panel p,.aiw-org-custom p{margin:5px 0 0!important;color:#657181!important;font-size:9px!important;line-height:1.45!important}
      .aiw-org-count{min-width:28px;height:28px;display:grid;place-items:center;border-radius:999px;border:1px solid rgba(255,255,255,.07);font-size:9px;color:#9aa6b5}
      .aiw-org-list{display:grid;gap:7px;margin-top:12px}
      .aiw-org-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 11px;border:1px solid rgba(255,255,255,.055);border-radius:9px;background:rgba(255,255,255,.012)}
      .aiw-org-row strong{display:block;color:#dce2e9;font-size:9px;line-height:1.35}
      .aiw-org-row span{display:block;margin-top:3px;color:#788493;font-size:8px;line-height:1.45}
      .aiw-org-row.activity{grid-template-columns:44px minmax(0,1fr);align-items:start}
      .aiw-org-time{color:#657181!important;font-variant-numeric:tabular-nums}
      .aiw-org-row button{min-height:28px!important;padding:4px 8px!important;font-size:8px!important}
      .aiw-org-empty{margin-top:12px;padding:15px;border:1px dashed rgba(255,255,255,.08);border-radius:10px;color:#7f8b9b;font-size:9px;text-align:center;background:rgba(255,255,255,.008)}
      .aiw-org-custom-list{display:grid;gap:7px;margin-top:12px}
      .aiw-org-custom-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 11px;border:1px solid rgba(255,255,255,.055);border-radius:9px;background:rgba(255,255,255,.012)}
      .aiw-org-custom-row strong{font-size:9px}.aiw-org-custom-row small{display:block;margin-top:2px;color:#657181;font-size:8px}

      @media(min-width:1500px){
        #elyonAiWorkforce .aiw-org{max-width:1420px!important}
        .aiw-org-branches{grid-template-columns:repeat(4,minmax(260px,1fr));gap:18px}
        .aiw-org-branches:before{left:12.5%;right:12.5%}
        .aiw-org-card{min-height:204px;padding:18px}
      }
      @media(max-width:900px){
        .aiw-org{gap:22px!important}
        .aiw-org-head{flex-direction:column;gap:8px}
        .aiw-org-manager{grid-template-columns:1fr;padding:19px}
        .aiw-org-manager-side{justify-items:start}
        .aiw-org-manager-state{justify-content:flex-start}
        .aiw-org-branches{grid-template-columns:1fr;gap:16px;padding:0 0 0 22px;border-left:1px solid rgba(121,149,184,.22)}
        .aiw-org-branches:before{display:none}
        .aiw-org-dept:before{left:-22px;top:28px;width:22px;height:1px}
        .aiw-org-manager-wrap{justify-content:stretch;padding-bottom:24px}
        .aiw-org-manager-wrap:after{left:22px;height:24px}
        .aiw-org-work{grid-template-columns:1fr}
      }
      @media(max-width:620px){
        .aiw-org-manager,.aiw-org-card,.aiw-org-panel,.aiw-org-custom{padding:15px}
        .aiw-org-card-top,.aiw-org-foot,.aiw-org-custom-head{flex-direction:column;align-items:stretch}
        .aiw-org-card .aiw-org-status{width:max-content}
        .aiw-org-foot .aiw-org-actions{width:100%;margin-left:0}
        .aiw-org-foot .aiw-org-actions button{flex:1}
        .aiw-org-specialists{grid-template-columns:1fr}
        .aiw-org-custom-row{grid-template-columns:1fr}
      }
      @media(prefers-reduced-motion:reduce){.aiw-org-card{transition:none!important}.aiw-org-card:hover{transform:none}}
    `;
    document.head.appendChild(style);
  }

  function person(agentId) {
    const [icon, name] = PEOPLE[agentId] || ["•", agentId];
    const [tone, label] = statusMeta(taskSet([agentId]));
    return `<div class="aiw-org-specialist"><span>${icon}</span><div><strong>${esc(name)}</strong><small><span class="aiw-org-status ${tone}">${esc(label)}</span></small></div></div>`;
  }

  function department(item) {
    const list = taskSet(item.agents);
    const [tone, label] = statusMeta(list);
    const expanded = state.expanded.has(item.id);
    const open = list.filter(needsDecision).length;
    const running = list.filter((task) => RUNNING.has(status(task))).length;
    const openLabel = `${open} offen`;
    const runningLabel = running ? `${running} aktiv` : "Bereit";

    return `<article class="aiw-org-dept" data-org-department="${item.id}">
      <div class="aiw-org-card">
        <div class="aiw-org-card-top">
          <div class="aiw-org-id">
            <span class="aiw-org-avatar">${item.icon}</span>
            <div class="aiw-org-copy"><h4>${esc(item.name)}</h4><small>${esc(item.subtitle)}</small></div>
          </div>
          <span class="aiw-org-status ${tone}">${esc(label)}</span>
        </div>
        <div class="aiw-org-meta"><span>${item.agents.length} Spezialist${item.agents.length === 1 ? "" : "en"}</span><span>${esc(runningLabel)}</span><span>${esc(openLabel)}</span></div>
        <div class="aiw-org-foot">
          <div class="aiw-org-actions">
            <button class="aiw-secondary aiw-org-toggle" data-org-toggle="${item.id}" aria-expanded="${expanded}">${expanded ? "Team schließen" : "Team ansehen"}</button>
            <button class="aiw-org-primary" data-v6-assign="${item.id}">Auftrag geben</button>
          </div>
        </div>
      </div>
      <div class="aiw-org-specialists" ${expanded ? "" : "hidden"}>${item.agents.map(person).join("")}</div>
    </article>`;
  }

  function decisions() {
    const list = tasks().filter(needsDecision).slice(0, 6);
    if (!list.length) return `<div class="aiw-org-empty">✓ Dein Team arbeitet selbstständig. Aktuell ist keine Entscheidung notwendig.</div>`;
    return `<div class="aiw-org-list">${list.map((task) => {
      const agent = visibleAgent(task);
      return `<div class="aiw-org-row"><div><strong>${esc((PEOPLE[agent] || ["", "Elyon Mitarbeiter"])[1])} · ${esc(statusLabel(task))}</strong><span>${esc(text(task.title, "Aufgabe"))}: ${esc(summary(task)).slice(0, 170)}</span></div><button class="aiw-secondary" data-v6-details="${departmentFor(agent)}">Prüfen</button></div>`;
    }).join("")}</div>`;
  }

  function activity() {
    const list = tasks().slice(0, 8);
    if (!list.length) return `<div class="aiw-org-empty">Noch keine Teamaktivität. Gib dem Elyon Manager den ersten Auftrag.</div>`;
    return `<div class="aiw-org-list">${list.map((task) => {
      const agent = visibleAgent(task);
      return `<div class="aiw-org-row activity"><span class="aiw-org-time">${esc(clock(task))}</span><div><strong>${esc((PEOPLE[agent] || ["", "Elyon Mitarbeiter"])[1])}</strong><span>${esc(text(task.title, summary(task))).slice(0, 170)} · ${esc(statusLabel(task))}</span></div></div>`;
    }).join("")}</div>`;
  }

  function custom() {
    const list = customAgents();
    return `<section class="aiw-org-custom">
      <div class="aiw-org-custom-head">
        <div><h4>Eigene Mitarbeiter</h4><p>Spezialrollen für Aufgaben außerhalb des Kernteams.</p></div>
        <button class="aiw-secondary" data-v6-create-custom>＋ Mitarbeiter einstellen</button>
      </div>
      ${list.length
        ? `<div class="aiw-org-custom-list">${list.map((agent) => `<div class="aiw-org-custom-row"><div><strong>${esc(agent.icon || "🤖")} ${esc(agent.name)}</strong><small>${esc(agent.role || "Eigener Mitarbeiter")}</small></div><div class="aiw-org-actions"><button data-v6-custom-assign="${esc(agent.id)}">Auftrag</button><button class="aiw-secondary" data-v6-custom-edit="${esc(agent.id)}">Bearbeiten</button></div></div>`).join("")}</div>`
        : `<div class="aiw-org-empty">Noch keine eigenen Mitarbeiter eingestellt.</div>`}
    </section>`;
  }

  function markup() {
    const all = tasks();
    const managerTasks = taskSet(["elyon-manager"]);
    const [tone, label] = statusMeta(managerTasks.length ? managerTasks : all);
    const decisionCount = all.filter(needsDecision).length;

    return `<div class="aiw-v6-team aiw-org">
      <header class="aiw-org-head">
        <div><h3>Dein Elyon Unternehmen</h3><p>Der Elyon Manager führt dein digitales Team. Die Hauptansicht zeigt bewusst nur Geschäftsleitung, Abteilungen und echte Entscheidungen.</p></div>
        <div class="aiw-org-head-note">${decisionCount ? `${decisionCount} Entscheidung${decisionCount === 1 ? "" : "en"} offen` : "Keine offenen Entscheidungen"}</div>
      </header>
      <div class="aiw-org-tree">
        <div class="aiw-org-manager-wrap">
          <article class="aiw-org-manager">
            <div class="aiw-org-person">
              <span class="aiw-org-avatar">🧠</span>
              <div class="aiw-org-copy"><h4>Elyon Manager</h4><small>Geschäftsleitung · Zentrale Steuerung</small><p>Steuert dein digitales Team, verteilt Aufgaben und meldet sich bei notwendigen Entscheidungen.</p></div>
            </div>
            <div class="aiw-org-manager-side">
              <div class="aiw-org-manager-state"><span class="aiw-org-status ${tone}">${esc(label)}</span><span class="aiw-org-mode">${esc(mode("elyon-manager"))}</span></div>
              <div class="aiw-org-actions"><button class="aiw-secondary" data-org-scroll="activity">Aktivität</button><button class="aiw-org-primary" data-v6-assign="manager">＋ Auftrag geben</button></div>
            </div>
          </article>
        </div>
        <div class="aiw-org-branches">${TEAM.map(department).join("")}</div>
      </div>
      <div class="aiw-org-work">
        <section class="aiw-org-panel" data-org-anchor="decisions"><div class="aiw-org-panel-head"><div><h4>Braucht deine Entscheidung</h4><p>Nur Freigaben, Blocker, Fehler und echte Prüffälle.</p></div><span class="aiw-org-count">${decisionCount}</span></div>${decisions()}</section>
        <section class="aiw-org-panel" data-org-anchor="activity"><div class="aiw-org-panel-head"><div><h4>Letzte Teamaktivität</h4><p>Verständliche Business-Aktivität statt technischer Logs.</p></div><span class="aiw-org-count">${Math.min(all.length, 8)}</span></div>${activity()}</section>
      </div>
      ${custom()}
    </div>`;
  }

  function signature() {
    return JSON.stringify({
      expanded: [...state.expanded].sort(),
      tasks: tasks().slice(0, 80).map((task) => [task.id, task.updatedAt, task.status, task.result?.status, task.result?.summary]),
      custom: customAgents().map((item) => [item.id, item.name, item.role, item.updatedAt]),
      modes: ["elyon-manager", ...TEAM.flatMap((item) => item.agents)].map((id) => [id, mode(id)]),
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
    if (nav) nav.innerHTML = "◉ Firmenstruktur";
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
    const toggle = target.closest("[data-org-toggle]");
    if (toggle) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const id = text(toggle.dataset.orgToggle);
      state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id);
      write(EXPANDED_KEY, [...state.expanded]);
      queueRender();
      return;
    }
    const scroll = target.closest("[data-org-scroll]");
    if (scroll) {
      event.preventDefault();
      event.stopImmediatePropagation();
      document.querySelector(`[data-org-anchor="${scroll.dataset.orgScroll}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
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
    window.addEventListener("storage", (event) => {
      if ([SETTINGS_KEY, CUSTOM_KEY, EXPANDED_KEY, ...TASK_KEYS].includes(event.key)) queueRender();
    });
    queueRender();
  }

  window.ElyonAIWorkforceOrgchartV1 = { render: queueRender, team: TEAM };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
