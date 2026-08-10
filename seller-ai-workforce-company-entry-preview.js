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
        gap:4px;
        align-items:center;
        margin:0 auto 18px;
        padding:4px;
        width:max-content;
        max-width:100%;
        border:1px solid rgba(255,255,255,.065);
        border-radius:9px;
        background:#0f151d;
      }
      #${SWITCHER_ID} button{
        min-height:30px!important;
        padding:5px 9px!important;
        border-radius:7px!important;
        border-color:transparent!important;
        background:transparent!important;
        color:#8d98a7!important;
        font-size:10px!important;
        font-weight:590!important;
        box-shadow:none!important;
      }
      #${SWITCHER_ID} button.active{
        color:#f4f6f8!important;
        background:#182230!important;
        border-color:rgba(79,140,255,.18)!important;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.025)!important;
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

      /* Compact Seller-OS density for the company structure */
      #elyonAiWorkforce:has(.aiw-org) .aiw-org{
        gap:22px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-head{
        gap:16px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-head h3{
        font-size:20px!important;
        font-weight:650!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-head p{
        margin-top:5px!important;
        font-size:11px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-manager-wrap{
        padding-bottom:28px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-manager-wrap:after{
        height:28px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-manager{
        width:min(800px,100%)!important;
        gap:18px!important;
        padding:17px 19px!important;
        border-radius:12px!important;
        border-color:rgba(79,140,255,.25)!important;
        box-shadow:0 6px 18px rgba(0,0,0,.07)!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-avatar{
        width:40px!important;
        height:40px!important;
        flex-basis:40px!important;
        border-radius:10px!important;
        font-size:19px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-person{
        gap:11px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-copy h4{
        font-size:14px!important;
        font-weight:640!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-copy p{
        margin-top:6px!important;
        font-size:10px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-manager-side{
        gap:7px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-status,
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-mode{
        min-height:23px!important;
        padding:3px 7px!important;
        font-size:8.5px!important;
        font-weight:560!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-status:before{
        width:6px!important;
        height:6px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-actions{
        gap:6px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-actions button,
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-primary,
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-toggle{
        min-height:31px!important;
        padding:5px 9px!important;
        border-radius:8px!important;
        font-size:10px!important;
        font-weight:590!important;
        box-shadow:none!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-branches{
        gap:18px!important;
        padding-top:28px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-dept:before{
        top:-28px!important;
        height:28px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-card{
        min-height:164px!important;
        gap:11px!important;
        padding:15px!important;
        border-radius:11px!important;
        box-shadow:0 5px 16px rgba(0,0,0,.055)!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-id{
        gap:9px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-id .aiw-org-avatar{
        width:35px!important;
        height:35px!important;
        flex-basis:35px!important;
        font-size:17px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-card .aiw-org-copy h4{
        font-size:13px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-card .aiw-org-copy small{
        font-size:8.5px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-meta{
        gap:7px!important;
        font-size:8.5px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-specialists{
        gap:7px!important;
        margin-top:8px!important;
        padding:10px!important;
        border-radius:9px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-specialist{
        padding:8px 9px!important;
        border-radius:8px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-work{
        gap:14px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-panel,
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-custom{
        padding:14px!important;
        border-radius:10px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-panel h4,
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-custom h4{
        font-size:12px!important;
        font-weight:640!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-count{
        min-width:24px!important;
        height:24px!important;
        font-size:8.5px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-list,
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-custom-list{
        margin-top:9px!important;
        gap:6px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-row,
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-custom-row{
        padding:8px 9px!important;
        border-radius:8px!important;
      }
      #elyonAiWorkforce:has(.aiw-org) .aiw-org-empty{
        margin-top:9px!important;
        padding:11px!important;
        border-radius:8px!important;
      }

      @media(max-width:720px){
        #${SWITCHER_ID}{width:100%;margin-bottom:14px}
        #${SWITCHER_ID} button{flex:1}
        #elyonAiWorkforce:has(.aiw-org) .aiw-org-manager,
        #elyonAiWorkforce:has(.aiw-org) .aiw-org-card,
        #elyonAiWorkforce:has(.aiw-org) .aiw-org-panel,
        #elyonAiWorkforce:has(.aiw-org) .aiw-org-custom{padding:13px!important}
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