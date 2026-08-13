(() => {
  "use strict";

  const ROOT_ID = "virtualAgentsSettingsRoot";
  const PRIMARY_TASK_KEY = "elyon_ai_workforce_tasks";
  const LEGACY_TASK_KEY = "elyon_ai_tasks";
  const LOG_KEY = "elyon_ai_logs";
  const EVENT_KEY = "elyon_ai_events";
  const MAX_TASKS = 150;
  const MAX_RENDERED_TASKS = 24;
  const MAX_RENDERED_LOGS = 10;
  const state = { renderQueued: false, bound: false };

  const text = (value, fallback = "") => value === null || value === undefined ? fallback : String(value).trim();
  const escapeHtml = (value) => text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function readCollection(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function writeCollection(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify((Array.isArray(value) ? value : []).slice(0, MAX_TASKS)));
      return true;
    } catch {
      return false;
    }
  }

  function timestamp(item) {
    const parsed = Date.parse(text(item?.updatedAt || item?.completedAt || item?.createdAt || item?.timestamp || item?.time));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function mergeTasks() {
    const map = new Map();
    for (const task of [...readCollection(PRIMARY_TASK_KEY), ...readCollection(LEGACY_TASK_KEY)]) {
      if (!task || typeof task !== "object") continue;
      const id = text(task.id) || `${text(task.agentId)}:${text(task.title)}:${text(task.createdAt)}`;
      if (!id) continue;
      const current = map.get(id);
      if (!current || timestamp(task) >= timestamp(current)) map.set(id, task);
    }
    return [...map.values()].sort((a, b) => timestamp(b) - timestamp(a));
  }

  function recentLogs() {
    const entries = [...readCollection(LOG_KEY), ...readCollection(EVENT_KEY)]
      .filter((item) => item && typeof item === "object")
      .sort((a, b) => timestamp(b) - timestamp(a));
    const seen = new Set();
    return entries.filter((item) => {
      const signature = `${text(item.id)}|${text(item.message || item.summary || item.title)}|${timestamp(item)}`;
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    }).slice(0, MAX_RENDERED_LOGS);
  }

  function statusOf(task) {
    return text(task?.result?.status || task?.status, "queued");
  }

  function statusLabel(status) {
    return ({
      queued: "Wartet",
      analyzing: "Läuft",
      running: "Läuft",
      passed: "Bestanden",
      warning: "Warnung",
      blocked: "Blockiert",
      failed: "Fehler",
      rejected: "Abgelehnt",
      manualReviewRequired: "Prüfung nötig",
      approval_required: "Freigabe nötig",
      waiting_approval: "Freigabe nötig",
      draft_ready: "Entwurf fertig",
      approved: "Freigegeben",
      completed: "Abgeschlossen",
      done: "Erledigt",
      paused: "Pausiert",
    })[status] || status || "Offen";
  }

  function statusClass(status) {
    if (["passed", "approved", "completed", "done", "draft_ready"].includes(status)) return "good";
    if (["blocked", "failed", "rejected"].includes(status)) return "bad";
    if (["warning", "manualReviewRequired", "approval_required", "waiting_approval"].includes(status)) return "warn";
    return "info";
  }

  function formatTime(value) {
    const time = timestamp(value);
    if (!time) return "—";
    try {
      return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(time));
    } catch {
      return "—";
    }
  }

  function taskSummary(task) {
    return text(
      task?.result?.summary ||
      task?.result?.message ||
      task?.summary ||
      task?.description ||
      task?.message,
      "Noch kein Ergebnis vorhanden."
    );
  }

  function detailPayload(task) {
    const details = {
      agentId: text(task?.agentId),
      provider: text(task?.provider || task?.result?.provider),
      model: text(task?.model || task?.result?.model),
      type: text(task?.type),
      priority: text(task?.priority),
      warnings: Array.isArray(task?.warnings) ? task.warnings : (Array.isArray(task?.result?.warnings) ? task.result.warnings : []),
      errors: Array.isArray(task?.errors) ? task.errors : (Array.isArray(task?.result?.errors) ? task.result.errors : []),
      result: task?.result || null,
    };
    return JSON.stringify(details, null, 2);
  }

  function taskCard(task) {
    const status = statusOf(task);
    const id = text(task?.id);
    const title = text(task?.title, "Unbenannte Aufgabe");
    const agent = text(task?.agentName || task?.agentId, "Noch keinem Agenten zugeordnet");
    const priority = text(task?.priority, "normal");
    return `
      <article class="card task-center-card task-center-priority-${escapeHtml(priority)}" data-live-task-id="${escapeHtml(id)}">
        <div class="task-center-card-top">
          <div class="task-center-card-heading">
            <h4>${escapeHtml(title)}</h4>
            <p>${escapeHtml(taskSummary(task))}</p>
          </div>
          <div class="task-center-badge-stack">
            <span class="status ${statusClass(status)}">${escapeHtml(statusLabel(status))}</span>
            <span class="pill">${escapeHtml(priority)}</span>
          </div>
        </div>
        <div class="task-center-meta-grid">
          <div><small>Agent</small><strong>${escapeHtml(agent)}</strong></div>
          <div><small>Typ</small><strong>${escapeHtml(text(task?.type, "—"))}</strong></div>
          <div><small>Aktualisiert</small><strong>${escapeHtml(formatTime(task))}</strong></div>
          <div><small>Provider</small><strong>${escapeHtml(text(task?.provider || task?.result?.provider, "—"))}</strong></div>
        </div>
        <div class="task-center-control-row">
          <details class="details-box" style="flex:1;min-width:260px">
            <summary>Details / Ergebnis</summary>
            <pre style="white-space:pre-wrap;word-break:break-word;margin-top:10px;max-height:320px;overflow:auto">${escapeHtml(detailPayload(task))}</pre>
          </details>
          <div class="task-center-action-row">
            ${!["completed", "done"].includes(status) ? `<button type="button" class="secondary" data-live-task-status="done" data-live-task-id="${escapeHtml(id)}">Erledigt</button>` : ""}
            <button type="button" class="secondary" data-live-task-remove="${escapeHtml(id)}">Entfernen</button>
          </div>
        </div>
      </article>`;
  }

  function logRow(entry) {
    const message = text(entry?.message || entry?.summary || entry?.title || entry?.description, "Aktivität ohne Beschreibung");
    const type = text(entry?.level || entry?.type || entry?.eventType, "Info");
    return `<div class="task-center-triage-item"><div class="task-center-triage-title"><strong>${escapeHtml(type)}</strong><span>${escapeHtml(formatTime(entry))}</span></div><p>${escapeHtml(message)}</p></div>`;
  }

  function getMount() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return null;
    return root.querySelector("[data-elyon-task-center-live]") || root.querySelector(".task-center-empty");
  }

  function render() {
    const mount = getMount();
    if (!mount) return false;
    const tasks = mergeTasks();
    const visibleTasks = tasks.slice(0, MAX_RENDERED_TASKS);
    const logs = recentLogs();
    const running = tasks.filter((task) => ["queued", "analyzing", "running"].includes(statusOf(task))).length;
    const attention = tasks.filter((task) => ["warning", "blocked", "failed", "manualReviewRequired", "approval_required", "waiting_approval"].includes(statusOf(task))).length;
    const done = tasks.filter((task) => ["passed", "approved", "completed", "done", "draft_ready"].includes(statusOf(task))).length;

    mount.dataset.elyonTaskCenterLive = "true";
    mount.classList.remove("empty", "task-center-empty");
    mount.classList.add("task-center-shell");
    mount.innerHTML = `
      <div class="dashboard task-center-stats" style="margin-bottom:0">
        <div class="metric"><small>Aufgaben</small><strong>${tasks.length}</strong></div>
        <div class="metric"><small>Aktiv / Wartend</small><strong>${running}</strong></div>
        <div class="metric"><small>Prüfung nötig</small><strong>${attention}</strong></div>
        <div class="metric"><small>Erledigt</small><strong>${done}</strong></div>
      </div>
      <section class="task-center-list" data-live-task-list>
        ${visibleTasks.length ? visibleTasks.map(taskCard).join("") : '<div class="empty">Noch keine Aufgaben vorhanden. Über „Neue Aufgabe“ kannst du die erste Aufgabe anlegen.</div>'}
      </section>
      <section class="task-center-triage" style="margin-top:4px">
        <div class="task-center-triage-head"><div><h4>Letzte Logs & Ereignisse</h4><p>Aktuelle Agenten- und Task-Aktivität aus dem lokalen Elyon-Zustand.</p></div><span class="pill">${logs.length}</span></div>
        <div class="task-center-triage-list">${logs.length ? logs.map(logRow).join("") : '<div class="task-center-triage-empty">Noch keine Logs oder Ereignisse vorhanden.</div>'}</div>
      </section>`;
    return true;
  }

  function queueRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(() => {
      state.renderQueued = false;
      render();
    });
  }

  function upsertInKey(key, task) {
    const tasks = readCollection(key);
    const index = tasks.findIndex((entry) => text(entry?.id) === task.id);
    if (index >= 0) tasks[index] = { ...tasks[index], ...task, updatedAt: task.updatedAt || new Date().toISOString() };
    else tasks.unshift(task);
    writeCollection(key, tasks);
  }

  function createTaskFromForm() {
    const now = new Date().toISOString();
    const title = text(document.getElementById("aiTaskTitleInput")?.value, "Neue Aufgabe");
    const description = text(document.getElementById("aiTaskDescriptionInput")?.value);
    const agentId = text(document.getElementById("aiTaskAgentSelect")?.value);
    const type = text(document.getElementById("aiTaskTypeSelect")?.value, "product_analysis");
    const priority = text(document.getElementById("aiTaskPrioritySelect")?.value, "normal");
    const task = {
      id: `ai-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      description,
      agentId,
      type,
      priority,
      status: "queued",
      provider: "",
      model: "",
      input: { source: "task-center-form" },
      inputSnapshot: { source: "task-center-form" },
      result: null,
      warnings: [],
      errors: [],
      createdAt: now,
      updatedAt: now,
    };
    upsertInKey(PRIMARY_TASK_KEY, task);
    upsertInKey(LEGACY_TASK_KEY, task);
    const logs = readCollection(LOG_KEY);
    logs.unshift({ id: `log-${task.id}`, level: "Task", message: `Aufgabe „${title}“ wurde erstellt.`, taskId: task.id, createdAt: now, updatedAt: now });
    writeCollection(LOG_KEY, logs);
    const titleInput = document.getElementById("aiTaskTitleInput");
    const descriptionInput = document.getElementById("aiTaskDescriptionInput");
    if (titleInput) titleInput.value = "";
    if (descriptionInput) descriptionInput.value = "";
    window.dispatchEvent(new CustomEvent("elyon:ai-workforce-v2-task-updated", { detail: task }));
    window.dispatchEvent(new CustomEvent("elyon:ai-task-center-updated", { detail: task }));
    queueRender();
  }

  function updateTaskStatus(taskId, status) {
    const now = new Date().toISOString();
    for (const key of [PRIMARY_TASK_KEY, LEGACY_TASK_KEY]) {
      const tasks = readCollection(key);
      const index = tasks.findIndex((task) => text(task?.id) === taskId);
      if (index < 0) continue;
      tasks[index] = { ...tasks[index], status, updatedAt: now };
      writeCollection(key, tasks);
    }
    window.dispatchEvent(new CustomEvent("elyon:ai-workforce-v2-task-updated", { detail: { id: taskId, status, updatedAt: now } }));
    queueRender();
  }

  function removeTask(taskId) {
    for (const key of [PRIMARY_TASK_KEY, LEGACY_TASK_KEY]) {
      writeCollection(key, readCollection(key).filter((task) => text(task?.id) !== taskId));
    }
    queueRender();
  }

  function bind() {
    if (state.bound) return;
    state.bound = true;
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const create = target.closest(`#${ROOT_ID} [data-task-action="create-task"]`);
      if (create) {
        event.preventDefault();
        event.stopImmediatePropagation();
        createTaskFromForm();
        return;
      }
      const statusButton = target.closest(`#${ROOT_ID} [data-live-task-status][data-live-task-id]`);
      if (statusButton) {
        event.preventDefault();
        updateTaskStatus(text(statusButton.dataset.liveTaskId), text(statusButton.dataset.liveTaskStatus, "done"));
        return;
      }
      const removeButton = target.closest(`#${ROOT_ID} [data-live-task-remove]`);
      if (removeButton) {
        event.preventDefault();
        removeTask(text(removeButton.dataset.liveTaskRemove));
      }
    }, true);

    window.addEventListener("elyon:ai-workforce-v2-task-updated", queueRender);
    window.addEventListener("elyon:ai-workforce-custom-task-updated", queueRender);
    window.addEventListener("elyon:ai-agent-registry-updated", queueRender);
    window.addEventListener("elyon:runtime-group-loaded", (event) => {
      if (event.detail?.tabId === "virtualAgentsTab") queueRender();
    });
    window.addEventListener("elyon:tab-changed", (event) => {
      const tabId = event.detail?.tabId || event.detail;
      if (tabId === "virtualAgentsTab") queueRender();
    });
    window.addEventListener("storage", (event) => {
      if ([PRIMARY_TASK_KEY, LEGACY_TASK_KEY, LOG_KEY, EVENT_KEY].includes(event.key)) queueRender();
    });
  }

  function install() {
    bind();
    render();
  }

  window.ElyonAITaskCenterLive = { render, refresh: queueRender, tasks: mergeTasks, logs: recentLogs };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
