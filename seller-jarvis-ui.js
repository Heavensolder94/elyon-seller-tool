(() => {
  "use strict";

  const STYLE_ID = "elyonJarvisD1Styles";
  const DOCK_ID = "elyonJarvisDock";
  const PANEL_ID = "elyonJarvisPanel";
  const MENU_VALUE = "__elyon_jarvis_panel__";
  const HISTORY_LIMIT = 20;
  const TASKS_KEY = "elyon_ai_workforce_tasks";
  const PRODUCT_KEYS = ["elyonProducts", "elyonSellerProducts", "sellerProductMaster", "elyonProductMaster"];

  const state = {
    mounted: false,
    open: false,
    busy: false,
    status: "ready",
    lastMenuValue: "",
    lastCommand: "",
    lastPlannedCommand: "",
    history: [],
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

  function selectedProduct() {
    const products = collection(PRODUCT_KEYS);
    if (!products.length) return {};
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
    return products.find((item) => ["ready_for_seller_tool", "bereit_manuell_einstellen"].includes(text(item?.status).toLowerCase())) || products[0] || {};
  }

  function contextSnapshot() {
    const product = selectedProduct();
    const tasks = readJson(TASKS_KEY, []);
    return {
      ...(product && Object.keys(product).length ? { product } : {}),
      ...(Array.isArray(tasks) && tasks.length ? { tasks: tasks.slice(0, 20) } : {}),
    };
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .elyon-jarvis-dock{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;margin:0 0 18px;padding:12px 14px;border-radius:20px;border:1px solid rgba(96,165,250,.22);background:linear-gradient(135deg,rgba(15,23,42,.9),rgba(30,41,59,.72));box-shadow:0 16px 45px rgba(2,6,23,.24);backdrop-filter:blur(18px)}
      .elyon-jarvis-brand{display:flex;align-items:center;gap:10px;min-width:150px}.elyon-jarvis-orb{width:34px;height:34px;border-radius:999px;display:grid;place-items:center;border:1px solid rgba(125,211,252,.55);background:radial-gradient(circle at 35% 30%,#e0f2fe 0 8%,#38bdf8 12%,#2563eb 45%,#0f172a 72%);box-shadow:0 0 0 5px rgba(59,130,246,.08),0 0 26px rgba(56,189,248,.42);cursor:pointer;position:relative;flex:0 0 auto}.elyon-jarvis-orb:after{content:"";position:absolute;inset:5px;border:1px solid rgba(255,255,255,.52);border-radius:999px}.elyon-jarvis-brand-copy strong{display:block;font-size:12px;letter-spacing:.12em}.elyon-jarvis-state{display:block;margin-top:2px;color:#93c5fd;font-size:9px;font-weight:850;letter-spacing:.08em}.elyon-jarvis-command{display:flex;align-items:center;gap:8px;min-width:0}.elyon-jarvis-command input{margin:0!important;min-width:0;padding:11px 13px!important;border-radius:14px!important;background:rgba(2,6,23,.55)!important}.elyon-jarvis-command button{margin:0;padding:10px 13px;border-radius:12px;font-size:12px;white-space:nowrap}.elyon-jarvis-open{padding:10px 12px!important;border-radius:12px!important;font-size:11px!important;background:rgba(255,255,255,.07)!important;border:1px solid rgba(148,163,184,.16)!important;color:#dbeafe!important}
      .elyon-jarvis-dock[data-state="thinking"] .elyon-jarvis-orb,.elyon-jarvis-dock[data-state="working"] .elyon-jarvis-orb{animation:elyonJarvisPulse 1.25s ease-in-out infinite}.elyon-jarvis-dock[data-state="warning"] .elyon-jarvis-state{color:#fde68a}.elyon-jarvis-dock[data-state="error"] .elyon-jarvis-state,.elyon-jarvis-dock[data-state="offline"] .elyon-jarvis-state{color:#fca5a5}.elyon-jarvis-dock[data-state="error"] .elyon-jarvis-orb,.elyon-jarvis-dock[data-state="offline"] .elyon-jarvis-orb{filter:saturate(.45)}
      @keyframes elyonJarvisPulse{0%,100%{box-shadow:0 0 0 5px rgba(59,130,246,.08),0 0 22px rgba(56,189,248,.34)}50%{box-shadow:0 0 0 9px rgba(59,130,246,.04),0 0 38px rgba(56,189,248,.62)}}
      .elyon-jarvis-backdrop{position:fixed;inset:0;z-index:22000;background:rgba(2,6,23,.54);backdrop-filter:blur(4px);opacity:0;pointer-events:none;transition:opacity .18s ease}.elyon-jarvis-backdrop.open{opacity:1;pointer-events:auto}.elyon-jarvis-panel{position:absolute;right:0;top:0;height:100%;width:min(460px,100%);display:flex;flex-direction:column;background:linear-gradient(180deg,#07111f,#0b1422 58%,#08111e);border-left:1px solid rgba(96,165,250,.24);box-shadow:-26px 0 70px rgba(0,0,0,.38);transform:translateX(102%);transition:transform .2s ease;color:#e5e7eb}.elyon-jarvis-backdrop.open .elyon-jarvis-panel{transform:translateX(0)}
      .elyon-jarvis-panel-head{padding:18px;border-bottom:1px solid rgba(148,163,184,.14);display:flex;justify-content:space-between;gap:12px;align-items:center}.elyon-jarvis-panel-brand{display:flex;align-items:center;gap:11px}.elyon-jarvis-panel-brand .elyon-jarvis-orb{width:42px;height:42px}.elyon-jarvis-panel-brand h2{margin:0;font-size:17px;letter-spacing:.06em}.elyon-jarvis-panel-brand p{margin:3px 0 0;color:#8fa2b8;font-size:10px}.elyon-jarvis-close{padding:8px 10px!important;background:rgba(255,255,255,.06)!important;border:1px solid rgba(148,163,184,.14)!important;color:#cbd5e1!important}
      .elyon-jarvis-quick{display:flex;gap:7px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid rgba(148,163,184,.1)}.elyon-jarvis-quick button{padding:8px 10px;border-radius:10px;font-size:10px;background:rgba(37,99,235,.1);border:1px solid rgba(96,165,250,.18);color:#dbeafe}
      .elyon-jarvis-feed{flex:1;overflow:auto;padding:15px;display:grid;align-content:start;gap:10px}.elyon-jarvis-empty{padding:20px;border-radius:16px;border:1px dashed rgba(148,163,184,.2);color:#8fa2b8;font-size:11px;line-height:1.55;text-align:center}.elyon-jarvis-message{padding:12px 13px;border-radius:15px;background:rgba(15,31,50,.58);border:1px solid rgba(148,163,184,.12)}.elyon-jarvis-message.user{background:rgba(37,99,235,.09);border-color:rgba(96,165,250,.18)}.elyon-jarvis-message.error{background:rgba(127,29,29,.12);border-color:rgba(248,113,113,.22)}.elyon-jarvis-message-head{display:flex;justify-content:space-between;gap:8px;margin-bottom:6px}.elyon-jarvis-message-head strong{font-size:11px}.elyon-jarvis-message-head small{font-size:9px;color:#71849a}.elyon-jarvis-message p{margin:0;color:#cbd5e1;font-size:11px;line-height:1.55}.elyon-jarvis-delegations{display:grid;gap:6px;margin-top:9px}.elyon-jarvis-delegation{padding:8px 9px;border-radius:10px;background:rgba(2,6,23,.38);border:1px solid rgba(148,163,184,.1);font-size:10px;color:#cbd5e1}.elyon-jarvis-delegation b{color:#e5e7eb}.elyon-jarvis-run-last{margin-top:10px;padding:8px 10px!important;border-radius:10px!important;font-size:10px!important}
      .elyon-jarvis-panel-form{padding:13px 15px 16px;border-top:1px solid rgba(148,163,184,.12);background:rgba(2,6,23,.24)}.elyon-jarvis-panel-form textarea{min-height:74px;margin:0 0 9px!important;padding:11px 12px!important;border-radius:13px!important;font-size:12px!important}.elyon-jarvis-panel-actions{display:flex;gap:8px}.elyon-jarvis-panel-actions button{flex:1;padding:9px 10px;border-radius:11px;font-size:11px}.elyon-jarvis-execute{background:linear-gradient(135deg,#2563eb,#7c3aed)!important}.elyon-jarvis-plan{background:rgba(255,255,255,.07)!important;border:1px solid rgba(148,163,184,.14)!important;color:#dbeafe!important}
      .elyon-jarvis-menu-option{font-weight:900}.elyon-jarvis-dock button:disabled,.elyon-jarvis-panel button:disabled{opacity:.5;cursor:wait}
      @media(max-width:760px){.elyon-jarvis-dock{grid-template-columns:auto 1fr}.elyon-jarvis-brand{min-width:0}.elyon-jarvis-brand-copy{display:none}.elyon-jarvis-open{display:none}.elyon-jarvis-command button{padding:10px}.elyon-jarvis-panel{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function statusLabel(value) {
    return ({
      ready: "BEREIT",
      thinking: "DENKT",
      working: "ARBEITET",
      waiting: "WARTET AUF FREIGABE",
      warning: "HINWEIS",
      error: "FEHLER",
      offline: "OFFLINE",
    })[value] || "BEREIT";
  }

  function setStatus(value) {
    state.status = value;
    const dock = document.getElementById(DOCK_ID);
    if (dock) {
      dock.dataset.state = value;
      dock.querySelectorAll("[data-jarvis-state]").forEach((node) => { node.textContent = statusLabel(value); });
    }
    const panel = document.getElementById(PANEL_ID);
    panel?.querySelectorAll("[data-jarvis-state]").forEach((node) => { node.textContent = statusLabel(value); });
  }

  function ensurePanel() {
    let backdrop = document.getElementById(PANEL_ID);
    if (backdrop) return backdrop;
    backdrop = document.createElement("div");
    backdrop.id = PANEL_ID;
    backdrop.className = "elyon-jarvis-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    backdrop.innerHTML = `
      <aside class="elyon-jarvis-panel" role="dialog" aria-modal="true" aria-label="Elyon Jarvis">
        <header class="elyon-jarvis-panel-head">
          <div class="elyon-jarvis-panel-brand"><button class="elyon-jarvis-orb" type="button" aria-label="Jarvis Status"></button><div><h2>ELYON JARVIS</h2><p data-jarvis-state>${statusLabel(state.status)}</p></div></div>
          <button class="elyon-jarvis-close" type="button" data-jarvis-close>✕</button>
        </header>
        <div class="elyon-jarvis-quick">
          <button type="button" data-jarvis-quick="status">Status heute</button>
          <button type="button" data-jarvis-quick="products">Produkte prüfen</button>
          <button type="button" data-jarvis-quick="errors">Blocker prüfen</button>
        </div>
        <div class="elyon-jarvis-feed" data-jarvis-feed><div class="elyon-jarvis-empty">Jarvis ist bereit. Gib einen Auftrag ein oder lass zuerst einen sicheren Plan erstellen.</div></div>
        <form class="elyon-jarvis-panel-form" data-jarvis-panel-form>
          <textarea data-jarvis-panel-input placeholder="Frag Jarvis oder gib einen Auftrag …"></textarea>
          <div class="elyon-jarvis-panel-actions"><button type="button" class="elyon-jarvis-plan" data-jarvis-plan>Planen</button><button type="button" class="elyon-jarvis-execute" data-jarvis-execute>Ausführen</button></div>
        </form>
      </aside>`;
    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop || event.target.closest("[data-jarvis-close]")) closePanel();
      const quick = event.target.closest("[data-jarvis-quick]")?.dataset.jarvisQuick;
      if (quick) handleQuick(quick);
      if (event.target.closest("[data-jarvis-plan]")) runPanel(false);
      if (event.target.closest("[data-jarvis-execute]")) runPanel(true);
      if (event.target.closest("[data-jarvis-run-last]") && state.lastPlannedCommand) runCommand(state.lastPlannedCommand, true);
    });
    backdrop.querySelector("[data-jarvis-panel-input]")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        runPanel(false);
      }
    });
    return backdrop;
  }

  function ensureDock() {
    let dock = document.getElementById(DOCK_ID);
    if (dock) return dock;
    const host = document.querySelector("main.container") || document.querySelector(".container") || document.body;
    const hero = host.querySelector?.(".hero");
    const tabs = host.querySelector?.(".tabs");
    dock = document.createElement("section");
    dock.id = DOCK_ID;
    dock.className = "elyon-jarvis-dock";
    dock.dataset.state = state.status;
    dock.innerHTML = `
      <div class="elyon-jarvis-brand"><button type="button" class="elyon-jarvis-orb" data-jarvis-open aria-label="Jarvis öffnen"></button><div class="elyon-jarvis-brand-copy"><strong>JARVIS</strong><span class="elyon-jarvis-state" data-jarvis-state>${statusLabel(state.status)}</span></div></div>
      <form class="elyon-jarvis-command" data-jarvis-dock-form><input data-jarvis-dock-input placeholder="Frag Jarvis oder gib einen Auftrag …" autocomplete="off"><button type="submit">Planen</button></form>
      <button type="button" class="elyon-jarvis-open" data-jarvis-open>Öffnen</button>`;

    if (tabs?.parentElement === host) host.insertBefore(dock, tabs);
    else if (hero?.parentElement === host) hero.insertAdjacentElement("afterend", dock);
    else host.prepend(dock);

    dock.addEventListener("click", (event) => {
      if (event.target.closest("[data-jarvis-open]")) openPanel();
    });
    dock.querySelector("[data-jarvis-dock-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = dock.querySelector("[data-jarvis-dock-input]");
      const command = text(input?.value);
      if (!command) return openPanel();
      if (input) input.value = "";
      openPanel();
      runCommand(command, false);
    });
    return dock;
  }

  function ensureMenuEntry() {
    const menu = document.getElementById("mainMenu");
    if (!menu) return false;
    if (!state.lastMenuValue || state.lastMenuValue === MENU_VALUE) state.lastMenuValue = menu.value;
    if (!menu.querySelector(`option[value="${MENU_VALUE}"]`)) {
      const option = document.createElement("option");
      option.value = MENU_VALUE;
      option.textContent = "◉ JARVIS";
      option.className = "elyon-jarvis-menu-option";
      const agents = menu.querySelector('option[value="virtualAgentsTab"]');
      if (agents) agents.insertAdjacentElement("afterend", option);
      else menu.appendChild(option);
    }
    if (menu.dataset.elyonJarvisBound !== "1") {
      menu.dataset.elyonJarvisBound = "1";
      menu.addEventListener("change", (event) => {
        if (menu.value !== MENU_VALUE) {
          state.lastMenuValue = menu.value;
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        menu.value = state.lastMenuValue || "dashboardTab";
        openPanel();
      }, true);
    }
    return true;
  }

  function openPanel() {
    const panel = ensurePanel();
    state.open = true;
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => panel.querySelector("[data-jarvis-panel-input]")?.focus({ preventScroll: true }));
  }

  function closePanel() {
    const panel = document.getElementById(PANEL_ID);
    state.open = false;
    panel?.classList.remove("open");
    panel?.setAttribute("aria-hidden", "true");
  }

  function timeLabel() {
    return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date());
  }

  function pushHistory(entry) {
    state.history.push(entry);
    if (state.history.length > HISTORY_LIMIT) state.history.shift();
    renderFeed();
  }

  function planMarkup(payload) {
    const plan = payload?.plan || {};
    const delegations = Array.isArray(plan.delegations) ? plan.delegations : [];
    const summary = text(payload?.summary?.summary || payload?.summary || plan.summary || plan.objective, "Plan erstellt.");
    return `${escapeHtml(summary)}${delegations.length ? `<div class="elyon-jarvis-delegations">${delegations.map((item, index) => `<div class="elyon-jarvis-delegation"><b>${index + 1}. ${escapeHtml(item.agentName || item.agentId)}</b><br>${escapeHtml(item.capability || item.reason || "Aufgabe")}</div>`).join("")}</div>` : ""}<button type="button" class="elyon-jarvis-run-last" data-jarvis-run-last>Plan jetzt ausführen</button>`;
  }

  function executeMarkup(payload) {
    const runs = Array.isArray(payload?.runs) ? payload.runs : [];
    const summary = text(payload?.summary?.summary || payload?.summary || "Jarvis hat den Auftrag bearbeitet.");
    const runMarkup = runs.length ? `<div class="elyon-jarvis-delegations">${runs.map((run, index) => {
      const result = run?.payload?.result || run?.payload?.task?.result || {};
      const label = run.ok ? "✓" : "✕";
      return `<div class="elyon-jarvis-delegation"><b>${label} ${index + 1}. ${escapeHtml(run.agentName || run.agentId)}</b><br>${escapeHtml(result.summary || run.message || "Bearbeitet")}</div>`;
    }).join("")}</div>` : "";
    return `${escapeHtml(summary)}${runMarkup}`;
  }

  function renderFeed() {
    const feed = document.querySelector(`#${PANEL_ID} [data-jarvis-feed]`);
    if (!feed) return;
    if (!state.history.length) {
      feed.innerHTML = '<div class="elyon-jarvis-empty">Jarvis ist bereit. Gib einen Auftrag ein oder lass zuerst einen sicheren Plan erstellen.</div>';
      return;
    }
    feed.innerHTML = state.history.map((entry) => `<article class="elyon-jarvis-message ${escapeHtml(entry.kind || "jarvis")}"><div class="elyon-jarvis-message-head"><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.time)}</small></div><p>${entry.html || escapeHtml(entry.text)}</p></article>`).join("");
    feed.scrollTop = feed.scrollHeight;
  }

  function setBusy(busy, execute = false) {
    state.busy = busy;
    setStatus(busy ? (execute ? "working" : "thinking") : "ready");
    document.querySelectorAll(`#${DOCK_ID} button,#${PANEL_ID} button`).forEach((button) => { button.disabled = busy; });
  }

  async function runCommand(command, execute = false) {
    const normalized = text(command);
    if (!normalized || state.busy) return null;
    openPanel();
    state.lastCommand = normalized;
    pushHistory({ kind: "user", title: "Du", text: normalized, time: timeLabel() });
    setBusy(true, execute);
    try {
      if (!window.ElyonJarvis) throw new Error("Jarvis-Client ist noch nicht geladen.");
      const options = { input: contextSnapshot() };
      const payload = execute
        ? await window.ElyonJarvis.execute(normalized, options)
        : await window.ElyonJarvis.plan(normalized, options);
      if (!execute) state.lastPlannedCommand = normalized;
      pushHistory({
        kind: "jarvis",
        title: execute ? "Jarvis · Ergebnis" : "Jarvis · Plan",
        html: execute ? executeMarkup(payload) : planMarkup(payload),
        time: timeLabel(),
      });
      const blocked = payload?.plan?.status === "blocked" || payload?.summary?.status === "blocked";
      setStatus(blocked ? "warning" : "ready");
      window.dispatchEvent(new CustomEvent("elyon:jarvis-ui-result", { detail: { command: normalized, execute, payload } }));
      return payload;
    } catch (error) {
      const status = Number(error?.status || 0);
      setStatus(status === 0 || status >= 500 ? "offline" : "error");
      pushHistory({ kind: "error", title: "Jarvis · Fehler", text: error?.message || "Jarvis konnte den Auftrag nicht bearbeiten.", time: timeLabel() });
      return null;
    } finally {
      state.busy = false;
      document.querySelectorAll(`#${DOCK_ID} button,#${PANEL_ID} button`).forEach((button) => { button.disabled = false; });
    }
  }

  function runPanel(execute) {
    const input = document.querySelector(`#${PANEL_ID} [data-jarvis-panel-input]`);
    const command = text(input?.value);
    if (!command) return;
    if (input) input.value = "";
    runCommand(command, execute);
  }

  async function handleQuick(kind) {
    if (kind === "status") {
      openPanel();
      setBusy(true, false);
      try {
        if (!window.ElyonJarvis) throw new Error("Jarvis-Client ist noch nicht geladen.");
        const payload = await window.ElyonJarvis.status();
        const agents = Array.isArray(payload?.agents) ? payload.agents : [];
        pushHistory({ kind: "jarvis", title: "Jarvis · Systemstatus", text: `Jarvis ist ${payload?.jarvis === "ready" ? "bereit" : text(payload?.jarvis, "online")}. ${agents.filter((agent) => agent.enabled !== false).length} Mitarbeiter sind verfügbar.`, time: timeLabel() });
        setStatus("ready");
      } catch (error) {
        setStatus("offline");
        pushHistory({ kind: "error", title: "Jarvis · Statusfehler", text: error?.message || "Status konnte nicht geladen werden.", time: timeLabel() });
      } finally {
        state.busy = false;
        document.querySelectorAll(`#${DOCK_ID} button,#${PANEL_ID} button`).forEach((button) => { button.disabled = false; });
      }
      return;
    }
    if (kind === "products") return runCommand("Prüfe das aktuell ausgewählte Produkt vollständig und plane die nötigen Fachagenten.", false);
    if (kind === "errors") return runCommand("Prüfe die vorhandenen Aufgaben auf Fehler, Blocker und offene Entscheidungen und nenne die nächsten sinnvollen Schritte.", false);
  }

  function mount() {
    if (state.mounted) return true;
    installStyles();
    ensurePanel();
    ensureDock();
    ensureMenuEntry();
    state.mounted = true;
    setStatus(document.body?.dataset?.sellerAuthenticated === "false" ? "offline" : "ready");
    return true;
  }

  function refresh() {
    installStyles();
    ensurePanel();
    ensureDock();
    ensureMenuEntry();
    return true;
  }

  window.addEventListener("elyon:seller-authenticated", () => setStatus("ready"));
  window.addEventListener("elyon:seller-auth-ready", (event) => setStatus(event.detail?.authenticated ? "ready" : "offline"));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.open) closePanel();
  });

  window.ElyonJarvisUI = Object.freeze({
    mount,
    refresh,
    open: openPanel,
    close: closePanel,
    plan: (command) => runCommand(command, false),
    execute: (command) => runCommand(command, true),
    state: () => ({ ...state, history: [...state.history] }),
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
