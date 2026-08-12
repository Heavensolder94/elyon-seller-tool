(() => {
  "use strict";

  const PANEL_ID = "elyonJarvisE1CloudPanel";
  const TAB_ID = "jarvisCommandCenterTab";
  const STYLE_ID = "elyonJarvisE1CloudStyles";

  const state = {
    loading: false,
    events: [],
    jobs: [],
    storage: { configured: false, source: "unknown" },
    queue: { workerEnabled: false, workerState: "paused", mode: "assisted" },
    control: null,
    lastRefreshAt: "",
  };

  const text = (value, fallback = "") => value === null || value === undefined ? fallback : String(value).trim();
  const escapeHtml = (value) => text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .jarvis-e1-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px;padding:11px 13px;border-radius:16px;border:1px solid rgba(56,189,248,.16);background:rgba(14,116,144,.07)}
      .jarvis-e1-head strong{font-size:11px;letter-spacing:.04em}.jarvis-e1-head span{display:block;margin-top:4px;color:#8294aa;font-size:9px;line-height:1.45}.jarvis-e1-badge{flex:0 0 auto;padding:6px 8px;border-radius:999px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);color:#bbf7d0;font-size:8px;font-weight:900;letter-spacing:.06em}
      .jarvis-e1-badge.off{background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.18);color:#fde68a}.jarvis-e1-badge.stop{background:rgba(239,68,68,.09);border-color:rgba(239,68,68,.22);color:#fca5a5}
      .jarvis-e1-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.jarvis-e1-meta span{padding:3px 6px;border-radius:999px;background:rgba(148,163,184,.07);color:#94a3b8;font-size:8px}
      .jarvis-e1-refresh{padding:7px 9px!important;border-radius:10px!important;background:rgba(255,255,255,.06)!important;border:1px solid rgba(148,163,184,.12)!important;color:#cbd5e1!important;font-size:9px!important}
    `;
    document.head.appendChild(style);
  }

  function commandCenterActive() {
    const tab = document.getElementById(TAB_ID);
    const menu = document.getElementById("mainMenu");
    return Boolean(tab?.classList.contains("active") || menu?.value === TAB_ID);
  }

  function dateLabel(value) {
    const stamp = Date.parse(text(value));
    if (!Number.isFinite(stamp)) return "ohne Zeit";
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(stamp));
  }

  function statusClass(value) {
    const status = text(value).toUpperCase();
    if (["FAILED", "BLOCKED", "CANCELLED"].includes(status)) return "blocked";
    if (["WAITING_APPROVAL", "RETRYING"].includes(status)) return "waiting";
    if (status === "RUNNING") return "running";
    if (["SUCCESS", "SUCCEEDED", "COMPLETED"].includes(status)) return "done";
    return "";
  }

  function workerBadge() {
    const enabled = state.queue?.workerEnabled === true;
    const workerState = text(state.queue?.workerState, enabled ? "ready" : "paused");
    const kill = state.control?.control?.killSwitch === true;
    if (kill || workerState === "stopped") return { label: "NOT-AUS", cls: "stop" };
    if (enabled && workerState === "throttled") return { label: "WORKER GEDROSSELT", cls: "off" };
    if (enabled) return { label: "WORKER AKTIV", cls: "" };
    return { label: "WORKER PAUSIERT", cls: "off" };
  }

  function eventRows() {
    if (!state.events.length) {
      return '<div class="jarvis-cc-empty">Noch keine serverseitigen Elyon-Ereignisse gespeichert. E4 wartet auf echte System-Events.</div>';
    }
    return state.events.slice(0, 8).map((event) => `
      <article class="jarvis-cc-item">
        <span class="jarvis-cc-item-icon">↯</span>
        <div><strong>${escapeHtml(event.type || "Event")}</strong><p>${escapeHtml(event.source || "elyon")}${event.sourceId ? ` · ${escapeHtml(event.sourceId)}` : ""} · ${escapeHtml(dateLabel(event.createdAt || event.receivedAt))}</p></div>
        <span class="jarvis-cc-pill">EVENT</span>
      </article>`).join("");
  }

  function jobRows() {
    if (!state.jobs.length) {
      return '<div class="jarvis-cc-empty">Noch keine Cloud-Jobs vorhanden. Der E4-Worker wartet auf neue Company-OS-Nova-Produkte.</div>';
    }
    return state.jobs.slice(0, 8).map((job) => {
      const resultSummary = text(job.result?.summary?.summary || job.result?.summary || "");
      return `
      <article class="jarvis-cc-item">
        <span class="jarvis-cc-item-icon">☁</span>
        <div><strong>${escapeHtml(job.command || job.eventType || "Cloud-Job")}</strong><p>${escapeHtml(job.eventType || "Event")} · ${escapeHtml(job.executionPolicy || "manual_dispatch")} · Versuch ${Number(job.attempts) || 0}/${Number(job.maxAttempts) || 0}${resultSummary ? ` · ${escapeHtml(resultSummary)}` : ""}</p></div>
        <span class="jarvis-cc-pill ${statusClass(job.status)}">${escapeHtml(text(job.status, "QUEUED"))}</span>
      </article>`;
    }).join("");
  }

  function render() {
    installStyles();
    const tab = document.getElementById(TAB_ID);
    const shell = tab?.querySelector(".jarvis-cc");
    if (!shell) return false;

    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = PANEL_ID;
      const metrics = shell.querySelector(".jarvis-cc-metrics");
      if (metrics) metrics.insertAdjacentElement("afterend", panel);
      else shell.prepend(panel);
    }

    const configured = state.storage?.configured === true;
    const badge = workerBadge();
    const mode = text(state.queue?.mode || state.control?.control?.mode, "assisted").toUpperCase();
    panel.innerHTML = `
      <div class="jarvis-e1-head">
        <div><strong>☁ Cloud-Automation · Phase E4</strong><span>Der Cloud-Worker wird jetzt durch Autopilot-Modus, Not-Aus, Budget, Job-/Token-Limits und Fehlerwächter kontrolliert. Externe Aktionen und Live-Publishing bleiben gesperrt.${state.lastRefreshAt ? ` · Aktualisiert ${escapeHtml(state.lastRefreshAt)}` : ""}</span></div>
        <div style="display:flex;gap:8px;align-items:center"><span class="jarvis-e1-badge ${badge.cls}">${escapeHtml(badge.label)}</span><button type="button" class="jarvis-e1-refresh" data-jarvis-e1-refresh>Cloud aktualisieren</button></div>
      </div>
      <div class="jarvis-cc-grid">
        <section class="jarvis-cc-card">
          <div class="jarvis-cc-card-head"><h2>Event Inbox</h2><small>${configured ? `${state.events.length} echte Server-Events` : "Persistenz nicht konfiguriert"}</small></div>
          <div class="jarvis-cc-list">${eventRows()}</div>
        </section>
        <section class="jarvis-cc-card">
          <div class="jarvis-cc-card-head"><h2>Cloud Jobs</h2><small>${state.jobs.length} Jobs · ${escapeHtml(mode)}</small></div>
          <div class="jarvis-cc-list">${jobRows()}</div>
        </section>
      </div>`;
    return true;
  }

  async function refresh() {
    if (state.loading || !commandCenterActive()) return false;
    state.loading = true;
    try {
      if (!window.ElyonJarvis?.events || !window.ElyonJarvis?.jobs) throw new Error("Jarvis Cloud Client ist nicht verfügbar.");
      const [eventsResult, jobsResult] = await Promise.allSettled([
        window.ElyonJarvis.events({ limit: 20 }),
        window.ElyonJarvis.jobs({ limit: 20 }),
      ]);
      if (eventsResult.status === "fulfilled") {
        state.events = Array.isArray(eventsResult.value?.events) ? eventsResult.value.events : [];
        state.storage = eventsResult.value?.storage || state.storage;
      }
      if (jobsResult.status === "fulfilled") {
        state.jobs = Array.isArray(jobsResult.value?.jobs) ? jobsResult.value.jobs : [];
        state.storage = jobsResult.value?.storage || state.storage;
        state.queue = jobsResult.value?.queue || state.queue;
        state.control = jobsResult.value?.control || state.control;
      }
      state.lastRefreshAt = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date());
    } catch {
      state.events = [];
      state.jobs = [];
      state.queue = { workerEnabled: false, workerState: "paused", mode: "assisted" };
    } finally {
      state.loading = false;
      render();
    }
    return true;
  }

  function refreshAfterCommandCenter(delay = 350) {
    window.setTimeout(() => {
      if (commandCenterActive()) refresh();
      else render();
    }, delay);
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("[data-jarvis-e1-refresh]")) refresh();
    if (target.closest("[data-jarvis-cc-refresh]")) refreshAfterCommandCenter();
  });

  document.addEventListener("change", (event) => {
    if (event.target?.id === "mainMenu" && event.target.value === TAB_ID) refreshAfterCommandCenter();
  }, true);

  window.addEventListener("storage", (event) => {
    if (event.key === "elyon_ai_workforce_tasks") window.queueMicrotask(() => render());
  });
  window.addEventListener("elyon:jarvis-command-center-result", () => refresh());
  window.addEventListener("elyon:jarvis-control-updated", (event) => {
    if (event.detail?.snapshot) state.control = event.detail.snapshot;
    if (commandCenterActive()) refresh();
    else render();
  });
  window.addEventListener("elyon:seller-authenticated", () => {
    if (commandCenterActive()) refreshAfterCommandCenter();
  });

  const api = Object.freeze({
    refresh,
    render,
    state: () => ({ ...state, events: [...state.events], jobs: [...state.jobs], queue: { ...state.queue } }),
  });
  window.ElyonJarvisE4Cloud = api;
  window.ElyonJarvisE3Cloud = api;
  window.ElyonJarvisE1Cloud = api;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render, { once: true });
  else render();
})();
