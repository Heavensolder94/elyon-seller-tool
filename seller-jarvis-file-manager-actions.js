(() => {
  "use strict";

  const ROOT_ID = "jarvisFileManagerPanel";
  const MODAL_ID = "jarvisFileEditorModal";
  const STYLE_ID = "jarvisFileManagerActionsStyles";
  const API = "/api/jarvis-file-actions";

  const state = {
    key: "",
    loading: false,
    busy: false,
    workflow: null,
    error: "",
  };

  let observedRoot = null;
  let rootObserver = null;
  let scheduled = false;

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
      .jarvis-fm-edit-btn{margin-right:7px!important;background:rgba(37,99,235,.11)!important;border-color:rgba(96,165,250,.22)!important;color:#bfdbfe!important}
      .jarvis-fm-editor-modal{position:fixed;inset:0;z-index:2850;display:grid;place-items:center;padding:18px;background:rgba(2,6,23,.82);backdrop-filter:blur(14px)}.jarvis-fm-editor-modal.hidden{display:none!important}
      .jarvis-fm-editor{width:min(1220px,97vw);max-height:95vh;overflow:auto;border-radius:26px;background:linear-gradient(150deg,#07111f,#0f172a 58%,#111827);border:1px solid rgba(96,165,250,.22);box-shadow:0 32px 110px rgba(0,0,0,.6)}
      .jarvis-fm-editor-head{position:sticky;top:0;z-index:3;display:flex;justify-content:space-between;gap:14px;align-items:center;padding:16px 18px;background:rgba(7,17,31,.95);border-bottom:1px solid rgba(148,163,184,.1);backdrop-filter:blur(14px)}.jarvis-fm-editor-head strong{display:block;font-size:15px}.jarvis-fm-editor-head small{display:block;margin-top:4px;color:#71849a;font-size:9px}.jarvis-fm-editor-body{padding:18px;display:grid;gap:13px}
      .jarvis-fm-editor-banner{padding:11px 12px;border-radius:14px;background:rgba(37,99,235,.07);border:1px solid rgba(96,165,250,.15);color:#bfdbfe;font-size:9px;line-height:1.5}.jarvis-fm-editor-banner.warn{color:#fde68a;background:rgba(245,158,11,.07);border-color:rgba(245,158,11,.16)}.jarvis-fm-editor-banner.bad{color:#fecaca;background:rgba(127,29,29,.09);border-color:rgba(248,113,113,.18)}
      .jarvis-fm-editor-meta{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.jarvis-fm-editor-stat{padding:10px 11px;border-radius:14px;background:rgba(2,6,23,.38);border:1px solid rgba(148,163,184,.08)}.jarvis-fm-editor-stat span{display:block;color:#71849a;font-size:8px;text-transform:uppercase;letter-spacing:.07em}.jarvis-fm-editor-stat strong{display:block;margin-top:5px;color:#e2e8f0;font-size:10px;overflow-wrap:anywhere}
      .jarvis-fm-editor-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(330px,.75fr);gap:12px}.jarvis-fm-editor-card{min-width:0;padding:13px;border-radius:17px;background:rgba(2,6,23,.34);border:1px solid rgba(148,163,184,.08)}.jarvis-fm-editor-card h3{margin:0 0 9px;font-size:11px}.jarvis-fm-editor-card label{display:block;margin:9px 0 5px;color:#8294aa;font-size:8px;text-transform:uppercase;letter-spacing:.07em}
      .jarvis-fm-editor textarea,.jarvis-fm-editor input,.jarvis-fm-editor select{width:100%;box-sizing:border-box;margin:0!important;border-radius:12px!important;background:rgba(2,6,23,.55)!important;border:1px solid rgba(148,163,184,.13)!important;color:#e5eefb!important}.jarvis-fm-editor textarea{min-height:390px;padding:12px!important;resize:vertical;font:10px/1.58 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace!important}.jarvis-fm-editor input,.jarvis-fm-editor select{padding:10px 11px!important;font-size:9px!important}
      .jarvis-fm-editor-help{margin-top:5px;color:#64748b;font-size:8px;line-height:1.45}.jarvis-fm-editor-protected{padding:10px 11px;border-radius:13px;background:rgba(139,92,246,.07);border:1px solid rgba(139,92,246,.16);color:#ddd6fe;font-size:8px;line-height:1.5}
      .jarvis-fm-editor-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.jarvis-fm-editor-actions button{padding:9px 11px!important;border-radius:11px!important;font-size:9px!important;font-weight:900!important}.jarvis-fm-action-save{background:linear-gradient(135deg,#2563eb,#4f46e5)!important}.jarvis-fm-action-approve{background:linear-gradient(135deg,#0f766e,#059669)!important}.jarvis-fm-action-activate{background:linear-gradient(135deg,#15803d,#16a34a)!important}.jarvis-fm-action-rollback{background:rgba(245,158,11,.1)!important;border:1px solid rgba(245,158,11,.2)!important;color:#fde68a!important}.jarvis-fm-editor-actions button[disabled]{opacity:.45;cursor:not-allowed}
      .jarvis-fm-mini-diff{max-height:300px;overflow:auto;border-radius:13px;background:rgba(2,6,23,.5);border:1px solid rgba(148,163,184,.08);font:8px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.jarvis-fm-mini-row{display:grid;grid-template-columns:24px 1fr}.jarvis-fm-mini-row span{padding:3px 5px;text-align:center;border-right:1px solid rgba(148,163,184,.07);color:#64748b}.jarvis-fm-mini-row code{padding:3px 7px;white-space:pre-wrap;overflow-wrap:anywhere;color:#aebed0}.jarvis-fm-mini-row.add{background:rgba(34,197,94,.08)}.jarvis-fm-mini-row.add span,.jarvis-fm-mini-row.add code{color:#bbf7d0}.jarvis-fm-mini-row.remove{background:rgba(239,68,68,.08)}.jarvis-fm-mini-row.remove span,.jarvis-fm-mini-row.remove code{color:#fecaca}
      .jarvis-fm-workflow{display:grid;gap:7px}.jarvis-fm-workflow-row{display:grid;grid-template-columns:auto minmax(0,1fr);gap:9px;align-items:start;padding:9px 10px;border-radius:13px;background:rgba(2,6,23,.38);border:1px solid rgba(148,163,184,.08)}.jarvis-fm-workflow-step{width:22px;height:22px;border-radius:8px;display:grid;place-items:center;background:rgba(59,130,246,.09);color:#93c5fd;font-size:8px;font-weight:900}.jarvis-fm-workflow-row strong{display:block;font-size:9px}.jarvis-fm-workflow-row small{display:block;margin-top:3px;color:#71849a;font-size:8px;line-height:1.4}
      @media(max-width:920px){.jarvis-fm-editor-grid{grid-template-columns:1fr}.jarvis-fm-editor-meta{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:620px){.jarvis-fm-editor-modal{padding:6px}.jarvis-fm-editor{width:100%;max-height:98vh;border-radius:18px}.jarvis-fm-editor-meta{grid-template-columns:1fr 1fr}.jarvis-fm-editor textarea{min-height:300px}}
    `;
    document.head.appendChild(style);
  }

  async function apiFetch(url, init = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(init.headers || {}) },
      ...init,
    });
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok || payload?.ok !== true) {
      const error = new Error(text(payload?.error, `HTTP ${response.status}`));
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function friendlyError(error) {
    const code = text(error?.message);
    if (Number(error?.status) === 403 && code.includes("protected_confirmation")) return "Geschützte Datei: Bitte den angezeigten Dateischlüssel exakt als Bestätigung eingeben.";
    if (Number(error?.status) === 403) return "Seller-Sitzung fehlt, ist abgelaufen oder die Schutzbestätigung ist nicht gültig.";
    if (code.includes("version_conflict")) return "Die aktive Basis hat sich seit dem Öffnen geändert. Bitte Editor neu laden und Änderungen erneut prüfen.";
    if (code.includes("not_pending")) return "Dieser Draft ist nicht mehr im Status PENDING. Bitte Workflow aktualisieren.";
    if (code.includes("not_approved")) return "Der Draft muss zuerst freigegeben werden.";
    if (code.includes("summary_required")) return "Bitte einen kurzen Änderungsgrund angeben.";
    if (code.includes("rollback_reason_required")) return "Bitte einen Grund für den Rollback angeben.";
    if (code.includes("sensitive")) return "Der Inhalt enthält etwas, das wie ein Secret oder Credential aussieht. Speichern wurde blockiert.";
    if (code.includes("too_large")) return "Die Datei überschreitet das erlaubte Größenlimit.";
    return `Workflow-Aktion fehlgeschlagen: ${code || "unbekannter Fehler"}`;
  }

  function ensureModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = MODAL_ID;
    modal.className = "jarvis-fm-editor-modal hidden";
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-jarvis-editor-close]")) closeEditor();
    });
    document.body.appendChild(modal);
    return modal;
  }

  function workflowStatus(workflow) {
    const change = workflow?.change;
    if (!change) return "Kein offener Draft";
    if (change.status === "approved") return `Draft v${change.proposedVersion} · FREIGEGEBEN`;
    return `Draft v${change.proposedVersion} · REVIEW OFFEN`;
  }

  function runtimeBanner(workflow) {
    if (workflow?.runtime?.fileStoreEnabled) {
      return '<div class="jarvis-fm-editor-banner">Runtime File Store ist <strong>EIN</strong>. Eine aktivierte Store-Version kann damit direkt von Jarvis geladen werden.</div>';
    }
    return '<div class="jarvis-fm-editor-banner warn">Runtime File Store ist <strong>AUS</strong>. Aktivieren setzt den versionierten Store-Pointer, Jarvis selbst nutzt bis zur bewussten Runtime-Freigabe weiterhin den Repository-Fallback.</div>';
  }

  function protectedHtml(workflow) {
    if (!workflow?.file?.protected) return "";
    return `
      <div class="jarvis-fm-editor-protected">
        <strong>Geschützte Core-Datei.</strong> Für Save, Freigabe, Aktivierung oder Rollback muss der Dateischlüssel bewusst bestätigt werden.
        <label>Schutzbestätigung</label>
        <input data-jarvis-protected-confirm autocomplete="off" placeholder="${escapeHtml(workflow.file.key)}" />
        <div class="jarvis-fm-editor-help">Exakt eingeben: <code>${escapeHtml(workflow.file.key)}</code></div>
      </div>`;
  }

  function diffRows(before, after) {
    const helper = window.ElyonJarvisFileManager?.lineDiff;
    if (typeof helper !== "function") return [];
    return helper(before || "", after || "");
  }

  function miniDiffHtml(before, after) {
    const rows = diffRows(before, after);
    const changed = rows.map((row, index) => row.type !== "same" ? index : -1).filter((index) => index >= 0);
    if (!changed.length) return '<div class="jarvis-fm-editor-help">Noch keine inhaltliche Änderung gegenüber der Store-Basis.</div>';
    const visible = new Set();
    changed.forEach((index) => {
      for (let offset = -1; offset <= 1; offset += 1) if (rows[index + offset]) visible.add(index + offset);
    });
    let prev = -2;
    const html = [];
    [...visible].sort((a, b) => a - b).forEach((index) => {
      if (index > prev + 1) html.push('<div class="jarvis-fm-mini-row"><span>…</span><code>…</code></div>');
      const row = rows[index];
      const marker = row.type === "add" ? "+" : row.type === "remove" ? "−" : " ";
      html.push(`<div class="jarvis-fm-mini-row ${row.type}"><span>${marker}</span><code>${escapeHtml(row.line || " ")}</code></div>`);
      prev = index;
    });
    return `<div class="jarvis-fm-mini-diff">${html.join("")}</div>`;
  }

  function rollbackOptions(workflow) {
    const current = Number(workflow?.store?.activeVersion || 0) || null;
    const versions = Array.isArray(workflow?.versions) ? workflow.versions : [];
    const eligible = versions.filter((version) => Number(version.version) > 0 && Number(version.version) !== current && version.status !== "draft");
    const options = ['<option value="repository">Repository-Baseline</option>'];
    eligible.forEach((version) => options.push(`<option value="${Number(version.version)}">v${Number(version.version)} · ${escapeHtml(text(version.status, "archived").toUpperCase())}</option>`));
    return options.join("");
  }

  function editorHtml(workflow) {
    const change = workflow.change;
    const content = change?.content ?? workflow.store?.activeContent ?? "";
    const summary = change?.changeSummary || change?.reason || "";
    const pending = change?.status === "pending";
    const approved = change?.status === "approved";
    const activeStore = workflow.store?.activeVersion ? `v${workflow.store.activeVersion}` : "Repository";
    const runtime = workflow.runtime?.source === "supabase" ? `Supabase v${workflow.runtime.version}` : "Repository";
    return `
      <div class="jarvis-fm-editor">
        <div class="jarvis-fm-editor-head">
          <div><strong>${escapeHtml(workflow.file.title)} · Edit Workflow</strong><small>${escapeHtml(workflow.file.path)} · V1.2 kontrollierte Änderung</small></div>
          <button type="button" class="jarvis-fm-btn" data-jarvis-editor-close>Schließen</button>
        </div>
        <div class="jarvis-fm-editor-body">
          ${runtimeBanner(workflow)}
          ${state.error ? `<div class="jarvis-fm-editor-banner bad">${escapeHtml(state.error)}</div>` : ""}
          <div class="jarvis-fm-editor-meta">
            <div class="jarvis-fm-editor-stat"><span>Runtime</span><strong>${escapeHtml(runtime)}</strong></div>
            <div class="jarvis-fm-editor-stat"><span>Store-Basis</span><strong>${escapeHtml(activeStore)}</strong></div>
            <div class="jarvis-fm-editor-stat"><span>Workflow</span><strong>${escapeHtml(workflowStatus(workflow))}</strong></div>
            <div class="jarvis-fm-editor-stat"><span>Schutz</span><strong>${workflow.file.protected ? "PROTECTED" : "NORMAL"}</strong></div>
            <div class="jarvis-fm-editor-stat"><span>Versionen</span><strong>${Array.isArray(workflow.versions) ? workflow.versions.length : 0}</strong></div>
          </div>
          <div class="jarvis-fm-editor-grid">
            <section class="jarvis-fm-editor-card">
              <h3>Datei bearbeiten</h3>
              <label>Änderungsgrund</label>
              <input data-jarvis-change-summary maxlength="1000" value="${escapeHtml(summary)}" placeholder="Was wurde geändert und warum?" />
              <label>Inhalt</label>
              <textarea data-jarvis-editor-content spellcheck="false">${escapeHtml(content)}</textarea>
              ${protectedHtml(workflow)}
              <div class="jarvis-fm-editor-actions">
                <button type="button" class="jarvis-fm-action-save" data-jarvis-save-draft ${state.busy ? "disabled" : ""}>Draft speichern</button>
                ${pending ? `<button type="button" class="jarvis-fm-action-approve" data-jarvis-approve ${state.busy ? "disabled" : ""}>Draft freigeben</button>` : ""}
                ${approved ? `<button type="button" class="jarvis-fm-action-activate" data-jarvis-activate ${state.busy ? "disabled" : ""}>Freigabe aktivieren</button>` : ""}
              </div>
              <div class="jarvis-fm-editor-help">Speichern erzeugt immer eine neue immutable Version. Wird ein bereits freigegebener Draft nochmals verändert, verfällt die alte Freigabe automatisch.</div>
            </section>
            <aside class="jarvis-fm-editor-card">
              <h3>Live-Diff zur Store-Basis</h3>
              <div data-jarvis-live-diff>${miniDiffHtml(workflow.store?.activeContent || "", content)}</div>
              <label>Rollback-Ziel</label>
              <select data-jarvis-rollback-target>${rollbackOptions(workflow)}</select>
              <label>Rollback-Grund</label>
              <input data-jarvis-rollback-reason maxlength="1000" placeholder="Warum soll zurückgerollt werden?" />
              <div class="jarvis-fm-editor-actions"><button type="button" class="jarvis-fm-action-rollback" data-jarvis-rollback ${state.busy ? "disabled" : ""}>Rollback ausführen</button></div>
              <div class="jarvis-fm-workflow">
                <div class="jarvis-fm-workflow-row"><span class="jarvis-fm-workflow-step">1</span><div><strong>Draft</strong><small>Neue immutable Version + Change Request.</small></div></div>
                <div class="jarvis-fm-workflow-row"><span class="jarvis-fm-workflow-step">2</span><div><strong>Review</strong><small>Diff prüfen und explizit freigeben.</small></div></div>
                <div class="jarvis-fm-workflow-row"><span class="jarvis-fm-workflow-step">3</span><div><strong>Aktivieren</strong><small>Nur freigegebene und nicht veraltete Versionen können Store-Active werden.</small></div></div>
                <div class="jarvis-fm-workflow-row"><span class="jarvis-fm-workflow-step">4</span><div><strong>Rollback</strong><small>Frühere Store-Version oder Repository-Baseline wiederherstellen.</small></div></div>
              </div>
            </aside>
          </div>
        </div>
      </div>`;
  }

  function renderEditor() {
    const modal = ensureModal();
    if (state.loading) {
      modal.innerHTML = '<div class="jarvis-fm-editor"><div class="jarvis-fm-editor-body"><div class="jarvis-fm-editor-banner">Workflow wird geladen …</div></div></div>';
      return;
    }
    if (!state.workflow) {
      modal.innerHTML = `<div class="jarvis-fm-editor"><div class="jarvis-fm-editor-head"><div><strong>Brain-Datei konnte nicht geladen werden</strong></div><button type="button" class="jarvis-fm-btn" data-jarvis-editor-close>Schließen</button></div><div class="jarvis-fm-editor-body"><div class="jarvis-fm-editor-banner bad">${escapeHtml(state.error || "Unbekannter Fehler")}</div></div></div>`;
      return;
    }
    modal.innerHTML = editorHtml(state.workflow);
    bindEditor(modal);
  }

  function protectedConfirmation() {
    return text(document.querySelector("[data-jarvis-protected-confirm]")?.value, "");
  }

  function currentEditorContent() {
    return document.querySelector("[data-jarvis-editor-content]")?.value ?? "";
  }

  function currentSummary() {
    return text(document.querySelector("[data-jarvis-change-summary]")?.value, "");
  }

  async function runAction(payload, confirmationMessage = "") {
    if (state.busy || !state.workflow) return false;
    if (confirmationMessage && !window.confirm(confirmationMessage)) return false;
    state.busy = true;
    state.error = "";
    const preservedContent = currentEditorContent();
    const preservedSummary = currentSummary();
    try {
      state.workflow = await apiFetch(API, { method: "POST", body: JSON.stringify(payload) });
      window.ElyonJarvisFileManager?.refresh?.();
      window.ElyonJarvisFileManagerMountBridge?.schedule?.();
      renderEditor();
      return true;
    } catch (error) {
      state.error = friendlyError(error);
      renderEditor();
      const content = document.querySelector("[data-jarvis-editor-content]");
      const summary = document.querySelector("[data-jarvis-change-summary]");
      if (content) content.value = preservedContent;
      if (summary) summary.value = preservedSummary;
      updateLiveDiff();
      return false;
    } finally {
      state.busy = false;
    }
  }

  function basePayload(action) {
    return {
      action,
      key: state.workflow.file.key,
      protectedConfirmation: protectedConfirmation(),
    };
  }

  async function saveDraft() {
    const payload = {
      ...basePayload("create_draft"),
      content: currentEditorContent(),
      changeSummary: currentSummary(),
      expectedActiveVersion: state.workflow.store?.activeVersion ?? null,
    };
    return runAction(payload);
  }

  async function approveDraft() {
    const change = state.workflow?.change;
    if (!change) return false;
    return runAction({ ...basePayload("approve_draft"), changeRequestId: change.id, confirmed: true }, `Draft v${change.proposedVersion} wirklich freigeben? Danach ist genau dieser Inhalt zur Aktivierung berechtigt.`);
  }

  async function activateDraft() {
    const change = state.workflow?.change;
    if (!change) return false;
    const runtimeNote = state.workflow.runtime?.fileStoreEnabled
      ? "Jarvis kann diese Version anschließend direkt aus dem File Store laden."
      : "Der Store-Pointer wird aktiviert; Jarvis bleibt vorerst auf Repository-Fallback, weil Runtime Store AUS ist.";
    return runAction({ ...basePayload("activate_draft"), changeRequestId: change.id, confirmed: true }, `Freigegebenen Draft v${change.proposedVersion} aktivieren?\n\n${runtimeNote}`);
  }

  async function rollback() {
    const target = document.querySelector("[data-jarvis-rollback-target]")?.value || "repository";
    const reason = text(document.querySelector("[data-jarvis-rollback-reason]")?.value, "");
    const targetLabel = target === "repository" ? "Repository-Baseline" : `Version ${target}`;
    return runAction({ ...basePayload("rollback"), targetVersion: target, reason, confirmed: true }, `Wirklich auf ${targetLabel} zurückrollen? Offene Draft-Freigaben dieser Datei werden dabei verworfen.`);
  }

  function updateLiveDiff() {
    if (!state.workflow) return;
    const host = document.querySelector("[data-jarvis-live-diff]");
    if (host) host.innerHTML = miniDiffHtml(state.workflow.store?.activeContent || "", currentEditorContent());
  }

  function bindEditor(modal) {
    modal.querySelector("[data-jarvis-editor-content]")?.addEventListener("input", updateLiveDiff);
    const save = modal.querySelector("[data-jarvis-save-draft]");
    const approve = modal.querySelector("[data-jarvis-approve]");
    const activate = modal.querySelector("[data-jarvis-activate]");
    const rollbackButton = modal.querySelector("[data-jarvis-rollback]");
    if (save) save.onclick = saveDraft;
    if (approve) approve.onclick = approveDraft;
    if (activate) activate.onclick = activateDraft;
    if (rollbackButton) rollbackButton.onclick = rollback;
  }

  async function openEditor(key) {
    state.key = text(key);
    state.loading = true;
    state.error = "";
    state.workflow = null;
    const modal = ensureModal();
    modal.classList.remove("hidden");
    renderEditor();
    try {
      state.workflow = await apiFetch(`${API}?key=${encodeURIComponent(state.key)}`);
    } catch (error) {
      state.error = friendlyError(error);
    } finally {
      state.loading = false;
      renderEditor();
    }
  }

  function closeEditor() {
    ensureModal().classList.add("hidden");
    state.key = "";
    state.workflow = null;
    state.error = "";
  }

  function decorate(root = document.getElementById(ROOT_ID)) {
    if (!root) return false;
    root.querySelectorAll("[data-jarvis-file-key]").forEach((card) => {
      const key = text(card.dataset.jarvisFileKey);
      const actions = card.querySelector(".jarvis-fm-file-actions");
      if (!key || !actions || actions.querySelector("[data-jarvis-file-edit]")) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "jarvis-fm-btn jarvis-fm-edit-btn";
      button.dataset.jarvisFileEdit = key;
      button.textContent = "Bearbeiten";
      button.onclick = () => openEditor(key);
      actions.prepend(button);
    });
    return true;
  }

  function bindRoot() {
    const root = document.getElementById(ROOT_ID);
    if (!root) return false;
    if (root !== observedRoot) {
      rootObserver?.disconnect();
      observedRoot = root;
      rootObserver = new MutationObserver(() => scheduleDecorate());
      rootObserver.observe(root, { childList: true, subtree: true });
    }
    decorate(root);
    return true;
  }

  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => requestAnimationFrame(() => {
      scheduled = false;
      bindRoot();
    }));
  }

  function mount() {
    installStyles();
    ensureModal();
    scheduleDecorate();
    window.addEventListener("elyon:tab-changed", scheduleDecorate);
    window.addEventListener("elyon:seller-authenticated", scheduleDecorate);
    return true;
  }

  window.ElyonJarvisFileManagerActions = Object.freeze({
    mount,
    bindRoot,
    decorate,
    openEditor,
    closeEditor,
    state,
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
