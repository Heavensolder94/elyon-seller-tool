const STATE_BEFORE = '  const state = { activating: false, requestedView: "company" };';
const STATE_AFTER = `  const COMPANY_HOST_ID = "elyonWorkforceCompanyHost";
  const COMPANY_HOST_STYLE_ID = "elyonWorkforceCompanyHostStyles";
  const state = { activating: false, activationQueued: false, requestedView: "company" };`;

const ACTIVATION_BEFORE = `  function activateCompanyView() {
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
  }`;

const ACTIVATION_AFTER = `  function ensureCompanyHost() {
    const shell = document.getElementById("elyonAiWorkforce");
    if (!shell) return null;

    let host = document.getElementById(COMPANY_HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = COMPANY_HOST_ID;
      host.setAttribute("data-elyon-workforce-company-host", "true");
      shell.appendChild(host);
    } else if (host.parentElement !== shell) {
      shell.appendChild(host);
    }

    if (!document.getElementById(COMPANY_HOST_STYLE_ID)) {
      const style = document.createElement("style");
      style.id = COMPANY_HOST_STYLE_ID;
      style.textContent = \`
        #elyonWorkforceCompanyHost{display:none;width:100%}
        #elyonAiWorkforce.aiw-company-view>#elyonWorkforceCompanyHost{display:block!important}
        #elyonAiWorkforce.aiw-company-view>:not(#elyonWorkforceCompanyHost):not(#elyonWorkforceCompanySwitcher){display:none!important}
        #virtualAgentsSettingsRoot:has(>#elyonAiWorkforce.aiw-company-view)>:not(#elyonAiWorkforce){display:none!important}
      \`;
      document.head.appendChild(style);
    }

    return host;
  }

  function activateCompanyView() {
    state.activationQueued = false;
    if (state.activating || state.requestedView !== "company" || !virtualAreaIsActive()) return false;
    const shell = document.getElementById("elyonAiWorkforce");
    if (!shell) return false;
    ensureSwitcher();
    const host = ensureCompanyHost();
    if (!host) return false;
    if (shell.classList.contains("aiw-company-view") && host.querySelector(".aiw-org")) return true;

    state.activating = true;
    try {
      state.requestedView = "company";
      shell.classList.add("aiw-company-view");
      window.ElyonAIWorkforceOrgchartV1?.render?.();
      ensureSwitcher();
      return true;
    } finally {
      state.activating = false;
    }
  }

  function scheduleActivation() {
    if (state.activationQueued || state.activating || state.requestedView !== "company" || !virtualAreaIsActive()) return;
    state.activationQueued = true;
    requestAnimationFrame(activateCompanyView);
  }`;

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Company-entry optimization failed: ${label} signature not found.`);
  return source.replace(before, after);
}

export function optimizeCompanyEntryRuntime(source) {
  let output = replaceRequired(source, STATE_BEFORE, STATE_AFTER, "state");
  output = replaceRequired(output, ACTIVATION_BEFORE, ACTIVATION_AFTER, "activation scheduler");
  return output;
}
