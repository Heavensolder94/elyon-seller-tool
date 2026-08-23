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
    const root = document.getElementById("virtualAgentsSettingsRoot");
    if (!root) return null;

    let host = document.getElementById(COMPANY_HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = COMPANY_HOST_ID;
      host.setAttribute("data-elyon-workforce-company-host", "true");
      root.prepend(host);
    } else if (host.parentElement !== root) {
      root.prepend(host);
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

const EMPLOYEE_GRID = '      <div class="aiw-cockpit-grid">${TEAM.map(employeeCard).join("")}</div>';
const DECISION_PANEL = '      <section class="aiw-org-panel" data-org-anchor="decisions"><div class="aiw-org-panel-head"><div><h4>🚨 Deine Entscheidungen</h4><p>Nur Freigaben, Blocker, Fehler und echte Prüffälle.</p></div><span class="aiw-org-count">${decisionCount}</span></div>${decisions(5)}</section>';
const ACTIVITY_BLOCK = [
  '      <div class="aiw-cockpit-two">',
  '        <section class="aiw-org-panel"><div class="aiw-org-panel-head"><div><h4>⚡ Gerade in Arbeit</h4><p>Live aus den bestehenden Workforce-Tasks.</p></div><span class="aiw-org-count">${Math.min(runningCount, 8)}</span></div>${currentWork(6)}</section>',
  '        <section class="aiw-org-panel"><div class="aiw-org-panel-head"><div><h4>✅ Zuletzt erledigt</h4><p>Die jüngsten abgeschlossenen Team-Aufgaben.</p></div><span class="aiw-org-count">${Math.min(all.filter((task) => GOOD.has(status(task))).length, 8)}</span></div>${completed(6)}</section>',
  '      </div>',
].join("\n");

function promoteOperationalPanels(source) {
  const before = [EMPLOYEE_GRID, DECISION_PANEL, ACTIVITY_BLOCK].join("\n");
  if (!source.includes(before)) {
    throw new Error("Workforce cockpit layout transform failed: overview order signature not found.");
  }
  return source.replace(before, [DECISION_PANEL, ACTIVITY_BLOCK, EMPLOYEE_GRID].join("\n"));
}

function scopeCockpitStyles(source) {
  return source
    .replaceAll("#elyonAiWorkforce .aiw-org", "#elyonWorkforceCompanyHost .aiw-org")
    .replaceAll("#elyonAiWorkforce.aiw-company-view #elyonWorkforceCompanySwitcher", "#elyonWorkforceCompanyHost #elyonWorkforceCompanySwitcher");
}

export function stabilizeWorkforceCockpitMount(source) {
  const input = String(source || "");
  if (!input.includes(RENDER_BEFORE)) {
    throw new Error("Workforce cockpit mount transform failed: render signature not found.");
  }
  const mounted = input.replace(RENDER_BEFORE, RENDER_AFTER);
  return promoteOperationalPanels(scopeCockpitStyles(mounted));
}
