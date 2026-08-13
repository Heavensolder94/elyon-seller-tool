const STATE_BEFORE = '  const state = { activating: false, requestedView: "company" };';
const STATE_AFTER = '  const state = { activating: false, activationQueued: false, requestedView: "company" };';

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

const ACTIVATION_AFTER = `  function activateCompanyView() {
    state.activationQueued = false;
    if (state.activating || state.requestedView !== "company" || !virtualAreaIsActive()) return false;
    const shell = document.getElementById("elyonAiWorkforce");
    const teamButton = shell?.querySelector('[data-v3-view="team"]');
    if (!shell) return false;
    ensureSwitcher();
    if (shell.classList.contains("aiw-company-view") && shell.querySelector(".aiw-org")) return true;
    if (!teamButton) return false;

    state.activating = true;
    try {
      if (!teamButton.classList.contains("active")) teamButton.click();
      renderCompanyTree();
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
