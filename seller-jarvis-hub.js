(() => {
  "use strict";

  const TOP_TAB_ID = "jarvisCommandCenterTab";
  const INTEGRATION_TAB_ID = "jarvisIntegrationCenterTab";
  const BRAIN_HOST_ID = "jarvisBrainControlPersistentHost";
  const HUB_ID = "jarvisUnifiedHubHost";
  const STYLE_ID = "jarvisUnifiedHubStyles";
  const VERSION = "v2-simple";

  const AREAS = Object.freeze([
    { id: "home", label: "JARVIS", icon: "◉" },
    { id: "brain", label: "Gehirn", icon: "🧠" },
    { id: "system", label: "System", icon: "⚙" },
  ]);

  const SYSTEM_VIEWS = Object.freeze([
    { id: "overview", label: "Status" },
    { id: "apis", label: "Integrationen" },
    { id: "models", label: "KI-Modelle" },
    { id: "routing", label: "Routing" },
    { id: "costs", label: "Kosten" },
    { id: "logs", label: "Logs" },
  ]);

  const AREA_COPY = Object.freeze({
    home: {
      title: "Was ist gerade wichtig?",
      copy: "Gib Jarvis einen Auftrag und sieh nur die Punkte, die deine Aufmerksamkeit brauchen oder zuletzt passiert sind.",
    },
    brain: {
      title: "Das Gehirn von Jarvis",
      copy: "Hier steuerst du, wer Jarvis ist, was er über Elyon weiß, welche Ziele er verfolgt und nach welchen Regeln er arbeitet.",
    },
    system: {
      title: "Ist Jarvis gesund?",
      copy: "Die einfache Ansicht zeigt nur den Betriebszustand. APIs, Modelle, Routing, Kosten und Logs liegen eine Ebene tiefer.",
    },
  });

  const BRAIN_NAMES = Object.freeze({
    "brain.identity": "Identität",
    "brain.elyon_context": "Elyon-Wissen",
    "brain.goals": "Ziele",
    "brain.operating_rules": "Regeln",
    "brain.capabilities": "Fähigkeiten",
    "brain.playbooks": "Abläufe",
  });

  const state = {
    area: "home",
    systemView: "overview",
    advanced: { home: false, brain: false, system: false },
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
      #${HUB_ID}{display:none;margin:0 0 14px;padding:16px 18px;border-radius:24px;background:radial-gradient(circle at 8% 0,rgba(59,130,246,.15),transparent 34%),linear-gradient(145deg,rgba(7,17,31,.96),rgba(15,23,42,.86));border:1px solid rgba(96,165,250,.18);box-shadow:0 18px 54px rgba(2,6,23,.2)}
      body[data-jarvis-hub-open="1"] #${HUB_ID}{display:block}
      .jarvis-hub-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.jarvis-hub-brand{display:flex;gap:11px;align-items:center}.jarvis-hub-orb{width:38px;height:38px;display:grid;place-items:center;flex:0 0 auto;border-radius:14px;background:radial-gradient(circle at 35% 30%,rgba(224,242,254,.94),rgba(56,189,248,.66) 14%,rgba(37,99,235,.27) 48%,rgba(15,23,42,.75) 74%);border:1px solid rgba(125,211,252,.38);color:#e0f2fe;box-shadow:0 0 24px rgba(56,189,248,.14)}.jarvis-hub-kicker{font-size:8px;letter-spacing:.13em;text-transform:uppercase;color:#60a5fa;font-weight:950}.jarvis-hub-title{margin:2px 0 0;font-size:20px;letter-spacing:-.035em;color:#f1f7ff}.jarvis-hub-version{padding:5px 8px;border-radius:999px;border:1px solid rgba(96,165,250,.16);background:rgba(59,130,246,.06);color:#9fbde7;font-size:7px;font-weight:900;white-space:nowrap}.jarvis-hub-nav{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px;padding-top:13px;border-top:1px solid rgba(148,163,184,.08)}.jarvis-hub-tab{display:inline-flex;align-items:center;gap:7px;padding:10px 14px;border-radius:12px;border:1px solid rgba(148,163,184,.11);background:rgba(255,255,255,.035);color:#91a4ba;font-size:10px;font-weight:850}.jarvis-hub-tab:hover{border-color:rgba(96,165,250,.24);color:#dbeafe}.jarvis-hub-tab.active{color:#fff;border-color:rgba(96,165,250,.32);background:linear-gradient(135deg,rgba(37,99,235,.25),rgba(109,40,217,.16));box-shadow:0 8px 22px rgba(37,99,235,.07)}.jarvis-hub-context{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-top:12px;padding:12px 13px;border-radius:15px;background:rgba(2,6,23,.24);border:1px solid rgba(148,163,184,.07)}.jarvis-hub-context strong{display:block;font-size:12px;color:#e6eef9}.jarvis-hub-context p{margin:4px 0 0;color:#8294aa;font-size:9px;line-height:1.5;max-width:760px}.jarvis-hub-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.jarvis-hub-action{padding:7px 9px;border-radius:10px;border:1px solid rgba(148,163,184,.11);background:rgba(255,255,255,.045);color:#cbd5e1;font-size:8px;font-weight:850;white-space:nowrap}.jarvis-hub-action.primary{border-color:rgba(96,165,250,.25);background:rgba(37,99,235,.14);color:#dbeafe}.jarvis-hub-subnav{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.jarvis-hub-subtab{padding:7px 9px;border-radius:10px;border:1px solid rgba(148,163,184,.09);background:rgba(2,6,23,.28);color:#71849a;font-size:8px;font-weight:800}.jarvis-hub-subtab.active{color:#bfdbfe;border-color:rgba(96,165,250,.21);background:rgba(59,130,246,.08)}

      body[data-jarvis-hub-open="1"][data-jarvis-hub-area="home"] #${TOP_TAB_ID}{display:block!important}
      body[data-jarvis-hub-open="1"]:not([data-jarvis-hub-area="home"]) #${TOP_TAB_ID}{display:none!important}
      body[data-jarvis-hub-open="1"][data-jarvis-hub-area="brain"] #${BRAIN_HOST_ID}{display:block!important}
      body[data-jarvis-hub-open="1"]:not([data-jarvis-hub-area="brain"]) #${BRAIN_HOST_ID}{display:none!important}
      body[data-jarvis-hub-open="1"][data-jarvis-hub-area="system"] #${INTEGRATION_TAB_ID}{display:block!important}
      body[data-jarvis-hub-open="1"]:not([data-jarvis-hub-area="system"]) #${INTEGRATION_TAB_ID}{display:none!important}
      body[data-jarvis-hub-open="1"] #${INTEGRATION_TAB_ID} .jic-tabs{display:none!important}
      body[data-jarvis-hub-open="1"] #${INTEGRATION_TAB_ID}{margin-top:0}

      body[data-jarvis-hub-open="1"][data-jarvis-hub-area="home"][data-jarvis-hub-advanced="0"] #${TOP_TAB_ID} .jarvis-cc-metrics{display:none!important}
      body[data-jarvis-hub-open="1"][data-jarvis-hub-area="home"][data-jarvis-hub-advanced="0"] #${TOP_TAB_ID} .jarvis-cc-grid>.jarvis-cc-card:nth-child(2),body[data-jarvis-hub-open="1"][data-jarvis-hub-area="home"][data-jarvis-hub-advanced="0"] #${TOP_TAB_ID} .jarvis-cc-grid>.jarvis-cc-card:nth-child(4){display:none!important}
      body[data-jarvis-hub-open="1"][data-jarvis-hub-area="home"][data-jarvis-hub-advanced="0"] #${TOP_TAB_ID} .jarvis-cc>.jarvis-cc-card{display:none!important}
      body[data-jarvis-hub-open="1"][data-jarvis-hub-area="home"][data-jarvis-hub-advanced="0"] #${TOP_TAB_ID} .jarvis-cc-grid{grid-template-columns:repeat(2,minmax(0,1fr))}

      body[data-jarvis-hub-open="1"][data-jarvis-hub-area="brain"][data-jarvis-hub-advanced="0"] #${BRAIN_HOST_ID} .jarvis-fm-head,body[data-jarvis-hub-open="1"][data-jarvis-hub-area="brain"][data-jarvis-hub-advanced="0"] #${BRAIN_HOST_ID} .jarvis-fm-health-grid,body[data-jarvis-hub-open="1"][data-jarvis-hub-area="brain"][data-jarvis-hub-advanced="0"] #${BRAIN_HOST_ID} .jarvis-fm-statusline,body[data-jarvis-hub-open="1"][data-jarvis-hub-area="brain"][data-jarvis-hub-advanced="0"] #${BRAIN_HOST_ID} .jarvis-fm-toolbar,body[data-jarvis-hub-open="1"][data-jarvis-hub-area="brain"][data-jarvis-hub-advanced="0"] #${BRAIN_HOST_ID} .jarvis-fm-file-title code,body[data-jarvis-hub-open="1"][data-jarvis-hub-area="brain"][data-jarvis-hub-advanced="0"] #${BRAIN_HOST_ID} .jarvis-fm-file-meta,body[data-jarvis-hub-open="1"][data-jarvis-hub-area="brain"][data-jarvis-hub-advanced="0"] #${BRAIN_HOST_ID} .jarvis-fm-file-note,body[data-jarvis-hub-open="1"][data-jarvis-hub-area="brain"][data-jarvis-hub-advanced="0"] #${BRAIN_HOST_ID} .jarvis-fm-foot{display:none!important}
      body[data-jarvis-hub-open="1"][data-jarvis-hub-area="brain"][data-jarvis-hub-advanced="0"] #${BRAIN_HOST_ID} .jarvis-fm-health{grid-template-columns:1fr;margin-bottom:12px}
      body[data-jarvis-hub-open="1"][data-jarvis-hub-area="brain"][data-jarvis-hub-advanced="0"] #${BRAIN_HOST_ID} .jarvis-fm-file-title strong{font-size:13px}
      body[data-jarvis-hub-open="1"][data-jarvis-hub-area="brain"][data-jarvis-hub-advanced="0"] #${BRAIN_HOST_ID} .jarvis-fm-file-desc{font-size:9px;min-height:32px}
      body[data-jarvis-hub-open="1"][data-jarvis-hub-area="brain"][data-jarvis-hub-advanced="0"] #${BRAIN_HOST_ID} .jarvis-fm-group-count{display:none!important}

      body[data-jarvis-hub-open="1"][data-jarvis-hub-area="system"][data-jarvis-hub-advanced="0"] #${INTEGRATION_TAB_ID} .jic-metrics,body[data-jarvis-hub-open="1"][data-jarvis-hub-area="system"][data-jarvis-hub-advanced="0"] #${INTEGRATION_TAB_ID} .jic-grid,body[data-jarvis-hub-open="1"][data-jarvis-hub-area="system"][data-jarvis-hub-advanced="0"] #${INTEGRATION_TAB_ID} .jic-route,body[data-jarvis-hub-open="1"][data-jarvis-hub-area="system"][data-jarvis-hub-advanced="0"] #${INTEGRATION_TAB_ID} .jic-note{display:none!important}

      @media(max-width:760px){.jarvis-hub-context{display:grid}.jarvis-hub-actions{justify-content:flex-start}body[data-jarvis-hub-open="1"][data-jarvis-hub-area="home"][data-jarvis-hub-advanced="0"] #${TOP_TAB_ID} .jarvis-cc-grid{grid-template-columns:1fr}}
      @media(max-width:620px){#${HUB_ID}{padding:14px}.jarvis-hub-head{display:grid}.jarvis-hub-version{justify-self:start}.jarvis-hub-tab{flex:1 1 auto;justify-content:center}}
    `;
    document.head.appendChild(style);
  }

  function mainMenu() { return document.getElementById("mainMenu"); }

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

  function renderHub() {
    const hub = document.getElementById(HUB_ID);
    if (!hub) return false;
    const copy = AREA_COPY[state.area] || AREA_COPY.home;
    const advanced = Boolean(state.advanced[state.area]);
    const detailLabel = state.area === "home"
      ? (advanced ? "Weniger anzeigen" : "Mehr anzeigen")
      : (advanced ? "Technische Details ausblenden" : "Technische Details");
    const systemSubnav = state.area === "system" && advanced
      ? `<nav class="jarvis-hub-subnav" aria-label="Systemdetails">${SYSTEM_VIEWS.map((view) => `<button type="button" class="jarvis-hub-subtab ${state.systemView === view.id ? "active" : ""}" data-jarvis-system-view="${view.id}">${view.label}</button>`).join("")}</nav>`
      : "";
    const shortcuts = state.area === "home"
      ? `<button type="button" class="jarvis-hub-action" data-jarvis-quick="brain">Gehirn öffnen</button><button type="button" class="jarvis-hub-action" data-jarvis-quick="system">System prüfen</button><button type="button" class="jarvis-hub-action" data-jarvis-quick="agents">Mitarbeiter</button>`
      : "";

    hub.innerHTML = `
      <div class="jarvis-hub-head">
        <div class="jarvis-hub-brand"><div class="jarvis-hub-orb">◉</div><div><div class="jarvis-hub-kicker">Elyon</div><h2 class="jarvis-hub-title">JARVIS</h2></div></div>
        <span class="jarvis-hub-version">SIMPLE CONTROL</span>
      </div>
      <nav class="jarvis-hub-nav" aria-label="JARVIS Bereiche">${AREAS.map((area) => `<button type="button" class="jarvis-hub-tab ${state.area === area.id ? "active" : ""}" data-jarvis-hub-area="${area.id}"><span>${area.icon}</span>${area.label}</button>`).join("")}</nav>
      <div class="jarvis-hub-context"><div><strong>${copy.title}</strong><p>${copy.copy}</p></div><div class="jarvis-hub-actions">${shortcuts}<button type="button" class="jarvis-hub-action primary" data-jarvis-toggle-advanced>${detailLabel}</button></div></div>
      ${systemSubnav}`;
    return true;
  }

  function removeLegacyMenuEntry() {
    const menu = mainMenu();
    if (!menu) return false;
    const legacySelected = menu.value === INTEGRATION_TAB_ID;
    menu.querySelectorAll(`option[value="${INTEGRATION_TAB_ID}"]`).forEach((option) => option.remove());
    const jarvis = menu.querySelector(`option[value="${TOP_TAB_ID}"]`);
    if (jarvis) jarvis.textContent = "◉ JARVIS";
    if (legacySelected) {
      state.area = "system";
      state.systemView = "apis";
      state.advanced.system = true;
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
      body.dataset.jarvisHubAdvanced = state.advanced[state.area] ? "1" : "0";
    } else {
      delete body.dataset.jarvisHubOpen;
      delete body.dataset.jarvisHubArea;
      delete body.dataset.jarvisHubAdvanced;
    }
    renderHub();
    return open;
  }

  function patchHomeCopy() {
    const tab = document.getElementById(TOP_TAB_ID);
    if (!tab) return false;
    const title = tab.querySelector(".jarvis-cc-title h1");
    const copy = tab.querySelector(".jarvis-cc-title p");
    const input = tab.querySelector("[data-jarvis-cc-input]");
    if (title) title.textContent = "JARVIS";
    if (copy) copy.textContent = "Deine Arbeitsoberfläche für Aufträge, wichtige Hinweise und die letzten Aktionen.";
    if (input) input.setAttribute("placeholder", "Was soll ich tun?");
    tab.querySelectorAll(".jarvis-cc-card-head h2").forEach((heading) => {
      if (heading.textContent === "Meine Aufmerksamkeit") heading.textContent = "Braucht deine Aufmerksamkeit";
      if (heading.textContent === "Live-Aktivität") heading.textContent = "Letzte Aktionen";
    });
    return true;
  }

  function patchBrainCopy() {
    const host = document.getElementById(BRAIN_HOST_ID);
    if (!host) return false;
    host.querySelectorAll("[data-jarvis-file-key]").forEach((card) => {
      const key = card.dataset.jarvisFileKey || "";
      const title = card.querySelector(".jarvis-fm-file-title strong");
      if (title && BRAIN_NAMES[key]) title.textContent = BRAIN_NAMES[key];
      card.querySelectorAll(".jarvis-fm-file-actions button").forEach((button) => {
        if (!button.matches("[data-jarvis-file-edit]") && /Öffnen|Review/i.test(button.textContent || "")) button.textContent = "Details";
      });
    });
    const groups = host.querySelectorAll(".jarvis-fm-group");
    const groupCopy = [
      ["Wer Jarvis ist", "Identität, Elyon-Wissen und Ziele"],
      ["Regeln & Fähigkeiten", "Wie Jarvis arbeiten darf und soll"],
      ["Abläufe", "Wiederverwendbare Vorgehensweisen"],
    ];
    groups.forEach((group, index) => {
      const [name, sub] = groupCopy[index] || [];
      if (!name) return;
      const strong = group.querySelector(".jarvis-fm-group-title strong");
      const small = group.querySelector(".jarvis-fm-group-title small");
      if (strong) strong.textContent = name;
      if (small) small.textContent = sub;
    });
    return true;
  }

  function patchSystemCopy() {
    const tab = document.getElementById(INTEGRATION_TAB_ID);
    const title = tab?.querySelector(".jic-title h1");
    const copy = tab?.querySelector(".jic-title p");
    if (title) title.textContent = state.advanced.system && state.systemView !== "overview" ? "System · Technische Details" : "System";
    if (copy) copy.textContent = state.advanced.system
      ? "Technische Diagnose für Integrationen, Modelle, Routing, Kosten und Logs."
      : "Schneller Gesundheitscheck für Brain, Memory, Pipeline und Safety.";
    return Boolean(tab);
  }

  function routeSystem(view = state.systemView) {
    const allowed = SYSTEM_VIEWS.some((item) => item.id === view) ? view : "overview";
    state.systemView = state.advanced.system ? allowed : "overview";
    window.ElyonJarvisIntegrationCenter?.refresh?.();
    requestAnimationFrame(() => {
      const tab = document.getElementById(INTEGRATION_TAB_ID);
      const button = tab?.querySelector(`[data-jic-tab="${state.systemView}"]`);
      if (button && !button.classList.contains("active")) button.click();
      requestAnimationFrame(() => {
        patchSystemCopy();
        removeLegacyMenuEntry();
      });
    });
  }

  function refreshArea() {
    if (state.area === "home") {
      window.ElyonJarvisCommandCenter?.refresh?.();
      requestAnimationFrame(patchHomeCopy);
      return;
    }
    if (state.area === "brain") {
      window.ElyonJarvisFileManager?.refresh?.();
      window.ElyonJarvisFileManagerActions?.bindRoot?.();
      requestAnimationFrame(patchBrainCopy);
      return;
    }
    routeSystem();
  }

  function ensureTopRoute() {
    if (isJarvisRouteActive()) return;
    if (typeof window.showTab === "function") {
      try { window.showTab(TOP_TAB_ID); } catch { /* menu fallback below */ }
    }
    const menu = mainMenu();
    if (menu?.querySelector(`option[value="${TOP_TAB_ID}"]`)) menu.value = TOP_TAB_ID;
  }

  function activate(area, { ensureRoute = true } = {}) {
    state.area = AREAS.some((item) => item.id === area) ? area : "home";
    if (ensureRoute) ensureTopRoute();
    ensureHub();
    removeLegacyMenuEntry();
    syncOpenState();
    refreshArea();
    return true;
  }

  function openExternalTab(tabId) {
    if (typeof window.showTab === "function") {
      try { window.showTab(tabId); } catch { /* menu fallback */ }
    }
    const menu = mainMenu();
    if (menu?.querySelector(`option[value="${tabId}"]`)) {
      menu.value = tabId;
      menu.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function bindHubClicks() {
    if (document.documentElement.dataset.jarvisUnifiedHubBound === "1") return;
    document.documentElement.dataset.jarvisUnifiedHubBound = "1";
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const area = target.closest("[data-jarvis-hub-area]");
      if (area) {
        activate(area.dataset.jarvisHubArea || "home");
        return;
      }
      if (target.closest("[data-jarvis-toggle-advanced]")) {
        state.advanced[state.area] = !state.advanced[state.area];
        if (state.area === "system" && !state.advanced.system) state.systemView = "overview";
        syncOpenState();
        refreshArea();
        return;
      }
      const systemView = target.closest("[data-jarvis-system-view]");
      if (systemView) {
        state.systemView = systemView.dataset.jarvisSystemView || "overview";
        renderHub();
        routeSystem(state.systemView);
        return;
      }
      const quick = target.closest("[data-jarvis-quick]");
      if (quick) {
        const action = quick.dataset.jarvisQuick || "";
        if (action === "brain" || action === "system") activate(action);
        else if (action === "agents") openExternalTab("virtualAgentsTab");
      }
    });
    document.addEventListener("change", (event) => {
      if (event.target?.id !== "mainMenu") return;
      if (event.target.value === INTEGRATION_TAB_ID) {
        queueMicrotask(() => {
          state.advanced.system = true;
          state.systemView = "apis";
          activate("system");
        });
        return;
      }
      if (event.target.value === TOP_TAB_ID) queueMicrotask(() => { ensureHub(); removeLegacyMenuEntry(); syncOpenState(); refreshArea(); });
      else queueMicrotask(syncOpenState);
    }, true);
  }

  function schedule() {
    if (state.scheduled) return;
    state.scheduled = true;
    queueMicrotask(() => {
      state.scheduled = false;
      ensureHub();
      removeLegacyMenuEntry();
      syncOpenState();
      if (state.area === "home") patchHomeCopy();
      else if (state.area === "brain") patchBrainCopy();
      else patchSystemCopy();
      observeKnownNodes();
    });
  }

  function observeKnownNodes() {
    const menu = mainMenu();
    const top = document.getElementById(TOP_TAB_ID);
    const integration = document.getElementById(INTEGRATION_TAB_ID);
    if (menu && menu !== observedMenu) {
      menuObserver?.disconnect();
      observedMenu = menu;
      menuObserver = new MutationObserver(schedule);
      menuObserver.observe(menu, { childList: true });
    }
    if (top && top !== observedTop) {
      topObserver?.disconnect();
      observedTop = top;
      topObserver = new MutationObserver(schedule);
      topObserver.observe(top, { attributes: true, attributeFilter: ["class"] });
    }
    if (integration && integration !== observedIntegration) {
      integrationObserver?.disconnect();
      observedIntegration = integration;
      integrationObserver = new MutationObserver(() => {
        if (state.area === "system" && isJarvisRouteActive()) requestAnimationFrame(patchSystemCopy);
      });
      integrationObserver.observe(integration, { childList: true, subtree: true });
    }
  }

  function mount() {
    installStyles();
    ensureHub();
    removeLegacyMenuEntry();
    bindHubClicks();
    observeKnownNodes();
    syncOpenState();
    refreshArea();
    if (!lateObserver && document.body) {
      lateObserver = new MutationObserver(schedule);
      lateObserver.observe(document.body, { childList: true, subtree: false });
    }
    window.addEventListener("elyon:jarvis-command-center-rendered", () => requestAnimationFrame(() => { patchHomeCopy(); schedule(); }));
    window.addEventListener("elyon:tab-changed", schedule);
    window.addEventListener("elyon:seller-authenticated", schedule);
    return true;
  }

  window.ElyonJarvisHub = Object.freeze({
    mount,
    refresh: schedule,
    open: (area = "home") => activate(area),
    state,
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
