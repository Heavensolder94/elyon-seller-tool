(() => {
  "use strict";

  const STYLE_ID = "elyonJarvisD1Styles";
  const DOCK_ID = "elyonJarvisDock";
  const PANEL_ID = "elyonJarvisPanel";
  const MENU_VALUE = "__elyon_jarvis_panel__";
  const HISTORY_LIMIT = 20;
  const TASKS_KEY = "elyon_ai_workforce_tasks";
  const PRODUCT_KEYS = ["elyonProducts", "elyonSellerProducts", "sellerProductMaster", "elyonProductMaster"];
  const POSITION_KEY = "elyon_jarvis_floating_position_v1";
  const MINIMIZED_KEY = "elyon_jarvis_floating_minimized_v1";
  const EDGE_GAP = 18;

  const state = {
    mounted: false,
    open: false,
    minimized: false,
    busy: false,
    status: "ready",
    lastMenuValue: "",
    lastCommand: "",
    lastPlannedCommand: "",
    history: [],
    drag: null,
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

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be unavailable in private/restricted browser contexts.
    }
  }

  function readBoolean(key, fallback = false) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return raw === "1" || raw === "true";
    } catch {
      return fallback;
    }
  }

  function writeBoolean(key, value) {
    try {
      localStorage.setItem(key, value ? "1" : "0");
    } catch {
      // Ignore storage errors.
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
      :root{--elyon-jarvis-cyan:#38bdf8;--elyon-jarvis-blue:#2563eb;--elyon-jarvis-bg:rgba(5,14,28,.88);--elyon-jarvis-border:rgba(125,211,252,.42)}
      .elyon-jarvis-floating{position:fixed;z-index:22000;left:calc(100vw - 500px);top:calc(100vh - 530px);width:min(460px,calc(100vw - 36px));max-height:min(650px,calc(100vh - 36px));color:#e5e7eb;filter:drop-shadow(0 28px 70px rgba(0,0,0,.42));touch-action:none;transition:filter .16s ease,opacity .16s ease}.elyon-jarvis-floating.dragging{filter:drop-shadow(0 34px 90px rgba(14,165,233,.2));transition:none}.elyon-jarvis-floating.minimized{width:auto;max-height:none}
      .elyon-jarvis-panel{position:relative;display:flex;flex-direction:column;width:100%;min-height:420px;max-height:min(650px,calc(100vh - 36px));overflow:hidden;border-radius:24px;border:1px solid var(--elyon-jarvis-border);background:linear-gradient(160deg,rgba(3,12,24,.95),rgba(9,23,43,.9) 54%,rgba(5,16,31,.94));box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 0 0 1px rgba(56,189,248,.05),0 0 38px rgba(14,165,233,.13);backdrop-filter:blur(24px) saturate(135%);-webkit-backdrop-filter:blur(24px) saturate(135%)}
      .elyon-jarvis-panel:before,.elyon-jarvis-panel:after{content:"";position:absolute;pointer-events:none;z-index:3}.elyon-jarvis-panel:before{inset:9px;border-radius:18px;background:linear-gradient(90deg,rgba(56,189,248,.7),transparent 16%,transparent 84%,rgba(56,189,248,.7)) top/100% 1px no-repeat,linear-gradient(90deg,rgba(56,189,248,.35),transparent 22%,transparent 78%,rgba(56,189,248,.35)) bottom/100% 1px no-repeat;opacity:.36}.elyon-jarvis-panel:after{left:22px;right:22px;top:0;height:2px;background:linear-gradient(90deg,transparent,rgba(125,211,252,.95),transparent);box-shadow:0 0 18px rgba(56,189,248,.7);opacity:.7}
      .elyon-jarvis-panel-head{position:relative;z-index:4;padding:14px 15px 13px;display:flex;justify-content:space-between;gap:12px;align-items:center;border-bottom:1px solid rgba(148,163,184,.12);cursor:grab;user-select:none;background:linear-gradient(180deg,rgba(15,35,59,.48),rgba(2,6,23,.08))}.elyon-jarvis-panel-head:active{cursor:grabbing}.elyon-jarvis-drag-grip{position:absolute;left:50%;top:6px;transform:translateX(-50%);display:grid;grid-template-columns:repeat(4,3px);gap:3px;opacity:.72}.elyon-jarvis-drag-grip i{width:3px;height:3px;border-radius:50%;background:#67e8f9;box-shadow:0 0 8px rgba(34,211,238,.8)}
      .elyon-jarvis-panel-brand{display:flex;align-items:center;gap:11px}.elyon-jarvis-orb{width:42px;height:42px;border-radius:999px;display:grid;place-items:center;border:1px solid rgba(125,211,252,.7);background:radial-gradient(circle at 38% 32%,#f0f9ff 0 5%,#67e8f9 9%,#0ea5e9 22%,#2563eb 46%,#071225 72%);box-shadow:0 0 0 5px rgba(14,165,233,.07),0 0 28px rgba(34,211,238,.48);cursor:pointer;position:relative;flex:0 0 auto}.elyon-jarvis-orb:before{content:"";position:absolute;inset:-7px;border:1px dashed rgba(56,189,248,.3);border-radius:999px;animation:elyonJarvisSpin 12s linear infinite}.elyon-jarvis-orb:after{content:"";position:absolute;inset:6px;border:1px solid rgba(255,255,255,.52);border-radius:999px}.elyon-jarvis-panel-brand h2{margin:0;font-size:14px;letter-spacing:.16em}.elyon-jarvis-panel-brand p{margin:3px 0 0;color:#7dd3fc;font-size:9px;font-weight:850;letter-spacing:.1em}.elyon-jarvis-panel-tools{display:flex;align-items:center;gap:6px}.elyon-jarvis-icon-button{width:32px;height:32px;display:grid;place-items:center;padding:0!important;border-radius:10px!important;background:rgba(255,255,255,.045)!important;border:1px solid rgba(148,163,184,.14)!important;color:#cbd5e1!important;font-size:13px!important}.elyon-jarvis-icon-button:hover{background:rgba(56,189,248,.1)!important;border-color:rgba(125,211,252,.3)!important;color:#e0f2fe!important}
      .elyon-jarvis-status-strip{position:relative;z-index:2;padding:11px 15px 2px;display:flex;align-items:center;justify-content:space-between;gap:12px}.elyon-jarvis-status-copy strong{display:block;font-size:12px;color:#e0f2fe}.elyon-jarvis-status-copy span{display:block;margin-top:3px;font-size:10px;color:#8fa2b8}.elyon-jarvis-live{display:flex;align-items:center;gap:6px;font-size:9px;font-weight:900;letter-spacing:.1em;color:#86efac}.elyon-jarvis-live:before{content:"";width:6px;height:6px;border-radius:50%;background:#4ade80;box-shadow:0 0 12px rgba(74,222,128,.85)}
      .elyon-jarvis-quick{position:relative;z-index:2;display:grid;grid-template-columns:repeat(3,1fr);gap:7px;padding:11px 15px 12px}.elyon-jarvis-quick button{padding:9px 9px;border-radius:11px;font-size:10px;background:linear-gradient(180deg,rgba(14,165,233,.11),rgba(37,99,235,.07));border:1px solid rgba(96,165,250,.18);color:#dbeafe}.elyon-jarvis-quick button:hover{border-color:rgba(125,211,252,.38);background:rgba(14,165,233,.14)}
      .elyon-jarvis-feed{position:relative;z-index:2;flex:1;min-height:150px;overflow:auto;padding:2px 15px 12px;display:grid;align-content:start;gap:9px;overscroll-behavior:contain}.elyon-jarvis-empty{padding:17px;border-radius:15px;border:1px dashed rgba(125,211,252,.2);background:linear-gradient(135deg,rgba(14,165,233,.04),rgba(37,99,235,.025));color:#8fa2b8;font-size:11px;line-height:1.55;text-align:center}.elyon-jarvis-message{padding:11px 12px;border-radius:14px;background:rgba(15,31,50,.56);border:1px solid rgba(148,163,184,.12)}.elyon-jarvis-message.user{background:rgba(37,99,235,.09);border-color:rgba(96,165,250,.18)}.elyon-jarvis-message.error{background:rgba(127,29,29,.12);border-color:rgba(248,113,113,.22)}.elyon-jarvis-message-head{display:flex;justify-content:space-between;gap:8px;margin-bottom:6px}.elyon-jarvis-message-head strong{font-size:11px}.elyon-jarvis-message-head small{font-size:9px;color:#71849a}.elyon-jarvis-message p{margin:0;color:#cbd5e1;font-size:11px;line-height:1.55}.elyon-jarvis-delegations{display:grid;gap:6px;margin-top:9px}.elyon-jarvis-delegation{padding:8px 9px;border-radius:10px;background:rgba(2,6,23,.38);border:1px solid rgba(148,163,184,.1);font-size:10px;color:#cbd5e1}.elyon-jarvis-delegation b{color:#e5e7eb}.elyon-jarvis-run-last{margin-top:10px;padding:8px 10px!important;border-radius:10px!important;font-size:10px!important}
      .elyon-jarvis-panel-form{position:relative;z-index:2;padding:12px 15px 15px;border-top:1px solid rgba(148,163,184,.12);background:rgba(2,6,23,.26)}.elyon-jarvis-panel-form textarea{min-height:66px;max-height:130px;resize:vertical;margin:0 0 9px!important;padding:11px 12px!important;border-radius:13px!important;font-size:12px!important;background:rgba(2,6,23,.55)!important;border-color:rgba(125,211,252,.16)!important}.elyon-jarvis-panel-actions{display:flex;gap:8px}.elyon-jarvis-panel-actions button{flex:1;padding:9px 10px;border-radius:11px;font-size:11px}.elyon-jarvis-execute{background:linear-gradient(135deg,#0ea5e9,#2563eb)!important}.elyon-jarvis-plan{background:rgba(255,255,255,.055)!important;border:1px solid rgba(148,163,184,.14)!important;color:#dbeafe!important}
      .elyon-jarvis-dock{display:none;position:relative;align-items:center;gap:10px;padding:9px 11px 9px 9px;border-radius:999px;border:1px solid rgba(125,211,252,.4);background:linear-gradient(135deg,rgba(4,13,26,.94),rgba(11,29,50,.9));box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 18px 48px rgba(0,0,0,.38),0 0 28px rgba(14,165,233,.13);backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);cursor:grab;user-select:none}.elyon-jarvis-floating.minimized .elyon-jarvis-panel{display:none}.elyon-jarvis-floating.minimized .elyon-jarvis-dock{display:flex}.elyon-jarvis-dock .elyon-jarvis-orb{width:40px;height:40px}.elyon-jarvis-dock-copy{min-width:76px}.elyon-jarvis-dock-copy strong{display:block;font-size:11px;letter-spacing:.14em}.elyon-jarvis-state{display:block;margin-top:2px;color:#7dd3fc;font-size:8px;font-weight:900;letter-spacing:.09em}.elyon-jarvis-dock-open{width:28px;height:28px;padding:0!important;border-radius:999px!important;background:rgba(56,189,248,.08)!important;border:1px solid rgba(125,211,252,.2)!important;color:#bae6fd!important}.elyon-jarvis-floating[data-state="thinking"] .elyon-jarvis-orb,.elyon-jarvis-floating[data-state="working"] .elyon-jarvis-orb{animation:elyonJarvisPulse 1.15s ease-in-out infinite}.elyon-jarvis-floating[data-state="warning"] .elyon-jarvis-state{color:#fde68a}.elyon-jarvis-floating[data-state="error"] .elyon-jarvis-state,.elyon-jarvis-floating[data-state="offline"] .elyon-jarvis-state{color:#fca5a5}.elyon-jarvis-floating[data-state="error"] .elyon-jarvis-orb,.elyon-jarvis-floating[data-state="offline"] .elyon-jarvis-orb{filter:saturate(.45)}
      @keyframes elyonJarvisPulse{0%,100%{box-shadow:0 0 0 5px rgba(14,165,233,.07),0 0 24px rgba(34,211,238,.35)}50%{box-shadow:0 0 0 10px rgba(14,165,233,.025),0 0 42px rgba(34,211,238,.7)}}@keyframes elyonJarvisSpin{to{transform:rotate(360deg)}}
      .elyon-jarvis-menu-option{font-weight:900}.elyon-jarvis-floating button:disabled{opacity:.5;cursor:wait!important}
      @media(max-width:760px){.elyon-jarvis-floating{left:12px!important;right:12px!important;top:auto!important;bottom:12px!important;width:auto!important;max-height:calc(100vh - 24px)}.elyon-jarvis-panel{min-height:390px;max-height:calc(100vh - 24px);border-radius:20px}.elyon-jarvis-panel-head{cursor:default}.elyon-jarvis-drag-grip{display:none}.elyon-jarvis-quick{grid-template-columns:1fr}.elyon-jarvis-floating.minimized{left:auto!important;right:12px!important}.elyon-jarvis-floating.minimized .elyon-jarvis-dock{display:flex}.elyon-jarvis-dock-copy{display:none}}
      @media(prefers-reduced-motion:reduce){.elyon-jarvis-orb:before,.elyon-jarvis-floating[data-state="thinking"] .elyon-jarvis-orb,.elyon-jarvis-floating[data-state="working"] .elyon-jarvis-orb{animation:none!important}}
    `;
    style.textContent += `.elyon-jarvis-rich{display:grid;gap:5px}.elyon-jarvis-rich strong{color:#f1f5f9}.elyon-jarvis-rich hr{width:100%;margin:4px 0;border:0;border-top:1px solid rgba(148,163,184,.18)}.elyon-jarvis-rich-line{display:block}.elyon-jarvis-rich-list{display:grid;gap:4px;margin:2px 0 2px 4px;padding-left:14px;color:#cbd5e1}.elyon-jarvis-rich-list li{padding-left:2px}`;
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
    const shell = document.getElementById(PANEL_ID);
    if (!shell) return;
    shell.dataset.state = value;
    shell.querySelectorAll("[data-jarvis-state]").forEach((node) => { node.textContent = statusLabel(value); });
    shell.querySelectorAll("[data-jarvis-live]").forEach((node) => {
      node.textContent = value === "offline" ? "OFFLINE" : "ONLINE";
    });
  }

  function defaultPosition(shell) {
    const rect = shell.getBoundingClientRect();
    return {
      x: Math.max(EDGE_GAP, window.innerWidth - rect.width - EDGE_GAP),
      y: Math.max(EDGE_GAP, window.innerHeight - Math.min(rect.height, 520) - EDGE_GAP),
    };
  }

  function clampPosition(shell, position) {
    const rect = shell.getBoundingClientRect();
    const maxX = Math.max(EDGE_GAP, window.innerWidth - rect.width - EDGE_GAP);
    const maxY = Math.max(EDGE_GAP, window.innerHeight - rect.height - EDGE_GAP);
    return {
      x: Math.min(Math.max(EDGE_GAP, Number(position?.x) || EDGE_GAP), maxX),
      y: Math.min(Math.max(EDGE_GAP, Number(position?.y) || EDGE_GAP), maxY),
    };
  }

  function applyPosition(position, persist = false) {
    const shell = document.getElementById(PANEL_ID);
    if (!shell || window.matchMedia("(max-width: 760px)").matches) return;
    const next = clampPosition(shell, position || defaultPosition(shell));
    shell.style.left = `${Math.round(next.x)}px`;
    shell.style.top = `${Math.round(next.y)}px`;
    shell.style.right = "auto";
    shell.style.bottom = "auto";
    if (persist) writeJson(POSITION_KEY, next);
  }

  function restorePosition() {
    const shell = document.getElementById(PANEL_ID);
    if (!shell) return;
    if (window.matchMedia("(max-width: 760px)").matches) {
      shell.style.left = "";
      shell.style.top = "";
      shell.style.right = "";
      shell.style.bottom = "";
      return;
    }
    const stored = readJson(POSITION_KEY, null);
    requestAnimationFrame(() => applyPosition(stored || defaultPosition(shell), false));
  }

  function snapAndSave() {
    const shell = document.getElementById(PANEL_ID);
    if (!shell || window.matchMedia("(max-width: 760px)").matches) return;
    const rect = shell.getBoundingClientRect();
    const maxX = Math.max(EDGE_GAP, window.innerWidth - rect.width - EDGE_GAP);
    const maxY = Math.max(EDGE_GAP, window.innerHeight - rect.height - EDGE_GAP);
    let x = rect.left;
    let y = rect.top;
    const snapDistance = 28;
    if (Math.abs(x - EDGE_GAP) <= snapDistance) x = EDGE_GAP;
    if (Math.abs(x - maxX) <= snapDistance) x = maxX;
    if (Math.abs(y - EDGE_GAP) <= snapDistance) y = EDGE_GAP;
    if (Math.abs(y - maxY) <= snapDistance) y = maxY;
    applyPosition({ x, y }, true);
  }

  function beginDrag(event) {
    if (window.matchMedia("(max-width: 760px)").matches || event.button !== 0) return;
    if (event.target.closest("button,input,textarea,a,select")) return;
    const shell = document.getElementById(PANEL_ID);
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    state.drag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    shell.classList.add("dragging");
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event) {
    if (!state.drag || event.pointerId !== state.drag.pointerId) return;
    applyPosition({
      x: event.clientX - state.drag.offsetX,
      y: event.clientY - state.drag.offsetY,
    }, false);
  }

  function endDrag(event) {
    if (!state.drag || event.pointerId !== state.drag.pointerId) return;
    const shell = document.getElementById(PANEL_ID);
    shell?.classList.remove("dragging");
    try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch {}
    state.drag = null;
    snapAndSave();
  }

  function bindDrag(handle) {
    if (!handle || handle.dataset.jarvisDragBound === "1") return;
    handle.dataset.jarvisDragBound = "1";
    handle.addEventListener("pointerdown", beginDrag);
    handle.addEventListener("pointermove", moveDrag);
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
  }

  function setMinimized(value, persist = true) {
    const shell = ensurePanel();
    const rectBefore = shell.getBoundingClientRect();
    state.minimized = Boolean(value);
    state.open = !state.minimized;
    shell.classList.toggle("minimized", state.minimized);
    shell.setAttribute("aria-expanded", state.minimized ? "false" : "true");
    if (persist) writeBoolean(MINIMIZED_KEY, state.minimized);
    if (!window.matchMedia("(max-width: 760px)").matches) {
      requestAnimationFrame(() => {
        const rectAfter = shell.getBoundingClientRect();
        const x = Math.min(rectBefore.left, Math.max(EDGE_GAP, window.innerWidth - rectAfter.width - EDGE_GAP));
        const y = Math.min(rectBefore.top, Math.max(EDGE_GAP, window.innerHeight - rectAfter.height - EDGE_GAP));
        applyPosition({ x, y }, true);
      });
    }
  }

  function ensurePanel() {
    let shell = document.getElementById(PANEL_ID);
    if (shell) return shell;
    shell = document.createElement("section");
    shell.id = PANEL_ID;
    shell.className = "elyon-jarvis-floating";
    shell.dataset.state = state.status;
    shell.setAttribute("aria-label", "Elyon Jarvis");
    shell.setAttribute("aria-expanded", "true");
    shell.innerHTML = `
      <aside class="elyon-jarvis-panel" role="dialog" aria-label="Elyon Jarvis Command Center">
        <header class="elyon-jarvis-panel-head" data-jarvis-drag-handle>
          <span class="elyon-jarvis-drag-grip" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
          <div class="elyon-jarvis-panel-brand"><button class="elyon-jarvis-orb" type="button" data-jarvis-status-orb aria-label="Jarvis Status"></button><div><h2>ELYON JARVIS</h2><p data-jarvis-state>${statusLabel(state.status)}</p></div></div>
          <div class="elyon-jarvis-panel-tools"><button class="elyon-jarvis-icon-button" type="button" data-jarvis-minimize aria-label="Jarvis minimieren">—</button></div>
        </header>
        <div class="elyon-jarvis-status-strip"><div class="elyon-jarvis-status-copy"><strong>Jarvis Command HUD</strong><span>Schwebend · verschiebbar · Position wird gespeichert</span></div><span class="elyon-jarvis-live" data-jarvis-live>${state.status === "offline" ? "OFFLINE" : "ONLINE"}</span></div>
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
      </aside>
      <div id="${DOCK_ID}" class="elyon-jarvis-dock" data-jarvis-drag-handle role="button" tabindex="0" aria-label="Jarvis öffnen">
        <button type="button" class="elyon-jarvis-orb" data-jarvis-open aria-label="Jarvis öffnen"></button>
        <div class="elyon-jarvis-dock-copy"><strong>JARVIS</strong><span class="elyon-jarvis-state" data-jarvis-state>${statusLabel(state.status)}</span></div>
        <button type="button" class="elyon-jarvis-dock-open" data-jarvis-open aria-label="Jarvis öffnen">⌃</button>
      </div>`;
    document.body.appendChild(shell);

    shell.addEventListener("click", (event) => {
      if (event.target.closest("[data-jarvis-minimize]")) setMinimized(true);
      if (event.target.closest("[data-jarvis-open]")) openPanel();
      if (event.target.closest("[data-jarvis-status-orb]")) handleQuick("status");
      const quick = event.target.closest("[data-jarvis-quick]")?.dataset.jarvisQuick;
      if (quick) handleQuick(quick);
      if (event.target.closest("[data-jarvis-plan]")) runPanel(false);
      if (event.target.closest("[data-jarvis-execute]")) runPanel(true);
      if (event.target.closest("[data-jarvis-run-last]") && state.lastPlannedCommand) runCommand(state.lastPlannedCommand, true);
    });
    shell.querySelector("[data-jarvis-panel-input]")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        runPanel(false);
      }
    });
    shell.querySelector(`#${DOCK_ID}`)?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPanel();
      }
    });
    shell.querySelectorAll("[data-jarvis-drag-handle]").forEach(bindDrag);
    state.minimized = readBoolean(MINIMIZED_KEY, false);
    state.open = !state.minimized;
    shell.classList.toggle("minimized", state.minimized);
    restorePosition();
    return shell;
  }

  function ensureDock() {
    ensurePanel();
    return document.getElementById(DOCK_ID);
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
    setMinimized(false);
    panel.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => panel.querySelector("[data-jarvis-panel-input]")?.focus({ preventScroll: true }));
  }

  function closePanel() {
    setMinimized(true);
  }

  function timeLabel() {
    return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date());
  }

  function richText(value) {
    const source = text(value);
    if (!source) return "";
    const lines = escapeHtml(source).split(/\r?\n/);
    const output = [];
    let list = [];
    const flushList = () => {
      if (!list.length) return;
      output.push(`<ul class="elyon-jarvis-rich-list">${list.join("")}</ul>`);
      list = [];
    };
    for (const line of lines) {
      const clean = line.trim();
      if (!clean) { flushList(); output.push("<span class=\"elyon-jarvis-rich-line\"></span>"); continue; }
      if (/^---+$/.test(clean)) { flushList(); output.push("<hr>"); continue; }
      const bullet = clean.match(/^(?:[-*]|\d+[.)])\s+(.+)/);
      if (bullet) {
        list.push(`<li>${bullet[1].replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>`);
        continue;
      }
      flushList();
      output.push(`<span class="elyon-jarvis-rich-line">${clean.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</span>`);
    }
    flushList();
    return `<div class="elyon-jarvis-rich">${output.join("")}</div>`;
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
    const scout = payload?.marketScoutPlan;
    const scoutMarkup = scout ? `<div class="elyon-jarvis-market-plan"><strong>Market Scout V1</strong><br>${escapeHtml(String(scout.requestedCount))} Kandidaten, Draft-/Read-only-Recherche. Keine Produkte, Listings oder Lieferanten werden verändert.</div>` : "";
    return `${richText(summary)}${scoutMarkup}${delegations.length ? `<div class="elyon-jarvis-delegations">${delegations.map((item, index) => `<div class="elyon-jarvis-delegation"><b>${index + 1}. ${escapeHtml(item.agentName || item.agentId)}</b><br>${escapeHtml(item.capability || item.reason || "Aufgabe")}</div>`).join("")}</div>` : ""}<button type="button" class="elyon-jarvis-run-last" data-jarvis-run-last>Plan jetzt ausführen</button>`;
  }

  function executeMarkup(payload) {
    const runs = Array.isArray(payload?.runs) ? payload.runs : [];
    const summary = text(payload?.summary?.summary || payload?.summary || "Jarvis hat den Auftrag bearbeitet.");
    const runMarkup = runs.length ? `<div class="elyon-jarvis-delegations">${runs.map((run, index) => {
      const result = run?.payload?.result || run?.payload?.task?.result || {};
      const label = run.ok ? "✓" : "✕";
      return `<div class="elyon-jarvis-delegation"><b>${label} ${index + 1}. ${escapeHtml(run.agentName || run.agentId)}</b><br>${escapeHtml(result.summary || run.message || "Bearbeitet")}</div>`;
    }).join("")}</div>` : "";
    const scout = payload?.marketScout;
    const candidateMarkup = scout?.candidates?.length ? `<div class="elyon-jarvis-market-grid">${scout.candidates.map((item) => `<div class="elyon-jarvis-market-card"><strong>${escapeHtml(item.rank + ". " + item.productName)}</strong><small>${escapeHtml(item.category || "")} · ${escapeHtml(item.status === "needs_research" ? "Weitere Recherche nötig" : "Recherche belegt")}</small><div>${escapeHtml(item.demandSignal)} · Wettbewerb: ${escapeHtml(item.competitionLevel)} · Risiko: ${escapeHtml(item.riskLevel)}</div><div>EK: ${item.purchasePrice == null ? "nicht belegt" : escapeHtml(String(item.purchasePrice))} · VK: ${item.sellingPrice == null ? "nicht belegt" : escapeHtml(String(item.sellingPrice))} · Marge: ${item.estimatedMarginPercent == null ? "nicht berechnet" : escapeHtml(String(item.estimatedMarginPercent)) + "%"}</div><p>${escapeHtml(item.rationale || "Keine zusätzliche Begründung")}</p>${item.supplierUrl ? `<a href="${escapeHtml(item.supplierUrl)}" target="_blank" rel="noreferrer">Quelle öffnen</a>` : "<small>Keine verifizierte Quelle geliefert</small>"}</div>`).join("")}</div>` : "";
    return `${richText(summary)}${scout?.warnings?.length ? richText("Warnungen:\n" + scout.warnings.map((w) => "- " + w).join("\n")) : ""}${candidateMarkup}${runMarkup}`;
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
    document.querySelectorAll(`#${PANEL_ID} button`).forEach((button) => { button.disabled = busy; });
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
      document.querySelectorAll(`#${PANEL_ID} button`).forEach((button) => { button.disabled = false; });
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
        document.querySelectorAll(`#${PANEL_ID} button`).forEach((button) => { button.disabled = false; });
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
    restorePosition();
    return true;
  }

  window.addEventListener("elyon:seller-authenticated", () => setStatus("ready"));
  window.addEventListener("elyon:seller-auth-ready", (event) => setStatus(event.detail?.authenticated ? "ready" : "offline"));
  window.addEventListener("resize", () => restorePosition());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.open) closePanel();
  });

  window.ElyonJarvisUI = Object.freeze({
    mount,
    refresh,
    open: openPanel,
    close: closePanel,
    minimize: () => setMinimized(true),
    plan: (command) => runCommand(command, false),
    execute: (command) => runCommand(command, true),
    state: () => ({ ...state, drag: null, history: [...state.history] }),
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
