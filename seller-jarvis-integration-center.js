(() => {
  "use strict";

  const TAB_ID = "jarvisIntegrationCenterTab";
  const STYLE_ID = "elyonJarvisIntegrationCenterStyles";
  const STORAGE_KEY = "elyon_jarvis_integration_registry_v1";

  const seed = {
    models: [
      { id: "nemotron-3-ultra-free", name: "Nemotron 3 Ultra", provider: "OpenRouter", role: "Brain", tier: "FREE", status: "configured", enabled: true, priority: 100, capabilities: ["Reasoning", "Agents", "Tools"] },
      { id: "gpt-oss-20b-free", name: "GPT-OSS 20B", provider: "OpenRouter", role: "General Worker", tier: "FREE", status: "configured", enabled: true, priority: 90, capabilities: ["Tools", "JSON", "Reasoning"] },
      { id: "north-mini-code-free", name: "North Mini Code", provider: "OpenRouter", role: "Developer", tier: "FREE", status: "configured", enabled: true, priority: 90, capabilities: ["Coding", "Tools"] },
      { id: "lfm-2-5-2-6b-free", name: "LFM2.5-2.6B", provider: "OpenRouter", role: "Fast Worker", tier: "FREE", status: "configured", enabled: true, priority: 70, capabilities: ["Fast Tasks", "Agents"] },
      { id: "nemotron-nano-12b-vl-free", name: "Nemotron Nano 12B VL", provider: "OpenRouter", role: "Vision", tier: "FREE", status: "configured", enabled: true, priority: 85, capabilities: ["Vision", "Documents"] },
      { id: "nemotron-3-embed-1b-free", name: "Nemotron 3 Embed 1B", provider: "OpenRouter", role: "Memory Embed", tier: "FREE", status: "configured", enabled: true, priority: 95, capabilities: ["Embeddings", "RAG"] },
      { id: "nemotron-rerank-vl-free", name: "Nemotron Rerank VL", provider: "OpenRouter", role: "Memory Rerank", tier: "FREE", status: "configured", enabled: true, priority: 95, capabilities: ["Rerank", "RAG"] },
      { id: "openrouter-free-router", name: "Free Models Router", provider: "OpenRouter", role: "Fallback", tier: "FREE", status: "configured", enabled: true, priority: 50, capabilities: ["Routing", "Fallback"] },
      { id: "nemotron-3-5-lightning-free", name: "Nemotron 3.5 Lightning", provider: "OpenRouter", role: "Reasoning / Coding", tier: "FREE", status: "configured", enabled: true, priority: 80, capabilities: ["Reasoning", "Coding"] },
      { id: "gemma-4-31b-free", name: "Gemma 4 31B", provider: "OpenRouter", role: "Generalist", tier: "FREE", status: "configured", enabled: true, priority: 70, capabilities: ["Text", "Analysis"] }
    ],
    apis: [
      { id: "openrouter", name: "OpenRouter", category: "AI Gateway", auth: "API Key", access: "AI calls", status: "configured", enabled: true },
      { id: "ebay", name: "eBay", category: "Marketplace", auth: "OAuth", access: "Read + Draft", status: "existing", enabled: true },
      { id: "cj", name: "CJ Dropshipping", category: "Supplier", auth: "API Key", access: "Read", status: "existing", enabled: true },
      { id: "openai", name: "OpenAI", category: "AI Provider", auth: "API Key", access: "Fallback", status: "existing", enabled: true }
    ],
    routing: {
      Brain: ["nemotron-3-ultra-free", "gpt-oss-20b-free", "openrouter-free-router"],
      "General Worker": ["gpt-oss-20b-free", "lfm-2-5-2-6b-free", "openrouter-free-router"],
      Developer: ["north-mini-code-free", "nemotron-3-5-lightning-free", "openrouter-free-router"],
      Vision: ["nemotron-nano-12b-vl-free", "openrouter-free-router"],
      "Memory Embed": ["nemotron-3-embed-1b-free"],
      "Memory Rerank": ["nemotron-rerank-vl-free"]
    }
  };

  const state = { active: "overview", registry: loadRegistry() };
  const text = (v, f = "") => v === null || v === undefined ? f : String(v).trim();
  const escapeHtml = (v) => text(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  function loadRegistry() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(seed);
      const parsed = JSON.parse(raw);
      return { ...structuredClone(seed), ...parsed };
    } catch { return structuredClone(seed); }
  }

  function saveRegistry() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.registry)); } catch { /* local fallback only */ }
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${TAB_ID}{display:none}#${TAB_ID}.active{display:block}.jic{display:grid;gap:16px;padding-bottom:36px}.jic-hero{padding:22px;border-radius:26px;border:1px solid rgba(96,165,250,.18);background:radial-gradient(circle at 10% 0,rgba(59,130,246,.18),transparent 32%),linear-gradient(145deg,rgba(8,17,31,.97),rgba(15,23,42,.86))}.jic-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.jic-title h1{margin:0;font-size:28px;letter-spacing:-.04em}.jic-title p{margin:7px 0 0;color:#94a3b8;font-size:11px;line-height:1.55;max-width:760px}.jic-badge{padding:7px 10px;border-radius:999px;border:1px solid rgba(34,197,94,.22);background:rgba(34,197,94,.08);color:#bbf7d0;font-size:9px;font-weight:900;white-space:nowrap}.jic-tabs{display:flex;gap:7px;flex-wrap:wrap;margin-top:18px}.jic-tab{padding:8px 11px;border-radius:11px;border:1px solid rgba(148,163,184,.12);background:rgba(255,255,255,.04);color:#94a3b8;font-size:10px}.jic-tab.active{color:#fff;border-color:rgba(96,165,250,.3);background:rgba(37,99,235,.18)}.jic-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.jic-metric,.jic-card{padding:16px;border-radius:20px;background:rgba(15,23,42,.62);border:1px solid rgba(148,163,184,.12)}.jic-metric small{display:block;color:#7f91a6;font-size:9px;text-transform:uppercase;letter-spacing:.08em}.jic-metric strong{display:block;margin-top:8px;font-size:25px}.jic-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.jic-card h2{margin:0 0 12px;font-size:15px}.jic-list{display:grid;gap:8px}.jic-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px;border-radius:14px;background:rgba(2,6,23,.34);border:1px solid rgba(148,163,184,.08)}.jic-row strong{font-size:11px}.jic-row p{margin:4px 0 0;color:#7f91a6;font-size:9px;line-height:1.45}.jic-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.jic-tag{padding:4px 6px;border-radius:999px;background:rgba(59,130,246,.09);border:1px solid rgba(96,165,250,.13);color:#bfdbfe;font-size:8px}.jic-side{display:grid;justify-items:end;gap:6px}.jic-tier{font-size:9px;font-weight:900;color:#bbf7d0}.jic-toggle{padding:6px 8px;border-radius:9px;border:1px solid rgba(148,163,184,.12);background:rgba(255,255,255,.05);color:#dbeafe;font-size:8px}.jic-toggle.off{color:#94a3b8}.jic-route{display:grid;grid-template-columns:150px minmax(0,1fr);gap:12px;padding:11px 0;border-bottom:1px solid rgba(148,163,184,.08)}.jic-route:last-child{border-bottom:0}.jic-route strong{font-size:10px}.jic-route span{color:#8ea0b5;font-size:9px}.jic-note{padding:13px 14px;border-radius:14px;border:1px solid rgba(250,204,21,.13);background:rgba(161,98,7,.06);color:#d6c68e;font-size:9px;line-height:1.55}.jic-empty{padding:24px;text-align:center;color:#71849a;font-size:10px}.jic-actions{display:flex;gap:7px;flex-wrap:wrap}.jic-btn{padding:8px 10px;border-radius:10px;border:1px solid rgba(148,163,184,.12);background:rgba(255,255,255,.05);color:#dbeafe;font-size:9px}.jic-btn.primary{background:linear-gradient(135deg,#2563eb,#7c3aed);border-color:transparent}.jic-secret{font-family:monospace;color:#93a4b8;font-size:9px}.jic-status{font-size:8px;color:#bbf7d0}.jic-status.warn{color:#fde68a}
      @media(max-width:900px){.jic-metrics{grid-template-columns:repeat(2,1fr)}.jic-grid{grid-template-columns:1fr}}@media(max-width:600px){.jic-head{display:grid}.jic-metrics{grid-template-columns:1fr 1fr}.jic-route{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureTab() {
    let tab = document.getElementById(TAB_ID);
    if (tab) return tab;
    tab = document.createElement("section");
    tab.id = TAB_ID;
    tab.className = "tab";
    const jarvis = document.getElementById("jarvisCommandCenterTab");
    if (jarvis) jarvis.insertAdjacentElement("afterend", tab);
    else (document.querySelector("main.container") || document.querySelector(".container") || document.body).appendChild(tab);
    return tab;
  }

  function ensureMenu() {
    const menu = document.getElementById("mainMenu");
    if (!menu) return false;
    let option = menu.querySelector(`option[value="${TAB_ID}"]`);
    if (!option) {
      option = document.createElement("option");
      option.value = TAB_ID;
      option.textContent = "⌘ Integrationen";
      const jarvis = menu.querySelector('option[value="jarvisCommandCenterTab"]');
      if (jarvis) jarvis.insertAdjacentElement("afterend", option); else menu.appendChild(option);
    }
    return true;
  }

  function activateTab() {
    const target = ensureTab();
    if (typeof window.showTab === "function") { try { window.showTab(TAB_ID); } catch { /* fallback */ } }
    document.querySelectorAll(".tab").forEach((node) => node.classList.toggle("active", node === target));
    const menu = document.getElementById("mainMenu"); if (menu) menu.value = TAB_ID;
  }

  function modelById(id) { return state.registry.models.find((m) => m.id === id); }

  function renderModels() {
    return `<section class="jic-card"><h2>KI-Modelle</h2><div class="jic-list">${state.registry.models.map((m) => `<article class="jic-row"><div><strong>${escapeHtml(m.name)}</strong><p>${escapeHtml(m.provider)} · Rolle: ${escapeHtml(m.role)} · Priorität ${escapeHtml(m.priority)}</p><div class="jic-tags">${m.capabilities.map((c) => `<span class="jic-tag">${escapeHtml(c)}</span>`).join("")}</div></div><div class="jic-side"><span class="jic-tier">${escapeHtml(m.tier)}</span><button class="jic-toggle ${m.enabled ? "" : "off"}" data-jic-toggle-model="${escapeHtml(m.id)}">${m.enabled ? "✓ Aktiv" : "Deaktiviert"}</button></div></article>`).join("")}</div></section>`;
  }

  function renderApis() {
    return `<section class="jic-card"><h2>APIs & Provider</h2><div class="jic-list">${state.registry.apis.map((a) => `<article class="jic-row"><div><strong>${escapeHtml(a.name)}</strong><p>${escapeHtml(a.category)} · Auth: ${escapeHtml(a.auth)} · Jarvis: ${escapeHtml(a.access)}</p></div><div class="jic-side"><span class="jic-status ${a.status === "configured" || a.status === "existing" ? "" : "warn"}">${escapeHtml(a.status.toUpperCase())}</span><button class="jic-toggle ${a.enabled ? "" : "off"}" data-jic-toggle-api="${escapeHtml(a.id)}">${a.enabled ? "✓ Aktiv" : "Deaktiviert"}</button></div></article>`).join("")}</div></section>`;
  }

  function renderRouting() {
    return `<section class="jic-card"><h2>Routing-Regeln</h2>${Object.entries(state.registry.routing).map(([role, ids]) => `<div class="jic-route"><strong>${escapeHtml(role)}</strong><span>${ids.map((id) => modelById(id)?.name || id).map(escapeHtml).join(" → ")}</span></div>`).join("")}</section>`;
  }

  function renderOverview() {
    const activeModels = state.registry.models.filter((m) => m.enabled).length;
    const free = state.registry.models.filter((m) => m.enabled && m.tier === "FREE").length;
    const apis = state.registry.apis.filter((a) => a.enabled).length;
    return `<section class="jic-metrics"><div class="jic-metric"><small>Integrationen</small><strong>${activeModels + apis}</strong></div><div class="jic-metric"><small>KI-Modelle aktiv</small><strong>${activeModels}</strong></div><div class="jic-metric"><small>Free-Modelle</small><strong>${free}</strong></div><div class="jic-metric"><small>Kosten heute</small><strong>€0.00</strong></div></section><div class="jic-grid">${renderModels()}${renderApis()}</div>${renderRouting()}<div class="jic-note">V1 ist absichtlich kontrolliert: Registry, Rollen, Aktiv/Deaktiviert und Fallback-Reihenfolge sind sichtbar. Health Checks, echte Kostenmessung und automatisches Jarvis-Routing werden erst angeschlossen, wenn diese Verwaltungsbasis stabil läuft.</div>`;
  }

  function renderCosts() {
    return `<section class="jic-card"><h2>Kosten</h2><div class="jic-empty">Noch keine echte Usage-Telemetrie angebunden. In V2 werden Provider, Modell, Input-/Output-Tokens, Kosten und Agent pro Request protokolliert.</div></section>`;
  }

  function renderLogs() {
    return `<section class="jic-card"><h2>Logs</h2><div class="jic-empty">Noch keine Integration-Logs vorhanden. V2 erhält Health-Check- und Routing-Ereignisse ohne API-Secrets.</div></section>`;
  }

  function render() {
    const tab = ensureTab();
    const labels = { overview: "Übersicht", models: "KI-Modelle", apis: "APIs", routing: "Routing", costs: "Kosten", logs: "Logs" };
    let body = renderOverview();
    if (state.active === "models") body = renderModels();
    else if (state.active === "apis") body = renderApis();
    else if (state.active === "routing") body = renderRouting();
    else if (state.active === "costs") body = renderCosts();
    else if (state.active === "logs") body = renderLogs();
    tab.innerHTML = `<div class="jic"><section class="jic-hero"><div class="jic-head"><div class="jic-title"><h1>Jarvis Integration Center</h1><p>Zentrale Registry für KI-Modelle, Provider, APIs, Rollen und Fallbacks. Konkrete Modelle bleiben austauschbar; Jarvis arbeitet langfristig gegen Fähigkeiten und Rollen.</p></div><span class="jic-badge">● V1 REGISTRY BEREIT</span></div><div class="jic-tabs">${Object.entries(labels).map(([id,label]) => `<button class="jic-tab ${state.active === id ? "active" : ""}" data-jic-tab="${id}">${label}</button>`).join("")}</div></section>${body}</div>`;
  }

  function bindEvents() {
    if (document.documentElement.dataset.elyonJarvisIntegrationCenterBound === "1") return;
    document.documentElement.dataset.elyonJarvisIntegrationCenterBound = "1";
    document.addEventListener("change", (event) => { if (event.target?.id === "mainMenu" && event.target.value === TAB_ID) { activateTab(); render(); } }, true);
    document.addEventListener("click", (event) => {
      const el = event.target instanceof Element ? event.target : null; if (!el) return;
      const tab = el.closest("[data-jic-tab]"); if (tab) { state.active = tab.dataset.jicTab || "overview"; render(); return; }
      const model = el.closest("[data-jic-toggle-model]"); if (model) { const item = modelById(model.dataset.jicToggleModel); if (item) { item.enabled = !item.enabled; saveRegistry(); render(); } return; }
      const api = el.closest("[data-jic-toggle-api]"); if (api) { const item = state.registry.apis.find((a) => a.id === api.dataset.jicToggleApi); if (item) { item.enabled = !item.enabled; saveRegistry(); render(); } }
    });
  }

  function mount() { installStyles(); ensureTab(); ensureMenu(); bindEvents(); render(); return true; }
  function refresh() { installStyles(); ensureTab(); ensureMenu(); render(); return true; }
  function open() { ensureTab(); ensureMenu(); activateTab(); render(); return true; }

  window.ElyonJarvisIntegrationCenter = Object.freeze({ mount, refresh, open, getRegistry: () => structuredClone(state.registry) });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true }); else mount();
})();