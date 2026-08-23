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

const RENDER_AFTER = `  function cockpitMountTarget() {
    const shell = document.getElementById("elyonAiWorkforce");
    if (!shell) return null;

    const current = shell.querySelector(".aiw-v6-team");
    if (current) return { node: current, replaceNode: true };

    const teamButton = shell.querySelector('[data-v3-view="team"].active');
    if (!teamButton) return null;
    const section = [...shell.querySelectorAll(".aiw-v3-section")].find((item) =>
      item.querySelector(".aiw-v3-agent-list") || item.querySelector(".aiw-org")
    );
    return section ? { node: section, replaceNode: false } : null;
  }

  function render() {
    installStyles();
    const target = cockpitMountTarget();
    if (!target) return false;
    const sig = signature();
    const existing = target.node.matches?.(".aiw-org") ? target.node : target.node.querySelector?.(".aiw-org");
    if (existing?.dataset.orgSignature === sig) return true;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = markup();
    const replacement = wrapper.firstElementChild;
    if (!replacement) return false;
    replacement.dataset.orgSignature = sig;
    if (target.replaceNode) target.node.replaceWith(replacement);
    else target.node.replaceChildren(replacement);
    const nav = document.querySelector('#elyonAiWorkforce [data-v3-view="team"]');
    if (nav) nav.innerHTML = "◉ Team-Cockpit";
    return true;
  }`;

export function stabilizeWorkforceCockpitMount(source) {
  const input = String(source || "");
  if (!input.includes(RENDER_BEFORE)) {
    throw new Error("Workforce cockpit mount transform failed: render signature not found.");
  }
  return input.replace(RENDER_BEFORE, RENDER_AFTER);
}
