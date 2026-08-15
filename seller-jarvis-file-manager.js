(() => {
  "use strict";

  const TAB_ID = "jarvisCommandCenterTab";
  const ROOT_ID = "jarvisFileManagerPanel";
  const STYLE_ID = "jarvisFileManagerStyles";
  const MODAL_ID = "jarvisFileManagerModal";
  const API = "/api/jarvis-files";

  const GROUPS = Object.freeze([
    { id: "core", title: "Core Brain", icon: "◉", subtitle: "Identität, Kontext und dauerhafte Ziele", keys: ["brain.identity", "brain.elyon_context", "brain.goals"] },
    { id: "rules", title: "Rules & Safety", icon: "◆", subtitle: "Betriebsregeln, Grenzen und Fähigkeiten", keys: ["brain.operating_rules", "brain.capabilities"] },
    { id: "execution", title: "Execution", icon: "⌘", subtitle: "Wiederverwendbare Abläufe und Handlungslogik", keys: ["brain.playbooks"] },
  ]);

  const DESCRIPTIONS = Object.freeze({
    "brain.identity": "Definiert, wer Jarvis ist, welche Rolle er hat und wie er sich grundsätzlich verhält.",
    "brain.elyon_context": "Hält den stabilen Elyon-Systemkontext fest, damit Jarvis Entscheidungen im richtigen Gesamtzusammenhang trifft.",
    "brain.operating_rules": "Enthält verbindliche Arbeits-, Sicherheits- und Entscheidungsregeln für Jarvis.",
    "brain.capabilities": "Beschreibt, was Jarvis darf, kann und bewusst nicht autonom ausführen soll.",
    "brain.goals": "Definiert Jarvis’ permanente Ziele, Prioritäten und Optimierungsrichtung.",
    "brain.playbooks": "Enthält standardisierte Vorgehensweisen für wiederkehrende Aufgaben und Spezialfälle.",
  });

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
      .jarvis-fm{min-width:0;padding:18px;border-radius:24px;background:linear-gradient(145deg,rgba(15,23,42,.68),rgba(8,17,31,.76));border:1px solid rgba(96,165,250,.16);box-shadow:0 18px 50px rgba(2,6,23,.18)}
      .jarvis-fm-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:15px}.jarvis-fm-title-wrap{display:flex;gap:11px;align-items:flex-start}.jarvis-fm-icon{width:38px;height:38px;display:grid;place-items:center;flex:0 0 auto;border-radius:13px;background:radial-gradient(circle at 35% 30%,rgba(224,242,254,.9),rgba(56,189,248,.65) 14%,rgba(37,99,235,.25) 48%,rgba(15,23,42,.7) 74%);border:1px solid rgba(125,211,252,.36);color:#e0f2fe;font-size:14px;box-shadow:0 0 24px rgba(56,189,248,.14)}.jarvis-fm-kicker{font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:#60a5fa;font-weight:950}.jarvis-fm h2{margin:3px 0 0!important;font-size:17px!important;letter-spacing:-.02em}.jarvis-fm-sub{margin:5px 0 0;color:#8294aa;font-size:9px;line-height:1.5}.jarvis-fm-actions{display:flex;gap:7px;align-items:center}.jarvis-fm-btn{padding:8px 10px!important;border-radius:11px!important;background:rgba(255,255,255,.055)!important;border:1px solid rgba(148,163,184,.13)!important;color:#dbeafe!important;font-size:9px!important;font-weight:850!important}.jarvis-fm-btn:hover{background:rgba(96,165,250,.1)!important}.jarvis-fm-btn.primary{background:linear-gradient(135deg,#2563eb,#6d28d9)!important;border-color:transparent!important}.jarvis-fm-btn[disabled]{opacity:.48;cursor:not-allowed;transform:none!important;filter:none!important}
      .jarvis-fm-health{display:grid;grid-template-columns:minmax(220px,.8fr) minmax(0,1.7fr);gap:10px;margin-bottom:13px}.jarvis-fm-health-main{display:flex;gap:12px;align-items:center;padding:14px;border-radius:17px;background:linear-gradient(145deg,rgba(2,6,23,.48),rgba(15,23,42,.54));border:1px solid rgba(34,197,94,.16)}.jarvis-fm-health-main.attention{border-color:rgba(245,158,11,.2)}.jarvis-fm-health-main.critical{border-color:rgba(248,113,113,.25)}.jarvis-fm-health-orb{width:38px;height:38px;border-radius:999px;display:grid;place-items:center;flex:0 0 auto;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.24);color:#86efac;box-shadow:0 0 22px rgba(34,197,94,.12)}.jarvis-fm-health-main.attention .jarvis-fm-health-orb{color:#fde68a;background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.23);box-shadow:0 0 22px rgba(245,158,11,.1)}.jarvis-fm-health-main.critical .jarvis-fm-health-orb{color:#fca5a5;background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.25);box-shadow:0 0 22px rgba(239,68,68,.12)}.jarvis-fm-health-copy span{display:block;color:#71849a;font-size:8px;text-transform:uppercase;letter-spacing:.09em}.jarvis-fm-health-copy strong{display:block;margin-top:3px;font-size:15px}.jarvis-fm-health-copy small{display:block;margin-top:4px;color:#8294aa;font-size:8px;line-height:1.45}.jarvis-fm-health-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.jarvis-fm-health-stat{padding:11px 12px;border-radius:15px;background:rgba(2,6,23,.34);border:1px solid rgba(148,163,184,.09)}.jarvis-fm-health-stat span{display:block;color:#71849a;font-size:8px;text-transform:uppercase;letter-spacing:.08em}.jarvis-fm-health-stat strong{display:block;margin-top:5px;font-size:16px;color:#e5eefb}
      .jarvis-fm-statusline{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:13px}.jarvis-fm-pill{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;font-size:8px;font-weight:900;letter-spacing:.02em;background:rgba(148,163,184,.07);border:1px solid rgba(148,163,184,.12);color:#cbd5e1}.jarvis-fm-pill.ok{color:#bbf7d0;background:rgba(34,197,94,.08);border-color:rgba(34,197,94,.18)}.jarvis-fm-pill.info{color:#bfdbfe;background:rgba(59,130,246,.08);border-color:rgba(59,130,246,.18)}.jarvis-fm-pill.draft{color:#fde68a;background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.18)}.jarvis-fm-pill.lock{color:#ddd6fe;background:rgba(139,92,246,.08);border-color:rgba(139,92,246,.18)}.jarvis-fm-pill.bad{color:#fecaca;background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.2)}
      .jarvis-fm-toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-bottom:14px}.jarvis-fm-search{margin:0!important;padding:10px 12px!important;border-radius:12px!important;background:rgba(2,6,23,.44)!important;border:1px solid rgba(148,163,184,.12)!important;font-size:10px!important}
      .jarvis-fm-groups{display:grid;gap:13px}.jarvis-fm-group{padding:12px;border-radius:18px;background:rgba(2,6,23,.2);border:1px solid rgba(148,163,184,.07)}.jarvis-fm-group-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:9px}.jarvis-fm-group-title{display:flex;gap:9px;align-items:center}.jarvis-fm-group-icon{width:27px;height:27px;border-radius:9px;display:grid;place-items:center;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.14);color:#93c5fd;font-size:10px}.jarvis-fm-group-title strong{display:block;font-size:11px}.jarvis-fm-group-title small{display:block;margin-top:2px;color:#64748b;font-size:8px}.jarvis-fm-group-count{color:#64748b;font-size:8px}.jarvis-fm-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.jarvis-fm-file{min-width:0;padding:12px;border-radius:17px;background:rgba(2,6,23,.38);border:1px solid rgba(148,163,184,.09);transition:border-color .15s ease,transform .15s ease,background .15s ease}.jarvis-fm-file:hover{transform:translateY(-1px);border-color:rgba(96,165,250,.24);background:rgba(2,6,23,.48)}.jarvis-fm-file.draft{border-color:rgba(245,158,11,.15)}.jarvis-fm-file.conflict,.jarvis-fm-file.missing{border-color:rgba(248,113,113,.2)}.jarvis-fm-file-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.jarvis-fm-file-title{min-width:0}.jarvis-fm-file-title strong{display:block;color:#eef6ff;font-size:11px;line-height:1.35}.jarvis-fm-file-title code{display:block;margin-top:4px;color:#64748b;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.jarvis-fm-shield{width:22px;height:22px;display:grid;place-items:center;flex:0 0 auto;border-radius:8px;background:rgba(139,92,246,.09);border:1px solid rgba(139,92,246,.16);font-size:9px;color:#c4b5fd}.jarvis-fm-file-meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:9px}.jarvis-fm-file-desc{min-height:36px;margin:9px 0 0;color:#91a4ba;font-size:8px;line-height:1.5}.jarvis-fm-file-note{margin:7px 0 0;color:#64748b;font-size:8px;line-height:1.45}.jarvis-fm-file-actions{display:flex;justify-content:flex-end;margin-top:9px;padding-top:9px;border-top:1px solid rgba(148,163,184,.07)}.jarvis-fm-empty{grid-column:1/-1;padding:22px 14px;border-radius:16px;border:1px dashed rgba(148,163,184,.16);text-align:center;color:#71849a;font-size:9px;line-height:1.5}.jarvis-fm-error{padding:12px 13px;border-radius:14px;background:rgba(127,29,29,.09);border:1px solid rgba(248,113,113,.18);color:#fecaca;font-size:9px;line-height:1.5}.jarvis-fm-foot{margin-top:11px;padding-top:10px;border-top:1px solid rgba(148,163,184,.07);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:#64748b;font-size:8px;line-height:1.5}
      .jarvis-fm-modal{position:fixed;inset:0;z-index:2800;display:grid;place-items:center;padding:22px;background:rgba(2,6,23,.78);backdrop-filter:blur(12px)}.jarvis-fm-modal.hidden{display:none!important}.jarvis-fm-dialog{width:min(1180px,96vw);max-height:92vh;overflow:auto;border-radius:26px;background:linear-gradient(150deg,#07111f,#0f172a 58%,#111827);border:1px solid rgba(96,165,250,.2);box-shadow:0 30px 100px rgba(0,0,0,.55)}.jarvis-fm-dialog-head{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;gap:14px;align-items:center;padding:17px 19px;background:rgba(7,17,31,.94);border-bottom:1px solid rgba(148,163,184,.1);backdrop-filter:blur(14px)}.jarvis-fm-dialog-title strong{display:block;font-size:15px}.jarvis-fm-dialog-title small{display:block;margin-top:4px;color:#71849a;font-size:9px}.jarvis-fm-dialog-body{padding:18px}.jarvis-fm-detail-meta{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:14px}.jarvis-fm-detail-box{padding:11px;border-radius:14px;background:rgba(2,6,23,.4);border:1px solid rgba(148,163,184,.09)}.jarvis-fm-detail-box span{display:block;color:#71849a;font-size:8px;text-transform:uppercase;letter-spacing:.07em}.jarvis-fm-detail-box strong{display:block;margin-top:5px;color:#e2e8f0;font-size:10px;overflow-wrap:anywhere}.jarvis-fm-diff-state{margin:0 0 12px;padding:10px 12px;border-radius:14px;color:#bbf7d0;background:rgba(34,197,94,.07);border:1px solid rgba(34,197,94,.15);font-size:9px}.jarvis-fm-diff-state.changed{color:#fde68a;background:rgba(245,158,11,.07);border-color:rgba(245,158,11,.16)}
      .jarvis-fm-section-title{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:16px 0 8px}.jarvis-fm-section-title strong{font-size:11px}.jarvis-fm-section-title small{color:#64748b;font-size:8px}.jarvis-fm-diff{max-height:390px;overflow:auto;border-radius:16px;border:1px solid rgba(148,163,184,.09);background:rgba(2,6,23,.42);font:9px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.jarvis-fm-diff-line{display:grid;grid-template-columns:28px 1fr;min-height:21px}.jarvis-fm-diff-line span:first-child{padding:3px 6px;text-align:center;color:#64748b;border-right:1px solid rgba(148,163,184,.07);user-select:none}.jarvis-fm-diff-line code{padding:3px 9px;white-space:pre-wrap;overflow-wrap:anywhere;color:#aebed0}.jarvis-fm-diff-line.add{background:rgba(34,197,94,.08)}.jarvis-fm-diff-line.add span:first-child,.jarvis-fm-diff-line.add code{color:#bbf7d0}.jarvis-fm-diff-line.remove{background:rgba(239,68,68,.08)}.jarvis-fm-diff-line.remove span:first-child,.jarvis-fm-diff-line.remove code{color:#fecaca}.jarvis-fm-diff-line.same{opacity:.78}
      .jarvis-fm-compare{display:grid;grid-template-columns:1fr 1fr;gap:10px}.jarvis-fm-pane{min-width:0;border-radius:17px;overflow:hidden;background:rgba(2,6,23,.42);border:1px solid rgba(148,163,184,.09)}.jarvis-fm-pane-head{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:10px 12px;background:rgba(255,255,255,.025);border-bottom:1px solid rgba(148,163,184,.08)}.jarvis-fm-pane-head strong{font-size:9px}.jarvis-fm-pane pre{margin:0;padding:13px;max-height:330px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;color:#cbd5e1;font:9px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
      .jarvis-fm-history{display:grid;gap:7px}.jarvis-fm-history-row{display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;gap:9px;align-items:center;padding:10px 11px;border-radius:14px;background:rgba(2,6,23,.35);border:1px solid rgba(148,163,184,.08)}.jarvis-fm-history-v{font-size:10px;font-weight:900;color:#dbeafe}.jarvis-fm-history-copy{min-width:0}.jarvis-fm-history-copy strong{display:block;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.jarvis-fm-history-copy small{display:block;margin-top:3px;color:#64748b;font-size:8px}.jarvis-fm-history-time{color:#64748b;font-size:8px;white-space:nowrap}.jarvis-fm-safety{margin-top:13px;padding:11px 12px;border-radius:14px;color:#94a3b8;background:rgba(139,92,246,.055);border:1px solid rgba(139,92,246,.13);font-size:9px;line-height:1.55}
      @media(max-width:980px){.jarvis-fm-health{grid-template-columns:1fr}.jarvis-fm-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.jarvis-fm-compare{grid-template-columns:1fr}.jarvis-fm-detail-meta{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:650px){.jarvis-fm-head{display:grid}.jarvis-fm-actions{justify-content:flex-start}.jarvis-fm-health-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.jarvis-fm-grid{grid-template-columns:1fr}.jarvis-fm-toolbar{grid-template-columns:1fr}.jarvis-fm-detail-meta{grid-template-columns:1fr 1fr}.jarvis-fm-history-row{grid-template-columns:auto auto 1fr}.jarvis-fm-history-time{grid-column:3}.jarvis-fm-modal{padding:8px}.jarvis-fm-dialog{width:100%;max-height:96vh;border-radius:20px}}
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

  function operationalPill(file) {
    const status = text(file.operationalStatus, "fallback");
    if (status === "draft") return statusPill(`DRAFT v${file.latestDraft?.version || "?"}`, "draft");
    if (status === "active") return statusPill("ACTIVE", "ok");
    if (status === "conflict") return statusPill("CONFLICT", "bad");
    if (status === "missing") return statusPill("MISSING", "bad");
    if (status === "unregistered") return statusPill("UNREGISTERED", "bad");
    return statusPill("FALLBACK", "info");
  }

  function fileNote(file) {
    if (file.operationalStatus === "conflict") return "Aktive Versionsreferenz passt nicht zur gespeicherten Historie. Vor Aktivierung prüfen.";
    if (!file.registered) return "Registry-Eintrag fehlt. Die Datei ist nicht sauber über den File Store verwaltbar.";
    if (file.latestDraft) return `Draft v${file.latestDraft.version} wartet auf Review. Jarvis nutzt weiterhin die aktive Quelle.`;
    if (file.activeSource === "supabase") return "Jarvis lädt diese Datei aktuell aus dem versionierten File Store.";
    return "Jarvis nutzt den sicheren Repository-Fallback.";
  }

  function renderFile(file) {
    const badges = [
      operationalPill(file),
      statusPill(activeLabel(file), file.activeSource === "supabase" ? "ok" : "info"),
    ];
    if (file.required) badges.push(statusPill("CORE", "info"));
    if (file.protected) badges.push(statusPill("PROTECTED", "lock"));
    return `
      <article class="jarvis-fm-file ${escapeHtml(file.operationalStatus || "")}" data-jarvis-file-key="${escapeHtml(file.key)}">
        <div class="jarvis-fm-file-top">
          <div class="jarvis-fm-file-title">
            <strong>${escapeHtml(file.title)}</strong>
            <code>${escapeHtml(file.path)}</code>
          </div>
          ${file.protected ? '<span class="jarvis-fm-shield" title="Geschützte Brain-Datei">◆</span>' : ""}
        </div>
        <div class="jarvis-fm-file-meta">${badges.join("")}</div>
        <p class="jarvis-fm-file-desc">${escapeHtml(DESCRIPTIONS[file.key] || "Verwaltete Jarvis-Datei.")}</p>
        <p class="jarvis-fm-file-note">${escapeHtml(fileNote(file))}</p>
        <div class="jarvis-fm-file-actions">
          <button type="button" class="jarvis-fm-btn" data-jarvis-file-open="${escapeHtml(file.key)}">Öffnen / Review</button>
        </div>
      </article>`;
  }

  function filteredFiles() {
    const files = Array.isArray(state.snapshot?.files) ? state.snapshot.files : [];
    const query = state.query.toLowerCase();
    if (!query) return files;
    return files.filter((file) => [file.title, file.path, file.key, file.category, DESCRIPTIONS[file.key]]
      .some((value) => text(value).toLowerCase().includes(query)));
  }

  function renderGroups(files) {
    if (!files.length) return '<div class="jarvis-fm-empty">Keine passende Brain-Datei gefunden.</div>';
    return GROUPS.map((group) => {
      const entries = group.keys.map((key) => files.find((file) => file.key === key)).filter(Boolean);
      if (!entries.length) return "";
      return `
        <section class="jarvis-fm-group" data-jarvis-fm-group="${group.id}">
          <div class="jarvis-fm-group-head">
            <div class="jarvis-fm-group-title">
              <div class="jarvis-fm-group-icon">${group.icon}</div>
              <div><strong>${escapeHtml(group.title)}</strong><small>${escapeHtml(group.subtitle)}</small></div>
            </div>
            <span class="jarvis-fm-group-count">${entries.length} Datei${entries.length === 1 ? "" : "en"}</span>
          </div>
          <div class="jarvis-fm-grid">${entries.map(renderFile).join("")}</div>
        </section>`;
    }).join("");
  }

  function healthHtml(snapshot) {
    const health = snapshot.health || {};
    const status = text(health.status, "critical");
    const label = status === "healthy" ? "Healthy" : status === "attention" ? "Review erforderlich" : "Attention required";
    const detail = status === "healthy"
      ? "Pflicht-Core vollständig und keine Versionskonflikte."
      : status === "attention"
        ? `${Number(health.draftCount || 0)} Draft${Number(health.draftCount || 0) === 1 ? "" : "s"} wartet auf Prüfung; Runtime bleibt stabil.`
        : "Pflichtdatei oder Versionszustand erfordert Prüfung.";
    const orb = status === "critical" ? "!" : status === "attention" ? "◌" : "✓";
    return `
      <div class="jarvis-fm-health">
        <div class="jarvis-fm-health-main ${escapeHtml(status)}">
          <div class="jarvis-fm-health-orb">${orb}</div>
          <div class="jarvis-fm-health-copy">
            <span>Jarvis Brain Health</span>
            <strong>${escapeHtml(label)}</strong>
            <small>${escapeHtml(detail)}</small>
          </div>
        </div>
        <div class="jarvis-fm-health-grid">
          <div class="jarvis-fm-health-stat"><span>Core Ready</span><strong>${Number(health.requiredReady || 0)}/${Number(health.requiredTotal || 0)}</strong></div>
          <div class="jarvis-fm-health-stat"><span>Protected</span><strong>${Number(health.protectedReady || 0)}/${Number(health.protectedTotal || 0)}</strong></div>
          <div class="jarvis-fm-health-stat"><span>Drafts</span><strong>${Number(health.draftCount || 0)}</strong></div>
          <div class="jarvis-fm-health-stat"><span>Conflicts</span><strong>${Number(health.conflictCount || 0)}</strong></div>
        </div>
      </div>`;
  }

  function panelHtml() {
    if (state.loading && !state.snapshot) return '<div class="jarvis-fm-empty">Brain-Dateien werden sicher geladen …</div>';
    if (state.error && !state.snapshot) return `<div class="jarvis-fm-error">${escapeHtml(state.error)}</div>`;
    const snapshot = state.snapshot || { stats: {}, files: [], health: {} };
    const files = filteredFiles();
    return `
      ${healthHtml(snapshot)}
      <div class="jarvis-fm-statusline">
        ${statusPill("READ ONLY", "ok")}
        ${statusPill(snapshot.runtimeFileStoreEnabled ? "Runtime Store: EIN" : "Runtime Store: AUS", snapshot.runtimeFileStoreEnabled ? "draft" : "info")}
        ${statusPill("VERSIONIERT", "info")}
        ${statusPill("AKTIVIERUNG GESPERRT", "lock")}
      </div>
      <div class="jarvis-fm-toolbar">
        <input class="jarvis-fm-search" id="jarvisFileManagerSearch" type="search" placeholder="Brain-Datei, Funktion oder Bereich suchen …" value="${escapeHtml(state.query)}" autocomplete="off" />
        <button type="button" class="jarvis-fm-btn" data-jarvis-fm-refresh>Aktualisieren</button>
      </div>
      ${state.error ? `<div class="jarvis-fm-error" style="margin-bottom:10px">${escapeHtml(state.error)}</div>` : ""}
      <div class="jarvis-fm-groups">${renderGroups(files)}</div>
      <div class="jarvis-fm-foot">
        <span>Drafts sind nur Änderungsvorschläge. Erst eine spätere, explizite Freigabe darf den aktiven Brain-Zustand ändern.</span>
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
          <div class="jarvis-fm-icon">◉</div>
          <div>
            <div class="jarvis-fm-kicker">Brain Center · File Manager</div>
            <h2>Jarvis Brain Control</h2>
            <p class="jarvis-fm-sub">Core Brain, Rules & Safety und Execution zentral prüfen – mit Health, Diff und Versionshistorie.</p>
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
        <div class="jarvis-fm-detail-box"><span>Status</span><strong>${escapeHtml(text(file.operationalStatus, "fallback").toUpperCase())}</strong></div>
        <div class="jarvis-fm-detail-box"><span>Aktive Quelle</span><strong>${escapeHtml(activeLabel(file))}</strong></div>
        <div class="jarvis-fm-detail-box"><span>Draft</span><strong>${detail.draft ? `v${detail.draft.version} · ${escapeHtml(detail.draft.status)}` : "Keiner"}</strong></div>
        <div class="jarvis-fm-detail-box"><span>Versionen</span><strong>${Number(file.versionCount || 0)}</strong></div>
        <div class="jarvis-fm-detail-box"><span>Schutz</span><strong>${file.protected ? "Protected" : "Normal"}</strong></div>
      </div>`;
  }

  function lineDiff(beforeValue, afterValue) {
    const before = String(beforeValue ?? "").replace(/\r\n/g, "\n").split("\n");
    const after = String(afterValue ?? "").replace(/\r\n/g, "\n").split("\n");
    const n = before.length;
    const m = after.length;
    if (n * m > 350000) {
      return [
        { type: "remove", line: "Diff zu groß für die Inline-Ansicht – aktiven Inhalt unten vergleichen." },
        { type: "add", line: "Draft-Inhalt steht in der rechten Vergleichsansicht vollständig bereit." },
      ];
    }
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        dp[i][j] = before[i] === after[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const output = [];
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && before[i] === after[j]) {
        output.push({ type: "same", line: before[i] });
        i += 1; j += 1;
      } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
        output.push({ type: "add", line: after[j] });
        j += 1;
      } else {
        output.push({ type: "remove", line: before[i] });
        i += 1;
      }
    }
    return output;
  }

  function diffHtml(activeContent, draftContent) {
    if (draftContent === null || draftContent === undefined) {
      return '<div class="jarvis-fm-empty">Kein Draft vorhanden – deshalb gibt es keinen Diff.</div>';
    }
    const rows = lineDiff(activeContent, draftContent);
    const changedIndexes = rows.map((row, index) => row.type !== "same" ? index : -1).filter((index) => index >= 0);
    if (!changedIndexes.length) return '<div class="jarvis-fm-empty">Keine inhaltlichen Unterschiede.</div>';
    const visible = new Set();
    for (const index of changedIndexes) {
      for (let offset = -2; offset <= 2; offset += 1) {
        if (index + offset >= 0 && index + offset < rows.length) visible.add(index + offset);
      }
    }
    let previous = -2;
    const rendered = [];
    [...visible].sort((a, b) => a - b).forEach((index) => {
      if (index > previous + 1) rendered.push('<div class="jarvis-fm-diff-line same"><span>…</span><code>…</code></div>');
      const row = rows[index];
      const marker = row.type === "add" ? "+" : row.type === "remove" ? "−" : " ";
      rendered.push(`<div class="jarvis-fm-diff-line ${row.type}"><span>${marker}</span><code>${escapeHtml(row.line || " ")}</code></div>`);
      previous = index;
    });
    return `<div class="jarvis-fm-diff">${rendered.join("")}</div>`;
  }

  function historyHtml(detail) {
    const history = Array.isArray(detail.history) ? detail.history : [];
    if (!history.length) return '<div class="jarvis-fm-empty">Noch keine Supabase-Versionen gespeichert. Repository ist die Baseline.</div>';
    return `<div class="jarvis-fm-history">${history.map((version) => {
      const status = text(version.status, "unknown").toUpperCase();
      const kind = status === "ACTIVE" ? "ok" : status === "DRAFT" ? "draft" : "info";
      const summary = version.changeSummary || "Keine Änderungszusammenfassung";
      const actor = version.createdBy || "unbekannt";
      const timestamp = version.createdAt ? new Date(version.createdAt).toLocaleString("de-DE") : "ohne Zeit";
      return `
        <div class="jarvis-fm-history-row">
          <span class="jarvis-fm-history-v">v${Number(version.version || 0)}</span>
          ${statusPill(status, kind)}
          <div class="jarvis-fm-history-copy"><strong>${escapeHtml(summary)}</strong><small>von ${escapeHtml(actor)}</small></div>
          <span class="jarvis-fm-history-time">${escapeHtml(timestamp)}</span>
        </div>`;
    }).join("")}</div>`;
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
            <small>${escapeHtml(file.path || "")} · ${escapeHtml(DESCRIPTIONS[file.key] || "")}</small>
          </div>
          <button type="button" class="jarvis-fm-btn" data-jarvis-fm-close>Schließen</button>
        </div>
        <div class="jarvis-fm-dialog-body">
          ${detailMeta(file, detail)}
          ${draft
            ? `<div class="jarvis-fm-diff-state ${changed ? "changed" : ""}">${changed ? "Draft unterscheidet sich von der aktiven Datei und wartet auf Review." : "Draft und aktive Datei sind inhaltlich identisch."}${draft.changeSummary ? ` · ${escapeHtml(draft.changeSummary)}` : ""}</div>`
            : '<div class="jarvis-fm-diff-state">Keine Draft-Version vorhanden. Jarvis nutzt die aktive Quelle unverändert.</div>'}

          <div class="jarvis-fm-section-title"><strong>Änderungen</strong><small>Grün hinzugefügt · Rot entfernt</small></div>
          ${diffHtml(detail.active?.content || "", draft?.content)}

          <div class="jarvis-fm-section-title"><strong>Direkter Vergleich</strong><small>Vollständiger Inhalt</small></div>
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

          <div class="jarvis-fm-section-title"><strong>Versionshistorie</strong><small>Unveränderliche Metadaten der Store-Versionen</small></div>
          ${historyHtml(detail)}

          <div class="jarvis-fm-safety">
            <strong>Sicherheitsmodus:</strong> Diese V1.1-Ansicht ist vollständig read-only. Diff und Historie dienen nur der Prüfung. Aktivieren, Bearbeiten, Löschen und Rollback bleiben gesperrt, bis der Freigabe-Workflow separat implementiert und getestet ist.
          </div>
        </div>
      </div>`;
  }

  async function openDetail(key) {
    const modal = ensureModal();
    state.detailLoading = true;
    modal.classList.remove("hidden");
    modal.innerHTML = '<div class="jarvis-fm-dialog"><div class="jarvis-fm-dialog-body"><div class="jarvis-fm-empty">Datei, Diff und Historie werden geladen …</div></div></div>';
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
    lineDiff,
    state,
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();