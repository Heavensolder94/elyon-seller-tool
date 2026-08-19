(() => {
  "use strict";

  const SETTINGS_MODAL_SELECTOR = "#settingsModal";
  const TARGET_LABEL = "🤖 KI & Modelle";
  const CLEANUP_STYLE_ID = "elyonSettingsLegacyCleanupStyles";
  const EXPORT_STATUS_ID = "elyonGoogleSheetsExportStatus";
  const LEGACY_SYNC_LABEL_ATTR = "data-elyon-legacy-sync-status-label";
  let observer = null;
  let resultObserver = null;
  let scheduled = false;

  const text = (value) => String(value ?? "").trim();

  function normalizedLabel(value) {
    return text(value)
      .replace(/^🤖\s*/u, "")
      .trim()
      .toLocaleLowerCase("de-DE");
  }

  function installCleanupStyles() {
    if (document.getElementById(CLEANUP_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = CLEANUP_STYLE_ID;
    style.textContent = `
      #${EXPORT_STATUS_ID}{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:14px 0;padding:12px 14px;border-radius:15px;background:rgba(34,197,94,.055);border:1px solid rgba(34,197,94,.16)}
      #${EXPORT_STATUS_ID} .elyon-export-status-copy{min-width:0}
      #${EXPORT_STATUS_ID} strong{display:block;color:#d1fae5;font-size:13px;margin-bottom:4px}
      #${EXPORT_STATUS_ID} p{margin:0;color:#94a3b8;font-size:11px;line-height:1.45}
      #${EXPORT_STATUS_ID} .elyon-export-status-pill{flex:0 0 auto;padding:6px 9px;border-radius:999px;font-size:11px;font-weight:900}
      #${EXPORT_STATUS_ID} .elyon-export-status-pill.ready{color:#bbf7d0;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.24)}
      #${EXPORT_STATUS_ID} .elyon-export-status-pill.warn{color:#fde68a;background:rgba(245,158,11,.09);border:1px solid rgba(245,158,11,.22)}
      #elyonGoogleSheetsLegacyTools .elyon-legacy-sync-label{margin:12px 0 6px;color:#fcd34d;font-size:11px;font-weight:900}
      @media(max-width:760px){#${EXPORT_STATUS_ID}{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function applyLabel() {
    const modal = document.querySelector(SETTINGS_MODAL_SELECTOR);
    if (!modal) return false;

    const candidates = modal.querySelectorAll("h3, summary");
    for (const candidate of candidates) {
      const label = normalizedLabel(candidate.textContent);
      if (label !== "ki" && label !== "ki & modelle") continue;
      if (candidate.textContent.trim() !== TARGET_LABEL) candidate.textContent = TARGET_LABEL;
      candidate.dataset.elyonAiSettingsLabel = "1";
      return true;
    }
    return false;
  }

  function hideRetiredShopifyLab() {
    ["shopifyMenu", "shopifyTab"].forEach((id) => {
      const node = document.getElementById(id);
      if (!node) return;
      node.hidden = true;
      node.classList.add("hidden");
      node.setAttribute("aria-hidden", "true");
      node.dataset.elyonRetiredModule = "1";
    });
  }

  function normalizeExportResult(card) {
    const result = card?.querySelector("#googleSheetsSyncResult");
    if (!result) return;

    if (text(result.textContent) === "Noch keine Synchronisierung ausgeführt.") {
      result.innerHTML = "<p>Noch kein Google-Sheets-Export ausgeführt.</p>";
      return;
    }

    const heading = result.querySelector("h3");
    if (heading && text(heading.textContent) === "Senden abgeschlossen") {
      heading.textContent = "Export abgeschlossen";
    }
  }

  function renderExportStatus(card) {
    const status = card?.querySelector(`#${EXPORT_STATUS_ID}`);
    if (!status) return;

    const url = text(card.querySelector("#googleSheetsSyncUrl")?.value);
    const token = text(card.querySelector("#googleSheetsSyncToken")?.value);
    const configured = Boolean(url && token);

    status.innerHTML = `
      <div class="elyon-export-status-copy">
        <strong>Google-Sheets-Export</strong>
        <p>${configured
          ? "Manueller Export ist eingerichtet. Es läuft kein automatischer Zwei-Wege-Sync."
          : "Für den optionalen Export müssen Web-App-URL und Sync-Token gespeichert sein."}</p>
      </div>
      <span class="elyon-export-status-pill ${configured ? "ready" : "warn"}">${configured ? "Bereit" : "Einrichtung fehlt"}</span>
    `;
  }

  function bindExportStatusFields(card) {
    ["googleSheetsSyncUrl", "googleSheetsSyncToken"].forEach((id) => {
      const field = card?.querySelector(`#${id}`);
      if (!field || field.dataset.elyonExportStatusBound === "1") return;
      field.dataset.elyonExportStatusBound = "1";
      field.addEventListener("input", () => renderExportStatus(card));
      field.addEventListener("change", () => renderExportStatus(card));
    });
  }

  function bindResultObserver(card) {
    const result = card?.querySelector("#googleSheetsSyncResult");
    if (!result || resultObserver) return;
    resultObserver = new MutationObserver(() => normalizeExportResult(card));
    resultObserver.observe(result, { childList: true, subtree: true });
  }

  function cleanupGoogleSheetsCard() {
    const syncUrl = document.getElementById("googleSheetsSyncUrl");
    const card = syncUrl?.closest(".card");
    if (!card) return false;

    installCleanupStyles();

    const saveButton = card.querySelector("#saveGoogleSheetsSyncBtn");
    if (saveButton) {
      saveButton.textContent = "Google-Sheets-Verbindung speichern";
      saveButton.title = "Speichert URL und Token für den optionalen Google-Sheets-Export.";
    }

    const exportButton = card.querySelector("#syncAllGoogleSheetsBtn");
    if (exportButton) {
      exportButton.textContent = "Nach Google Sheets exportieren";
      exportButton.title = "Manueller Export; Product Master und zentrale Seller-Daten bleiben unverändert.";
    }

    let exportStatus = card.querySelector(`#${EXPORT_STATUS_ID}`);
    if (!exportStatus) {
      exportStatus = document.createElement("section");
      exportStatus.id = EXPORT_STATUS_ID;
      const exportRow = exportButton?.closest(".row") || exportButton?.parentElement;
      if (exportRow) exportRow.insertAdjacentElement("afterend", exportStatus);
      else card.appendChild(exportStatus);
    }

    const legacyBody = card.querySelector("#elyonGoogleSheetsLegacyTools .elyon-legacy-body");
    const legacyStatus = card.querySelector("#googleSheetsSyncStatus");
    if (legacyBody && legacyStatus && !legacyBody.contains(legacyStatus)) {
      let label = legacyBody.querySelector(`[${LEGACY_SYNC_LABEL_ATTR}]`);
      if (!label) {
        label = document.createElement("p");
        label.className = "elyon-legacy-sync-label";
        label.setAttribute(LEGACY_SYNC_LABEL_ATTR, "1");
        label.textContent = "Alte Sync-Diagnose";
        legacyBody.appendChild(label);
      }
      legacyStatus.dataset.elyonLegacySyncStatus = "1";
      legacyBody.appendChild(legacyStatus);
    }

    bindExportStatusFields(card);
    bindResultObserver(card);
    renderExportStatus(card);
    normalizeExportResult(card);
    card.dataset.elyonLegacyCleanup = "1";
    return true;
  }

  function applyAll() {
    scheduled = false;
    applyLabel();
    hideRetiredShopifyLab();
    cleanupGoogleSheetsCard();
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(applyAll);
  }

  function install() {
    installCleanupStyles();
    applyAll();

    const modal = document.querySelector(SETTINGS_MODAL_SELECTOR);
    if (modal && !observer) {
      observer = new MutationObserver(scheduleApply);
      observer.observe(modal, { childList: true, subtree: true });
    }

    [120, 400, 900, 1600].forEach((delay) => setTimeout(scheduleApply, delay));
  }

  window.ElyonAiSettingsLabel = {
    apply: applyLabel,
    cleanup: cleanupGoogleSheetsCard,
    install,
    label: TARGET_LABEL,
  };

  window.ElyonSettingsLegacyCleanup = {
    apply: applyAll,
    hideRetiredShopifyLab,
    cleanupGoogleSheetsCard,
    audit: {
      shopifyLab: "hidden_retired_module",
      legacySyncDashboard: "collapsed_migration_only",
      googleSheetsPrimaryAction: "manual_export",
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
