(() => {
  "use strict";

  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const MODAL_ID = "elyonAiWorkforceV2SettingsModal";
  const STYLE_ID = "elyonAiWorkforceV2SettingsStyles";
  const BACKEND = {
    "elyon-manager": "elyon-operations-manager",
    "elyon-product-data-specialist": "elyon-product-data-checker",
    "elyon-compliance-specialist": "elyon-compliance-guard",
    "elyon-profit-specialist": "elyon-profit-analyst",
    "elyon-listing-specialist": "elyon-listing-pro",
    "elyon-order-specialist": "elyon-order-coordinator",
    "elyon-customer-support-specialist": "elyon-support-assistant",
  };

  const COMMON = [
    { path: "common.outputDetail", label: "Ausführlichkeit", type: "select", options: [["compact", "Kompakt"], ["standard", "Standard"], ["detailed", "Ausführlich"]], value: "standard" },
    { path: "common.confidenceThreshold", label: "Mindest-Konfidenz", type: "number", min: 0, max: 1, step: 0.05, value: 0.75 },
    { path: "common.maxTokens", label: "Maximale Antwortgröße", type: "number", min: 500, max: 12000, step: 250, value: 4000 },
    { path: "common.priority", label: "Aufgabenpriorität", type: "select", options: [["low", "Niedrig"], ["medium", "Normal"], ["high", "Hoch"], ["critical", "Kritisch"]], value: "medium" },
  ];

  const DEFINITIONS = {
    "elyon-manager": {
      name: "Elyon Manager",
      icon: "🧠",
      description: "Zentrale Regeln für Orchestrierung, Blocker und interne Delegation.",
      fields: [
        { path: "specialist.stopOnBlocker", label: "Bei jedem Blocker stoppen", type: "checkbox", value: true },
        { path: "specialist.requireApprovalAtGates", label: "Freigabe an Prozessgrenzen verlangen", type: "checkbox", value: true, locked: true },
        { path: "specialist.allowInternalDelegation", label: "Nächsten internen Fachagenten vorschlagen", type: "checkbox", value: true },
        { path: "specialist.maximumParallelAgents", label: "Maximale parallele Fachagenten", type: "number", min: 1, max: 3, step: 1, value: 1 },
        { path: "specialist.dailyBriefing", label: "Tagesbriefing erstellen", type: "checkbox", value: true },
        { path: "specialist.blockOnConflicts", label: "Widersprüchliche Ergebnisse blockieren", type: "checkbox", value: true },
      ],
    },
    "elyon-product-data-specialist": {
      name: "Product Data Specialist",
      icon: "🧩",
      description: "Pflichtdaten, Bilder, Varianten und Lieferanteninformationen steuern.",
      fields: [
        { path: "specialist.requireTitle", label: "Produkttitel verlangen", type: "checkbox", value: true },
        { path: "specialist.requireImages", label: "Mindestens ein Bild verlangen", type: "checkbox", value: true },
        { path: "specialist.requireCosts", label: "Einkaufs- und Versandkosten verlangen", type: "checkbox", value: true },
        { path: "specialist.requireSupplierUrl", label: "Lieferantenlink verlangen", type: "checkbox", value: true },
        { path: "specialist.normalizeVariants", label: "Variantenbezeichnungen vereinheitlichen", type: "checkbox", value: true },
        { path: "specialist.missingDataAction", label: "Fehlende Pflichtdaten", type: "select", options: [["warn", "Warnen"], ["review", "Manuelle Prüfung"], ["block", "Blockieren"]], value: "block" },
      ],
    },
    "elyon-compliance-specialist": {
      name: "Compliance Guard",
      icon: "🛡️",
      description: "Prüfstrenge, Zielmärkte und Verhalten bei fehlenden Nachweisen.",
      fields: [
        { path: "specialist.strictness", label: "Prüfstrenge", type: "select", options: [["normal", "Normal"], ["strict", "Streng"], ["maximum", "Maximal"]], value: "strict" },
        { path: "specialist.targetMarket", label: "Hauptmarkt", type: "select", options: [["DE", "Deutschland"], ["EU", "Europäische Union"], ["UK", "Großbritannien"], ["CH", "Schweiz"]], value: "DE" },
        { path: "specialist.checkGpsr", label: "GPSR prüfen", type: "checkbox", value: true },
        { path: "specialist.checkCe", label: "CE und Konformität prüfen", type: "checkbox", value: true },
        { path: "specialist.checkVero", label: "Marke und VeRO prüfen", type: "checkbox", value: true },
        { path: "specialist.missingEvidenceAction", label: "Fehlende Nachweise", type: "select", options: [["warn", "Warnen"], ["manual-review", "Manuelle Prüfung"], ["block", "Blockieren"]], value: "block" },
      ],
    },
    "elyon-profit-specialist": {
      name: "Profit Analyst",
      icon: "📊",
      description: "Mindestgewinn, Marge, Reserven und Preisszenarien festlegen.",
      fields: [
        { path: "specialist.minimumProfitEur", label: "Mindestgewinn in €", type: "number", min: 0, max: 10000, step: 0.5, value: 5 },
        { path: "specialist.minimumMarginPercent", label: "Mindestmarge in %", type: "number", min: 0, max: 100, step: 0.5, value: 20 },
        { path: "specialist.minimumRuleMode", label: "Mindestregel", type: "select", options: [["or", "Gewinn ODER Marge"], ["and", "Gewinn UND Marge"]], value: "or" },
        { path: "specialist.returnReservePercent", label: "Retourenreserve in %", type: "number", min: 0, max: 100, step: 0.5, value: 7 },
        { path: "specialist.priceBufferPercent", label: "Kostenpuffer in %", type: "number", min: 0, max: 100, step: 0.5, value: 4 },
        { path: "specialist.weakResultAction", label: "Mindestregel verfehlt", type: "select", options: [["warn", "Warnen"], ["manual-review", "Manuelle Prüfung"], ["block", "Blockieren"]], value: "block" },
      ],
    },
    "elyon-listing-specialist": {
      name: "Listing Specialist",
      icon: "✍️",
      description: "Titel, SEO, Beschreibung und Faktenbindung steuern.",
      fields: [
        { path: "specialist.marketplace", label: "Zielmarktplatz", type: "select", options: [["ebay-de", "eBay Deutschland"], ["ebay-at", "eBay Österreich"], ["ebay-ch", "eBay Schweiz"]], value: "ebay-de" },
        { path: "specialist.titleMaxLength", label: "Maximale Titellänge", type: "number", min: 40, max: 120, step: 1, value: 80 },
        { path: "specialist.seoStrength", label: "SEO-Stärke", type: "select", options: [["low", "Zurückhaltend"], ["balanced", "Ausgewogen"], ["strong", "Stark"]], value: "balanced" },
        { path: "specialist.descriptionLength", label: "Beschreibungslänge", type: "select", options: [["short", "Kurz"], ["medium", "Mittel"], ["detailed", "Ausführlich"]], value: "medium" },
        { path: "specialist.factsOnly", label: "Nur belegte Fakten", type: "checkbox", value: true, locked: true },
        { path: "specialist.normalizeVariants", label: "Varianten vereinheitlichen", type: "checkbox", value: true },
      ],
    },
    "elyon-draft-quality-guard": {
      name: "Draft Quality Guard",
      icon: "🔎",
      description: "Technische Endkontrolle des eBay-Entwurfs vor der Freigabe.",
      fields: [
        { path: "specialist.checkTitleLength", label: "Titellänge prüfen", type: "checkbox", value: true },
        { path: "specialist.checkCategory", label: "Kategorie prüfen", type: "checkbox", value: true },
        { path: "specialist.checkAspects", label: "Pflichtmerkmale prüfen", type: "checkbox", value: true },
        { path: "specialist.checkPrice", label: "Preisabgleich durchführen", type: "checkbox", value: true },
        { path: "specialist.checkSupplierText", label: "Lieferantenreste erkennen", type: "checkbox", value: true },
        { path: "specialist.requireManualApproval", label: "Manuelle Endfreigabe verlangen", type: "checkbox", value: true, locked: true },
      ],
    },
    "elyon-order-specialist": {
      name: "Order Coordinator",
      icon: "📦",
      description: "Versandfristen, Tracking und operative Eskalationen steuern.",
      fields: [
        { path: "specialist.trackingCheckHours", label: "Tracking nach Stunden prüfen", type: "number", min: 1, max: 336, step: 1, value: 48 },
        { path: "specialist.deadlineWarningHours", label: "Warnung vor Fristablauf", type: "number", min: 1, max: 168, step: 1, value: 24 },
        { path: "specialist.maximumDelayDays", label: "Maximal tolerierte Verzögerung", type: "number", min: 0, max: 60, step: 1, value: 3 },
        { path: "specialist.detectInvalidTracking", label: "Ungültiges Tracking erkennen", type: "checkbox", value: true },
        { path: "specialist.detectStockLoss", label: "Lieferantenausfall melden", type: "checkbox", value: true },
        { path: "specialist.neverOrderAutomatically", label: "Niemals automatisch bestellen", type: "checkbox", value: true, locked: true },
      ],
    },
    "elyon-customer-support-specialist": {
      name: "Customer Support Specialist",
      icon: "💬",
      description: "Tonalität, Anrede, Kulanzvorschläge und Eskalationen festlegen.",
      fields: [
        { path: "specialist.tone", label: "Tonalität", type: "select", options: [["friendly-professional", "Freundlich und professionell"], ["empathetic", "Empathisch"], ["factual", "Sachlich"], ["brief-direct", "Kurz und direkt"]], value: "friendly-professional" },
        { path: "specialist.addressForm", label: "Anrede", type: "select", options: [["sie", "Sie"], ["du", "Du"]], value: "sie" },
        { path: "specialist.responseLength", label: "Antwortlänge", type: "select", options: [["very-short", "Sehr kurz"], ["compact", "Kompakt"], ["detailed", "Ausführlich"], ["adaptive", "Je nach Fall"]], value: "compact" },
        { path: "specialist.maximumRefundSuggestionEur", label: "Maximaler Erstattungsvorschlag €", type: "number", min: 0, max: 10000, step: 0.5, value: 0 },
        { path: "specialist.maximumDiscountSuggestionPercent", label: "Maximaler Rabattvorschlag %", type: "number", min: 0, max: 100, step: 1, value: 10 },
        { path: "specialist.requireApproval", label: "Jede Nachricht manuell freigeben", type: "checkbox", value: true, locked: true },
      ],
    },
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  function readSettings() {
    try {
      const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }

  function writeSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      return true;
    } catch {
      return false;
    }
  }

  function setPath(target, path, value) {
    const parts = path.split(".");
    let current = target;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) current[part] = value;
      else current = current[part] ||= {};
    });
  }

  function getPath(target, path) {
    return path.split(".").reduce((value, part) => value?.[part], target);
  }

  function defaultsFor(agentId) {
    const definition = DEFINITIONS[agentId];
    const result = { common: {}, specialist: {} };
    [...COMMON, ...definition.fields].forEach((field) => setPath(result, field.path, clone(field.value)));
    return result;
  }

  function advancedFor(agentId) {
    const defaults = defaultsFor(agentId);
    const stored = readSettings().agents?.[agentId]?.advanced || {};
    return {
      common: { ...defaults.common, ...(stored.common || {}) },
      specialist: { ...defaults.specialist, ...(stored.specialist || {}) },
    };
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `.aiwv2s-backdrop{position:fixed;inset:0;z-index:16000;background:rgba(2,6,23,.8);backdrop-filter:blur(8px);display:flex;justify-content:flex-end}.aiwv2s-panel{width:min(720px,100%);height:100%;overflow:auto;background:#0b1220;border-left:1px solid rgba(148,163,184,.2);padding:22px;box-shadow:-24px 0 80px rgba(0,0,0,.45)}.aiwv2s-head{display:flex;justify-content:space-between;gap:12px;position:sticky;top:-22px;padding:22px 0 14px;background:#0b1220;border-bottom:1px solid rgba(148,163,184,.14);z-index:2}.aiwv2s-title{display:flex;gap:11px}.aiwv2s-title i{font-style:normal;font-size:29px}.aiwv2s-title h2{margin:0;color:#e2e8f0}.aiwv2s-title p{margin:5px 0 0;color:#94a3b8;font-size:12px;line-height:1.45}.aiwv2s-close{width:38px;height:38px;padding:0!important}.aiwv2s-section{margin-top:15px;padding:15px;border-radius:17px;background:rgba(15,23,42,.55);border:1px solid rgba(148,163,184,.15)}.aiwv2s-section h3{margin:0 0 12px;color:#dbeafe;font-size:14px}.aiwv2s-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}.aiwv2s-field{display:grid;gap:5px;font-size:11px;color:#cbd5e1}.aiwv2s-field input,.aiwv2s-field select{margin:0;padding:10px;border-radius:11px}.aiwv2s-check{display:flex;gap:8px;align-items:flex-start;padding:10px;border-radius:12px;background:rgba(255,255,255,.035);font-size:11px;color:#cbd5e1}.aiwv2s-lock{margin-left:auto;color:#fbbf24;font-size:9px}.aiwv2s-safety{margin-top:15px;padding:13px;border-radius:14px;background:rgba(34,197,94,.06);border:1px solid rgba(74,222,128,.18);color:#bbf7d0;font-size:11px;line-height:1.5}.aiwv2s-actions{display:flex;gap:9px;position:sticky;bottom:-22px;background:#0b1220;padding:15px 0 22px;margin-top:16px;border-top:1px solid rgba(148,163,184,.14)}.aiwv2s-actions button{padding:11px 14px;border-radius:12px}.aiwv2s-reset{background:rgba(239,68,68,.1)!important;color:#fecaca!important}@media(max-width:640px){.aiwv2s-panel{padding:16px}.aiwv2s-head{top:-16px}.aiwv2s-grid{grid-template-columns:1fr}.aiwv2s-actions{bottom:-16px}}`;
    document.head.appendChild(style);
  }

  function renderField(field, values) {
    const value = getPath(values, field.path);
    if (field.type === "checkbox") return `<label class="aiwv2s-check"><input data-path="${field.path}" type="checkbox" ${value !== false ? "checked" : ""} ${field.locked ? "disabled" : ""}><span><strong>${escapeHtml(field.label)}</strong></span>${field.locked ? '<span class="aiwv2s-lock">🔒 fest</span>' : ""}</label>`;
    if (field.type === "number") return `<label class="aiwv2s-field"><strong>${escapeHtml(field.label)}</strong><input data-path="${field.path}" type="number" value="${escapeHtml(value)}" min="${field.min}" max="${field.max}" step="${field.step}" ${field.locked ? "disabled" : ""}></label>`;
    return `<label class="aiwv2s-field"><strong>${escapeHtml(field.label)}</strong><select data-path="${field.path}" ${field.locked ? "disabled" : ""}>${field.options.map(([optionValue, optionLabel]) => `<option value="${escapeHtml(optionValue)}" ${String(value) === String(optionValue) ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}</select></label>`;
  }

  function save(agentId) {
    const modal = document.getElementById(MODAL_ID);
    const advanced = advancedFor(agentId);
    modal?.querySelectorAll("[data-path]").forEach((control) => {
      const value = control.type === "checkbox" ? control.checked : control.type === "number" ? Number(control.value) : control.value;
      setPath(advanced, control.dataset.path, value);
    });
    const settings = readSettings();
    settings.agents = settings.agents && typeof settings.agents === "object" ? settings.agents : {};
    settings.agents[agentId] = { ...(settings.agents[agentId] || {}), advanced };
    const backendId = BACKEND[agentId];
    if (backendId) settings.agents[backendId] = { ...(settings.agents[backendId] || {}), ...(settings.agents[agentId] || {}), id: backendId, advanced };
    writeSettings(settings);
    window.ElyonAIWorkforceV2?.render?.();
  }

  function open(agentId) {
    const definition = DEFINITIONS[agentId];
    if (!definition) return;
    installStyles();
    document.getElementById(MODAL_ID)?.remove();
    const values = advancedFor(agentId);
    const backdrop = document.createElement("div");
    backdrop.id = MODAL_ID;
    backdrop.className = "aiwv2s-backdrop";
    backdrop.innerHTML = `<aside class="aiwv2s-panel" role="dialog" aria-modal="true"><div class="aiwv2s-head"><div class="aiwv2s-title"><i>${definition.icon}</i><div><h2>${escapeHtml(definition.name)} einstellen</h2><p>${escapeHtml(definition.description)}</p></div></div><button class="aiwv2s-close" data-action="close">✕</button></div><section class="aiwv2s-section"><h3>Allgemeine Arbeitsweise</h3><div class="aiwv2s-grid">${COMMON.map((field) => renderField(field, values)).join("")}</div></section><section class="aiwv2s-section"><h3>Fachregeln</h3><div class="aiwv2s-grid">${definition.fields.map((field) => renderField(field, values)).join("")}</div></section><div class="aiwv2s-safety"><strong>Unveränderbare Sicherheitsregeln:</strong> Keine automatische Veröffentlichung, Preisänderung, Lieferantenbestellung, Kundennachricht, Rückerstattung, Löschung oder Änderung rechtlicher Daten.</div><div class="aiwv2s-actions"><button data-action="save">Speichern</button><button class="aiw-secondary" data-action="save-test">Speichern und Test</button><button class="aiwv2s-reset" data-action="reset">Standard wiederherstellen</button></div></aside>`;
    backdrop.addEventListener("click", (event) => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (event.target === backdrop || action === "close") backdrop.remove();
      if (action === "save") { save(agentId); backdrop.remove(); }
      if (action === "save-test") { save(agentId); backdrop.remove(); window.ElyonAIWorkforceV2?.runAgent?.(agentId, { test: true }); }
      if (action === "reset") {
        const settings = readSettings();
        if (settings.agents?.[agentId]) delete settings.agents[agentId].advanced;
        const backendId = BACKEND[agentId];
        if (backendId && settings.agents?.[backendId]) delete settings.agents[backendId].advanced;
        writeSettings(settings);
        open(agentId);
      }
    });
    document.body.appendChild(backdrop);
  }

  window.ElyonAIWorkforceV2Settings = { open, get: advancedFor, definitions: DEFINITIONS };
})();
