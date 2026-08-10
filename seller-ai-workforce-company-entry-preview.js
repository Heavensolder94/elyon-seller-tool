(() => {
  "use strict";

  const STYLE_ID = "elyonCompanyEntryPreviewStyles";
  const SWITCHER_ID = "elyonWorkforceCompanySwitcher";
  const TAB_ID = "virtualAgentsTab";
  const state = { activating: false, requestedView: "company" };

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${SWITCHER_ID}{
        display:flex;
        gap:6px;
        align-items:center;
        margin:0 auto 22px;
        padding:5px;
        width:max-content;
        max-width:100%;
        border:1px solid rgba(255,255,255,.075);
        border-radius:10px;
        background:#0f151d;
      }
      #${SWITCHER_ID} button{
        min-height:34px!important;
        padding:7px 12px!important;
        border-radius:7px!important;
        border-color:transparent!important;
        background:transparent!important;
        color:#8d98a7!important;
        font-size:10px!important;
      }
      #${SWITCHER_ID} button.active{
        color:#f4f6f8!important;
        background:#182230!important;
        border-color:rgba(79,140,255,.22)!important;
        box-shadow:inset 0 0 0 1px rgba(79,140,255,.08);
      }

      #virtualAgentsTab:has(.aiw-org),
      #elyonAiWorkforce.aiw-company-view,
      #elyonAiWorkforce:has(.aiw-org){
        width:100%!important;
        max-width:none!important;
      }
      #elyonAiWorkforce.aiw-company-view,
      #elyonAiWorkforce:has(.aiw-org){
        padding:0!important;
        border:0!important;
        background:transparent!important;
        box-shadow:none!important;
      }

      #elyonAiWorkforce.aiw-company-view .aiw-v3-root,
      #elyonAiWorkforce.aiw-company-view .aiw-v3,
      #elyonAiWorkforce:has(.aiw-org) .aiw-v3-root,
      #elyonAiWorkforce:has(.aiw-org) .aiw-v3{
        display:block!important;
        width:100%!important;
        max-width:none!important;
        padding:0!important;
        border:0!important;
        background:transparent!important;
        box-shadow:none!important;
      }

      #elyonAiWorkforce.aiw-company-view .aiw-v3-command,
      #elyonAiWorkforce.aiw-company-view .aiw-v4-workbar,
      #elyonAiWorkforce.aiw-company-view .aiw-v3-nav,
      #elyonAiWorkforce.aiw-company-view .aiw-v3-side,
      #elyonAiWorkforce.aiw-company-view .aiw-v3-hero,
      #elyonAiWorkforce.aiw-company-view .aiw-v3-section-head,
      #elyonAiWorkforce:has(.aiw-org) .aiw-v3-command,
      #elyonAiWorkforce:has(.aiw-org) .aiw-v4-workbar,
      #elyonAiWorkforce:has(.aiw-org) .aiw-v3-nav,
      #elyonAiWorkforce:has(.aiw-org) .aiw-v3-side,
      #elyonAiWorkforce:has(.aiw-org) .aiw-v3-hero,
      #elyonAiWorkforce:has(.aiw-org) .aiw-v3-section-head{
        display:none!important;
      }

      #elyonAiWorkforce.aiw-company-view .aiw-v3-layout,
      #elyonAiWorkforce:has(.aiw-org) .aiw-v3-layout{
        display:block!important;
        width:100%!important;
        max-width:none!important;
      }
      #elyonAiWorkforce.aiw-company-view .aiw-v3-main,
      #elyonAiWorkforce:has(.aiw-org) .aiw-v3-main{
        display:block!important;
        width:100%!important;
        max-width:none!important;
        padding:0!important;
        margin:0!important;
      }
      #elyonAiWorkforce.aiw-company-view .aiw-v3-section,
      #elyonAiWorkforce:has(.aiw-org) .aiw-v3-section{
        width:100%!important;
        max-width:none!important;
        margin:0!important;
        padding:0!important;
        border:0!important;
        background:transparent!important;
        box-shadow:none!important;
      }
      #elyonAiWorkforce.aiw-company-view .aiw-v3-agent-list,
      #elyonAiWorkforce:has(.aiw-org) .aiw-v3-agent-list{
        width:100%!important;
        max-width:none!important;
        margin:0!important;
      }

      @media(max-width:720px){
        #${SWITCHER_ID}{width:100%;margin-bottom:16px}
        #${SWITCHER_ID} button{flex:1}
      }
    `;
    document.head.appendChild(style);
  }

  function virtualAreaIsActive() {
    if (document.getElementById(TAB_ID)?.classList.contains("active")) return true;
    return document.getElementById("mainMenu")?.value === TAB_ID;
  }

  function ensureSwitcher() {
    const shell = document.getElementById("elyonAiWorkforce");
    if (!shell) return null;
    let switcher = document.getElementById(SWITCHER_ID);
    if (!switcher) {
      switcher = document.createElement("nav");
      switcher.id = SWITCHER_ID;
      switcher.setAttribute("aria-label", "Virtuelle Mitarbeiter Ansichten");
      switcher.innerHTML = '<button type="button" data-company-view="company">🏢 Firmenstruktur</button><button type="button" data-company-view="advanced">⚙ Erweiterte Steuerung</button>';
      shell.prepend(switcher);
    }
    switcher.querySelectorAll("[data-company-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.companyView === state.requestedView);
      button.setAttribute("aria-pressed", button.classList.contains("active") ? "true" : "false");
    });
    return switcher;
  }

  function finalizeCompanyView() {
    const shell = document.getElementById("elyonAiWorkforce");
    const org = shell?.querySelector(".aiw-org");
    if (!shell || !org) return false;
    state.requestedView = "company";
    shell.classList.add("aiw-company-view");
    ensureSwitcher();
    return true;
  }

  function renderCompanyTree() {
    window.ElyonAIWorkforceTeamV6?.render?.();
    window.ElyonAIWorkforceOrgchartV1?.render?.();
    return finalizeCompanyView();
  }

  function activateCompanyView() {
    if (state.activating || state.requestedView !== "company" || !virtualAreaIsActive()) return false;
    const shell = document.getElementById("elyonAiWorkforce");
    const teamButton = shell?.querySelector('[data-v3-view="team"]');
    if (!shell) return false;
    ensureSwitcher();
    if (!teamButton) return false;

    state.activating = true;
    try {
      if (!teamButton.classList.contains("active")) teamButton.click();
      renderCompanyTree();
      requestAnimationFrame(() => {
        renderCompanyTree();
        window.setTimeout(renderCompanyTree, 35);
      });
      return true;
    } finally {
      state.activating = false;
    }
  }

  function scheduleActivation() {
    [0, 80, 250, 700].forEach((delay) => window.setTimeout(activateCompanyView, delay));
  }

  function openAdvanced(view = "product") {
    state.requestedView = "advanced";
    const shell = document.getElementById("elyonAiWorkforce");
    shell?.classList.remove("aiw-company-view");
    ensureSwitcher();
    const button = shell?.querySelector(`[data-v3-view="${view}"]`);
    button?.click();
    ensureSwitcher();
  }

  function handleClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const viewButton = target.closest("[data-company-view]");
    if (viewButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (viewButton.dataset.companyView === "advanced") {
        openAdvanced("product");
      } else {
        state.requestedView = "company";
        ensureSwitcher();
        scheduleActivation();
      }
      return;
    }

    const team = target.closest('[data-v3-view="team"]');
    if (team && state.requestedView === "company") scheduleActivation();

    const tabTrigger = target.closest(`[data-tab="${TAB_ID}"],[data-tab-id="${TAB_ID}"],[data-target-tab="${TAB_ID}"],[data-sd-tab="${TAB_ID}"],[data-seller-open-tab="${TAB_ID}"]`);
    if (tabTrigger) {
      state.requestedView = "company";
      scheduleActivation();
    }
  }

  function install() {
    installStyles();
    document.addEventListener("click", handleClick, true);
    document.addEventListener("change", (event) => {
      if (event.target?.id === "mainMenu" && event.target.value === TAB_ID) {
        state.requestedView = "company";
        scheduleActivation();
      }
    }, true);
    window.addEventListener("elyon:runtime-group-loaded", (event) => {
      if (event.detail?.tabId === TAB_ID) {
        ensureSwitcher();
        if (state.requestedView === "company") scheduleActivation();
      }
    });
    window.addEventListener("elyon:tab-changed", (event) => {
      const tabId = event.detail?.tabId || event.detail;
      if (tabId === TAB_ID) {
        state.requestedView = "company";
        scheduleActivation();
      }
    });
    window.addEventListener("elyon:ai-workforce-team-v6-rendered", () => {
      if (state.requestedView !== "company") return;
      window.ElyonAIWorkforceOrgchartV1?.render?.();
      requestAnimationFrame(finalizeCompanyView);
    });
    if (virtualAreaIsActive()) scheduleActivation();
  }

  window.ElyonAIWorkforceCompanyEntryPreview = {
    activate: activateCompanyView,
    openAdvanced,
    showCompany: () => {
      state.requestedView = "company";
      scheduleActivation();
    },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
