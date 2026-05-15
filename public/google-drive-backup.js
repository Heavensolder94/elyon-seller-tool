(function(){
  "use strict";

  const STORAGE_KEYS = {
    lastDriveBackupAt: "elyonLastGoogleDriveBackupAt",
    lastDriveBackupError: "elyonLastGoogleDriveBackupError",
    lastRestoreAt: "elyonLastRestoreAt",
    preRestoreSnapshot: "elyon_last_pre_restore_snapshot",
    lastDriveBackupFile: "elyonLastGoogleDriveBackupFile",
    lastDriveBackupId: "elyonLastGoogleDriveBackupId",
    backupInterval: "elyonBackupInterval",
    backupReminderDismissedAt: "elyonBackupReminderDismissedAt",
  };

  const state = {
    pendingRestore: null,
    pendingRestorePreview: null,
    status: null,
    isUploading: false,
  };

  function nowIso() {
    return new Date().toISOString();
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function formatLocalFilename(dateInput) {
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
    return `elyon-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}.json`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeJSONParse(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function getValue(key) {
    if (!key) return "";
    try {
      return localStorage.getItem(key) || "";
    } catch {
      return "";
    }
  }

  function setValue(key, value) {
    try {
      localStorage.setItem(key, String(value ?? ""));
    } catch {
      // ignore storage failures
    }
  }

  function getCurrentBackupData() {
    return {
      app: "Elyon Seller Tool",
      version: "1.0",
      exportedAt: nowIso(),
      products: typeof normalizeProductsCollection === "function" ? normalizeProductsCollection(products) : clone(products || []),
      sales: Array.isArray(sales) ? clone(sales) : [],
      suppliers: typeof loadStoredArray === "function" ? loadStoredArray("elyonSuppliers") : clone(suppliers || []),
      runningCosts: typeof loadStoredArray === "function" ? loadStoredArray("elyonCosts") : clone(runningCosts || []),
      returns: Array.isArray(returns) ? clone(returns) : [],
      shopifyReturns: Array.isArray(shopifyReturns) ? clone(shopifyReturns) : [],
      invoices: Array.isArray(invoices) ? clone(invoices) : [],
      listingDraft: latestEbayListingDraft || (typeof loadStoredEbayListingDraft === "function" ? loadStoredEbayListingDraft() : null),
      settings: clone(appSettings || {}),
      invoiceSettings: clone(invoiceSettings || {}),
      backupInterval: getBackupIntervalValue(),
      backupReminderDismissedAt: getValue(STORAGE_KEYS.backupReminderDismissedAt),
      googleSheetsSync: {
        url: getValue(GOOGLE_SHEETS_SYNC_KEYS && GOOGLE_SHEETS_SYNC_KEYS.url),
        token: getValue(GOOGLE_SHEETS_SYNC_KEYS && GOOGLE_SHEETS_SYNC_KEYS.token),
        lastInventorySyncAt: getValue(GOOGLE_SHEETS_SYNC_KEYS && GOOGLE_SHEETS_SYNC_KEYS.inventoryAt),
        lastSupplierSyncAt: getValue(GOOGLE_SHEETS_SYNC_KEYS && GOOGLE_SHEETS_SYNC_KEYS.supplierAt),
        lastSalesSyncAt: getValue(GOOGLE_SHEETS_SYNC_KEYS && GOOGLE_SHEETS_SYNC_KEYS.salesAt),
        lastCostsSyncAt: getValue(GOOGLE_SHEETS_SYNC_KEYS && GOOGLE_SHEETS_SYNC_KEYS.costsAt),
      },
    };
  }

  function normalizeBackupData(data) {
    const source = data && typeof data === "object" ? data : {};
    const hasBackupInterval = Object.prototype.hasOwnProperty.call(source, "backupInterval");
    const hasBackupReminderDismissedAt = Object.prototype.hasOwnProperty.call(source, "backupReminderDismissedAt");
    return {
      app: String(source.app || "Elyon Seller Tool"),
      version: String(source.version || "1.0"),
      exportedAt: String(source.exportedAt || nowIso()),
      products: Array.isArray(source.products) ? source.products : [],
      sales: Array.isArray(source.sales) ? source.sales : [],
      suppliers: Array.isArray(source.suppliers) ? source.suppliers : [],
      runningCosts: Array.isArray(source.runningCosts) ? source.runningCosts : [],
      returns: Array.isArray(source.returns) ? source.returns : [],
      shopifyReturns: Array.isArray(source.shopifyReturns) ? source.shopifyReturns : [],
      invoices: Array.isArray(source.invoices) ? source.invoices : [],
      listingDraft: source.listingDraft || null,
      settings: source.settings && typeof source.settings === "object" ? source.settings : {},
      invoiceSettings: source.invoiceSettings && typeof source.invoiceSettings === "object" ? source.invoiceSettings : {},
      backupInterval: hasBackupInterval ? String(source.backupInterval || "manual") : null,
      backupReminderDismissedAt: hasBackupReminderDismissedAt ? String(source.backupReminderDismissedAt || "") : null,
      googleSheetsSync: source.googleSheetsSync && typeof source.googleSheetsSync === "object" ? source.googleSheetsSync : {},
    };
  }

  function parseTimestamp(value) {
    const ts = new Date(String(value || "")).getTime();
    return Number.isFinite(ts) ? ts : null;
  }

  function formatAbsoluteDate(value) {
    const ts = parseTimestamp(value);
    if (!ts) return "Noch nie";
    return new Date(ts).toLocaleString("de-DE");
  }

  function formatShortDate(value) {
    const ts = parseTimestamp(value);
    if (!ts) return "Noch nie";
    const diffMs = Date.now() - ts;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays <= 0) return "Heute";
    if (diffDays === 1) return "Gestern";
    if (diffDays < 7) return `Vor ${diffDays} Tagen`;
    return new Date(ts).toLocaleDateString("de-DE");
  }

  function getIntervalMeta(value) {
    const normalized = String(value || "manual");
    switch (normalized) {
      case "daily":
        return { value: normalized, label: "Täglich", type: "days", amount: 1 };
      case "every_3_days":
        return { value: normalized, label: "Alle 3 Tage", type: "days", amount: 3 };
      case "weekly":
        return { value: normalized, label: "Wöchentlich", type: "days", amount: 7 };
      case "monthly":
        return { value: normalized, label: "Monatlich", type: "months", amount: 1 };
      case "manual":
      default:
        return { value: "manual", label: "Manuell", type: "manual", amount: 0 };
    }
  }

  function getBackupIntervalValue() {
    const current = String(getValue(STORAGE_KEYS.backupInterval) || "manual").toLowerCase();
    return getIntervalMeta(current).value;
  }

  function setBackupIntervalValue(value) {
    const meta = getIntervalMeta(value);
    setValue(STORAGE_KEYS.backupInterval, meta.value);
    return meta.value;
  }

  function addIntervalToDate(dateInput, intervalValue) {
    const meta = getIntervalMeta(intervalValue);
    const base = dateInput instanceof Date ? new Date(dateInput.getTime()) : new Date(dateInput);
    if (meta.type === "manual") return null;
    if (meta.type === "days") {
      base.setDate(base.getDate() + meta.amount);
      return base;
    }
    if (meta.type === "months") {
      const originalDate = base.getDate();
      base.setDate(1);
      base.setMonth(base.getMonth() + meta.amount);
      const lastDayOfTargetMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
      base.setDate(Math.min(originalDate, lastDayOfTargetMonth));
      return base;
    }
    return null;
  }

  function getLatestBackupTimestamp() {
    const candidates = [
      parseTimestamp(getValue("elyonLastBackupAt")),
      parseTimestamp(getValue(STORAGE_KEYS.lastDriveBackupAt)),
    ].filter(ts => Number.isFinite(ts));
    if (!candidates.length) return null;
    return Math.max(...candidates);
  }

  function getBackupReminderDismissedAt() {
    return parseTimestamp(getValue(STORAGE_KEYS.backupReminderDismissedAt));
  }

  function isMeaningfulDriveError(text) {
    const value = String(text || "").trim();
    if (!value) return false;
    const lowered = value.toLowerCase();
    if (lowered === "kein fehler") return false;
    if (lowered.includes("backup wird zu google drive hochgeladen")) return false;
    if (lowered.includes("google drive verbindung wird gestartet")) return false;
    if (lowered.includes("status konnte nicht geladen werden")) return false;
    if (lowered.includes("google drive status unbekannt")) return false;
    return true;
  }

  function getDriveConnectionSnapshot() {
    const status = state.status && typeof state.status === "object" ? state.status : null;
    const hasConnected = status && Object.prototype.hasOwnProperty.call(status, "connected");
    const connected = hasConnected ? (status.connected === true ? true : status.connected === false ? false : null) : null;
    const fetchFailed = Boolean(status && connected === null && status.error);
    return { status, connected, fetchFailed };
  }

  function getBackupStorageStatus() {
    const localTs = parseTimestamp(getValue("elyonLastBackupAt"));
    const driveTs = parseTimestamp(getValue(STORAGE_KEYS.lastDriveBackupAt) || getValue("elyonLastGoogleDriveBackupAt"));
    const driveErrorText = String(getValue(STORAGE_KEYS.lastDriveBackupError) || getValue("elyonLastGoogleDriveBackupError") || "").trim();
    const driveConnection = getDriveConnectionSnapshot();
    const driveError = isMeaningfulDriveError(driveErrorText);

    const local = {
      exists: Boolean(localTs),
      timestamp: localTs,
      text: localTs ? `vorhanden, zuletzt ${formatAbsoluteDate(localTs)}` : "fehlt",
    };

    const drive = {
      exists: Boolean(driveTs),
      timestamp: driveTs,
      connected: driveConnection.connected,
      error: driveError,
      errorText: driveErrorText,
      text: "fehlt",
    };

    if (driveError) {
      drive.text = "Fehler";
    } else if (driveTs) {
      drive.text = `vorhanden, zuletzt ${formatAbsoluteDate(driveTs)}`;
    } else if (driveConnection.connected === false) {
      drive.text = "nicht verbunden";
    } else if (driveConnection.connected === null && driveConnection.fetchFailed) {
      drive.text = "Google Drive Status unbekannt";
    }

    let overall = "Kein Backup vorhanden";
    if (driveError) {
      overall = "Google-Drive-Backup fehlgeschlagen";
    } else if (!local.exists && !drive.exists && driveConnection.connected === false) {
      overall = "Google Drive nicht verbunden";
    } else if (!local.exists && !drive.exists && driveConnection.connected === null && driveConnection.fetchFailed) {
      overall = "Google Drive Status unbekannt";
    } else if (!local.exists && !drive.exists) {
      overall = "Kein Backup vorhanden";
    } else if (local.exists && !drive.exists) {
      overall = "Nur lokales Backup vorhanden – Cloud-Sicherung empfohlen";
    } else if (!local.exists && drive.exists) {
      overall = "Nur Google-Drive-Backup vorhanden – lokales Backup empfohlen";
    } else if (local.exists && drive.exists) {
      overall = "Doppelt gesichert";
    }

    const latestTs = [local.timestamp, drive.timestamp].filter(ts => Number.isFinite(ts));
    const latestTimestamp = latestTs.length ? Math.max(...latestTs) : null;
    const latestSource = latestTs.length && latestTimestamp === drive.timestamp ? "google-drive" : latestTimestamp ? "lokal" : "keins";
    const fullyBackedUp = local.exists && drive.exists;
    const backupMissing = !local.exists || !drive.exists;

    return {
      local,
      drive,
      overall,
      latestTimestamp,
      latestSource,
      fullyBackedUp,
      backupMissing,
      checkedAt: nowIso(),
      connection: driveConnection,
    };
  }

  function persistBackupStorageStatus(status) {
    try {
      localStorage.setItem("elyonBackupStorageStatus", JSON.stringify({
        local: {
          exists: Boolean(status?.local?.exists),
          timestamp: status?.local?.timestamp || null,
          text: status?.local?.text || "",
        },
        drive: {
          exists: Boolean(status?.drive?.exists),
          timestamp: status?.drive?.timestamp || null,
          text: status?.drive?.text || "",
          connected: status?.drive?.connected ?? null,
          error: Boolean(status?.drive?.error),
        },
        overall: status?.overall || "",
        latestTimestamp: status?.latestTimestamp || null,
        latestSource: status?.latestSource || "keins",
        fullyBackedUp: Boolean(status?.fullyBackedUp),
        checkedAt: status?.checkedAt || nowIso(),
      }));
      localStorage.setItem("elyonLastBackupCheckAt", status?.checkedAt || nowIso());
    } catch {
      // ignore storage failures
    }
  }

  function getBackupStorageSummaryText(status) {
    const current = status || getBackupStorageStatus();
    return current.overall || "Backup-Status unbekannt";
  }

  function getBackupStatusClass(text) {
    const value = String(text || "").toLowerCase();
    if (value.includes("fehler") || value.includes("kein backup") || value.includes("nicht verbunden")) return "bad";
    if (value.includes("unbekannt")) return "warn";
    if (value.includes("empfohlen") || value.includes("nur lokales") || value.includes("nur google-drive")) return "warn";
    return "good";
  }

  function getBackupReminderContext() {
    const info = getBackupDueInfo();
    const storage = getBackupStorageStatus();
    const dismissedRecently = Boolean(info.dismissedRecently);
    const shouldShow = !dismissedRecently && (info.isDue || !storage.fullyBackedUp || storage.drive.error);
    let text = "";

    if (shouldShow) {
      if (storage.drive.error) {
        text = "Backup empfohlen: Google-Drive-Backup fehlgeschlagen.";
      } else if (!storage.fullyBackedUp) {
        text = "Backup empfohlen: Deine Daten sind aktuell nicht doppelt gesichert.";
      } else if (info.isDue) {
        text = "Backup empfohlen: Dein letztes Backup ist älter als dein eingestelltes Intervall.";
      }
    }

    return {
      info,
      storage,
      shouldShow: Boolean(text),
      text,
    };
  }

  function getBackupDueInfo() {
    const interval = getBackupIntervalValue();
    const intervalMeta = getIntervalMeta(interval);
    const lastBackupTs = getLatestBackupTimestamp();
    if (intervalMeta.type === "manual") {
      return {
        interval: intervalMeta,
        lastBackupTs,
        nextDueTs: null,
        isDue: false,
        dismissedRecently: false,
      };
    }

    const dismissedAt = getBackupReminderDismissedAt();
    const dismissedRecently = Boolean(dismissedAt && (Date.now() - dismissedAt) < 86400000);
    const nextDueTs = lastBackupTs ? addIntervalToDate(new Date(lastBackupTs), interval).getTime() : Date.now();
    const isDue = !dismissedRecently && (lastBackupTs === null || Date.now() >= nextDueTs);

    return {
      interval: intervalMeta,
      lastBackupTs,
      nextDueTs,
      isDue,
      dismissedRecently,
    };
  }

  function dismissBackupReminder() {
    setValue(STORAGE_KEYS.backupReminderDismissedAt, nowIso());
    renderBackupIntervalUi();
    renderBackupReminder();
  }

  function getNextRecommendedBackupLabel(info) {
    if (!info || info.interval.type === "manual") return "Nicht fällig";
    if (info.nextDueTs === null) return "Nicht fällig";
    if (info.isDue) return "Jetzt";
    return new Date(info.nextDueTs).toLocaleString("de-DE");
  }

  function getBackupReminderText(info, storage) {
    const reminder = getBackupReminderContext();
    const currentInfo = info || reminder.info;
    const currentStorage = storage || reminder.storage;
    if (!reminder.shouldShow) return "";
    if (currentStorage?.drive?.error) return "Backup empfohlen: Google-Drive-Backup fehlgeschlagen.";
    if (!currentStorage?.fullyBackedUp) return "Backup empfohlen: Deine Daten sind aktuell nicht doppelt gesichert.";
    if (currentInfo?.isDue) return "Backup empfohlen: Dein letztes Backup ist älter als dein eingestelltes Intervall.";
    return "";
  }

  function syncBackupIntervalSelect() {
    const select = $("backupIntervalSelect");
    if (!select) return;
    select.value = getBackupIntervalValue();
  }

  function renderBackupIntervalUi() {
    const info = getBackupDueInfo();
    const lastText = info.lastBackupTs ? formatAbsoluteDate(info.lastBackupTs) : "Noch nie";
    const nextText = info.interval.type === "manual" ? "Nicht fällig" : getNextRecommendedBackupLabel(info);

    safe("backupIntervalCurrent", el => { el.textContent = info.interval.label; });
    safe("backupIntervalLast", el => { el.textContent = lastText; });
    safe("backupIntervalNext", el => { el.textContent = nextText; });
    syncBackupIntervalSelect();
  }

  function renderBackupStorageUi() {
    const storage = getBackupStorageStatus();
    persistBackupStorageStatus(storage);
    const localClass = storage.local.exists ? "good" : "bad";
    const driveClass = storage.drive.error ? "bad" : storage.drive.exists ? "good" : storage.drive.connected === false || storage.drive.connected === null ? "warn" : "bad";
    const overallClass = getBackupStatusClass(storage.overall);
    const lastCheck = getValue("elyonLastBackupCheckAt") || storage.checkedAt;

    safe("backupStorageBox", el => {
      el.innerHTML = `
        <p><strong>Lokal:</strong> <span class="status ${localClass}">${escapeHtml(storage.local.exists ? "vorhanden" : "fehlt")}</span>${storage.local.exists ? `, zuletzt ${escapeHtml(formatAbsoluteDate(storage.local.timestamp))}` : ""}</p>
        <p><strong>Google Drive:</strong> <span class="status ${driveClass}">${escapeHtml(storage.drive.text)}</span>${storage.drive.errorText && storage.drive.error ? `<br><span class="muted">Fehler: ${escapeHtml(storage.drive.errorText)}</span>` : ""}</p>
        <p><strong>Gesamtstatus:</strong> <span class="status ${overallClass}">${escapeHtml(storage.overall)}</span></p>
        <p><strong>Letzter Backup-Check:</strong> ${escapeHtml(lastCheck ? new Date(lastCheck).toLocaleString("de-DE") : "Noch nie")}</p>
      `;
    });
  }

  function renderBackupReminder() {
    const context = getBackupReminderContext();
    const card = $("backupReminderCard");
    const text = getBackupReminderText(context.info, context.storage);
    if (!card) return;

    if (!text) {
      card.style.display = "none";
      return;
    }

    card.style.display = "";
    safe("backupReminderText", el => { el.textContent = text; });
  }

  function refreshBackupUi() {
    renderBackupIntervalUi();
    renderBackupStorageUi();
    renderBackupReminder();
    if (typeof renderStartDashboard === "function") renderStartDashboard();
  }

  function updateBackupReminderButtons() {
    bind("backupReminderLocalBtn", "click", () => {
      if (typeof exportFullBackup === "function") exportFullBackup();
      setTimeout(refreshBackupUi, 0);
    });
    bind("backupReminderDriveBtn", "click", async () => {
      try {
        if (typeof uploadGoogleDriveBackup === "function") {
          await uploadGoogleDriveBackup();
        }
      } catch {
        // uploadGoogleDriveBackup already shows a user-facing error
      }
      refreshBackupUi();
    });
    bind("backupReminderLaterBtn", "click", dismissBackupReminder);
    bind("backupIntervalSelect", "change", e => {
      setBackupIntervalValue(e.target.value);
      renderBackupIntervalUi();
      renderBackupReminder();
      renderBackupStorageUi();
      if (typeof renderDashboardDetails === "function") renderDashboardDetails();
    });
  }

  function validateBackupData(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, errors: ["Die Datei enthält kein gültiges JSON-Objekt."], warnings: [] };
    }

    const warnings = [];
    const requiredArrayKeys = ["products", "sales", "suppliers", "runningCosts", "returns", "shopifyReturns", "invoices"];
    requiredArrayKeys.forEach(key => {
      if (data[key] !== undefined && !Array.isArray(data[key])) {
        warnings.push(`${key} ist vorhanden, aber kein Array.`);
      }
    });
    if (data.settings !== undefined && (typeof data.settings !== "object" || Array.isArray(data.settings))) {
      warnings.push("settings ist vorhanden, aber kein Objekt.");
    }
    if (data.invoiceSettings !== undefined && (typeof data.invoiceSettings !== "object" || Array.isArray(data.invoiceSettings))) {
      warnings.push("invoiceSettings ist vorhanden, aber kein Objekt.");
    }

    const summary = {
      products: Array.isArray(data.products) ? data.products.length : 0,
      sales: Array.isArray(data.sales) ? data.sales.length : 0,
      suppliers: Array.isArray(data.suppliers) ? data.suppliers.length : 0,
      runningCosts: Array.isArray(data.runningCosts) ? data.runningCosts.length : 0,
      returns: Array.isArray(data.returns) ? data.returns.length : 0,
      shopifyReturns: Array.isArray(data.shopifyReturns) ? data.shopifyReturns.length : 0,
      invoices: Array.isArray(data.invoices) ? data.invoices.length : 0,
      hasListingDraft: Boolean(data.listingDraft),
    };

    return {
      ok: true,
      errors: [],
      warnings,
      summary,
      normalized: normalizeBackupData(data),
    };
  }

  function backupPreviewHtml(fileName, validation, data) {
    const summary = validation.summary || {};
    const badgeClass = validation.warnings.length ? "warn" : "good";
    const badgeText = validation.warnings.length ? "Mit Hinweisen" : "Gültig";
    const listItems = [
      `Datei: ${fileName || "Unbekannt"}`,
      `Exportiert: ${data.exportedAt || "unbekannt"}`,
      `Produkte: ${summary.products || 0}`,
      `Verkäufe: ${summary.sales || 0}`,
      `Lieferanten: ${summary.suppliers || 0}`,
      `Kosten: ${summary.runningCosts || 0}`,
      `Retouren: ${summary.returns || 0}`,
      `Shopify-Retouren: ${summary.shopifyReturns || 0}`,
      `Rechnungen: ${summary.invoices || 0}`,
      `Listing-Entwurf: ${summary.hasListingDraft ? "ja" : "nein"}`,
    ];
    const warnings = validation.warnings.length
      ? `<ul>${validation.warnings.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : "<p>Keine Auffälligkeiten gefunden.</p>";
    return `
      <p><strong class="status ${badgeClass}">${badgeText}</strong></p>
      <ul>${listItems.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      <h3>Prüfhinweise</h3>
      ${warnings}
    `;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderRestorePreview(fileName, validation, data) {
    state.pendingRestorePreview = { fileName, validation, data };
    safe("backupRestorePreview", el => {
      el.innerHTML = backupPreviewHtml(fileName, validation, data);
    });
    safe("applyRestoreBackupBtn", el => {
      el.disabled = false;
      el.textContent = validation.warnings.length ? "Backup trotzdem wiederherstellen" : "Backup wiederherstellen";
    });
  }

  function renderRestoreMessage(message, kind) {
    const status = kind === "error" ? "bad" : kind === "warn" ? "warn" : "good";
    safe("backupRestorePreview", el => {
      el.innerHTML = `<p><strong class="status ${status}">${escapeHtml(message)}</strong></p>`;
    });
  }

  function captureRestoreSnapshot(reason) {
    const snapshot = {
      ...getCurrentBackupData(),
      snapshotReason: reason || "restore",
      capturedAt: nowIso(),
    };
    setValue(STORAGE_KEYS.preRestoreSnapshot, JSON.stringify(snapshot));
    window.__elyonLastRestoreSnapshot = snapshot;
    return snapshot;
  }

  function applyBackupData(data, options = {}) {
    const normalized = normalizeBackupData(data);
    if (options.captureSnapshot !== false) {
      captureRestoreSnapshot(options.reason || "restore");
    }

    products = typeof normalizeProductsCollection === "function"
      ? normalizeProductsCollection(Array.isArray(normalized.products) ? normalized.products : [])
      : (Array.isArray(normalized.products) ? normalized.products : []);
    sales = Array.isArray(normalized.sales) ? normalized.sales : [];
    suppliers = Array.isArray(normalized.suppliers) ? normalized.suppliers : [];
    runningCosts = Array.isArray(normalized.runningCosts) ? normalized.runningCosts : [];
    returns = Array.isArray(normalized.returns) ? normalized.returns : [];
    shopifyReturns = Array.isArray(normalized.shopifyReturns) ? normalized.shopifyReturns : [];
    invoices = Array.isArray(normalized.invoices) ? normalized.invoices : [];
    appSettings = { ...(defaultSettings || {}), ...(normalized.settings || {}) };
    invoiceSettings = { ...(defaultInvoiceSettings || {}), ...(normalized.invoiceSettings || {}) };
    if (normalized.backupInterval !== null && normalized.backupInterval !== undefined) {
      const intervalValue = getIntervalMeta(normalized.backupInterval || getValue(STORAGE_KEYS.backupInterval) || "manual").value;
      setValue(STORAGE_KEYS.backupInterval, intervalValue);
    }
    if (normalized.backupReminderDismissedAt !== null && normalized.backupReminderDismissedAt !== undefined) {
      setValue(STORAGE_KEYS.backupReminderDismissedAt, String(normalized.backupReminderDismissedAt || ""));
    }

    if (normalized.googleSheetsSync && typeof normalized.googleSheetsSync === "object") {
      if (normalized.googleSheetsSync.url !== undefined) localStorage.setItem(GOOGLE_SHEETS_SYNC_KEYS.url, String(normalized.googleSheetsSync.url || ""));
      if (normalized.googleSheetsSync.token !== undefined) localStorage.setItem(GOOGLE_SHEETS_SYNC_KEYS.token, String(normalized.googleSheetsSync.token || ""));
      if (normalized.googleSheetsSync.lastInventorySyncAt !== undefined) localStorage.setItem(GOOGLE_SHEETS_SYNC_KEYS.inventoryAt, String(normalized.googleSheetsSync.lastInventorySyncAt || ""));
      if (normalized.googleSheetsSync.lastSupplierSyncAt !== undefined) localStorage.setItem(GOOGLE_SHEETS_SYNC_KEYS.supplierAt, String(normalized.googleSheetsSync.lastSupplierSyncAt || ""));
      if (normalized.googleSheetsSync.lastSalesSyncAt !== undefined) localStorage.setItem(GOOGLE_SHEETS_SYNC_KEYS.salesAt, String(normalized.googleSheetsSync.lastSalesSyncAt || ""));
      if (normalized.googleSheetsSync.lastCostsSyncAt !== undefined) localStorage.setItem(GOOGLE_SHEETS_SYNC_KEYS.costsAt, String(normalized.googleSheetsSync.lastCostsSyncAt || ""));
    }

    localStorage.setItem("elyonProducts", JSON.stringify(products));
    localStorage.setItem("elyonSales", JSON.stringify(sales));
    localStorage.setItem("elyonSuppliers", JSON.stringify(suppliers));
    localStorage.setItem("elyonCosts", JSON.stringify(runningCosts));
    localStorage.setItem("elyonReturns", JSON.stringify(returns));
    localStorage.setItem("elyonShopifyReturns", JSON.stringify(shopifyReturns));
    localStorage.setItem("elyonInvoices", JSON.stringify(invoices));
    if (normalized.listingDraft) {
      localStorage.setItem(EBAY_LISTING_DRAFT_KEY, JSON.stringify(typeof normalizeEbayListingDraftRecord === "function" ? normalizeEbayListingDraftRecord(normalized.listingDraft) : normalized.listingDraft));
    }
    localStorage.setItem("elyonSettings", JSON.stringify(appSettings));
    localStorage.setItem("elyonInvoiceSettings", JSON.stringify(invoiceSettings));
    localStorage.setItem(STORAGE_KEYS.lastRestoreAt, nowIso());

    if (typeof applySettings === "function") applySettings();
    if (typeof applyInvoiceSettings === "function") applyInvoiceSettings();
    if (typeof renderGoogleSheetsSyncStatus === "function") renderGoogleSheetsSyncStatus();
    if (typeof render === "function") render();
    if (typeof renderReturns === "function") renderReturns();
    if (typeof renderShopifyReturns === "function") renderShopifyReturns();
    if (typeof renderReturnsOverview === "function") renderReturnsOverview();
    if (typeof renderSales === "function") renderSales();
    if (typeof renderSaleProductOptions === "function") renderSaleProductOptions();
    if (typeof renderShippingCockpit === "function") renderShippingCockpit();
    if (typeof renderInvoiceOverview === "function") renderInvoiceOverview();
    if (typeof renderReturnProductOptions === "function") renderReturnProductOptions();
    refreshBackupUi();
  }

  function undoLastRestore() {
    const raw = getValue(STORAGE_KEYS.preRestoreSnapshot);
    if (!raw) {
      renderRestoreMessage("Kein Restore-Snapshot vorhanden.", "warn");
      alert("Es gibt keinen gespeicherten Snapshot zum Zurückrollen.");
      return;
    }

    const snapshot = safeJSONParse(raw, null);
    if (!snapshot || typeof snapshot !== "object") {
      renderRestoreMessage("Snapshot konnte nicht gelesen werden.", "error");
      alert("Der gespeicherte Snapshot ist ungültig.");
      return;
    }

    if (!confirm("Letzte Wiederherstellung wirklich rückgängig machen?")) return;
    applyBackupData(snapshot, { captureSnapshot: false, reason: "undo-restore" });
    setValue(STORAGE_KEYS.lastDriveBackupError, "");
    renderRestoreMessage("Wiederherstellung wurde rückgängig gemacht.", "good");
  }

  async function refreshGoogleDriveStatus() {
    try {
      const response = await fetch("/api/google-drive/status", { credentials: "same-origin" });
      const data = await response.json().catch(() => ({}));
      state.status = data;
      if (data.lastBackupAt) setValue(STORAGE_KEYS.lastDriveBackupAt, data.lastBackupAt);
      if (data.lastBackupFileName) setValue(STORAGE_KEYS.lastDriveBackupFile, data.lastBackupFileName);
      if (data.lastBackupFileId) setValue(STORAGE_KEYS.lastDriveBackupId, data.lastBackupFileId);
      if (data.lastBackupError !== undefined) setValue(STORAGE_KEYS.lastDriveBackupError, data.lastBackupError || "");
      renderGoogleDriveStatus(data);
      refreshBackupUi();
    } catch (error) {
      state.status = { ok: false, connected: null, error: error.message || "Google Drive Status unbekannt" };
      renderGoogleDriveStatus(state.status);
      refreshBackupUi();
    }
  }

  function renderGoogleDriveStatus(data) {
    const connected = data && Object.prototype.hasOwnProperty.call(data, "connected") ? data.connected : null;
    const statusText = connected === true ? "Verbunden" : connected === false ? "Nicht verbunden" : "Google Drive Status unbekannt";
    const lastBackup = data?.lastBackupAt || getValue(STORAGE_KEYS.lastDriveBackupAt) || "Noch nie";
    const errorText = data?.error || data?.lastBackupError || getValue(STORAGE_KEYS.lastDriveBackupError) || "Kein Fehler";

    safe("googleDriveStatus", el => { el.textContent = statusText; });
    safe("googleDriveLastBackup", el => { el.textContent = lastBackup === "Noch nie" ? lastBackup : new Date(lastBackup).toLocaleString("de-DE"); });
    safe("googleDriveErrorStatus", el => { el.textContent = errorText || "Kein Fehler"; });
    safe("googleDriveStatusBox", el => {
      el.innerHTML = `
        <p><strong>Verbindung:</strong> ${escapeHtml(statusText)}</p>
        <p><strong>Letztes Drive-Backup:</strong> ${escapeHtml(lastBackup === "Noch nie" ? lastBackup : new Date(lastBackup).toLocaleString("de-DE"))}</p>
        <p><strong>Status:</strong> ${escapeHtml(errorText || "Alles gut")}</p>
      `;
    });
  }

  async function connectGoogleDrive() {
    try {
      renderGoogleDriveStatus({ connected: false, error: "Google Drive Verbindung wird gestartet..." });
      const response = await fetch("/api/google-drive/auth-url", { method: "GET", credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok || !data.ok || !data.authUrl) {
        throw new Error(data.error || "Google Drive Auth-URL konnte nicht geladen werden.");
      }
      window.location.assign(data.authUrl);
    } catch (error) {
      setValue(STORAGE_KEYS.lastDriveBackupError, error.message || "Google Drive Verbindung fehlgeschlagen.");
      renderGoogleDriveStatus({ connected: false, error: error.message || "Google Drive Verbindung fehlgeschlagen." });
      refreshBackupUi();
      alert(error.message || "Google Drive Verbindung fehlgeschlagen.");
    }
  }

  async function uploadGoogleDriveBackup() {
    try {
      if (state.isUploading) return;
      state.isUploading = true;
      const data = typeof window.buildElyonFullBackupData === "function" ? window.buildElyonFullBackupData() : getCurrentBackupData();
      const fileName = formatLocalFilename(new Date(data.exportedAt || Date.now()));
      const validation = validateBackupData(data);
      if (!validation.ok) {
        throw new Error((validation.errors || []).join(" "));
      }

      setValue(STORAGE_KEYS.lastDriveBackupError, "Backup wird zu Google Drive hochgeladen...");
      renderGoogleDriveStatus({ connected: true, error: "Backup wird hochgeladen..." });

      const response = await fetch("/api/google-drive/upload-backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ backup: validation.normalized || data, fileName }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "Google Drive Upload fehlgeschlagen.");
      }

      const uploadedAt = result.uploadedAt || nowIso();
      setValue(STORAGE_KEYS.lastDriveBackupAt, uploadedAt);
      setValue(STORAGE_KEYS.lastDriveBackupFile, result.fileName || fileName);
      setValue(STORAGE_KEYS.lastDriveBackupId, result.file?.id || "");
      setValue(STORAGE_KEYS.lastDriveBackupError, "");
      setValue("elyonLastGoogleDriveBackupAt", uploadedAt);
      setValue("elyonLastGoogleDriveBackupFile", result.fileName || fileName);
      setValue("elyonLastGoogleDriveBackupError", "");
      if (typeof render === "function") render();
      await refreshGoogleDriveStatus();
      alert(`Backup erfolgreich in Google Drive gespeichert: ${result.fileName || fileName}`);
      return result;
    } catch (error) {
      setValue(STORAGE_KEYS.lastDriveBackupError, error.message || "Google Drive Upload fehlgeschlagen.");
      setValue("elyonLastGoogleDriveBackupError", error.message || "Google Drive Upload fehlgeschlagen.");
      renderGoogleDriveStatus({ connected: Boolean(state.status?.connected), error: error.message || "Google Drive Upload fehlgeschlagen." });
      refreshBackupUi();
      alert(error.message || "Google Drive Upload fehlgeschlagen.");
      throw error;
    } finally {
      state.isUploading = false;
    }
  }

  async function prepareGoogleDriveRestore(file) {
    if (!file) return;
    try {
      const raw = await file.text();
      const data = JSON.parse(raw);
      const validation = validateBackupData(data);
      state.pendingRestore = { data: validation.normalized || data, fileName: file.name, validation };
      renderRestorePreview(file.name, validation, validation.normalized || data);
      setValue(STORAGE_KEYS.lastDriveBackupError, "");
    } catch (error) {
      state.pendingRestore = null;
      renderRestoreMessage(`Backup konnte nicht gelesen werden: ${error.message || "Ungültige JSON-Datei."}`, "error");
      setValue(STORAGE_KEYS.lastDriveBackupError, error.message || "Backup konnte nicht gelesen werden.");
      refreshBackupUi();
      alert(error.message || "Backup konnte nicht gelesen werden. Bitte JSON-Datei prüfen.");
    }
  }

  async function applyPendingGoogleDriveRestore() {
    if (!state.pendingRestore) {
      alert("Bitte zuerst eine Backup-Datei auswählen.");
      return;
    }
    const { data, fileName, validation } = state.pendingRestore;
    const proceed = confirm(
      validation?.warnings?.length
        ? `Backup "${fileName}" wird mit Hinweisen wiederhergestellt. Lokale Daten werden ersetzt. Fortfahren?`
        : `Backup "${fileName}" wirklich wiederherstellen? Lokale Daten werden ersetzt.`
    );
    if (!proceed) return;
    applyBackupData(data, { captureSnapshot: true, reason: "manual-restore" });
    state.pendingRestore = null;
    setValue(STORAGE_KEYS.lastRestoreAt, nowIso());
    safe("fullBackupImport", el => { el.value = ""; });
    renderRestoreMessage("Backup wurde wiederhergestellt. Der vorherige Zustand ist als Snapshot gespeichert.", "good");
    if (typeof toast === "function") {
      toast("Backup wiederhergestellt.");
    } else {
      alert("Backup wurde wiederhergestellt.");
    }
  }

  function updateRestoreUiForNoSelection() {
    safe("backupRestorePreview", el => {
      el.innerHTML = "<p>Noch keine Backup-Datei ausgewählt.</p>";
    });
    safe("applyRestoreBackupBtn", el => {
      el.disabled = true;
      el.textContent = "Wiederherstellung ausführen";
    });
  }

  function consumeGoogleDriveQueryState() {
    try {
      const url = new URL(window.location.href);
      const flag = url.searchParams.get("googleDrive");
      const message = url.searchParams.get("googleDriveMessage") || "";
      if (!flag) return;

      if (flag === "connected") {
        if (typeof toast === "function") toast("Google Drive ist verbunden.");
        else alert("Google Drive ist verbunden.");
      } else if (flag === "error") {
        const text = message || "Google Drive Login fehlgeschlagen.";
        if (typeof toast === "function") toast(text);
        else alert(text);
        setValue(STORAGE_KEYS.lastDriveBackupError, text);
      }
      url.searchParams.delete("googleDrive");
      url.searchParams.delete("googleDriveMessage");
      window.history.replaceState({}, document.title, `${url.pathname}${url.search ? url.search : ""}${url.hash || ""}`);
    } catch {
      // ignore URL cleanup errors
    }
  }

  function getBackupAgeLabel(ts) {
    const parsed = parseTimestamp(ts);
    if (!parsed) return "Noch nie";
    const diffMs = Date.now() - parsed;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays <= 0) return "Heute";
    if (diffDays === 1) return "Gestern";
    return `Vor ${diffDays} Tagen`;
  }

  function lastBackupText() {
    const ts = getLatestBackupTimestamp();
    const age = getBackupAgeLabel(ts);
    const info = getBackupDueInfo();
    if (info.interval.type !== "manual" && info.isDue) {
      return `Backup fällig - ${age}`;
    }
    return age;
  }

  function backupWarningText() {
    return getBackupReminderText();
  }

  function bindGoogleDriveUi() {
    bind("googleDriveConnectBtn", "click", connectGoogleDrive);
    bind("googleDriveUploadBtn", "click", uploadGoogleDriveBackup);
    bind("applyRestoreBackupBtn", "click", applyPendingGoogleDriveRestore);
    bind("undoRestoreBtn", "click", undoLastRestore);
  }

  function hookRender() {
    if (window.__elyonBackupRenderHookInstalled) return;
    if (typeof render !== "function") return;
    const originalRender = render;
    window.render = function(...args) {
      const result = originalRender.apply(this, args);
      refreshBackupUi();
      return result;
    };
    window.__elyonBackupRenderHookInstalled = true;
  }

  function installHelpers() {
    window.buildElyonFullBackupData = getCurrentBackupData;
    window.normalizeBackupData = normalizeBackupData;
    window.validateElyonBackupData = validateBackupData;
    window.applyElyonBackupData = applyBackupData;
    window.captureElyonRestoreSnapshot = captureRestoreSnapshot;
    window.undoElyonRestore = undoLastRestore;
    window.lastBackupText = lastBackupText;
    window.backupWarningText = backupWarningText;
    window.getElyonBackupWarningText = backupWarningText;
    window.backupStorageSummaryText = function() {
      return getBackupStorageSummaryText();
    };
    window.getElyonBackupStorageStatus = function() {
      return getBackupStorageStatus();
    };
    window.prepareElyonBackupRestore = async function(eventOrFile) {
      const file = eventOrFile && eventOrFile.target && eventOrFile.target.files
        ? eventOrFile.target.files[0]
        : eventOrFile;
      return prepareGoogleDriveRestore(file);
    };
    window.uploadElyonBackupToGoogleDrive = uploadGoogleDriveBackup;
    window.refreshElyonGoogleDriveStatus = refreshGoogleDriveStatus;
    window.renderElyonGoogleDriveStatus = renderGoogleDriveStatus;
  }

  async function init() {
    installHelpers();
    hookRender();
    bindGoogleDriveUi();
    updateBackupReminderButtons();
    updateRestoreUiForNoSelection();
    consumeGoogleDriveQueryState();
    refreshBackupUi();
    if (typeof render === "function") render();
    if (typeof renderStartDashboard === "function") renderStartDashboard();
    await refreshGoogleDriveStatus();
    refreshBackupUi();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
