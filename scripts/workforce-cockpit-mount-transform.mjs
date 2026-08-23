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

const STATE_BEFORE = '  const state = { expanded: new Set(), queued: false, view: "overview", filter: "" };';
const STATE_AFTER = '  const state = { expanded: new Set(), queued: false, view: "overview", filter: "", taskFilter: "all" };';

const RUNNING_BEFORE = '  const RUNNING = new Set(["analyzing", "running", "queued"]);';
const RUNNING_AFTER = '  const RUNNING = new Set(["analyzing", "running"]);\n  const QUEUED = new Set(["queued"]);';

const STATUS_META_BEFORE = `  function statusMeta(list) {
    const values = list.slice(0, 30).map(status);
    if (values.some((value) => RUNNING.has(value))) return ["running", "Arbeitet"];
    if (values.some((value) => BAD.has(value))) return ["bad", "Aufmerksamkeit"];
    if (values.some((value) => WARN.has(value))) return ["warn", "Prüfung nötig"];
    if (values.some((value) => GOOD.has(value))) return ["good", "Bereit"];
    return ["idle", "Bereit"];
  }`;

const STATUS_META_AFTER = `  function statusMeta(list) {
    const recent = list.slice(0, 30);
    const values = recent.map(status);
    if (values.some((value) => RUNNING.has(value))) return ["running", "Arbeitet"];
    if (values.some((value) => BAD.has(value))) return ["bad", "Fehler"];
    if (recent.some(needsDecision)) return ["warn", "Wartet auf dich"];
    return ["good", "Bereit"];
  }

  function employeeStatusMeta(item, list) {
    const enabled = item.agents.some((id) => rawMode(id) !== "off");
    if (!enabled) return ["disabled", "Deaktiviert"];
    const recent = list.slice(0, 30);
    if (recent.some((task) => BAD.has(status(task)))) return ["bad", "Fehler"];
    if (recent.some(needsDecision)) return ["warn", "Wartet auf dich"];
    if (recent.some((task) => RUNNING.has(status(task)))) return ["running", "Arbeitet"];
    return ["good", "Bereit"];
  }`;

const STYLE_STATUS_BEFORE = '      .aiw-org-status.good:before{background:#35c46a}.aiw-org-status.running:before{background:#4f8cff}.aiw-org-status.warn:before{background:#f1ae42}.aiw-org-status.bad:before{background:#ee6464}';
const STYLE_STATUS_AFTER = '      .aiw-org-status.good:before{background:#35c46a}.aiw-org-status.running:before{background:#4f8cff}.aiw-org-status.warn:before{background:#f1ae42}.aiw-org-status.bad:before{background:#ee6464}.aiw-org-status.disabled:before{background:#4b5563}';

const STYLE_METRIC_BEFORE = '      .aiw-cockpit-metric strong{display:block;margin-top:5px;color:#f3f6f9;font-size:20px;font-variant-numeric:tabular-nums}';
const STYLE_METRIC_AFTER = `      .aiw-cockpit-metric strong{display:block;margin-top:5px;color:#f3f6f9;font-size:20px;font-variant-numeric:tabular-nums}
      .aiw-cockpit-metric-note{display:block;margin-top:3px;color:#748293;font-size:8px;line-height:1.35}
      .aiw-task-filters{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 2px}
      .aiw-task-filters button{min-height:29px!important;padding:5px 9px!important;border-radius:8px!important;border:1px solid rgba(255,255,255,.065)!important;background:rgba(255,255,255,.018)!important;color:#8190a1!important;font-size:8.5px!important;box-shadow:none!important}
      .aiw-task-filters button.active{background:#182331!important;border-color:rgba(79,140,255,.18)!important;color:#f5f7fa!important}`;

const PERSON_BEFORE = `  function person(agentId) {
    const [icon, name] = PEOPLE[agentId] || ["•", agentId];
    const [tone, label] = statusMeta(taskSet([agentId]));
    return \`<div class="aiw-org-specialist"><span>\${icon}</span><div><strong>\${esc(name)}</strong><small><span class="aiw-org-status \${tone}">\${esc(label)}</span></small></div></div>\`;
  }`;

const PERSON_AFTER = `  function person(agentId) {
    const [icon, name] = PEOPLE[agentId] || ["•", agentId];
    const enabled = rawMode(agentId) !== "off";
    const [tone, label] = enabled ? statusMeta(taskSet([agentId])) : ["disabled", "Deaktiviert"];
    return \`<div class="aiw-org-specialist"><span>\${icon}</span><div><strong>\${esc(name)}</strong><small><span class="aiw-org-status \${tone}">\${esc(label)}</span></small></div></div>\`;
  }`;

const EMPLOYEE_START_BEFORE = `  function employeeCard(item) {
    const list = taskSet(item.agents);
    const [tone, label] = statusMeta(list);
    const running = list.filter((task) => RUNNING.has(status(task)));
    const open = list.filter(needsDecision).length;
    const doneToday = list.filter((task) => GOOD.has(status(task)) && isToday(task)).length;
    const current = running[0] || list.find(needsDecision) || null;
    const currentText = current
      ? \`<strong>\${esc(statusLabel(current))}:</strong> \${esc(text(current.title, summary(current))).slice(0, 125)}\`
      : "Keine laufende Aufgabe · bereit für einen neuen Auftrag.";`;

const EMPLOYEE_START_AFTER = `  function employeeCard(item) {
    const list = taskSet(item.agents);
    const enabled = item.agents.some((id) => rawMode(id) !== "off");
    const [tone, label] = employeeStatusMeta(item, list);
    const running = list.filter((task) => RUNNING.has(status(task)));
    const open = list.filter(needsDecision).length;
    const doneToday = list.filter((task) => GOOD.has(status(task)) && isToday(task)).length;
    const current = running[0] || list.find(needsDecision) || list.find((task) => QUEUED.has(status(task))) || null;
    const currentText = !enabled
      ? "Deaktiviert · unter Einstellungen wieder einschalten."
      : current
        ? \`<strong>\${esc(statusLabel(current))}:</strong> \${esc(text(current.title, summary(current))).slice(0, 125)}\`
        : "Keine laufende Aufgabe · bereit für einen neuen Auftrag.";`;

const EMPLOYEE_META_BEFORE = '      <div class="aiw-cockpit-meta"><span>${running.length} aktiv</span><span>${open} Entscheidung${open === 1 ? "" : "en"}</span><span>${doneToday} heute erledigt</span></div>';
const EMPLOYEE_META_AFTER = '      <div class="aiw-cockpit-meta"><span>${running.length} laufend</span><span>${open} Entscheidung${open === 1 ? "" : "en"}</span><span>${doneToday} heute erledigt</span></div>';

const OVERVIEW_BEFORE = `  function overview() {
    const all = tasks();
    const runningCount = all.filter((task) => RUNNING.has(status(task))).length;
    const decisionCount = all.filter(needsDecision).length;
    const doneToday = all.filter((task) => GOOD.has(status(task)) && isToday(task)).length;
    const activeTeam = TEAM.filter((item) => item.agents.some((id) => rawMode(id) !== "off")).length;

    return \`<div class="aiw-cockpit-stack">
      <div class="aiw-cockpit-metrics">
        <div class="aiw-cockpit-metric"><small>Mitarbeiter aktiv</small><strong>\${activeTeam}/\${TEAM.length}</strong></div>
        <div class="aiw-cockpit-metric"><small>Aufgaben laufen</small><strong>\${runningCount}</strong></div>
        <div class="aiw-cockpit-metric"><small>Entscheidungen</small><strong>\${decisionCount}</strong></div>
        <div class="aiw-cockpit-metric"><small>Heute erledigt</small><strong>\${doneToday}</strong></div>
      </div>`;

const OVERVIEW_AFTER = `  function overview() {
    const all = tasks();
    const runningCount = all.filter((task) => RUNNING.has(status(task))).length;
    const decisionCount = all.filter(needsDecision).length;
    const readyTeam = TEAM.filter((item) => item.agents.some((id) => rawMode(id) !== "off")).length;
    const workingEmployees = TEAM.filter((item) => taskSet(item.agents).some((task) => RUNNING.has(status(task)))).length;
    const openTaskCount = all.filter((task) => RUNNING.has(status(task)) || QUEUED.has(status(task)) || WARN.has(status(task))).length;

    return \`<div class="aiw-cockpit-stack">
      <div class="aiw-cockpit-metrics">
        <div class="aiw-cockpit-metric"><small>Mitarbeiter</small><strong>\${TEAM.length}</strong><span class="aiw-cockpit-metric-note">\${readyTeam}/\${TEAM.length} einsatzbereit</span></div>
        <div class="aiw-cockpit-metric"><small>Arbeiten gerade</small><strong>\${workingEmployees}</strong></div>
        <div class="aiw-cockpit-metric"><small>Offene Aufgaben</small><strong>\${openTaskCount}</strong></div>
        <div class="aiw-cockpit-metric"><small>Entscheidungen</small><strong>\${decisionCount}</strong></div>
      </div>`;

const TASKS_VIEW_BEFORE = `  function tasksView() {
    const dept = TEAM.find((item) => item.id === state.filter) || null;
    const list = (dept ? taskSet(dept.agents) : tasks()).slice(0, 30);
    return \`<section class="aiw-org-panel">
      <div class="aiw-cockpit-filter"><span>\${dept ? \`Aktivität von <strong>\${esc(dept.name)}</strong>\` : "<strong>Alle Team-Aufgaben</strong>"}</span>\${dept ? '<button class="aiw-secondary" data-org-view="tasks">Alle anzeigen</button>' : ""}</div>
      <div class="aiw-org-panel-head"><div><h4>Aufgaben</h4><p>Laufende, offene und abgeschlossene Arbeit in einer Liste.</p></div><span class="aiw-org-count">\${list.length}</span></div>
      \${taskRows(list, "Noch keine Aufgaben im Workforce-Verlauf.")}
    </section>\`;
  }`;

const TASKS_VIEW_AFTER = `  function tasksView() {
    const dept = TEAM.find((item) => item.id === state.filter) || null;
    const base = dept ? taskSet(dept.agents) : tasks();
    const filtered = base.filter((task) => {
      const value = status(task);
      if (state.taskFilter === "running") return RUNNING.has(value);
      if (state.taskFilter === "waiting") return QUEUED.has(value) || WARN.has(value);
      if (state.taskFilter === "done") return GOOD.has(value);
      if (state.taskFilter === "error") return BAD.has(value);
      return true;
    });
    const list = filtered.slice(0, 30);
    const filters = [
      ["all", "Alle"],
      ["running", "Laufend"],
      ["waiting", "Wartend"],
      ["done", "Erledigt"],
      ["error", "Fehler"],
    ];
    return \`<section class="aiw-org-panel">
      <div class="aiw-cockpit-filter"><span>\${dept ? \`Aktivität von <strong>\${esc(dept.name)}</strong>\` : "<strong>Alle Mitarbeiter-Aufgaben</strong>"}</span>\${dept ? '<button class="aiw-secondary" data-org-view="tasks">Alle anzeigen</button>' : ""}</div>
      <div class="aiw-org-panel-head"><div><h4>Aufgaben</h4><p>Nach Arbeitsstatus filtern statt technische Logs durchsuchen.</p></div><span class="aiw-org-count">\${list.length}</span></div>
      <div class="aiw-task-filters">\${filters.map(([id, label]) => \`<button class="\${state.taskFilter === id ? "active" : ""}" data-org-task-filter="\${id}">\${label}</button>\`).join("")}</div>
      \${taskRows(list, "Für diesen Filter sind keine Aufgaben vorhanden.")}
    </section>\`;
  }`;

const DEPARTMENT_START_BEFORE = `  function department(item) {
    const list = taskSet(item.agents);
    const [tone, label] = statusMeta(list);`;
const DEPARTMENT_START_AFTER = `  function department(item) {
    const list = taskSet(item.agents);
    const [tone, label] = employeeStatusMeta(item, list);`;

const DEPARTMENT_META_BEFORE = '        <div class="aiw-org-meta"><span>${item.agents.length} Spezialist${item.agents.length === 1 ? "" : "en"}</span><span>${running} aktiv</span><span>${open} offen</span></div>';
const DEPARTMENT_META_AFTER = '        <div class="aiw-org-meta"><span>${item.agents.length} Fähigkeit${item.agents.length === 1 ? "" : "en"}</span><span>${running} laufend</span><span>${open} offen</span></div>';

const DEPARTMENT_TOGGLE_BEFORE = '${expanded ? "Team schließen" : "Team ansehen"}';
const DEPARTMENT_TOGGLE_AFTER = '${expanded ? "Fähigkeiten schließen" : "Fähigkeiten ansehen"}';

const TEAM_NAV_BEFORE = '<button class="${state.view === "team" ? "active" : ""}" data-org-view="team">Team</button>';
const TEAM_NAV_AFTER = '<button class="${state.view === "team" ? "active" : ""}" data-org-view="team">Mitarbeiter</button>';

const SIGNATURE_BEFORE = '      filter: state.filter,';
const SIGNATURE_AFTER = '      filter: state.filter,\n      taskFilter: state.taskFilter,';

const CLICK_BEFORE = `    const view = target.closest("[data-org-view]");`;
const CLICK_AFTER = `    const taskFilter = target.closest("[data-org-task-filter]");
    if (taskFilter) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const nextFilter = text(taskFilter.dataset.orgTaskFilter, "all");
      state.taskFilter = ["all", "running", "waiting", "done", "error"].includes(nextFilter) ? nextFilter : "all";
      queueRender();
      return;
    }

    const view = target.closest("[data-org-view]");`;

const VIEW_STATE_BEFORE = `      state.view = ["overview", "tasks", "decisions", "team"].includes(next) ? next : "overview";
      state.filter = state.view === "tasks" ? text(view.dataset.orgFilter) : "";
      queueRender();`;
const VIEW_STATE_AFTER = `      state.view = ["overview", "tasks", "decisions", "team"].includes(next) ? next : "overview";
      state.filter = state.view === "tasks" ? text(view.dataset.orgFilter) : "";
      if (state.view === "tasks") state.taskFilter = "all";
      queueRender();`;

const TAB_RESET_BEFORE = `        state.view = "overview";
        state.filter = "";
        queueRender();`;
const TAB_RESET_AFTER = `        state.view = "overview";
        state.filter = "";
        state.taskFilter = "all";
        queueRender();`;

const EMPLOYEE_GRID = '      <div class="aiw-cockpit-grid">${TEAM.map(employeeCard).join("")}</div>';
const DECISION_PANEL = '      <section class="aiw-org-panel" data-org-anchor="decisions"><div class="aiw-org-panel-head"><div><h4>🚨 Deine Entscheidungen</h4><p>Nur Freigaben, Blocker, Fehler und echte Prüffälle.</p></div><span class="aiw-org-count">${decisionCount}</span></div>${decisions(5)}</section>';
const ACTIVITY_BLOCK = [
  '      <div class="aiw-cockpit-two">',
  '        <section class="aiw-org-panel"><div class="aiw-org-panel-head"><div><h4>⚡ Gerade in Arbeit</h4><p>Live aus den bestehenden Workforce-Tasks.</p></div><span class="aiw-org-count">${Math.min(runningCount, 8)}</span></div>${currentWork(6)}</section>',
  '        <section class="aiw-org-panel"><div class="aiw-org-panel-head"><div><h4>✅ Zuletzt erledigt</h4><p>Die jüngsten abgeschlossenen Team-Aufgaben.</p></div><span class="aiw-org-count">${Math.min(all.filter((task) => GOOD.has(status(task))).length, 8)}</span></div>${completed(6)}</section>',
  '      </div>',
].join("\n");

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Workforce cockpit transform failed: ${label} signature not found.`);
  return source.replace(before, after);
}

function improveInformationArchitecture(source) {
  let output = source;
  output = replaceRequired(output, STATE_BEFORE, STATE_AFTER, "state");
  output = replaceRequired(output, RUNNING_BEFORE, RUNNING_AFTER, "running semantics");
  output = replaceRequired(output, STATUS_META_BEFORE, STATUS_META_AFTER, "status semantics");
  output = replaceRequired(output, STYLE_STATUS_BEFORE, STYLE_STATUS_AFTER, "status styles");
  output = replaceRequired(output, STYLE_METRIC_BEFORE, STYLE_METRIC_AFTER, "metric styles");
  output = replaceRequired(output, PERSON_BEFORE, PERSON_AFTER, "specialist status");
  output = replaceRequired(output, EMPLOYEE_START_BEFORE, EMPLOYEE_START_AFTER, "employee status");
  output = replaceRequired(output, EMPLOYEE_META_BEFORE, EMPLOYEE_META_AFTER, "employee metadata");
  output = replaceRequired(output, OVERVIEW_BEFORE, OVERVIEW_AFTER, "overview metrics");
  output = replaceRequired(output, TASKS_VIEW_BEFORE, TASKS_VIEW_AFTER, "task filters");
  output = replaceRequired(output, DEPARTMENT_START_BEFORE, DEPARTMENT_START_AFTER, "employee detail status");
  output = replaceRequired(output, DEPARTMENT_META_BEFORE, DEPARTMENT_META_AFTER, "employee detail metadata");
  output = replaceRequired(output, DEPARTMENT_TOGGLE_BEFORE, DEPARTMENT_TOGGLE_AFTER, "employee capability toggle");
  output = replaceRequired(output, TEAM_NAV_BEFORE, TEAM_NAV_AFTER, "employee navigation label");
  output = replaceRequired(output, SIGNATURE_BEFORE, SIGNATURE_AFTER, "render signature");
  output = replaceRequired(output, CLICK_BEFORE, CLICK_AFTER, "task filter interaction");
  output = replaceRequired(output, VIEW_STATE_BEFORE, VIEW_STATE_AFTER, "task filter reset");
  output = replaceRequired(output, TAB_RESET_BEFORE, TAB_RESET_AFTER, "tab reset");
  return output;
}

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
  const improved = improveInformationArchitecture(input);
  const mounted = improved.replace(RENDER_BEFORE, RENDER_AFTER);
  return promoteOperationalPanels(scopeCockpitStyles(mounted));
}
