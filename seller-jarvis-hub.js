(() => {
  "use strict";

  const TOP_TAB_ID = "jarvisCommandCenterTab";
  const INTEGRATION_TAB_ID = "jarvisIntegrationCenterTab";
  const BRAIN_HOST_ID = "jarvisBrainControlPersistentHost";
  const HUB_ID = "jarvisUnifiedHubHost";
  const STYLE_ID = "jarvisUnifiedHubStyles";
  const VERSION = "v1";

  const AREAS = Object.freeze([
    { id: "overview", label: "Übersicht", icon: "◉" },
    { id: "brain", label: "Brain", icon: "◇" },
    { id: "integrations", label: "Integrationen", icon: "⌘" },
    { id: "models", label: "Modelle", icon: "◆" },
    { id: "system", label: "System", icon: "⚙" },
  ]);

  const SUBVIEWS = Object.freeze({
    integrations: Object.freeze([
      { id: "apis", label: "APIs & Provider" },
      { id: "routing", label: "Routing" },
    ]),
    system: Object.freeze([
      { id: "overview", label: "Status" },
      { id: "logs", label: "Logs" },
      { id: "costs", label: "Kosten" },
    ]),
  });

  const AREA_DEFAULT_VIEW = Object.freeze({
    integrations: "apis",
    models: "models",
    system: "overview",
  });

  const state = {
    area: "overview",
    subviews: { integrations: "apis", system: "overview" },
    scheduled: false,
  };

  let menuObserver = null;
  let topObserver = null;
  let integrationObserver = null;
  let lateObserver = null;
  let observedMenu = null;
  let observedTop = null;
  let observedIntegration = null;

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${HUB_ID}{display:none;margin:0 0 16px;padding:18px 20px;border-radius:26px;background:radial-gradient(circle at 8% 0,rgba(59,130,246,.18),transparent 34%),linear-gradient(145deg,rgba(7,17,31,.96),rgba(15,23,42,.86));border:1px solid rgba(96,165,250,.2);box-shadow:0 20px 60px rgba(2,6,23,.22)}
      body[data-jarvis-hub-open="1"] #${HUB_ID}{display:block}
      .jarvis-hub-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}.jarvis-hub-brand{display:flex;gap:12px;align-items:flex-start}.jarvis-hub-orb{width:42px;height:42px;display:grid;place-items:center;flex:0 0 auto;border-radius:15px;background:radial-gradient(circle at 35% 30%,rgba(224,242,254,.94),rgba(56,189,248,.66) 14%,rgba(37,99,235,.27) 48%,rgba(15,23,42,.75) 74%);border:1px solid rgba(125,211,252,.4);color:#e0f2fe;box-shadow:0 0 28px rgba(56,189,248,.16)}.jarvis-hub-kicker{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#60a5fa;font-weight:950}.jarvis-hub-title{margin:3px 0 0;font-size:22px;letter-spacing:-.035em;color:#f1f7ff}.jarvis-hub-subtitle{margin:5px 0 0;color:#8fa2b8;font-size:10px;line-height:1.5}.jarvis-hub-version{padding:6px 9px;border-radius:999px;border:1px solid rgba(96,165,250,.18);background:rgba(59,130,246,.08);color:#bfdbfe;font-size:8px;font-weight:900;white-space:nowrap}.jarvis-hub-nav{display:flex;gap:7px;flex-wrap:wrap;margin-top:17px;padding-top:14px;border-top:1px solid rgba(148,163,184,.09)}.jarvis-hub-tab{display:inline-flex;align-items:center;gap:6px;padding:9px 12px;border-radius:12px;border:1px solid rgba(148,163,184,.12);background:rgba(255,255,255,.045);color:#91a4ba;font-size:10px;font-weight:850}.jarvis-hub-tab:hover{border-color:rgba(96,165,250,.25);color:#dbeafe}.jarvis-hub-tab.active{color:#fff;border-color:rgba(96,165,250,.34);background:linear-gradient(135deg,rgba(37,99,235,.28),rgba(109,40,217,.2));box-shadow:0 8px 24px rgba(37,99,235,.08)}.jarvis-hub-subnav{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.jarvis-hub-subtab{padding:6px 9px;border-radius:10px;border:1px solid rgba(148,163,184,.1);background:rgba(2,6,23,.3);color:#71849a;font-size:9px;font-weight:800}.jarvis-hub-subtab.active{color:#bfdbfe;border-color:rgba(96,165,250,.22);background:rgba(59,130,246,.09)}
      body[data-jarvis-hub-open="1"][data-jarvis-hub-area="overview"] #${TOP_TAB_ID}{display:block!important}
      body[data-jarvis-hub-open="1"]:not([data-jarvis-hub-area="overview"]) #${TOP_TAB_ID}{display:none!important}
      body[data-jarvis-hub-open="1"][data-jarvis-hub-area="brain"] #${BRAIN_HOST_ID}{display:block!important}
      body[data-jarvis-hub-open="1"]:not([data-jarvis-hub-area="brain"]) #${BRAIN_HOST_ID}{display:none!important}
      body[data-jarvis-hub-open="1"][data-jarvis-hub-area="integrations"] #${INTEGRATION_TAB_ID},body[data-jarvis-hub-open="1"][data-jarvis-hub-area="models"] #${INTEGRATION_TAB_ID},body[data-jarvis-hub-open="1"][data-jarvis-hub-area="system"] #${INTEGRATION_TAB_ID}{display:block!important}
      body[data-jarvis-hub-open="1"] #${INTEGRATION_TAB_ID} .jic-tabs{display:none!important}
      body[data-jarvis-hub-open="1"] #${INTEGRATION_TAB_ID}{margin-top:0}
      @media(max-width:620px){#${HUB_ID}{padding:15px}.jarvis-hub-head{display:grid}.jarvis-hub-version{justify-self:start}.jarvis-hub-tab{flex:1 1 auto;justify-content:center}}
    `;
    document.head.appendChild(style);
  }

  function ensureHub() {
    installStyles();
    let hub = document.getElementById(HUB_ID);
    const top = document.getElementById(TOP_TAB_ID);
    if (!top?.parentNode) return hub;
    if (!hub) {
      hub = document.createElement("section");
      hub.id = HUB_ID;
      hub.dataset.jarvisHubVersion = VERSION;
      top.insertAdjacentElement("beforebegin", hub);
    } else if (hub.nextElementSibling !== top && top.parentNode === hub.parentNode) {
      top.insertAdjacentElement("beforebegin", hub);
    }
    renderHub();
    return hub;
  }

  function currentSubview(area = state.area) {
    if (area === "models") return "models";
    return state.subviews[area] || AREA_DEFAULT_VIEW[area] || "";
  }

  function renderHub() {
    const hub = document.getElementById(HUB_ID);
    if (!hub) return false;
    const subviews = SUBVIEWS[state.area] || [];
    const activeSubview = currentSubview();
    hub.innerHTML = `
      <div class="jarvis-hub-head">
        <div class="jarvis-hub-brand">
          <div class="jarvis-hub-orb">◉</div>
          <div><div class="jarvis-hub-kicker">Elyon Intelligence & Automation Core</div><h2 class="jarvis-hub-title">JARVIS</h2><p class="jarvis-hub-subtitle">Eine Steuerzentrale für Betrieb, Brain, Integrationen, Modelle und Systemdiagnose.</p></div>
        </div>
        <span class="jarvis-hub-version">UNIFIED CONTROL</span>
      </div>
      <nav class="jarvis-hub-nav" aria-label="JARVIS Bereiche">
        ${AREAS.map((area) => `<button type="button" class="jarvis-hub-tab ${state.area === area.id ? "active" : ""}" data-jarvis-hub-area="${area.id}"><span>${area.icon}</span>${area.label}</button>`).join("")}
      </nav>
      ${subviews.length ? `<nav class="jarvis-hub-subnav" aria-label="JARVIS Unterbereich">${subviews.map((view) => `<button type="button" class="jarvis-hub-subtab ${activeSubview === view.id ? "active" : ""}" data-jarvis-hub-subview="${view.id}">${view.label}</button>`).join("")}</nav>` : ""}`;
    return true;
  }

  function mainMenu() { return document.getElementById("mainMenu"); }

  function removeLegacyMenuEntry() {
    const menu = mainMenu();
    if (!menu) return false;
    const legacySelected = menu.value === INTEGRATION_TAB_ID;
    menu.querySelectorAll(`option[value="${INTEGRATION_TAB_ID}"]`).forEach((option) => option.remove());
    const jarvis = menu.querySelector(`option[value="${TOP_TAB_ID}"]`);
    if (jarvis) jarvis.textContent = "◉ JARVIS";
    if (legacySelected) {
      state.area = "integrations";
      state.subviews.integrations = "apis";
      if (typeof window.showTab === "function") {
        try { window.showTab(TOP_TAB_ID); } catch { menu.value = TOP_TAB_ID; }
      } else menu.value = TOP_TAB_ID;
    }
    return true;
  }

  function isJarvisRouteActive() {
    const menu = mainMenu();
    const top = document.getElementById(TOP_TAB_ID);
    return Boolean(top?.classList.contains("active") || menu?.value === TOP_TAB_ID);
  }

  function syncOpenState() {
    const body = document.body;
    if (!body) return false;
    const open = isJarvisRouteActive();
    if (open) {
      body.dataset.jarvisHubOpen = "1";
      body.dataset.jarvisHubArea = state.area;
    } else {
      delete body.dataset.jarvisHubOpen;
      delete body.dataset.jarvisHubArea;
    }
    renderHub();
    return open;
  }

  function integrationHeroCopy() {
    if (state.area === "models") return ["KI-Modelle", "Verfügbare Jarvis- und Workforce-Modelle zentral prüfen und lokale Routing-Freigaben verwalten."];
    if (state.area === "system") return ["System & Diagnose", "Runtime-Status, Safety, Telemetrie, Logs und beobachtete Kosten von JARVIS."];
    return ["Integrationen", "APIs, Provider und Routing-Verbindungen von JARVIS in einer gemeinsamen Integrationsansicht."];
  }

  function patchIntegrationHero() {
    if (!["integrations", "models", "system"].includes(state.area)) return false;
    const tab = document.getElementById(INTEGRATION_TAB_ID);
    const title = tab?.querySelector(".jic-title h1");
    const copy = tab?.querySelector(".jic-title p");
    const [headline, description] = integrationHeroCopy();
    if (title) title.textContent = headline;
    if (copy) copy.textContent = description;
    return Boolean(tab);
  }

  function routeIntegration(view) {
    const integration = window.ElyonJarvisIntegrationCenter;
    integration?.refresh?.();
    requestAnimationFrame(() => {
      const tab = document.getElementById(INTEGRATION_TAB_ID);
      const button = tab?.querySelector(`[data-jic-tab="${view}"]`);
      if (button && !button.classList.contains("active")) button.click();
      requestAnimationFrame(() => {
        patchIntegrationHero();
        removeLegacyMenuEntry();
      });
    });
  }

  function refreshArea() {
    if (state.area === "overview") {
      window.ElyonJarvisCommandCenter?.refresh?.();
      return;
    }
    if (state.area === "brain") {
      window.ElyonJarvisFileManager?.refresh?.();
      window.ElyonJarvisFileManagerActions?.bindRoot?.();
      return;
    }
    routeIntegration(currentSubview());
  }

  function activate(area, { subview = "", ensureTopRoute = true } = {}) {
    const valid = AREAS.some((item) => item.id === area) ? area : "overview";
    state.area = valid;
    if (subview && SUBVIEWS[valid]?.some((item) => item.id === subview)) state.subviews[valid] = subview;
    if (ensureTopRoute && !isJarvisRouteActive()) {
      if (typeof window.showTab === "function") {
        try { window.showTab(TOP_TAB_ID); } catch { /* menu fallback below */ }
      }
      const menu = mainMenu();
      if (menu?.querySelector(`option[value="${TOP_TAB_ID}"]`)) menu.value = TOP_TAB_ID;
    }
    ensureHub();
    removeLegacyMenuEntry();
    syncOpenState();
    refreshArea();
    return true;
  }

  function bindHubClicks() {
    if (document.documentElement.dataset.jarvisUnifiedHubBound === "1") return;
    document.documentElement.dataset.jarvisUnifiedHubBound = "1";
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const area = target.closest("[data-jarvis-hub-area]");
      if (area) {
        activate(area.dataset.jarvisHubArea || "overview");
        return;
      }
      const subview = target.closest("[data-jarvis-hub-subview]");
      if (subview) {
        const view = subview.dataset.jarvisHubSubview || "";
        if (SUBVIEWS[state.area]?.some((item) => item.id === view)) {
          state.subviews[state.area] = view;
          renderHub();
          routeIntegration(view);
        }
      }
    });
    document.addEventListener("change", (event) => {
      if (event.target?.id !== "mainMenu") return;
      if (event.target.value === INTEGRATION_TAB_ID) {
        queueMicrotask(() => activate("integrations"));
        return;
      }
      if (event.target.value === TOP_TAB_ID) queueMicrotask(() => { ensureHub(); removeLegacyMenuEntry(); syncOpenState(); refreshArea(); });
      else queueMicrotask(syncOpenState);
    }, true);
  }

  function observeMenu(menu) {
    if (!menu || menu === observedMenu) return;
    menuObserver?.disconnect();
    observedMenu = menu;
    menuObserver = new MutationObserver(() => schedule());
    menuObserver.observe(menu, { childList: true });
  }

  function observeTop(top) {
    if (!top || top === observedTop) return;
    topObserver?.disconnect();
    observedTop = top;
    topObserver = new MutationObserver(() => schedule());
    topObserver.observe(top, { attributes: true, attributeFilter: ["class"] });
  }

  function observeIntegration(tab) {
    if (!tab || tab === observedIntegration) return;
    integrationObserver?.disconnect();
    observedIntegration = tab;
    integrationObserver = new MutationObserver(() => {
      if (["integrations", "models", "system"].includes(state.area) && isJarvisRouteActive()) requestAnimationFrame(patchIntegrationHero);
    });
    integrationObserver.observe(tab, { childList: true, subtree: false, attributes: true, attributeFilter: ["class"] });
  }

  function reconcileLegacyActivation() {
    const legacy = document.getElementById(INTEGRATION_TAB_ID);
    if (!legacy?.classList.contains("active")) return false;
    state.area = state.area === "models" || state.area === "system" ? state.area : "integrations";
    if (typeof window.showTab === "function") {
      try { window.showTab(TOP_TAB_ID); } catch { legacy.classList.remove("active"); }
    } else {
      legacy.classList.remove("active");
      document.getElementById(TOP_TAB_ID)?.classList.add("active");
    }
    return true;
  }

  function reconcile() {
    state.scheduled = false;
    const menu = mainMenu();
    const top = document.getElementById(TOP_TAB_ID);
    const integration = document.getElementById(INTEGRATION_TAB_ID);
    if (!top || !menu) return false;

    lateObserver?.disconnect();
    lateObserver = null;
    ensureHub();
    bindHubClicks();
    observeMenu(menu);
    observeTop(top);
    observeIntegration(integration);
    removeLegacyMenuEntry();
    reconcileLegacyActivation();
    syncOpenState();
    patchIntegrationHero();
    return true;
  }

  function schedule() {
    if (state.scheduled) return;
    state.scheduled = true;
    queueMicrotask(() => requestAnimationFrame(reconcile));
  }

  function waitForRoots() {
    if (reconcile()) return true;
    if (!lateObserver && document.body) {
      lateObserver = new MutationObserver(() => {
        if (document.getElementById(TOP_TAB_ID) && mainMenu()) schedule();
      });
      lateObserver.observe(document.body, { childList: true, subtree: true });
    }
    return false;
  }

  function mount() {
    installStyles();
    bindHubClicks();
    waitForRoots();
    window.addEventListener("elyon:tab-changed", schedule);
    window.addEventListener("elyon:jarvis-command-center-rendered", schedule);
    window.addEventListener("elyon:seller-authenticated", schedule);
    return true;
  }

  window.ElyonJarvisHub = Object.freeze({
    version: VERSION,
    mount,
    refresh: schedule,
    open: (area = "overview") => activate(area),
    activate,
    getArea: () => state.area,
    getSubview: () => currentSubview(),
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
