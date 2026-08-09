(() => {
  "use strict";

  const STYLE_ID = "elyonCompanyEntryPreviewStyles";
  const TAB_ID = "virtualAgentsTab";
  const state = { activating: false };

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #elyonAiWorkforce.aiw-company-view{padding:0!important;background:transparent!important;border:0!important;box-shadow:none!important}
      #elyonAiWorkforce.aiw-company-view .aiw-v3-root,
      #elyonAiWorkforce.aiw-company-view .aiw-v3{display:block!important;width:100%!important;max-width:none!important;padding:0!important;background:transparent!important;border:0!important;box-shadow:none!important}
      #elyonAiWorkforce.aiw-company-view .aiw-v3-command,
      #elyonAiWorkforce.aiw-company-view .aiw-v4-workbar,
      #elyonAiWorkforce.aiw-company-view .aiw-v3-nav,
      #elyonAiWorkforce.aiw-company-view .aiw-v3-side,
      #elyonAiWorkforce.aiw-company-view .aiw-v3-hero{display:none!important}
      #elyonAiWorkforce.aiw-company-view .aiw-v3-layout{display:block!important;width:100%!important}
      #elyonAiWorkforce.aiw-company-view .aiw-v3-main{display:block!important;width:100%!important;max-width:none!important;padding:0!important;margin:0!important}
      #elyonAiWorkforce.aiw-company-view .aiw-v3-section{width:100%!important;margin:0!important;padding:0!important;background:transparent!important;border:0!important;box-shadow:none!important}
      #elyonAiWorkforce.aiw-company-view .aiw-org{width:100%!important;max-width:none!important}
      #elyonAiWorkforce.aiw-company-view .aiw-org-branches{grid-template-columns:repeat(4,minmax(0,1fr))!important}
      @media(max-width:1180px){#elyonAiWorkforce.aiw-company-view .aiw-org-branches{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
      @media(max-width:720px){#elyonAiWorkforce.aiw-company-view .aiw-org-branches{grid-template-columns:1fr!important}}
    `;
    document.head.appendChild(style);
  }

  function virtualAreaIsActive() {
    if (document.getElementById(TAB_ID)?.classList.contains("active")) return true;
    return document.getElementById("mainMenu")?.value === TAB_ID;
  }

  function addAdvancedControl() {
    const actions = document.querySelector("#elyonAiWorkforce .aiw-org-head .aiw-org-actions");
    if (!actions || actions.querySelector("[data-org-advanced-view]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "aiw-secondary";
    button.dataset.orgAdvancedView = "product";
    button.textContent = "⚙ Erweiterte Steuerung";
    actions.appendChild(button);
  }

  function finalizeCompanyView() {
    const shell = document.getElementById("elyonAiWorkforce");
    const org = shell?.querySelector(".aiw-org");
    if (!shell || !org) return false;
    shell.classList.add("aiw-company-view");
    addAdvancedControl();
    return true;
  }

  function activateCompanyView() {
    if (state.activating || !virtualAreaIsActive()) return false;
    const shell = document.getElementById("elyonAiWorkforce");
    const teamButton = shell?.querySelector('[data-v3-view="team"]');
    if (!shell || !teamButton) return false;

    state.activating = true;
    try {
      if (!teamButton.classList.contains("active")) teamButton.click();
      window.ElyonAIWorkforceTeamV6?.render?.();
      window.ElyonAIWorkforceOrgchartV1?.render?.();
      finalizeCompanyView();
      requestAnimationFrame(() => {
        window.ElyonAIWorkforceOrgchartV1?.render?.();
        finalizeCompanyView();
      });
      return true;
    } finally {
      state.activating = false;
    }
  }

  function scheduleActivation() {
    [0, 40, 140].forEach((delay) => window.setTimeout(activateCompanyView, delay));
  }

  function openAdvanced(view = "product") {
    const shell = document.getElementById("elyonAiWorkforce");
    shell?.classList.remove("aiw-company-view");
    const button = shell?.querySelector(`[data-v3-view="${view}"]`);
    button?.click();
  }

  function handleClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const advanced = target.closest("[data-org-advanced-view]");
    if (advanced) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openAdvanced(advanced.dataset.orgAdvancedView || "product");
      return;
    }

    const team = target.closest('[data-v3-view="team"]');
    if (team) scheduleActivation();

    const otherView = target.closest('[data-v3-view="product"],[data-v3-view="operations"]');
    if (otherView) document.getElementById("elyonAiWorkforce")?.classList.remove("aiw-company-view");

    const tabTrigger = target.closest(`[data-tab="${TAB_ID}"],[data-tab-id="${TAB_ID}"],[data-target-tab="${TAB_ID}"],[data-sd-tab="${TAB_ID}"],[data-seller-open-tab="${TAB_ID}"]`);
    if (tabTrigger) scheduleActivation();
  }

  function install() {
    installStyles();
    document.addEventListener("click", handleClick, true);
    document.addEventListener("change", (event) => {
      if (event.target?.id === "mainMenu" && event.target.value === TAB_ID) scheduleActivation();
    }, true);
    window.addEventListener("elyon:runtime-group-loaded", (event) => {
      if (event.detail?.tabId === TAB_ID) scheduleActivation();
    });
    window.addEventListener("elyon:tab-changed", (event) => {
      const tabId = event.detail?.tabId || event.detail;
      if (tabId === TAB_ID) scheduleActivation();
    });
    window.addEventListener("elyon:ai-workforce-team-v6-rendered", () => {
      window.ElyonAIWorkforceOrgchartV1?.render?.();
      requestAnimationFrame(finalizeCompanyView);
    });
    if (virtualAreaIsActive()) scheduleActivation();
  }

  window.ElyonAIWorkforceCompanyEntryPreview = { activate: activateCompanyView, openAdvanced };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
