(() => {
  "use strict";

  if (window.__elyonAiCompanyViewV1Installed) return;
  window.__elyonAiCompanyViewV1Installed = true;

  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const TASKS_KEY = "elyon_ai_workforce_tasks";
  const PANEL_ID = "elyonAiCompanyViewV1Panel";
  const STYLE_ID = "elyonAiCompanyViewV1Styles";

  const ROLES = {
    product: {
      name: "Product Manager",
      icon: "📦",
      role: "Produkt & Wirtschaftlichkeit",
      description: "Bündelt Produktdaten, Compliance und Wirtschaftlichkeit vor dem Listing.",
      agents: ["elyon-product-data-checker", "elyon-compliance-guard", "elyon-profit-analyst"],
    },
    listing: {
      name: "Listing Manager",
      icon: "🛒",
      role: "eBay Listings",
      description: "Bereitet faktengebundene Listing-Entwürfe vor und führt die Listing-Prüfung zusammen.",
      agents: ["elyon-listing-pro"],
    },
    operations: {
      name: "Operations Manager",
      icon: "🚚",
      role: "Bestellungen & Fulfillment",
      description: "Prüft Bestellungen, Versandfristen, Tracking und operative Ausnahmen.",
      agents: ["elyon-order-coordinator"],
    },
    care: {
      name: "Customer Care",
      icon: "💬",
      role: "Kundenservice",
      description: "Strukturiert Retouren und Kundenfälle; Antworten bleiben freigabepflichtig.",
      agents: ["elyon-support-assistant"],
    },
  };

  const LABELS = {
    "elyon-product-data-checker": "Produktdaten-Check",
    "elyon-compliance-guard": "Compliance Guard",
    "elyon-profit-analyst": "Profit Analyst",
    "elyon-listing-pro": "Listing Pro",
    "elyon-order-coordinator": "Order Coordinator",
    "elyon-support-assistant": "Support Assistant",
  };

  const VISIBLE = {
    "elyon-product-data-checker": "elyon-product-data-specialist",
    "elyon-compliance-guard": "elyon-compliance-specialist",
    "elyon-profit-analyst": "elyon-profit-specialist",
    "elyon-listing-pro": "elyon-listing-specialist",
    "elyon-order-coordinator": "elyon-order-specialist",
    "elyon-support-assistant": "elyon-customer-support-specialist",
  };

  const text = (value, fallback = "") => value === null || value === undefined ? fallback : String(value).trim();
  const escapeHtml = (value) => text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  function readJson(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key) || "null"); return value === null ? fallback : value; }
    catch { return fallback; }
  }

  function plainObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function tasks() { const value = readJson(TASKS_KEY, []); return Array.isArray(value) ? value : []; }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .elyon-company-panel{position:fixed;inset:0;z-index:22100;background:rgba(2,6,23,.86);backdrop-filter:blur(8px);display:flex;justify-content:flex-end}.elyon-company-panel-inner{width:min(760px,100%);height:100%;overflow:auto;background:#0b1422;border-left:1px solid rgba(148,163,184,.17);padding:20px;color:#e8eef7}.elyon-company-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding-bottom:13px;border-bottom:1px solid rgba(148,163,184,.13)}.elyon-company-head h2{margin:0;font-size:19px}.elyon-company-head p{margin:5px 0 0;color:#8fa2b8;font-size:10px;line-height:1.5}.elyon-company-section{padding:14px 0;border-bottom:1px solid rgba(148,163,184,.1)}.elyon-company-section h3{margin:0 0 9px;font-size:11px}.elyon-company-agent{display:grid;gap:8px;padding:11px;border-radius:12px;background:rgba(2,6,23,.36);border:1px solid rgba(148,163,184,.11);margin-bottom:8px}.elyon-company-agent-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.elyon-company-agent strong{font-size:10px}.elyon-company-state{font-size:8px;padding:4px 7px;border-radius:999px;background:rgba(148,163,184,.1);color:#cbd5e1;font-weight:900}.elyon-company-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.elyon-company-meta div{padding:7px 8px;border-radius:9px;background:rgba(255,255,255,.025);border:1px solid rgba(148,163,184,.08)}.elyon-company-meta b{display:block;font-size:8px;color:#e2e8f0}.elyon-company-meta small{display:block;margin-top:2px;font-size:7px;color:#7f93aa;overflow-wrap:anywhere}.elyon-company-result{font-size:8px;line-height:1.45;color:#9fb1c6}.elyon-company-actions{display:flex;gap:7px;flex-wrap:wrap}.elyon-company-actions button{padding:8px 10px;border-radius:9px;font-size:9px}@media(max-width:620px){.elyon-company-meta{grid-template-columns:1fr 1fr}.elyon-company-panel-inner{padding:15px}}
    `;
    document.head.appendChild(style);
  }

  function settingsFor(agentId) {
    const settings = plainObject(readJson(SETTINGS_KEY, {}));
    const agents = plainObject(settings.agents);
    const source = plainObject(agents[agentId] || agents[VISIBLE[agentId]]);
    const autonomy = Math.max(0, Math.min(3, Number(source.autonomyLevel ?? ({ off: 0, manual: 1, assisted: 2, semi: 3, auto_internal: 3, auto_external: 3 }[text(source.autonomyMode || source.autonomy?.mode).toLowerCase()] ?? 1)) || 0));
    return {
      active: source.active !== false && source.enabled !== false && source.paused !== true,
      provider: text(source.provider, agentId === "elyon-product-data-checker" ? "local" : "nicht festgelegt"),
      model: text(source.model, "Standard"),
      autonomy,
      lastRun: text(source.lastRun),
      todayUsage: Math.max(0, Number(source.todayUsage || 0) || 0),
      dailyLimit: Math.max(0, Number(source.dailyLimit || 0) || 0),
    };
  }

  function latestTask(agentId) { return tasks().find((task) => task?.agentId === agentId) || null; }
  function currentTask(agentId) { return tasks().find((task) => task?.agentId === agentId && ["queued", "analyzing", "running"].includes(text(task.status).toLowerCase())) || null; }

  function formatDate(value) {
    if (!value) return "noch nie";
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toLocaleString("de-DE") : value;
  }

  function agentMarkup(agentId) {
    const settings = settingsFor(agentId);
    const latest = latestTask(agentId);
    const current = currentTask(agentId);
    return `<article class="elyon-company-agent"><div class="elyon-company-agent-top"><div><strong>${escapeHtml(LABELS[agentId] || agentId)}</strong><div class="elyon-company-result">${escapeHtml(current?.title || "Keine laufende Aufgabe")}</div></div><span class="elyon-company-state">${settings.active ? "aktiv" : "pausiert"}</span></div><div class="elyon-company-meta"><div><b>Provider</b><small>${escapeHtml(settings.provider)} · ${escapeHtml(settings.model)}</small></div><div><b>Autonomie</b><small>Stufe ${settings.autonomy} / 3</small></div><div><b>Letzter Lauf</b><small>${escapeHtml(formatDate(settings.lastRun || latest?.updatedAt || latest?.createdAt))}</small></div><div><b>Heute</b><small>${settings.todayUsage.toFixed(2)} € Schätzung</small></div><div><b>Tageslimit</b><small>${settings.dailyLimit > 0 ? `${settings.dailyLimit.toFixed(2)} €` : "kein fixes Limit"}</small></div><div><b>Letzter Status</b><small>${escapeHtml(latest?.result?.status || latest?.status || "bereit")}</small></div></div><div class="elyon-company-result"><strong>Letztes Ergebnis:</strong> ${escapeHtml(latest?.result?.summary || latest?.errors?.[0] || "Noch kein Ergebnis vorhanden.")}</div></article>`;
  }

  function openDetails(roleId) {
    const role = ROLES[roleId];
    if (!role) return;
    document.getElementById(PANEL_ID)?.remove();
    installStyles();
    const root = document.createElement("div");
    root.id = PANEL_ID;
    root.className = "elyon-company-panel";
    root.innerHTML = `<aside class="elyon-company-panel-inner"><div class="elyon-company-head"><div><h2>${role.icon} ${escapeHtml(role.name)}</h2><p>${escapeHtml(role.description)}</p></div><button data-company-close>✕</button></div><section class="elyon-company-section"><h3>${escapeHtml(role.role)}</h3><div class="elyon-company-result">Diese Ansicht liest dieselben Agenteneinstellungen und Aufgaben wie die bestehende Elyon AI Workforce. Sie erzeugt keine eigenen Agenten oder Tasks.</div></section><section class="elyon-company-section"><h3>Mitarbeiter & Skills</h3>${role.agents.map(agentMarkup).join("")}</section><section class="elyon-company-section"><h3>Sicherheitsstatus</h3><div class="elyon-company-result">Maximale Autonomiestufe 3. Externe irreversible Aktionen bleiben gesperrt; Kundenantworten und Listing-Entwürfe benötigen Freigabe.</div></section><div class="elyon-company-actions"><button data-company-close>Schließen</button></div></aside>`;
    document.body.appendChild(root);
  }

  function handleClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const close = target.closest("[data-company-close]");
    if (close) { event.preventDefault(); document.getElementById(PANEL_ID)?.remove(); return; }
    const details = target.closest("[data-v6-details]");
    if (!details || details.dataset.v6Details === "manager" || !ROLES[details.dataset.v6Details]) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openDetails(details.dataset.v6Details);
  }

  function install() {
    installStyles();
    document.addEventListener("click", handleClick, true);
  }

  window.ElyonAICompanyViewV1 = { openDetails, roles: ROLES };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
