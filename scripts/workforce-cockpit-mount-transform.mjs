const RENDER_BEFORE = `  function render() {
    installStyles();
    const root = document.querySelector("#elyonAiWorkforce .aiw-v6-team");
    if (!root) return false;
    const sig = signature();
    if (root.classList.contains("aiw-org") && root.dataset.orgSignature === sig) return true;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = markup();
    const replacement = wrapper.firstElementChild;
    if (!replacement) return false;
    replacement.dataset.orgSignature = sig;
    root.replaceWith(replacement);
    const nav = document.querySelector('#elyonAiWorkforce [data-v3-view="team"]');
    if (nav) nav.innerHTML = "◉ Team-Cockpit";
    return true;
  }`;

const RENDER_AFTER = `  const COMPANY_HOST_ID = "elyonWorkforceCompanyHost";

  function cockpitMountTarget() {
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
    return host;
  }

  function render() {
    installStyles();
    const host = cockpitMountTarget();
    if (!host) return false;
    const sig = signature();
    const existing = host.firstElementChild?.classList?.contains("aiw-org") ? host.firstElementChild : null;
    if (existing?.dataset.orgSignature === sig) return true;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = markup();
    const replacement = wrapper.firstElementChild;
    if (!replacement) return false;
    replacement.dataset.orgSignature = sig;
    host.replaceChildren(replacement);
    return true;
  }`;

export function stabilizeWorkforceCockpitMount(source) {
  const input = String(source || "");
  if (!input.includes(RENDER_BEFORE)) {
    throw new Error("Workforce cockpit mount transform failed: render signature not found.");
  }
  return input.replace(RENDER_BEFORE, RENDER_AFTER);
}
