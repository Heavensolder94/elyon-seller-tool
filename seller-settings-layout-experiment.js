(() => {
  "use strict";

  const STYLE_ID = "elyonSettingsLayoutExperimentStyles";
  const INTRO_ID = "elyonSettingsLayoutExperimentIntro";
  const HIDDEN_IMPORT_ATTR = "data-elyon-settings-import-hidden";
  const SYNC_ARCHITECTURE_ID = "elyonDataArchitecturePanel";
  const SYNC_LEGACY_ID = "elyonGoogleSheetsLegacyTools";
  const SYNC_MIGRATION_NOTICE_ID = "elyonGoogleSheetsMigrationNotice";
  const AUTO_SYNC_KEY = "elyon_google_sheets_auto_sync_enabled";
  const AUTO_SYNC_MIGRATION_KEY = "elyon_google_sheets_auto_sync_disabled_20260820";
  const SYSTEM_STATUS_LABEL = "3. 🩺 Systemstatus & Diagnose";
  const SYSTEM_STATUS_HINT = "Verbindungen, Datenquellen und technische Betriebsbereitschaft prüfen";
  const ORDERS_IMPORT_TITLE = "1. 📦 eBay-Bestellungen importieren";
  const ORDERS_IMPORT_HINT = "Neue eBay-Bestellungen abrufen, die Vorschau kontrollieren und anschließend in den Elyon-Workflow übernehmen.";
  const LEGACY_CONTROL_IDS = [
    "loadAllGoogleSheetsBtn",
    "reconcileAllGoogleSheetsBtn",
    "syncSalesGoogleSheetsBtn",
    "clearLocalSalesGoogleSheetsBtn",
    "syncInventoryGoogleSheetsBtn",
    "syncSuppliersGoogleSheetsBtn",
    "syncCostsGoogleSheetsBtn",
    "googleSheetsAutoSyncEnabled",
    "googleSheetsAutoSyncInterval",
  ];
  const BLOCKED_LEGACY_ACTION_IDS = new Set([
    "loadAllGoogleSheetsBtn",
    "reconcileAllGoogleSheetsBtn",
    "clearLocalSalesGoogleSheetsBtn",
  ]);
  let observer = null;
  let scheduled = false;

  const text = (value) => String(value ?? "").trim();

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${INTRO_ID}{margin:0 0 16px;padding:14px 16px;border-radius:18px;background:rgba(59,130,246,.07);border:1px solid rgba(96,165,250,.18)}
      #${INTRO_ID} strong{display:block;margin-bottom:5px;color:#dbeafe;font-size:14px}
      #${INTRO_ID} p{margin:0;color:#94a3b8;font-size:12px;line-height:1.5}
      #settingsTab [${HIDDEN_IMPORT_ATTR}="1"]{display:none!important}
      #settingsTab>.card[data-elyon-settings-section]{position:relative}
      #settingsTab>.card[data-elyon-settings-section]::before{content:attr(data-elyon-settings-kicker);display:block;margin-bottom:8px;color:#60a5fa;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
      #ordersTab [data-elyon-orders-import-note]{margin:0 0 12px;padding:9px 11px;border-radius:13px;background:rgba(34,197,94,.07);border:1px solid rgba(34,197,94,.16);color:#bbf7d0;font-size:11px;line-height:1.45}
      #${SYNC_ARCHITECTURE_ID}{margin:0 0 16px;padding:14px;border-radius:16px;background:rgba(15,23,42,.5);border:1px solid rgba(96,165,250,.18)}
      #${SYNC_ARCHITECTURE_ID} h3{margin:0 0 6px;color:#dbeafe;font-size:14px}
      #${SYNC_ARCHITECTURE_ID}>p{margin:0;color:#94a3b8;font-size:12px;line-height:1.5}
      #${SYNC_ARCHITECTURE_ID} .elyon-data-role-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:12px}
      #${SYNC_ARCHITECTURE_ID} .elyon-data-role{padding:10px 11px;border-radius:13px;background:rgba(255,255,255,.045);border:1px solid rgba(148,163,184,.13)}
      #${SYNC_ARCHITECTURE_ID} .elyon-data-role strong{display:block;margin-bottom:3px;color:#e2e8f0;font-size:12px}
      #${SYNC_ARCHITECTURE_ID} .elyon-data-role span{display:block;color:#94a3b8;font-size:11px;line-height:1.4}
      #${SYNC_ARCHITECTURE_ID} .elyon-data-role.primary{border-color:rgba(34,197,94,.22);background:rgba(34,197,94,.06)}
      #${SYNC_ARCHITECTURE_ID} .elyon-data-role.optional{border-color:rgba(245,158,11,.2);background:rgba(245,158,11,.05)}
      .elyon-sheet-export-note{margin:10px 0 12px;padding:10px 11px;border-radius:13px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.16);color:#bbf7d0;font-size:11px;line-height:1.45}
      #${SYNC_LEGACY_ID}{margin-top:14px;border:1px solid rgba(245,158,11,.2);border-radius:15px;background:rgba(245,158,11,.035);overflow:hidden}
      #${SYNC_LEGACY_ID}>summary{cursor:pointer;padding:12px 13px;color:#fde68a;font-size:12px;font-weight:900;list-style:none}
      #${SYNC_LEGACY_ID}>summary::-webkit-details-marker{display:none}
      #${SYNC_LEGACY_ID}>summary::after{content:"▾";float:right;color:#fbbf24}
      #${SYNC_LEGACY_ID}[open]>summary::after{content:"▴"}
      #${SYNC_LEGACY_ID} .elyon-legacy-body{padding:0 12px 12px}
      #${SYNC_LEGACY_ID} .elyon-legacy-warning{margin:0 0 10px;padding:9px 10px;border-radius:12px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);color:#fecaca;font-size:11px;line-height:1.45}
      #${SYNC_LEGACY_ID} [data-elyon-legacy-row]{margin-top:9px}
      #${SYNC_LEGACY_ID} button:disabled,#${SYNC_LEGACY_ID} input:disabled,#${SYNC_LEGACY_ID} select:disabled{opacity:.52;cursor:not-allowed;filter:none;transform:none}
      #${SYNC_MIGRATION_NOTICE_ID}{margin:10px 0;padding:9px 10px;border-radius:12px;background:rgba(59,130,246,.07);border:1px solid rgba(96,165,250,.16);color:#bfdbfe;font-size:11px;line-height:1.45}
      @media(max-width:760px){#${SYNC_ARCHITECTURE_ID} .elyon-data-role-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function directCardContaining(root, selector) {
    if (!root) return null;
    return [...root.children].find((child) =>
      child instanceof HTMLElement
      && child.classList.contains("card")
      && child.querySelector(selector),
    ) || null;
  }

  function setCardCopy(card, { title, hint, kicker }) {
    if (!card) return;
    card.dataset.elyonSettingsSection = "1";
    card.dataset.elyonSettingsKicker = kicker;
    const heading = card.querySelector(":scope > h2");
    const description = card.querySelector(":scope > .hint");
    if (heading && text(heading.textContent) !== title) heading.textContent = title;
    if (description && text(description.textContent) !== hint) description.textContent = hint;
  }

  function ensureIntro(settings, firstCard) {
    let intro = document.getElementById(INTRO_ID);
    if (!intro) {
      intro = document.createElement("div");
      intro.id = INTRO_ID;
      intro.innerHTML = `
        <strong>Seller-Einstellungen</strong>
        <p>Konfiguration und Diagnose bleiben hier. Operative Arbeit wie der eBay-Bestellimport liegt direkt im jeweiligen Arbeitsbereich.</p>
      `;
    }
    if (intro.parentElement !== settings || intro.nextElementSibling !== firstCard) {
      settings.insertBefore(intro, firstCard || settings.firstChild);
    }
  }

  function configureSystemStatus(settings) {
    const wrapper = settings?.querySelector("#elyonSystemDataStatusSettings");
    if (!wrapper) return;
    wrapper.dataset.elyonSettingsSection = "3";
    const summary = wrapper.querySelector(":scope > summary");
    if (!summary || summary.dataset.elyonSettingsExperimentLabel === "1") return;
    summary.dataset.elyonSettingsExperimentLabel = "1";
    summary.innerHTML = `<span>${SYSTEM_STATUS_LABEL}<small>${SYSTEM_STATUS_HINT}</small></span>`;
  }

  function hideDuplicateSettingsImport(settings) {
    const duplicateImport = directCardContaining(settings, "#ebayOrdersRange");
    if (!duplicateImport || duplicateImport.getAttribute(HIDDEN_IMPORT_ATTR) === "1") return;
    duplicateImport.setAttribute(HIDDEN_IMPORT_ATTR, "1");
    duplicateImport.setAttribute("aria-hidden", "true");
    duplicateImport.hidden = true;
  }

  function configureOrdersImport() {
    const orders = document.getElementById("ordersTab");
    const importCard = directCardContaining(orders, "#ebayOrdersRangeOrders");
    if (!importCard) return;

    const heading = importCard.querySelector(":scope > h2");
    const hint = importCard.querySelector(":scope > .hint");
    if (heading && text(heading.textContent) !== ORDERS_IMPORT_TITLE) heading.textContent = ORDERS_IMPORT_TITLE;
    if (hint && text(hint.textContent) !== ORDERS_IMPORT_HINT) hint.textContent = ORDERS_IMPORT_HINT;

    let note = importCard.querySelector("[data-elyon-orders-import-note]");
    if (!note) {
      note = document.createElement("p");
      note.dataset.elyonOrdersImportNote = "1";
      note.textContent = "Dieser operative Import liegt direkt bei den Bestellungen statt in den Einstellungen.";
      const firstRow = importCard.querySelector(":scope > .row");
      importCard.insertBefore(note, firstRow || null);
    }
  }

  function ensureDataArchitecturePanel(card) {
    let panel = card.querySelector(`#${SYNC_ARCHITECTURE_ID}`);
    if (panel) return panel;
    panel = document.createElement("section");
    panel.id = SYNC_ARCHITECTURE_ID;
    panel.innerHTML = `
      <h3>Verbindliche Datenrollen</h3>
      <p>Der Seller-Betrieb verwendet zentrale Serverdaten als führende Quelle. Google Sheets ist nur noch ein optionaler Nebenkanal für Export, Auswertung und kontrollierte Migration.</p>
      <div class="elyon-data-role-grid">
        <div class="elyon-data-role primary"><strong>Product Master</strong><span>Verbindliche Produkt- und Listingdaten.</span></div>
        <div class="elyon-data-role primary"><strong>Server Operations</strong><span>Bestellungen, Bestand, Rechnungen und Retouren zentral.</span></div>
        <div class="elyon-data-role"><strong>Lokale Browserdaten</strong><span>Arbeitskopie und Fallback, nicht die Hauptquelle.</span></div>
        <div class="elyon-data-role optional"><strong>Google Sheets</strong><span>Optionaler Export/Backup; kein Datenmaster.</span></div>
      </div>
    `;
    const description = card.querySelector(":scope > .hint");
    if (description) description.insertAdjacentElement("afterend", panel);
    else card.prepend(panel);
    return panel;
  }

  function disableLegacyAutoSync(card) {
    const input = card.querySelector("#googleSheetsAutoSyncEnabled");
    const interval = card.querySelector("#googleSheetsAutoSyncInterval");
    let migrated = false;
    try {
      if (localStorage.getItem(AUTO_SYNC_KEY) === "yes") {
        localStorage.setItem(AUTO_SYNC_MIGRATION_KEY, new Date().toISOString());
        localStorage.setItem(AUTO_SYNC_KEY, "no");
        migrated = true;
      }
    } catch {
      // Storage can be unavailable in hardened browser contexts. UI still remains disabled.
    }
    if (input) {
      input.checked = false;
      input.disabled = true;
      input.title = "Legacy-Auto-Abgleich ist deaktiviert. Zentrale Serverdaten sind führend.";
    }
    if (interval) {
      interval.disabled = true;
      interval.title = "Legacy-Auto-Abgleich ist deaktiviert.";
    }
    if (migrated && typeof window.scheduleGoogleSheetsAutoSync === "function") {
      try { window.scheduleGoogleSheetsAutoSync(); } catch { /* no-op */ }
    }
    return migrated;
  }

  function ensureExportNote(card) {
    const exportButton = card.querySelector("#syncAllGoogleSheetsBtn");
    if (!exportButton) return;
    exportButton.textContent = "Nach Google Sheets exportieren";
    exportButton.title = "Exportiert die vorhandene Seller-Arbeitskopie nach Google Sheets. Der Product Master bleibt unverändert.";
    const row = exportButton.closest(".row") || exportButton.parentElement;
    if (!row || row.previousElementSibling?.classList?.contains("elyon-sheet-export-note")) return;
    const note = document.createElement("p");
    note.className = "elyon-sheet-export-note";
    note.textContent = "Google Sheets ist nur noch Export/Backup. Dieser Export ändert weder den Product Master noch die zentralen Seller-Daten.";
    row.insertAdjacentElement("beforebegin", note);
  }

  function ensureLegacyTools(card, migratedAutoSync) {
    let details = card.querySelector(`#${SYNC_LEGACY_ID}`);
    if (!details) {
      details = document.createElement("details");
      details.id = SYNC_LEGACY_ID;
      details.innerHTML = `
        <summary>Erweiterte Legacy- & Migrationswerkzeuge</summary>
        <div class="elyon-legacy-body">
          <p class="elyon-legacy-warning">Bidirektionales Laden/Abgleichen ist nicht mehr Teil des normalen Seller-Workflows. Direkte Rückimporte bleiben gesperrt, bis ein Vorschau-/Diff-Import vorhanden ist.</p>
        </div>
      `;
      const result = card.querySelector("#googleSheetsSyncResult");
      if (result) result.insertAdjacentElement("beforebegin", details);
      else card.appendChild(details);
    }
    const body = details.querySelector(".elyon-legacy-body");
    if (!body) return details;

    const rows = new Set();
    LEGACY_CONTROL_IDS.forEach((id) => {
      const control = card.querySelector(`#${id}`);
      if (!control || details.contains(control)) return;
      const row = control.closest(".row") || control.closest("label") || control.parentElement;
      if (row && row !== card) rows.add(row);
    });
    rows.forEach((row) => {
      row.dataset.elyonLegacyRow = "1";
      body.appendChild(row);
    });

    BLOCKED_LEGACY_ACTION_IDS.forEach((id) => {
      const control = details.querySelector(`#${id}`);
      if (!control) return;
      control.disabled = true;
      control.setAttribute("aria-disabled", "true");
      control.title = "Deaktiviert: Rückimport/Abgleich braucht zuerst eine sichere Vorschau mit Diff und bewusster Freigabe.";
    });

    const autoInput = details.querySelector("#googleSheetsAutoSyncEnabled");
    const autoInterval = details.querySelector("#googleSheetsAutoSyncInterval");
    if (autoInput) autoInput.disabled = true;
    if (autoInterval) autoInterval.disabled = true;

    if (migratedAutoSync && !body.querySelector(`#${SYNC_MIGRATION_NOTICE_ID}`)) {
      const notice = document.createElement("p");
      notice.id = SYNC_MIGRATION_NOTICE_ID;
      notice.textContent = "Ein zuvor aktiver Legacy-Auto-Abgleich wurde bei dieser Migration sicher deaktiviert. Es wurden keine Product-Master-Daten gelöscht oder überschrieben.";
      body.prepend(notice);
    }
    return details;
  }

  function modernizeSynchronizationCard(card) {
    if (!card) return;
    setCardCopy(card, {
      kicker: "Bereich 2",
      title: "2. ☁️ Daten, Backup & Export",
      hint: "Zentrale Serverdaten sind führend. Google Sheets bleibt optional für Export, Backup und kontrollierte Migration.",
    });
    ensureDataArchitecturePanel(card);
    const migratedAutoSync = disableLegacyAutoSync(card);
    ensureExportNote(card);
    ensureLegacyTools(card, migratedAutoSync);
    card.dataset.elyonDataSyncModernized = "1";
  }

  function configureSettings() {
    scheduled = false;
    installStyles();

    const settings = document.getElementById("settingsTab");
    if (!settings) return false;

    const integrations = directCardContaining(settings, "#intBackendStatus");
    const synchronization = directCardContaining(settings, "#googleSheetsSyncUrl");
    if (!integrations || !synchronization) return false;

    settings.dataset.elyonSettingsLayoutExperiment = "1";
    ensureIntro(settings, integrations);

    setCardCopy(integrations, {
      kicker: "Bereich 1",
      title: "1. 🔌 Integrationen & API-Verbindungen",
      hint: "Backend, eBay, CJ und weitere Verbindungen zentral einrichten und technisch prüfen.",
    });

    modernizeSynchronizationCard(synchronization);
    hideDuplicateSettingsImport(settings);
    configureSystemStatus(settings);
    configureOrdersImport();
    return true;
  }

  function scheduleConfigure() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(configureSettings);
  }

  function observe() {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver(scheduleConfigure);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function install() {
    installStyles();
    observe();
    configureSettings();
    [150, 450, 900, 1600].forEach((delay) => setTimeout(scheduleConfigure, delay));
  }

  window.ElyonSettingsLayoutExperiment = {
    apply: configureSettings,
    refresh: scheduleConfigure,
    modernizeSynchronizationCard,
    audit: {
      productMasterRole: "primary",
      serverOperationsRole: "primary",
      localStorageRole: "working_copy_fallback",
      googleSheetsRole: "optional_export_legacy",
      bidirectionalImport: "blocked_pending_preview_diff",
      autoReconcile: "disabled",
    },
    enabled: true,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
