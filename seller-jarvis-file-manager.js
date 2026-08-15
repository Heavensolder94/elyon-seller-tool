(() => {
  "use strict";

  const TAB_ID = "jarvisCommandCenterTab";
  const ROOT_ID = "jarvisFileManagerPanel";
  const STYLE_ID = "jarvisFileManagerStyles";
  const MODAL_ID = "jarvisFileManagerModal";
  const API = "/api/jarvis-files";

  const state = {
    loading: false,
    error: "",
    snapshot: null,
    query: "",
    detail: null,
    detailLoading: false,
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
      .jarvis-fm{min-width:0;padding:18px;border-radius:24px;background:linear-gradient(145deg,rgba(15,23,42,.66),rgba(8,17,31,.72));border:1px solid rgba(96,165,250,.16);box-shadow:0 18px 50px rgba(2,6,23,.18)}
      .jarvis-fm-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:15px}.jarvis-fm-title-wrap{display:flex;gap:11px;align-items:flex-start}.jarvis-fm-icon{width:35px;height:35px;display:grid;place-items:center;flex:0 0 auto;border-radius:12px;background:linear-gradient(135deg,rgba(37,99,235,.18),rgba(124,58,237,.2));border:1px solid rgba(96,165,250,.22);color:#bfdbfe;font-size:16px}.jarvis-fm-kicker{font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:#60a5fa;font-weight:950}.jarvis-fm h2{margin:3px 0 0!important;font-size:16px!important;letter-spacing:-.02em}.jarvis-fm-sub{margin:5px 0 0;color:#8294aa;font-size:9px;line-height:1.5}.jarvis-fm-actions{display:flex;gap:7px;align-items:center}.jarvis-fm-btn{padding:8px 10px!important;border-radius:11px!important;background:rgba(255,255,255,.055)!important;border:1px solid rgba(148,163,184,.13)!important;color:#dbeafe!important;font-size:9px!important;font-weight:850!important}.jarvis-fm-btn:hover{background:rgba(96,165,250,.1)!important}.jarvis-fm-btn.primary{background:linear-gradient(135deg,#2563eb,#6d28d9)!important;border-color:transparent!important}.jarvis-fm-btn[disabled]{opacity:.48;cursor:not-allowed;transform:none!important;filter:none!important}
      .jarvis-fm-statusline{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:13px}.jarvis-fm-pill{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;font-size:8px;font-weight:900;letter-spacing:.02em;background:rgba(148,163,184,.07);border:1px solid rgba(148,163,184,.12);color:#cbd5e1}.jarvis-fm-pill.ok{color:#bbf7d0;background:rgba(34,197,94,.08);border-color:rgba(34,197,94,.18)}.jarvis-fm-pill.info{color:#bfdbfe;background:rgba(59,130,246,.08);border-color:rgba(59,130,246,.18)}.jarvis-fm-pill.draft{color:#fde68a;background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.18)}.jarvis-fm-pill.lock{color:#ddd6fe;background:rgba(139,92,246,.08);border-color:rgba(139,92,246,.18)}
      .jarvis-fm-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:13px}.jarvis-fm-metric{padding:11px 12px;border-radius:15px;background:rgba(2,6,23,.34);border:1px solid rgba(148,163,184,.09)}.jarvis-fm-metric span{display:block;color:#71849a;font-size:8px;text-transform:uppercase;letter-spacing:.08em}.jarvis-fm-metric strong{display:block;margin-top:5px;font-size:18px;letter-spacing:-.035em;color:#e5eefb}.jarvis-fm-toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-bottom:12px}.jarvis-fm-search{margin:0!important;padding:10px 12px!important;border-radius:12px!important;background:rgba(2,6,23,.44)!important;border:1px solid rgba(148,163,184,.12)!important;font-size:10px!important}
      .jarvis-fm-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.jarvis-fm-file{min-width:0;padding:12px;border-radius:17px;background:rgba(2,6,23,.35);border:1px solid rgba(148,163,184,.09);transition:border-color .15s ease,transform .15s ease,background .15s ease}.jarvis-fm-file:hover{transform:translateY(-1px);border-color:rgba(96,165,250,.24);background:rgba(2,6,23,.46)}.jarvis-fm-file-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.jarvis-fm-file-title{min-width:0}.jarvis-fm-file-title strong{display:block;color:#eef6ff;font-size:11px;line-height:1.35}.jarvis-fm-file-title code{display:block;margin-top:4px;color:#64748b;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.jarvis-fm-shield{width:22px;height:22px;display:grid;place-items:center;flex:0 0 auto;border-radius:8px;background:rgba(139,92,246,.09);border:1px solid rgba(139,92,246,.16);font-size:9px;color:#c4b5fd}.jarvis-fm-file-meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:10px}.jarvis-fm-file-note{min-height:28px;margin:9px 0 0;color:#71849a;font-size:8px;line-height:1.5}.jarvis-fm-file-actions{display:flex;justify-content:flex-end;margin-top:9px;padding-top:9px;border-top:1px solid rgba(148,163,184,.07)}.jarvis-fm-empty{grid-column:1/-1;padding:22px 14px;border-radius:16px;border:1px dashed rgba(148,163,184,.16);text-align:center;color:#71849a;font-size:9px;line-height:1.5}.jarvis-fm-error{padding:12px 13px;border-radius:14px;background:rgba(127,29,29,.09);border:1px solid rgba(248,113,113,.18);color:#fecaca;font-size:9px;line-height:1.5}.jarvis-fm-foot{margin-top:11px;padding-top:10px;border-top:1px solid rgba(148,163,184,.07);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:#64748b;font-size:8px;line-height:1.5}
      .jarvis-fm-modal{position:fixed;inset:0;z-index:2800;display:grid;place-items:center;padding:22px;background:rgba(2,6,23,.78);backdrop-filter:blur(12px)}.jarvis-fm-modal.hidden{display:none!important}.jarvis-fm-dialog{width:min(1120px,96vw);max-height:90vh;overflow:auto;border-radius:26px;background:linear-gradient(150deg,#07111f,#0f172a 58%,#111827);border:1px solid rgba(96,165,250,.2);box-shadow:0 30px 100px rgba(0,0,0,.55)}.jarvis-fm-dialog-head{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;gap:14px;align-items:center;padding:17px 19px;background:rgba(7,17,31,.94);border-bottom:1px solid rgba(148,163,184,.1);backdrop-filter:blur(14px)}.jarvis-fm-dialog-title strong{display:block;font-size:15px}.jarvis-fm-dialog-title small{display:block;margin-top:4px;color:#71849a;font-size:9px}.jarvis-fm-dialog-body{padding:18px}.jarvis-fm-detail-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:14px}.jarvis-fm-detail-box{padding:11px;border-radius:14px;background:rgba(2,6,23,.4);border:1px solid rgba(148,163,184,.09)}.jarvis-fm-detail-box span{display:block;color:#71849a;font-size:8px;text-transform:uppercase;letter-spacing:.07em}.jarvis-fm-detail-box strong{display:block;margin-top:5px;color:#e2e8f0;font-size:10px;overflow-wrap:anywhere}.jarvis-fm-compare{display:grid;grid-template-columns:1fr 1fr;gap:10px}.jarvis-fm-pane{min-width:0;border-radius:17px;overflow:hidden;background:rgba(2,6,23,.42);border:1px solid rgba(148,163,184,.09)}.jarvis-fm-pane-head{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:10px 12px;background:rgba(255,255,255,.025);border-bottom:1px solid rgba(148,163,184,.08)}.jarvis-fm-pane-head strong{font-size:9px}.jarvis-fm-pane pre{margin:0;padding:13px;max-height:440px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;color:#cbd5e1;font:9px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.jarvis-fm-diff-state{margin:0 0 12px;padding:10px 12px;border-radius:14px;color:#bbf7d0;background:rgba(34,197,94,.07);border:1px solid rgba(34,197,94,.15);font-size:9px}.jarvis-fm-diff-state.changed{color:#fde68a;background:rgba(245,158,11,.07);border-color:rgba(245,158,11,.16)}.jarvis-fm-safety{margin-top:13px;padding:11px 12px;border-radius:14px;color:#94a3b8;background:rgba(139,92,246,.055);border:1px solid rgba(139,92,246,.13);font-size:9px;line-height:1.55}
      @media(max-width:980px){.jarvis-fm-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.jarvis-fm-compare{grid-template-columns:1fr}.jarvis-fm-detail-meta{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:650px){.jarvis-fm-head{display:grid}.jarvis-fm-actions{justify-content:flex-start}.jarvis-fm-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.jarvis-fm-grid{grid-template-columns:1fr}.jarvis-fm-toolbar{grid-template-columns:1fr}.jarvis-fm-detail-meta{grid-template-columns:1fr 1fr}.jarvis-fm-modal{padding:8px}.jarvis-fm-dialog{width:100%;max-height:96vh;border-radius:20px}}
    `;
    document.head.appendChild(style);
  }

  function statusPill(label, kind = "") {
    return `<span class="jarvis-fm-pill ${kind}">${escapeHtml(label)}</span>`;
  }

  function activeLabel(file) {
    return file.activeSource === "supabase"
      ? `Supabase · v${Number(file.activeVersion || 0)}`
      : "GitHub · Repository";
  }

  function fileNote(file) {
    if (file.latestDraft) return `Draft v${file.latestDraft.version} liegt in Supabase und ist noch nicht aktiv.`;
    if (file.activeSource === "supabase") return "Aktive Version wird aus dem File Store geladen.";
    return "Keine aktive Store-Version. Jarvis nutzt den Repository-Fallback.";
  }

  function renderFile(file) {
    const badges = [statusPill(activeLabel(file), file.activeSource === "supabase" ? "ok" : "info")];
    if (file.latestDraft) badges.push(statusPill(`Draft v${file.latestDraft.version}`, "draft"));
    if (file.required) badges.push(statusPill("Core", "info"));
    return `
      <article class="jarvis-fm-file" data-jarvis-file-key="${escapeHtml(file.key)}">
        <div class="jarvis-fm-file-top">
          <div class="jarvis-fm-file-title">
            <strong>${escapeHtml(file.title)}</strong>
            <code>${escapeHtml(file.path)}</code>
          </div>
          ${file.protected ? '<span class="jarvis-fm-shield" title="Geschützte Brain-Datei">◆</span>' : ""}
        </div>
        <div class="jarvis-fm-file-meta">${badges.join("")}</div>
        <p class="jarvis-fm-file-note">${escapeHtml(fileNote(file))}</p>
        <div class="jarvis-fm-file-actions">
          <button type="button" class="jarvis-fm-btn" data-jarvis-file-open="${escapeHtml(file.key)}">Öffnen / Diff</button>
        </div>
      </article>`;
  }

  function filteredFiles() {
    const files = Array.isArray(state.snapshot?.files) ? state.snapshot.files : [];
    const query = state.query.toLowerCase();
    if (!query) return files;
    return files.filter((file) => [file.title, file.path, file.key, file.category]
      .some((value) => text(value).toLowerCase().includes(query)));
  }

  function panelHtml() {
    if (state.loading && !state.snapshot) {
      return `<div class="jarvis-fm-empty">Brain-Dateien werden sicher geladen …</div>`;
    }
    if (state.error && !state.snapshot) {
      return `<div class="jarvis-fm-error">${escapeHtml(state.error)}</div>`;
    }
    const snapshot = state.snapshot || { stats: {}, files: [] };
    const stats = snapshot.stats || {};
    const files = filteredFiles();
    return `
      <div class="jarvis-fm-statusline">
        ${statusPill("Read-only UI", "ok")}
        ${statusPill(snapshot.runtimeFileStoreEnabled ? "Runtime Store: EIN" : "Runtime Store: AUS", snapshot.runtimeFileStoreEnabled ? "draft" : "info")}
        ${statusPill("Versioniert", "info")}
        ${statusPill("Aktivierung gesperrt", "lock")}
      </div>
      <div class="jarvis-fm-metrics">
        <div class="jarvis-fm-metric"><span>Verwaltet</span><strong>${Number(stats.managed || 0)}</strong></div>
        <div class="jarvis-fm-metric"><span>Drafts</span><strong>${Number(stats.drafts || 0)}</strong></div>
        <div class="jarvis-fm-metric"><span>Repo aktiv</span><strong>${Number(stats.repositoryActive || 0)}</strong></div>
        <div class="jarvis-fm-metric"><span>Geschützt</span><strong>${Number(stats.protected || 0)}</strong></div>
      </div>
      <div class="jarvis-fm-toolbar">
        <input class="jarvis-fm-search" id="jarvisFileManagerSearch" type="search" placeholder="Brain-Datei suchen …" value="${escapeHtml(state.query)}" autocomplete="off" />
        <button type="button" class="jarvis-fm-btn" data-jarvis-fm-refresh>Aktualisieren</button>
      </div>
      ${state.error ? `<div class="jarvis-fm-error" style="margin-bottom:10px">${escapeHtml(state.error)}</div>` : ""}
      <div class="jarvis-fm-grid">
        ${files.length ? files.map(renderFile).join("") : '<div class="jarvis-fm-empty">Keine passende Brain-Datei gefunden.</div>'}
      </div>
      <div class="jarvis-fm-foot">
        <span>Aktive Quelle und Draft-Status werden getrennt angezeigt. Ein Draft verändert Jarvis noch nicht.</span>
        <span>${snapshot.checkedAt ? `Stand ${escapeHtml(new Date(snapshot.checkedAt).toLocaleString("de-DE"))}` : ""}</span>
      </div>`;
  }

  function ensurePanel() {
    const tab = document.getElementById(TAB_ID);
    const shell = tab?.querySelector(".jarvis-cc");
    if (!shell) return null;
    let panel = document.getElementById(ROOT_ID);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = ROOT_ID;
      panel.className = "jarvis-fm";
      const metrics = shell.querySelector(".jarvis-cc-metrics");
      if (metrics) metrics.insertAdjacentElement("afterend", panel);
      else shell.appendChild(panel);
    }
    panel.innerHTML = `
      <div class="jarvis-fm-head">
        <div class="jarvis-fm-title-wrap">
          <div class="jarvis-fm-icon">⌁</div>
          <div>
            <div class="jarvis-fm-kicker">Brain Center · File Manager</div>
            <h2>Jarvis Brain Files</h2>
            <p class="jarvis-fm-sub">Zentrale Sicht auf Core-Dateien, Repository-Fallbacks und versionierte Supabase-Drafts.</p>
          </div>
        </div>
        <div class="jarvis-fm-actions">
          <button type="button" class="jarvis-fm-btn" data-jarvis-fm-refresh>↻ Sync</button>
        </div>
      </div>
      <div data-jarvis-fm-body>${panelHtml()}</div>`;
    bindPanel(panel);
    return panel;
  }

  function renderBody() {
    const panel = document.getElementById(ROOT_ID) || ensurePanel();
    const body = panel?.querySelector("[data-jarvis-fm-body]");
    if (!body) return false;
    body.innerHTML = panelHtml();
    bindPanel(panel);
    return true;
  }

  async function apiFetch(url) {
    const response = await fetch(url, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok || payload?.ok !== true) {
      const error = new Error(text(payload?.message || payload?.error, `HTTP ${response.status}`));
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function friendlyError(error) {
    if (Number(error?.status) === 403) return "Seller-Sitzung fehlt oder ist abgelaufen. Bitte Seller Tool erneut entsperren.";
    if (Number(error?.status) === 503) return "File Manager konnte Supabase gerade nicht lesen. Jarvis selbst bleibt durch den Repository-Fallback geschützt.";
    return `File Manager nicht verfügbar: ${text(error?.message, "unbekannter Fehler")}`;
  }

  async function refresh(force = false) {
    if (state.loading && !force) return false;
    state.loading = true;
    state.error = "";
    renderBody();
    try {
      state.snapshot = await apiFetch(API);
    } catch (error) {
      state.error = friendlyError(error);
    } finally {
      state.loading = false;
      renderBody();
    }
    return Boolean(state.snapshot);
  }

  function ensureModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.className = "jarvis-fm-modal hidden";
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-jarvis-fm-close]")) closeDetail();
    });
    document.body.appendChild(modal);
    return modal;
  }

  function detailMeta(file, detail) {
    return `
      <div class="jarvis-fm-detail-meta">
        <div class="jarvis-fm-detail-box"><span>Aktive Quelle</span><strong>${escapeHtml(activeLabel(file))}</strong></div>
        <div class="jarvis-fm-detail-box"><span>Draft</span><strong>${detail.draft ? `v${detail.draft.version} · ${escapeHtml(detail.draft.status)}` : "Keiner"}</strong></div>
        <div class="jarvis-fm-detail-box"><span>Kategorie</span><strong>${escapeHtml(file.category)}</strong></div>
        <div class="jarvis-fm-detail-box"><span>Schutz</span><strong>${file.protected ? "Geschützt" : "Normal"}</strong></div>
      </div>`;
  }

  function detailHtml(detail) {
    const file = detail.file || {};
    const draft = detail.draft;
    const changed = Boolean(draft && !draft.identicalToActive);
    const activeTitle = detail.active?.source === "supabase"
      ? `Aktiv · Supabase v${detail.active.version}`
      : "Aktiv · GitHub Repository";
    return `
      <div class="jarvis-fm-dialog">
        <div class="jarvis-fm-dialog-head">
          <div class="jarvis-fm-dialog-title">
            <strong>${escapeHtml(file.title || "Brain File")}</strong>
            <small>${escapeHtml(file.path || "")}</small>
          </div>
          <button type="button" class="jarvis-fm-btn" data-jarvis-fm-close>Schließen</button>
        </div>
        <div class="jarvis-fm-dialog-body">
          ${detailMeta(file, detail)}
          ${draft
            ? `<div class="jarvis-fm-diff-state ${changed ? "changed" : ""}">${changed ? "Draft unterscheidet sich von der aktiven Datei." : "Draft und aktive Datei sind inhaltlich identisch."}${draft.changeSummary ? ` · ${escapeHtml(draft.changeSummary)}` : ""}</div>`
            : '<div class="jarvis-fm-diff-state">Keine Draft-Version vorhanden. Jarvis nutzt die aktive Quelle unverändert.</div>'}
          <div class="jarvis-fm-compare">
            <section class="jarvis-fm-pane">
              <div class="jarvis-fm-pane-head"><strong>${escapeHtml(activeTitle)}</strong>${statusPill("AKTIV", "ok")}</div>
              <pre>${escapeHtml(detail.active?.content || "Kein Inhalt verfügbar")}</pre>
            </section>
            <section class="jarvis-fm-pane">
              <div class="jarvis-fm-pane-head"><strong>${draft ? `Supabase Draft v${draft.version}` : "Supabase Draft"}</strong>${draft ? statusPill("DRAFT", "draft") : statusPill("LEER")}</div>
              <pre>${escapeHtml(draft?.content || "Noch kein Draft vorhanden.")}</pre>
            </section>
          </div>
          <div class="jarvis-fm-safety">
            <strong>Sicherheitsmodus:</strong> Diese Ansicht ist bewusst read-only. Drafts können geprüft und verglichen werden, aber nicht versehentlich aktiviert werden. Geschützte Core-Dateien bleiben zusätzlich gesperrt.
          </div>
        </div>
      </div>`;
  }

  async function openDetail(key) {
    const modal = ensureModal();
    state.detailLoading = true;
    modal.classList.remove("hidden");
    modal.innerHTML = '<div class="jarvis-fm-dialog"><div class="jarvis-fm-dialog-body"><div class="jarvis-fm-empty">Datei und Versionen werden geladen …</div></div></div>';
    try {
      const detail = await apiFetch(`${API}?key=${encodeURIComponent(key)}`);
      state.detail = detail;
      modal.innerHTML = detailHtml(detail);
    } catch (error) {
      modal.innerHTML = `<div class="jarvis-fm-dialog"><div class="jarvis-fm-dialog-head"><div class="jarvis-fm-dialog-title"><strong>Datei konnte nicht geöffnet werden</strong></div><button type="button" class="jarvis-fm-btn" data-jarvis-fm-close>Schließen</button></div><div class="jarvis-fm-dialog-body"><div class="jarvis-fm-error">${escapeHtml(friendlyError(error))}</div></div></div>`;
    } finally {
      state.detailLoading = false;
    }
  }

  function closeDetail() {
    const modal = document.getElementById(MODAL_ID);
    modal?.classList.add("hidden");
    state.detail = null;
  }

  function bindPanel(panel) {
    panel.querySelectorAll("[data-jarvis-fm-refresh]").forEach((button) => {
      button.onclick = () => refresh(true);
    });
    panel.querySelectorAll("[data-jarvis-file-open]").forEach((button) => {
      button.onclick = () => openDetail(button.dataset.jarvisFileOpen);
    });
    const search = panel.querySelector("#jarvisFileManagerSearch");
    if (search) {
      search.oninput = () => {
        state.query = search.value;
        renderBody();
        const next = document.querySelector("#jarvisFileManagerSearch");
        next?.focus();
        if (next) next.setSelectionRange(next.value.length, next.value.length);
      };
    }
  }

  let mountScheduled = false;
  function scheduleMount() {
    if (mountScheduled) return;
    mountScheduled = true;
    requestAnimationFrame(() => {
      mountScheduled = false;
      const panel = ensurePanel();
      if (panel && !state.snapshot && !state.loading) refresh();
    });
  }

  function mount() {
    installStyles();
    ensureModal();
    scheduleMount();
    const observer = new MutationObserver(() => {
      if (!document.getElementById(ROOT_ID)) scheduleMount();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("elyon:tab-changed", scheduleMount);
    return true;
  }

  window.ElyonJarvisFileManager = Object.freeze({
    mount,
    refresh,
    openDetail,
    closeDetail,
    state,
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
