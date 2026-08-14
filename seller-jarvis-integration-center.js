(() => {
  "use strict";

  const TAB_ID = "jarvisIntegrationCenterTab";
  const STYLE_ID = "elyonJarvisIntegrationCenterStyles";
  const STORAGE_KEY = "elyon_jarvis_integration_registry_v1";
  const STATUS_TTL_MS = 15000;

  const seed = {
    models: [
      { id: "nemotron-3-ultra-free", name: "Nemotron 3 Ultra", provider: "OpenRouter", role: "Brain", tier: "FREE", status: "configured", enabled: true, priority: 100, capabilities: ["Reasoning", "Agents", "Tools"] },
      { id: "nemotron-3-super-free", name: "Nemotron 3 Super", provider: "OpenRouter", role: "Brain Fallback", tier: "FREE", status: "configured", enabled: true, priority: 95, capabilities: ["Reasoning", "Fallback"] },
      { id: "gpt-oss-20b-free", name: "GPT-OSS 20B", provider: "OpenRouter", role: "General Worker", tier: "FREE", status: "configured", enabled: true, priority: 90, capabilities: ["Tools", "JSON", "Reasoning"] },
      { id: "north-mini-code-free", name: "North Mini Code", provider: "OpenRouter", role: "Developer", tier: "FREE", status: "configured", enabled: true, priority: 90, capabilities: ["Coding", "Tools"] },
      { id: "lfm-2-5-2-6b-free", name: "LFM2.5-2.6B", provider: "OpenRouter", role: "Fast Worker", tier: "FREE", status: "configured", enabled: true, priority: 70, capabilities: ["Fast Tasks", "Agents"] },
      { id: "nemotron-nano-12b-vl-free", name: "Nemotron Nano 12B VL", provider: "OpenRouter", role: "Vision", tier: "FREE", status: "configured", enabled: true, priority: 85, capabilities: ["Vision", "Documents"] },
      { id: "openrouter-free-router", name: "Free Models Router", provider: "OpenRouter", role: "Fallback", tier: "FREE", status: "configured", enabled: true, priority: 50, capabilities: ["Routing", "Fallback"] }
    ],
    apis: [
      { id: "openrouter", name: "OpenRouter", category: "AI Gateway", auth: "API Key", access: "Brain + AI calls", status: "configured", enabled: true },
      { id: "deepseek", name: "DeepSeek", category: "AI Provider", auth: "API Key", access: "Brain fallback", status: "configured", enabled: true },
      { id: "openai", name: "OpenAI", category: "AI Provider", auth: "API Key", access: "Brain fallback", status: "configured", enabled: true },
      { id: "ebay", name: "eBay", category: "Marketplace", auth: "OAuth", access: "Read + Draft", status: "existing", enabled: true },
      { id: "cj", name: "CJ Dropshipping", category: "Supplier", auth: "API Key", access: "Read", status: "existing", enabled: true }
    ],
    routing: {
      "General Worker": ["gpt-oss-20b-free", "lfm-2-5-2-6b-free", "openrouter-free-router"],
      Developer: ["north-mini-code-free", "openrouter-free-router"],
      Vision: ["nemotron-nano-12b-vl-free", "openrouter-free-router"]
    }
  };

  const state = {
    active: "overview",
    registry: loadRegistry(),
    systemStatus: null,
    systemLoading: false,
    systemError: "",
    lastLoadedAt: 0,
  };

  const text = (v, f = "") => v === null || v === undefined ? f : String(v).trim();
  const escapeHtml = (v) => text(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const number = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
  const providerName = (v) => ({ openrouter: "OpenRouter", deepseek: "DeepSeek", openai: "OpenAI" }[text(v).toLowerCase()] || text(v) || "Unbekannt");

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

  function formatNumber(value) {
    const numeric = number(value);
    return numeric === null ? "—" : new Intl.NumberFormat("de-DE").format(numeric);
  }

  function formatMoney(value) {
    const numeric = number(value);
    return numeric === null ? "—" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 4 }).format(numeric);
  }

  function formatDate(value) {
    const timestamp = Date.parse(text(value));
    if (!Number.isFinite(timestamp)) return "—";
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "medium" }).format(new Date(timestamp));
  }

  function statusTone(status) {
    const value = text(status).toLowerCase();
    if (["healthy", "online", "completed", "success", "running", "autopilot"].includes(value)) return "good";
    if (["degraded", "configured", "queued", "assisted", "paused"].includes(value)) return "warn";
    if (["failed", "error", "not_configured", "offline"].includes(value)) return "bad";
    return "neutral";
  }

  function statusLabel(status) {
    const value = text(status).toLowerCase();
    const labels = {
      healthy: "ONLINE",
      online: "ONLINE",
      degraded: "DEGRADED",
      configured: "KONFIGURIERT",
      not_configured: "NICHT KONFIGURIERT",
      completed: "FERTIG",
      running: "LÄUFT",
      queued: "WARTET",
      failed: "FEHLER",
      autopilot: "AUTOPILOT",
      assisted: "ASSISTED",
      manual: "MANUELL",
      paused: "PAUSIERT",
    };
    return labels[value] || text(status).toUpperCase() || "UNBEKANNT";
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${TAB_ID}{display:none}#${TAB_ID}.active{display:block}.jic{display:grid;gap:16px;padding-bottom:36px}.jic-hero{padding:22px;border-radius:26px;border:1px solid rgba(96,165,250,.18);background:radial-gradient(circle at 10% 0,rgba(59,130,246,.18),transparent 32%),linear-gradient(145deg,rgba(8,17,31,.97),rgba(15,23,42,.86))}.jic-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.jic-title h1{margin:0;font-size:28px;letter-spacing:-.04em}.jic-title p{margin:7px 0 0;color:#94a3b8;font-size:11px;line-height:1.55;max-width:760px}.jic-badge{padding:7px 10px;border-radius:999px;border:1px solid rgba(148,163,184,.18);background:rgba(148,163,184,.08);color:#dbeafe;font-size:9px;font-weight:900;white-space:nowrap}.jic-badge.good{border-color:rgba(34,197,94,.25);background:rgba(34,197,94,.08);color:#bbf7d0}.jic-badge.warn{border-color:rgba(250,204,21,.22);background:rgba(161,98,7,.08);color:#fde68a}.jic-badge.bad{border-color:rgba(248,113,113,.22);background:rgba(127,29,29,.12);color:#fecaca}.jic-tabs{display:flex;gap:7px;flex-wrap:wrap;margin-top:18px}.jic-tab,.jic-btn{padding:8px 11px;border-radius:11px;border:1px solid rgba(148,163,184,.12);background:rgba(255,255,255,.04);color:#94a3b8;font-size:10px}.jic-tab.active,.jic-btn.primary{color:#fff;border-color:rgba(96,165,250,.3);background:rgba(37,99,235,.18)}.jic-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center}.jic-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.jic-metric,.jic-card{padding:16px;border-radius:20px;background:rgba(15,23,42,.62);border:1px solid rgba(148,163,184,.12)}.jic-metric small{display:block;color:#7f91a6;font-size:9px;text-transform:uppercase;letter-spacing:.08em}.jic-metric strong{display:block;margin-top:8px;font-size:25px}.jic-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.jic-health-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.jic-card h2{margin:0 0 12px;font-size:15px}.jic-card h3{margin:0;font-size:12px}.jic-list{display:grid;gap:8px}.jic-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px;border-radius:14px;background:rgba(2,6,23,.34);border:1px solid rgba(148,163,184,.08)}.jic-row strong{font-size:11px}.jic-row p{margin:4px 0 0;color:#7f91a6;font-size:9px;line-height:1.45}.jic-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.jic-tag{padding:4px 6px;border-radius:999px;background:rgba(59,130,246,.09);border:1px solid rgba(96,165,250,.13);color:#bfdbfe;font-size:8px}.jic-side{display:grid;justify-items:end;gap:6px}.jic-tier{font-size:9px;font-weight:900;color:#bbf7d0}.jic-toggle{padding:6px 8px;border-radius:9px;border:1px solid rgba(148,163,184,.12);background:rgba(255,255,255,.05);color:#dbeafe;font-size:8px}.jic-toggle.off{color:#94a3b8}.jic-route{display:grid;grid-template-columns:150px minmax(0,1fr);gap:12px;padding:11px 0;border-bottom:1px solid rgba(148,163,184,.08)}.jic-route:last-child{border-bottom:0}.jic-route strong{font-size:10px}.jic-route span{color:#8ea0b5;font-size:9px}.jic-note{padding:13px 14px;border-radius:14px;border:1px solid rgba(250,204,21,.13);background:rgba(161,98,7,.06);color:#d6c68e;font-size:9px;line-height:1.55}.jic-empty{padding:24px;text-align:center;color:#71849a;font-size:10px}.jic-status{font-size:8px;font-weight:900}.jic-status.good{color:#86efac}.jic-status.warn{color:#fde68a}.jic-status.bad{color:#fca5a5}.jic-status.neutral{color:#94a3b8}.jic-health{min-height:118px}.jic-health-head{display:flex;justify-content:space-between;gap:8px;align-items:center}.jic-health-value{font-size:17px;font-weight:900;margin-top:12px}.jic-health p{margin:6px 0 0;color:#8496aa;font-size:9px;line-height:1.45}.jic-safe{color:#86efac}.jic-danger{color:#fca5a5}.jic-log{display:grid;gap:5px;padding:11px 0;border-bottom:1px solid rgba(148,163,184,.08)}.jic-log:last-child{border-bottom:0}.jic-log-top{display:flex;justify-content:space-between;gap:8px}.jic-log small{color:#71849a;font-size:8px}.jic-error{padding:12px;border-radius:14px;border:1px solid rgba(248,113,113,.18);background:rgba(127,29,29,.08);color:#fecaca;font-size:9px}.jic-refresh-meta{color:#71849a;font-size:8px}
      @media(max-width:1000px){.jic-health-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:900px){.jic-metrics{grid-template-columns:repeat(2,1fr)}.jic-grid{grid-template-columns:1fr}}@media(max-width:600px){.jic-head{display:grid}.jic-metrics,.jic-health-grid{grid-template-columns:1fr 1fr}.jic-route{grid-template-columns:1fr}}@media(max-width:430px){.jic-metrics,.jic-health-grid{grid-template-columns:1fr}}
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
      option.textContent = "⌘ Jarvis Integration Center";
      const jarvis = menu.querySelector('option[value="jarvisCommandCenterTab"]');
      if (jarvis) jarvis.insertAdjacentElement("afterend", option); else menu.appendChild(option);
    }
    return true;
  }

  function activateTab() {
    const target = ensureTab();
    if (typeof window.showTab === "function") { try { window.showTab(TAB_ID); } catch { /* fallback */ } }
    document.querySelectorAll(".tab").forEach((node) => node.classList.toggle("active", node === target));
    const menu = document.getElementById("mainMenu");
    if (menu) menu.value = TAB_ID;
  }

  function modelById(id) { return state.registry.models.find((model) => model.id === id); }

  async function loadSystemStatus({ force = false } = {}) {
    if (state.systemLoading) return;
    if (!force && state.systemStatus && Date.now() - state.lastLoadedAt < STATUS_TTL_MS) return;
    state.systemLoading = true;
    state.systemError = "";
    render();
    try {
      const response = await fetch("/api/jarvis-system-status", {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(text(data?.error) || `HTTP ${response.status}`);
      state.systemStatus = data;
      state.lastLoadedAt = Date.now();
    } catch (error) {
      state.systemError = text(error?.message, "Systemstatus konnte nicht geladen werden.");
    } finally {
      state.systemLoading = false;
      render();
    }
  }

  function liveProviderById(id) {
    return state.systemStatus?.providers?.find?.((provider) => provider.provider === id) || null;
  }

  function renderModels() {
    return `<section class="jic-card"><h2>KI-Modelle · lokale Registry</h2><div class="jic-list">${state.registry.models.map((model) => `<article class="jic-row"><div><strong>${escapeHtml(model.name)}</strong><p>${escapeHtml(model.provider)} · Rolle: ${escapeHtml(model.role)} · Priorität ${escapeHtml(model.priority)}</p><div class="jic-tags">${(model.capabilities || []).map((capability) => `<span class="jic-tag">${escapeHtml(capability)}</span>`).join("")}</div></div><div class="jic-side"><span class="jic-tier">${escapeHtml(model.tier)}</span><button class="jic-toggle ${model.enabled ? "" : "off"}" data-jic-toggle-model="${escapeHtml(model.id)}">${model.enabled ? "✓ Lokal aktiv" : "Lokal aus"}</button></div></article>`).join("")}</div><div class="jic-note">Diese Schalter verwalten weiterhin nur die lokale Jarvis-/Workforce-Registry. Provider-Secrets oder Server-Fallbacks werden hier nicht verändert.</div></section>`;
  }

  function renderApis() {
    return `<section class="jic-card"><h2>APIs & Provider</h2><div class="jic-list">${state.registry.apis.map((api) => {
      const live = liveProviderById(api.id);
      const liveStatus = live?.status || api.status;
      return `<article class="jic-row"><div><strong>${escapeHtml(api.name)}</strong><p>${escapeHtml(api.category)} · Auth: ${escapeHtml(api.auth)} · Jarvis: ${escapeHtml(api.access)}${live?.lastAttempt?.at ? ` · zuletzt ${escapeHtml(formatDate(live.lastAttempt.at))}` : ""}</p></div><div class="jic-side"><span class="jic-status ${statusTone(liveStatus)}">${escapeHtml(statusLabel(liveStatus))}</span><button class="jic-toggle ${api.enabled ? "" : "off"}" data-jic-toggle-api="${escapeHtml(api.id)}">${api.enabled ? "✓ Lokal aktiv" : "Lokal aus"}</button></div></article>`;
    }).join("")}</div></section>`;
  }

  function renderRouting() {
    const liveChain = state.systemStatus?.brain?.chain || [];
    const brainRoute = liveChain.length
      ? `<div class="jic-route"><strong>Brain · LIVE</strong><span>${liveChain.map((item) => `${providerName(item.provider)}${item.model ? ` · ${item.model}` : " · Provider-Default"}`).map(escapeHtml).join(" → ")}</span></div>`
      : `<div class="jic-route"><strong>Brain</strong><span>Noch keine Live-Daten geladen.</span></div>`;
    const workforce = Object.entries(state.registry.routing).map(([role, ids]) => `<div class="jic-route"><strong>${escapeHtml(role)}</strong><span>${ids.map((id) => modelById(id)?.name || id).map(escapeHtml).join(" → ")}</span></div>`).join("");
    return `<section class="jic-card"><h2>Routing-Regeln</h2>${brainRoute}${workforce}<div class="jic-note">Die Brain-Zeile kommt vom Server und entspricht der tatsächlichen Fallback-Kette. Workforce-Routen darunter stammen aus der lokalen Registry.</div></section>`;
  }

  function renderHealthCard(title, status, value, detail) {
    return `<section class="jic-card jic-health"><div class="jic-health-head"><h3>${escapeHtml(title)}</h3><span class="jic-status ${statusTone(status)}">${escapeHtml(statusLabel(status))}</span></div><div class="jic-health-value">${escapeHtml(value)}</div><p>${escapeHtml(detail)}</p></section>`;
  }

  function renderOverview() {
    const system = state.systemStatus;
    if (!system) {
      return `${state.systemError ? `<div class="jic-error">${escapeHtml(state.systemError)}</div>` : ""}<section class="jic-card"><h2>Jarvis Systemstatus</h2><div class="jic-empty">${state.systemLoading ? "Live-Status wird geladen …" : "Noch keine Live-Daten geladen."}</div><div class="jic-actions"><button class="jic-btn primary" data-jic-refresh>${state.systemLoading ? "Lädt …" : "Systemstatus laden"}</button></div></section>`;
    }

    const metrics = system.brain?.metrics24h || {};
    const lastRun = system.brain?.lastRun;
    const memory = system.memory || {};
    const e5 = system.e5 || {};
    const brainStatus = lastRun ? (lastRun.ok ? "online" : "degraded") : (system.brain?.configured ? "configured" : "not_configured");
    const brainValue = lastRun?.provider ? `${providerName(lastRun.provider)}${lastRun.model ? ` · ${lastRun.model}` : ""}` : "Fallback-Kette bereit";
    const memoryValue = memory.online ? "Supabase verbunden" : (memory.configured ? "Teilweise erreichbar" : "Nicht konfiguriert");
    const e5Status = e5.online ? (e5.pipelineEnabled ? e5.mode : "paused") : "offline";
    const e5Value = e5.online ? `${e5.pipelineEnabled ? "Pipeline aktiv" : "Pipeline aus"} · ${text(e5.mode).toUpperCase()}` : "Nicht erreichbar";

    return `${state.systemError ? `<div class="jic-error">${escapeHtml(state.systemError)}</div>` : ""}
      <section class="jic-metrics">
        <div class="jic-metric"><small>Brain Requests · 24h</small><strong>${formatNumber(metrics.requests)}</strong></div>
        <div class="jic-metric"><small>Fallbacks · 24h</small><strong>${formatNumber(metrics.fallbacks)}</strong></div>
        <div class="jic-metric"><small>Rate Limits · 24h</small><strong>${formatNumber(metrics.rateLimits)}</strong></div>
        <div class="jic-metric"><small>Brain Tokens · 24h</small><strong>${formatNumber(metrics.totalTokens)}</strong></div>
      </section>
      <section class="jic-health-grid">
        ${renderHealthCard("Brain", brainStatus, brainValue, lastRun ? `Letzter Lauf ${formatDate(lastRun.at)} · ${lastRun.durationMs || 0} ms` : "Noch kein Brain-Lauf in der neuen Telemetrie.")}
        ${renderHealthCard("Memory", memory.online ? "online" : "degraded", memoryValue, `Long-Term: ${memory.longTermMemory?.online ? "online" : "nicht erreichbar"} · Working: ${memory.workingMemory?.online ? "online" : "nicht erreichbar"}`)}
        ${renderHealthCard("E5 Pipeline", e5Status, e5Value, e5.killSwitch ? "Kill-Switch aktiv" : e5.pausedByGuard ? "Durch Guard pausiert" : `State: ${text(e5.state) || "—"}`)}
        ${renderHealthCard("Safety", "online", "LIVE Publishing gesperrt", "Supplier Orders, Refunds, Kundennachrichten und Legal-Data-Writes bleiben gesperrt.")}
      </section>
      <div class="jic-grid">${renderApis()}${renderRecentActivity()}</div>
      ${renderRouting()}`;
  }

  function renderRecentActivity() {
    const memory = state.systemStatus?.memory || {};
    const tasks = Array.isArray(memory.recentTasks) ? memory.recentTasks.slice(0, 5) : [];
    const runs = Array.isArray(memory.recentAgentRuns) ? memory.recentAgentRuns.slice(0, 5) : [];
    return `<section class="jic-card"><h2>Letzte Aktivität</h2><div class="jic-list">${tasks.length ? tasks.map((task) => `<article class="jic-row"><div><strong>${escapeHtml(task.type || "Task")}</strong><p>${escapeHtml(formatDate(task.updatedAt))} · Fortschritt ${escapeHtml(formatNumber(task.progress))}%</p></div><span class="jic-status ${statusTone(task.status)}">${escapeHtml(statusLabel(task.status))}</span></article>`).join("") : `<div class="jic-empty">Keine aktuellen Tasks.</div>`}${runs.length ? runs.map((run) => `<article class="jic-row"><div><strong>${escapeHtml(run.agentName || "Agent")}</strong><p>${escapeHtml(run.model || "ohne Modell")} · ${escapeHtml(formatDate(run.createdAt))}</p></div><span class="jic-status ${statusTone(run.status)}">${escapeHtml(statusLabel(run.status))}</span></article>`).join("") : ""}</div></section>`;
  }

  function renderCosts() {
    const system = state.systemStatus;
    if (!system) return `<section class="jic-card"><h2>Kosten & Usage</h2><div class="jic-empty">Live-Daten zuerst laden.</div></section>`;
    const brain = system.brain?.metrics24h || {};
    const agents = system.memory?.agentUsage24h || {};
    return `<section class="jic-metrics"><div class="jic-metric"><small>Brain Kosten · beobachtet</small><strong>${formatMoney(brain.cost)}</strong></div><div class="jic-metric"><small>Agent-Kosten · 24h</small><strong>${formatMoney(agents.cost)}</strong></div><div class="jic-metric"><small>Agent-Runs · 24h</small><strong>${formatNumber(agents.runs)}</strong></div><div class="jic-metric"><small>Brain Tokens · 24h</small><strong>${formatNumber(brain.totalTokens)}</strong></div></section><section class="jic-card"><h2>Messgrenzen</h2><div class="jic-note">Kosten werden nur angezeigt, wenn der jeweilige Provider oder Agent-Run einen belastbaren Kostenwert liefert. „—“ bedeutet nicht €0,00. ${agents.sampled ? "Bei Agent-Runs wurden maximal 100 Einträge der letzten 24 Stunden berücksichtigt." : "Agent-Runs der letzten 24 Stunden wurden aus der Jarvis-Run-Historie gelesen."}</div></section>`;
  }

  function renderLogs() {
    const system = state.systemStatus;
    if (!system) return `<section class="jic-card"><h2>Logs</h2><div class="jic-empty">Live-Daten zuerst laden.</div></section>`;
    const lastRun = system.brain?.lastRun;
    const attempts = Array.isArray(lastRun?.attempts) ? lastRun.attempts : [];
    const agentRuns = Array.isArray(system.memory?.recentAgentRuns) ? system.memory.recentAgentRuns : [];
    return `<div class="jic-grid"><section class="jic-card"><h2>Letzter Brain-Lauf</h2>${lastRun ? `<div class="jic-log"><div class="jic-log-top"><strong>${escapeHtml(lastRun.ok ? "Erfolgreich" : "Fehlgeschlagen")}</strong><span class="jic-status ${lastRun.ok ? "good" : "bad"}">${lastRun.ok ? "OK" : "DEGRADED"}</span></div><small>${escapeHtml(formatDate(lastRun.at))} · ${escapeHtml(String(lastRun.durationMs || 0))} ms</small></div>${attempts.map((attempt, index) => `<div class="jic-log"><div class="jic-log-top"><strong>${index + 1}. ${escapeHtml(providerName(attempt.provider))}${attempt.model ? ` · ${escapeHtml(attempt.model)}` : ""}</strong><span class="jic-status ${attempt.ok ? "good" : "bad"}">${attempt.ok ? "OK" : escapeHtml(attempt.error || `HTTP ${attempt.status || "?"}`)}</span></div><small>${attempt.status ? `HTTP ${escapeHtml(String(attempt.status))}` : "kein HTTP-Status"}${attempt.retryAfterSeconds !== null && attempt.retryAfterSeconds !== undefined ? ` · Retry ${escapeHtml(String(attempt.retryAfterSeconds))}s` : ""}</small></div>`).join("")}` : `<div class="jic-empty">Noch kein Brain-Lauf in der V2-Telemetrie.</div>`}</section><section class="jic-card"><h2>Letzte Agent-Runs</h2>${agentRuns.length ? agentRuns.map((run) => `<div class="jic-log"><div class="jic-log-top"><strong>${escapeHtml(run.agentName || "Agent")}</strong><span class="jic-status ${statusTone(run.status)}">${escapeHtml(statusLabel(run.status))}</span></div><small>${escapeHtml(formatDate(run.createdAt))} · ${escapeHtml(run.model || "ohne Modell")}${run.cost !== null ? ` · ${escapeHtml(formatMoney(run.cost))}` : ""}</small></div>`).join("") : `<div class="jic-empty">Keine Agent-Runs verfügbar.</div>`}</section></div><div class="jic-note">Logs enthalten ausschließlich sanitizte Betriebsmetadaten. Prompts, Antworten, API-Secrets, Cookies und Memory-Inhalte werden hier nicht gespeichert.</div>`;
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
    const liveStatus = state.systemStatus?.status || (state.systemLoading ? "configured" : state.systemError ? "degraded" : "configured");
    const badge = state.systemLoading ? "● V2 LÄDT" : state.systemStatus ? `● V2 ${statusLabel(state.systemStatus.status)}` : "● V2 READ-ONLY";
    tab.innerHTML = `<div class="jic"><section class="jic-hero"><div class="jic-head"><div class="jic-title"><h1>Jarvis Integration Center</h1><p>Read-only Systemzentrale für Brain, Provider-Fallbacks, Memory, E5, Usage und sanitizte Betriebslogs. Das Center vergibt keine zusätzlichen Jarvis-Rechte.</p></div><div class="jic-actions"><span class="jic-badge ${statusTone(liveStatus)}">${escapeHtml(badge)}</span><button class="jic-btn" data-jic-refresh ${state.systemLoading ? "disabled" : ""}>↻ Aktualisieren</button></div></div><div class="jic-tabs">${Object.entries(labels).map(([id, label]) => `<button class="jic-tab ${state.active === id ? "active" : ""}" data-jic-tab="${id}">${label}</button>`).join("")}</div>${state.systemStatus?.checkedAt ? `<div class="jic-refresh-meta">Stand: ${escapeHtml(formatDate(state.systemStatus.checkedAt))}</div>` : ""}</section>${body}</div>`;
  }

  function bindEvents() {
    if (document.documentElement.dataset.elyonJarvisIntegrationCenterBound === "1") return;
    document.documentElement.dataset.elyonJarvisIntegrationCenterBound = "1";
    document.addEventListener("change", (event) => {
      if (event.target?.id === "mainMenu" && event.target.value === TAB_ID) {
        activateTab();
        render();
        void loadSystemStatus();
      }
    }, true);
    document.addEventListener("click", (event) => {
      const el = event.target instanceof Element ? event.target : null;
      if (!el) return;
      const refresh = el.closest("[data-jic-refresh]");
      if (refresh) { void loadSystemStatus({ force: true }); return; }
      const tab = el.closest("[data-jic-tab]");
      if (tab) { state.active = tab.dataset.jicTab || "overview"; render(); if (!state.systemStatus) void loadSystemStatus(); return; }
      const model = el.closest("[data-jic-toggle-model]");
      if (model) { const item = modelById(model.dataset.jicToggleModel); if (item) { item.enabled = !item.enabled; saveRegistry(); render(); } return; }
      const api = el.closest("[data-jic-toggle-api]");
      if (api) { const item = state.registry.apis.find((entry) => entry.id === api.dataset.jicToggleApi); if (item) { item.enabled = !item.enabled; saveRegistry(); render(); } }
    });
  }

  function mount() { installStyles(); ensureTab(); ensureMenu(); bindEvents(); render(); return true; }
  function refresh() { installStyles(); ensureTab(); ensureMenu(); render(); const menu = document.getElementById("mainMenu"); if (menu?.value === TAB_ID) void loadSystemStatus(); return true; }
  function open() { ensureTab(); ensureMenu(); activateTab(); render(); void loadSystemStatus(); return true; }

  window.ElyonJarvisIntegrationCenter = Object.freeze({
    mount,
    refresh,
    open,
    getRegistry: () => structuredClone(state.registry),
    getSystemStatus: () => state.systemStatus ? structuredClone(state.systemStatus) : null,
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
