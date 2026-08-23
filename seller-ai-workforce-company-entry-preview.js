(() => {
  "use strict";

  const STYLE_ID = "elyonCompanyEntryPreviewStyles";
  const TAB_ID = "virtualAgentsTab";
  const ROOT_ID = "virtualAgentsSettingsRoot";
  const COMPANY_HOST_ID = "elyonWorkforceCompanyHost";
  const ADVANCED_HOST_ID = "elyonWorkforceAdvancedHost";
  const ADVANCED_TOOLBAR_ID = "elyonWorkforceAdvancedToolbar";
  const state = { requestedView: "company" };

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID}{width:100%}
      #${COMPANY_HOST_ID},#${ADVANCED_HOST_ID}{width:100%;min-width:0}
      #${ROOT_ID}[data-workforce-owner="company"]>#${COMPANY_HOST_ID}{display:block!important}
      #${ROOT_ID}[data-workforce-owner="company"]>#${ADVANCED_HOST_ID}{display:none!important}
      #${ROOT_ID}[data-workforce-owner="company"]>:not(#${COMPANY_HOST_ID}):not(#${ADVANCED_HOST_ID}){display:none!important}
      #${ROOT_ID}[data-workforce-owner="advanced"]>#${COMPANY_HOST_ID}{display:none!important}
      #${ROOT_ID}[data-workforce-owner="advanced"]>#${ADVANCED_HOST_ID}{display:grid!important;gap:14px}

      #${ADVANCED_TOOLBAR_ID}{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;border:1px solid rgba(96,165,250,.16);border-radius:12px;background:#101923}
      #${ADVANCED_TOOLBAR_ID} strong{font-size:13px;color:#e5e7eb}
      #${ADVANCED_TOOLBAR_ID} span{display:block;margin-top:3px;color:#7f8b99;font-size:9px;line-height:1.4}
      #${ADVANCED_TOOLBAR_ID} button{min-height:32px!important;padding:6px 10px!important;border-radius:8px!important;font-size:9px!important}

      #${COMPANY_HOST_ID} .aiw-org{width:100%!important;max-width:1280px!important;margin:0 auto!important}
      @media(min-width:1500px){#${COMPANY_HOST_ID} .aiw-org{max-width:1420px!important}}

      #${TAB_ID}:has(#${ROOT_ID}[data-workforce-owner="company"])>.card{
        padding:0!important;
        border:0!important;
        background:transparent!important;
        box-shadow:none!important;
        backdrop-filter:none!important;
      }
      #${TAB_ID}:has(#${ROOT_ID}[data-workforce-owner="company"])>.card>.settings-agents-header{display:none!important}
      #${TAB_ID}:has(#${ROOT_ID}[data-workforce-owner="company"]) #${ROOT_ID}{display:block!important;margin:0!important;gap:0!important}

      body:has(#${TAB_ID}.active) .elyon-jarvis-floating.minimized{display:none!important}

      @media(max-width:720px){
        #${ADVANCED_TOOLBAR_ID}{align-items:flex-start;flex-direction:column}
        #${ADVANCED_TOOLBAR_ID} button{width:100%}
      }
    `;
    document.head.appendChild(style);
  }

  function virtualAreaIsActive() {
    if (document.getElementById(TAB_ID)?.classList.contains("active")) return true;
    return document.getElementById("mainMenu")?.value === TAB_ID;
  }

  function root() {
    return document.getElementById(ROOT_ID);
  }

  function ensureHosts() {
    const target = root();
    if (!target) return null;

    let company = document.getElementById(COMPANY_HOST_ID);
    if (!company) {
      company = document.createElement("div");
      company.id = COMPANY_HOST_ID;
      company.setAttribute("data-elyon-workforce-company-host", "true");
      target.prepend(company);
    } else if (company.parentElement !== target) {
      target.prepend(company);
    }

    let advanced = document.getElementById(ADVANCED_HOST_ID);
    if (!advanced) {
      advanced = document.createElement("div");
      advanced.id = ADVANCED_HOST_ID;
      advanced.setAttribute("data-elyon-workforce-advanced-host", "true");
      target.appendChild(advanced);
    } else if (advanced.parentElement !== target) {
      target.appendChild(advanced);
    }

    let toolbar = document.getElementById(ADVANCED_TOOLBAR_ID);
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.id = ADVANCED_TOOLBAR_ID;
      toolbar.innerHTML = '<div><strong>Technische Workforce-Steuerung</strong><span>Modelle, Autonomie, Agenten und Diagnose. Das Team-Cockpit bleibt die normale Mitarbeiteransicht.</span></div><button type="button" class="secondary" data-company-view="company">← Team-Cockpit</button>';
      advanced.prepend(toolbar);
    } else if (toolbar.parentElement !== advanced) {
      advanced.prepend(toolbar);
    }

    return { target, company, advanced };
  }

  function adoptLegacySurfaces() {
    const hosts = ensureHosts();
    if (!hosts) return false;
    const { target, company, advanced } = hosts;
    [...target.children].forEach((node) => {
      if (node === company || node === advanced) return;
      advanced.appendChild(node);
    });
    return true;
  }

  function renderCompany() {
    const hosts = ensureHosts();
    if (!hosts) return false;
    const rendered = window.ElyonAIWorkforceOrgchartV1?.render?.();
    return rendered !== false;
  }

  function showCompany() {
    if (!virtualAreaIsActive()) return false;
    installStyles();
    const hosts = ensureHosts();
    if (!hosts) return false;
    state.requestedView = "company";
    adoptLegacySurfaces();
    hosts.target.dataset.workforceOwner = "company";
    renderCompany();
    return true;
  }

  function refreshAdvancedSurfaces() {
    window.ElyonAIWorkforce?.mount?.();
    window.ElyonAIWorkforceMountFix?.refresh?.();
    adoptLegacySurfaces();
    window.ElyonAIWorkforceAdvancedSettings?.refresh?.();
    window.ElyonAIWorkforceWorkspaceV3?.render?.();
    window.ElyonAIAgentBuilder?.refresh?.();
    window.ElyonAIWorkforceInterfaceV4?.refresh?.();
    window.ElyonAiProviderModelGuard?.apply?.();
    window.ElyonAiProviderModelGuard?.syncWorkforce?.();
  }

  function openAdvanced(view = "product") {
    installStyles();
    const hosts = ensureHosts();
    if (!hosts) return false;
    state.requestedView = "advanced";
    refreshAdvancedSurfaces();
    adoptLegacySurfaces();
    hosts.target.dataset.workforceOwner = "advanced";

    const shell = document.getElementById("elyonAiWorkforce");
    const button = shell?.querySelector(`[data-v3-view="${view}"]`);
    button?.click();

    requestAnimationFrame(() => {
      adoptLegacySurfaces();
      const currentShell = document.getElementById("elyonAiWorkforce");
      const currentButton = currentShell?.querySelector(`[data-v3-view="${view}"]`);
      if (currentButton && !currentButton.classList.contains("active")) currentButton.click();
    });
    return true;
  }

  function handleClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const viewButton = target.closest("[data-company-view]");
    if (!viewButton) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (viewButton.dataset.companyView === "advanced") openAdvanced("product");
    else showCompany();
  }

  function handleTabEvent(tabId) {
    if (tabId !== TAB_ID) return;
    state.requestedView = "company";
    showCompany();
  }

  function install() {
    installStyles();
    ensureHosts();
    document.addEventListener("click", handleClick, true);
    document.addEventListener("change", (event) => {
      if (event.target?.id === "mainMenu") handleTabEvent(event.target.value);
    }, true);
    window.addEventListener("elyon:tab-changed", (event) => handleTabEvent(event.detail?.tabId || event.detail));
    window.addEventListener("elyon:runtime-group-loaded", (event) => handleTabEvent(event.detail?.tabId));

    if (virtualAreaIsActive()) showCompany();

    window.ElyonAIWorkforceCompanyEntryPreview = {
      showCompany,
      openAdvanced,
      refresh: showCompany,
      owner: () => root()?.dataset.workforceOwner || "",
      adoptLegacySurfaces,
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();