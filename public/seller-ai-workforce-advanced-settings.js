(() => {
  "use strict";

  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const ENDPOINT = "/api/ai-agent-run";
  const ADVANCED_ENDPOINT = "/api/ai-agent-run-advanced";
  const MODAL_ID = "elyonAiWorkforceAdvancedModal";
  const STYLE_ID = "elyonAiWorkforceAdvancedStyles";

  const OPTIONS = {
    detail: [["compact", "Kompakt"], ["standard", "Standard"], ["detailed", "Ausführlich"]],
    creativity: [["precise", "Präzise"], ["balanced", "Ausgewogen"], ["creative", "Kreativer"]],
    priority: [["low", "Niedrig"], ["medium", "Normal"], ["high", "Hoch"], ["critical", "Kritisch"]],
    yesNo: [["true", "Ja"], ["false", "Nein"]],
  };

  const COMMON_FIELDS = [
    { path: "common.outputDetail", label: "Ausführlichkeit", type: "select", options: OPTIONS.detail, help: "Steuert, wie umfangreich der Bericht ausfällt." },
    { path: "common.confidenceThreshold", label: "Mindest-Konfidenz", type: "number", min: 0, max: 1, step: 0.05, help: "Unsichere Ergebnisse werden automatisch zur manuellen Prüfung gestellt." },
    { path: "common.creativity", label: "Arbeitsweise", type: "select", options: OPTIONS.creativity, help: "Präzise ist für Prüfungen und Kalkulationen empfohlen." },
    { path: "common.maxTokens", label: "Maximale Antwortgröße", type: "number", min: 500, max: 12000, step: 250, help: "Begrenzt die maximale Größe eines KI-Ergebnisses." },
    { path: "common.priority", label: "Aufgabenpriorität", type: "select", options: OPTIONS.priority, help: "Wird in der gemeinsamen Arbeitsmappe verwendet." },
  ];

  const AGENTS = {
    "elyon-listing-pro": {
      name: "Listing Pro",
      icon: "✍️",
      description: "Titel, SEO, Varianten und Beschreibung fachlich steuern.",
      defaults: {
        common: { outputDetail: "standard", confidenceThreshold: 0.65, creativity: "balanced", maxTokens: 4000, priority: "medium" },
        specialist: { marketplace: "ebay-de", language: "de-DE", titleMaxLength: 80, seoStrength: "balanced", writingStyle: "sales-factual", descriptionLength: "medium", useBullets: true, allowHtml: true, factsOnly: true, includeBrand: true, includeModel: true, includeColorSize: true, normalizeVariants: true, unknownFactsAction: "mark-missing" },
      },
      sections: [
        { title: "Marktplatz und Sprache", fields: [
          { path: "specialist.marketplace", label: "Zielmarktplatz", type: "select", options: [["ebay-de", "eBay Deutschland"], ["ebay-at", "eBay Österreich"], ["ebay-ch", "eBay Schweiz"], ["shopify-de", "Shopify Deutschland"]] },
          { path: "specialist.language", label: "Zielsprache", type: "select", options: [["de-DE", "Deutsch"], ["en-GB", "Englisch (UK)"], ["en-US", "Englisch (US)"]] },
        ]},
        { title: "Titel und SEO", fields: [
          { path: "specialist.titleMaxLength", label: "Maximale Titellänge", type: "number", min: 40, max: 120, step: 1 },
          { path: "specialist.seoStrength", label: "SEO-Stärke", type: "select", options: [["low", "Zurückhaltend"], ["balanced", "Ausgewogen"], ["strong", "Stark"]] },
          { path: "specialist.includeBrand", label: "Marke aufnehmen, wenn belegt", type: "checkbox" },
          { path: "specialist.includeModel", label: "Modellnummer aufnehmen, wenn belegt", type: "checkbox" },
          { path: "specialist.includeColorSize", label: "Farbe und Größe berücksichtigen", type: "checkbox" },
        ]},
        { title: "Beschreibung und Fakten", fields: [
          { path: "specialist.writingStyle", label: "Schreibstil", type: "select", options: [["factual", "Sachlich"], ["sales-factual", "Verkaufsstark und sachlich"], ["technical", "Technisch"], ["friendly", "Freundlich"]] },
          { path: "specialist.descriptionLength", label: "Beschreibungslänge", type: "select", options: [["short", "Kurz"], ["medium", "Mittel"], ["detailed", "Ausführlich"]] },
          { path: "specialist.useBullets", label: "Aufzählungen verwenden", type: "checkbox" },
          { path: "specialist.allowHtml", label: "Sichere HTML-Struktur erlauben", type: "checkbox" },
          { path: "specialist.factsOnly", label: "Nur belegte Fakten verwenden", type: "checkbox", locked: true },
          { path: "specialist.unknownFactsAction", label: "Unbekannte Angaben", type: "select", options: [["mark-missing", "Als fehlend markieren"], ["omit", "Weglassen"]] },
          { path: "specialist.normalizeVariants", label: "Varianten vereinheitlichen", type: "checkbox" },
        ]},
      ],
    },
    "elyon-compliance-guard": {
      name: "Compliance Guard",
      icon: "🛡️",
      description: "Prüfbereiche, Zielländer, Nachweise und Blockierregeln festlegen.",
      defaults: {
        common: { outputDetail: "detailed", confidenceThreshold: 0.8, creativity: "precise", maxTokens: 5000, priority: "high" },
        specialist: { targetMarkets: ["DE", "EU"], strictness: "strict", checks: ["gpsr", "manufacturer", "responsible-person", "ce", "vero", "category-aspects"], requiredDocuments: ["manufacturer-data", "gpsr-data", "safety-information"], missingEvidenceAction: "block", uncertainCertificateAction: "manual-review", brandRiskAction: "block" },
      },
      sections: [
        { title: "Zielländer und Prüfstrenge", fields: [
          { path: "specialist.targetMarkets", label: "Zielmärkte", type: "multi", options: [["DE", "Deutschland"], ["EU", "Europäische Union"], ["UK", "Großbritannien"], ["CH", "Schweiz"]] },
          { path: "specialist.strictness", label: "Prüfstrenge", type: "select", options: [["normal", "Normal"], ["strict", "Streng"], ["maximum", "Maximal"]] },
        ]},
        { title: "Prüfbereiche", fields: [
          { path: "specialist.checks", label: "Aktive Prüfungen", type: "multi", options: [["gpsr", "GPSR"], ["manufacturer", "Hersteller"], ["responsible-person", "EU-Verantwortlicher"], ["ce", "CE"], ["battery", "Batteriegesetz"], ["weee", "ElektroG / WEEE"], ["packaging", "Verpackung"], ["textile", "Textil"], ["toy", "Spielzeug"], ["vero", "Marke / VeRO"], ["category-aspects", "Kategorie und Pflichtmerkmale"]] },
          { path: "specialist.requiredDocuments", label: "Verlangte Nachweise", type: "multi", options: [["manufacturer-data", "Herstellerdaten"], ["gpsr-data", "GPSR-Daten"], ["safety-information", "Sicherheitsangaben"], ["declaration-of-conformity", "Konformitätserklärung"], ["test-report", "Prüfbericht"], ["manual", "Bedienungsanleitung"], ["supplier-invoice", "Lieferantennachweis"]] },
        ]},
        { title: "Entscheidungsregeln", fields: [
          { path: "specialist.missingEvidenceAction", label: "Fehlende Nachweise", type: "select", options: [["warn", "Warnen"], ["manual-review", "Manuelle Prüfung"], ["block", "Produkt blockieren"]] },
          { path: "specialist.uncertainCertificateAction", label: "Unklares Zertifikat", type: "select", options: [["warn", "Warnen"], ["manual-review", "Manuelle Prüfung"], ["block", "Blockieren"]] },
          { path: "specialist.brandRiskAction", label: "Marken- oder VeRO-Risiko", type: "select", options: [["warn", "Warnen"], ["manual-review", "Manuelle Prüfung"], ["block", "Blockieren"]] },
        ]},
      ],
    },
    "elyon-profit-analyst": {
      name: "Profit Analyst",
      icon: "📊",
      description: "Mindestregeln, Reserven, Preispuffer und Szenarien bestimmen.",
      defaults: {
        common: { outputDetail: "detailed", confidenceThreshold: 0.8, creativity: "precise", maxTokens: 3500, priority: "high" },
        specialist: { minimumProfitEur: 5, minimumMarginPercent: 20, minimumRuleMode: "or", returnReservePercent: 7, priceBufferPercent: 4, advertisingCostPercent: 0, scenarioCount: 3, priceEnding: "0.99", weakResultAction: "block" },
      },
      sections: [
        { title: "Elyon-Mindestregel", fields: [
          { path: "specialist.minimumProfitEur", label: "Mindestgewinn in €", type: "number", min: 0, max: 10000, step: 0.5 },
          { path: "specialist.minimumMarginPercent", label: "Mindestmarge in %", type: "number", min: 0, max: 100, step: 0.5 },
          { path: "specialist.minimumRuleMode", label: "Verknüpfung", type: "select", options: [["or", "Gewinn ODER Marge"], ["and", "Gewinn UND Marge"]] },
          { path: "specialist.weakResultAction", label: "Regel nicht erfüllt", type: "select", options: [["warn", "Warnen"], ["manual-review", "Manuelle Prüfung"], ["block", "Produkt blockieren"]] },
        ]},
        { title: "Risiko- und Kostenreserven", fields: [
          { path: "specialist.returnReservePercent", label: "Retourenreserve in %", type: "number", min: 0, max: 100, step: 0.5 },
          { path: "specialist.priceBufferPercent", label: "Einkaufs-/Versandpuffer in %", type: "number", min: 0, max: 100, step: 0.5 },
          { path: "specialist.advertisingCostPercent", label: "Werbekosten in %", type: "number", min: 0, max: 100, step: 0.5 },
        ]},
        { title: "Preisvorschläge", fields: [
          { path: "specialist.scenarioCount", label: "Anzahl Preisszenarien", type: "select", options: [["3", "3 Szenarien"], ["4", "4 Szenarien"], ["5", "5 Szenarien"]] },
          { path: "specialist.priceEnding", label: "Bevorzugte Preisendung", type: "select", options: [["none", "Keine"], ["0.49", ",49 €"], ["0.90", ",90 €"], ["0.99", ",99 €"]] },
        ]},
      ],
    },
    "elyon-operations-manager": {
      name: "Operations Manager",
      icon: "🧭",
      description: "Tagesplanung, Prioritäten und interne Delegation steuern.",
      defaults: {
        common: { outputDetail: "standard", confidenceThreshold: 0.65, creativity: "precise", maxTokens: 4500, priority: "high" },
        specialist: { maximumDailyTasks: 10, availableMinutes: 240, briefingLength: "compact", orderPriority: "critical", supportPriority: "high", compliancePriority: "high", listingPriority: "medium", delegateInternalDrafts: true, preventDuplicateTasks: true, showCompletedSummary: true },
      },
      sections: [
        { title: "Tagesplanung", fields: [
          { path: "specialist.maximumDailyTasks", label: "Maximale Tagesaufgaben", type: "number", min: 1, max: 50, step: 1 },
          { path: "specialist.availableMinutes", label: "Verfügbare Arbeitszeit in Minuten", type: "number", min: 15, max: 960, step: 15 },
          { path: "specialist.briefingLength", label: "Briefing-Länge", type: "select", options: OPTIONS.detail },
          { path: "specialist.showCompletedSummary", label: "Erledigte Aufgaben zusammenfassen", type: "checkbox" },
        ]},
        { title: "Bereichsprioritäten", fields: [
          { path: "specialist.orderPriority", label: "Bestellungen", type: "select", options: OPTIONS.priority },
          { path: "specialist.supportPriority", label: "Supportfälle", type: "select", options: OPTIONS.priority },
          { path: "specialist.compliancePriority", label: "Compliance", type: "select", options: OPTIONS.priority },
          { path: "specialist.listingPriority", label: "Listings", type: "select", options: OPTIONS.priority },
        ]},
        { title: "Interne Organisation", fields: [
          { path: "specialist.delegateInternalDrafts", label: "Interne Entwürfe an Mitarbeiter delegieren", type: "checkbox" },
          { path: "specialist.preventDuplicateTasks", label: "Doppelte Aufgaben vermeiden", type: "checkbox" },
        ]},
      ],
    },
    "elyon-order-coordinator": {
      name: "Order Coordinator",
      icon: "📦",
      description: "Versandfristen, Tracking und Eskalationen einstellen.",
      defaults: {
        common: { outputDetail: "standard", confidenceThreshold: 0.75, creativity: "precise", maxTokens: 3500, priority: "critical" },
        specialist: { trackingCheckHours: 48, deadlineWarningHours: 24, maximumDelayDays: 3, includeWeekends: false, escalationLevel: "task-and-support-draft", detectPriceIncrease: true, detectStockLoss: true, detectInvalidTracking: true, neverOrderAutomatically: true },
      },
      sections: [
        { title: "Fristen", fields: [
          { path: "specialist.trackingCheckHours", label: "Tracking nach Stunden prüfen", type: "number", min: 1, max: 336, step: 1 },
          { path: "specialist.deadlineWarningHours", label: "Warnung vor Fristablauf in Stunden", type: "number", min: 1, max: 168, step: 1 },
          { path: "specialist.maximumDelayDays", label: "Maximal tolerierte Verzögerung in Tagen", type: "number", min: 0, max: 60, step: 1 },
          { path: "specialist.includeWeekends", label: "Wochenenden in Fristen einrechnen", type: "checkbox" },
        ]},
        { title: "Risikoerkennung", fields: [
          { path: "specialist.detectPriceIncrease", label: "Lieferanten-Preisanstieg melden", type: "checkbox" },
          { path: "specialist.detectStockLoss", label: "Nichtverfügbarkeit melden", type: "checkbox" },
          { path: "specialist.detectInvalidTracking", label: "Ungültiges Tracking erkennen", type: "checkbox" },
          { path: "specialist.escalationLevel", label: "Eskalationsstufe", type: "select", options: [["notice", "Nur Hinweis"], ["task", "Dringende Aufgabe"], ["task-and-support-draft", "Aufgabe und Supportentwurf"]] },
        ]},
        { title: "Sicherheitsgrenze", fields: [
          { path: "specialist.neverOrderAutomatically", label: "Niemals automatisch beim Lieferanten bestellen", type: "checkbox", locked: true },
        ]},
      ],
    },
    "elyon-support-assistant": {
      name: "Support Assistant",
      icon: "💬",
      description: "Tonalität, Falltypen, Kulanzvorschläge und Eskalationen festlegen.",
      defaults: {
        common: { outputDetail: "standard", confidenceThreshold: 0.75, creativity: "balanced", maxTokens: 3500, priority: "high" },
        specialist: { tone: "friendly-professional", addressForm: "sie", responseLength: "compact", languageMode: "detect", allowedCases: ["delay", "not-received", "wrong-item", "damaged", "return", "cancellation", "invoice", "product-question"], maximumRefundSuggestionEur: 0, maximumDiscountSuggestionPercent: 10, escalationTriggers: ["legal-threat", "marketplace-case", "safety-incident", "privacy-request", "fraud-suspicion", "negative-feedback"], requireApproval: true, prohibitBindingPromises: true },
      },
      sections: [
        { title: "Sprache und Ton", fields: [
          { path: "specialist.tone", label: "Tonalität", type: "select", options: [["friendly-professional", "Freundlich und professionell"], ["empathetic", "Besonders empathisch"], ["factual", "Sachlich"], ["brief-direct", "Kurz und direkt"]] },
          { path: "specialist.addressForm", label: "Anrede", type: "select", options: [["sie", "Sie"], ["du", "Du"]] },
          { path: "specialist.responseLength", label: "Antwortlänge", type: "select", options: [["very-short", "Sehr kurz"], ["compact", "Kompakt"], ["detailed", "Ausführlich"], ["adaptive", "Je nach Fall"]] },
          { path: "specialist.languageMode", label: "Sprache", type: "select", options: [["detect", "Automatisch erkennen"], ["de", "Deutsch"], ["en", "Englisch"], ["bilingual", "Zweisprachig anzeigen"]] },
        ]},
        { title: "Erlaubte Falltypen", fields: [
          { path: "specialist.allowedCases", label: "Bearbeitbare Fälle", type: "multi", options: [["delay", "Lieferverzögerung"], ["not-received", "Nicht erhalten"], ["wrong-item", "Falscher Artikel"], ["damaged", "Beschädigt"], ["return", "Rückgabe"], ["cancellation", "Stornierung"], ["invoice", "Rechnung"], ["product-question", "Produktfrage"], ["negative-feedback", "Negative Bewertung"]] },
        ]},
        { title: "Kulanzvorschläge", fields: [
          { path: "specialist.maximumRefundSuggestionEur", label: "Maximaler Erstattungsvorschlag in €", type: "number", min: 0, max: 10000, step: 0.5 },
          { path: "specialist.maximumDiscountSuggestionPercent", label: "Maximaler Rabattvorschlag in %", type: "number", min: 0, max: 100, step: 1 },
        ]},
        { title: "Eskalation und Schutz", fields: [
          { path: "specialist.escalationTriggers", label: "Sofort eskalieren bei", type: "multi", options: [["legal-threat", "Rechtlicher Drohung"], ["marketplace-case", "eBay-/Zahlungsfall"], ["safety-incident", "Sicherheitsvorfall"], ["privacy-request", "Datenschutzanfrage"], ["fraud-suspicion", "Betrugsverdacht"], ["negative-feedback", "Negativer Bewertung"], ["high-value-refund", "Hoher Erstattung"]] },
          { path: "specialist.requireApproval", label: "Jede Nachricht manuell freigeben", type: "checkbox", locked: true },
          { path: "specialist.prohibitBindingPromises", label: "Keine verbindlichen Zusagen", type: "checkbox", locked: true },
        ]},
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

  function mergeDefaults(defaults, stored) {
    const source = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    const result = clone(defaults);
    Object.keys(result).forEach((key) => {
      if (result[key] && typeof result[key] === "object" && !Array.isArray(result[key])) result[key] = { ...result[key], ...(source[key] || {}) };
      else if (source[key] !== undefined) result[key] = source[key];
    });
    return result;
  }

  function advancedFor(agentId) {
    const definition = AGENTS[agentId];
    if (!definition) return null;
    const settings = readSettings();
    const stored = settings.agents?.[agentId]?.advanced;
    return mergeDefaults(definition.defaults, stored);
  }

  function setPath(target, path, value) {
    const parts = path.split(".");
    let cursor = target;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) cursor[part] = value;
      else cursor = cursor[part] ||= {};
    });
  }

  function getPath(target, path) {
    return path.split(".").reduce((value, part) => value?.[part], target);
  }

  function renderField(field, values) {
    const value = getPath(values, field.path);
    const disabled = field.locked ? "disabled" : "";
    const lock = field.locked ? '<span class="aiwa-lock">🔒 fest</span>' : "";
    if (field.type === "checkbox") {
      return `<label class="aiwa-check"><input type="checkbox" data-setting-path="${field.path}" ${value !== false ? "checked" : ""} ${disabled}><span><strong>${escapeHtml(field.label)}</strong>${field.help ? `<small>${escapeHtml(field.help)}</small>` : ""}</span>${lock}</label>`;
    }
    if (field.type === "multi") {
      const selected = Array.isArray(value) ? value.map(String) : [];
      return `<div class="aiwa-field aiwa-wide" data-multi-path="${field.path}"><span class="aiwa-label">${escapeHtml(field.label)}</span><div class="aiwa-multi">${field.options.map(([optionValue, optionLabel]) => `<label><input type="checkbox" value="${escapeHtml(optionValue)}" ${selected.includes(String(optionValue)) ? "checked" : ""}><span>${escapeHtml(optionLabel)}</span></label>`).join("")}</div>${field.help ? `<small>${escapeHtml(field.help)}</small>` : ""}</div>`;
    }
    if (field.type === "number") {
      return `<label class="aiwa-field"><span class="aiwa-label">${escapeHtml(field.label)} ${lock}</span><input data-setting-path="${field.path}" type="number" value="${escapeHtml(value)}" min="${field.min}" max="${field.max}" step="${field.step}" ${disabled}>${field.help ? `<small>${escapeHtml(field.help)}</small>` : ""}</label>`;
    }
    return `<label class="aiwa-field"><span class="aiwa-label">${escapeHtml(field.label)} ${lock}</span><select data-setting-path="${field.path}" ${disabled}>${field.options.map(([optionValue, optionLabel]) => `<option value="${escapeHtml(optionValue)}" ${String(value) === String(optionValue) ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}</select>${field.help ? `<small>${escapeHtml(field.help)}</small>` : ""}</label>`;
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .aiwa-open{width:100%;justify-content:center}.aiwa-summary{font-size:10px;color:#93c5fd;padding:7px 9px;border-radius:10px;background:rgba(59,130,246,.08);border:1px solid rgba(96,165,250,.14)}
      .aiwa-backdrop{position:fixed;inset:0;z-index:12000;background:rgba(2,6,23,.78);backdrop-filter:blur(8px);display:flex;justify-content:flex-end}.aiwa-panel{width:min(760px,100%);height:100%;overflow:auto;background:#0b1220;border-left:1px solid rgba(148,163,184,.22);box-shadow:-24px 0 80px rgba(0,0,0,.45);padding:22px}.aiwa-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;position:sticky;top:-22px;background:#0b1220;padding:22px 0 14px;z-index:2;border-bottom:1px solid rgba(148,163,184,.14)}.aiwa-title{display:flex;gap:12px}.aiwa-icon{font-size:30px}.aiwa-title h2{margin:0;color:#e2e8f0}.aiwa-title p{margin:5px 0 0;color:#94a3b8;font-size:13px;line-height:1.45}.aiwa-close{width:38px;height:38px;border-radius:12px!important;padding:0!important;background:rgba(255,255,255,.07)!important}.aiwa-section{margin-top:16px;padding:15px;border:1px solid rgba(148,163,184,.15);border-radius:17px;background:rgba(15,23,42,.55)}.aiwa-section h3{margin:0 0 12px;color:#dbeafe;font-size:14px}.aiwa-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.aiwa-field{display:grid;gap:5px;color:#cbd5e1;font-size:12px}.aiwa-field input,.aiwa-field select{margin:0;padding:10px;border-radius:11px}.aiwa-label{font-weight:800}.aiwa-field small,.aiwa-check small{color:#64748b;line-height:1.35}.aiwa-wide{grid-column:1/-1}.aiwa-check{display:flex;gap:9px;align-items:flex-start;padding:10px;border-radius:12px;background:rgba(255,255,255,.035);color:#cbd5e1;font-size:12px}.aiwa-check input{margin-top:3px}.aiwa-check span{display:grid;gap:4px}.aiwa-lock{font-size:9px;color:#fbbf24;margin-left:auto}.aiwa-multi{display:grid;grid-template-columns:1fr 1fr;gap:7px}.aiwa-multi label{display:flex;gap:7px;align-items:center;padding:8px;border-radius:10px;background:rgba(255,255,255,.035);font-size:11px;color:#cbd5e1}.aiwa-safety{margin-top:16px;padding:13px;border-radius:15px;background:rgba(34,197,94,.07);border:1px solid rgba(74,222,128,.18);color:#bbf7d0;font-size:12px;line-height:1.5}.aiwa-actions{display:flex;gap:9px;flex-wrap:wrap;position:sticky;bottom:-22px;background:#0b1220;padding:15px 0 22px;margin-top:18px;border-top:1px solid rgba(148,163,184,.14)}.aiwa-actions button{padding:11px 14px;border-radius:12px}.aiwa-reset{background:rgba(239,68,68,.1)!important;color:#fecaca!important;border:1px solid rgba(239,68,68,.2)!important}.aiwa-toast{position:fixed;right:20px;bottom:20px;z-index:14000;padding:12px 15px;border-radius:13px;background:#111827;color:#e2e8f0;border:1px solid rgba(96,165,250,.3);box-shadow:0 18px 50px rgba(0,0,0,.4)}
      @media(max-width:640px){.aiwa-panel{padding:16px}.aiwa-head{top:-16px;padding-top:16px}.aiwa-grid,.aiwa-multi{grid-template-columns:1fr}.aiwa-actions{bottom:-16px;padding-bottom:16px}}
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    document.querySelector(".aiwa-toast")?.remove();
    const node = document.createElement("div");
    node.className = "aiwa-toast";
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 3500);
  }

  function summary(agentId, advanced) {
    const specialist = advanced.specialist || {};
    if (agentId === "elyon-listing-pro") return `${specialist.marketplace} · ${specialist.titleMaxLength} Zeichen · SEO ${specialist.seoStrength}`;
    if (agentId === "elyon-compliance-guard") return `${specialist.strictness} · ${specialist.targetMarkets?.join("/") || "DE"} · fehlend: ${specialist.missingEvidenceAction}`;
    if (agentId === "elyon-profit-analyst") return `${Number(specialist.minimumProfitEur).toFixed(2)} € ${specialist.minimumRuleMode?.toUpperCase()} ${Number(specialist.minimumMarginPercent).toFixed(1)} % · Reserve ${specialist.returnReservePercent} %`;
    if (agentId === "elyon-operations-manager") return `${specialist.maximumDailyTasks} Aufgaben · ${specialist.availableMinutes} Min. · ${specialist.briefingLength}`;
    if (agentId === "elyon-order-coordinator") return `Tracking ${specialist.trackingCheckHours} h · Warnung ${specialist.deadlineWarningHours} h`;
    if (agentId === "elyon-support-assistant") return `${specialist.tone} · ${specialist.addressForm === "sie" ? "Sie" : "Du"} · Freigabe Pflicht`;
    return "Individuelle Regeln aktiv";
  }

  function saveFromModal(agentId) {
    const modal = document.getElementById(MODAL_ID);
    const definition = AGENTS[agentId];
    if (!modal || !definition) return false;
    const advanced = advancedFor(agentId);
    modal.querySelectorAll("[data-setting-path]").forEach((control) => {
      let value;
      if (control.type === "checkbox") value = control.checked;
      else if (control.type === "number") value = Number(control.value);
      else value = control.value;
      setPath(advanced, control.dataset.settingPath, value);
    });
    modal.querySelectorAll("[data-multi-path]").forEach((group) => {
      const values = [...group.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
      setPath(advanced, group.dataset.multiPath, values);
    });
    advanced.updatedAt = new Date().toISOString();
    const settings = readSettings();
    settings.agents = settings.agents && typeof settings.agents === "object" ? settings.agents : {};
    settings.agents[agentId] = { ...(settings.agents[agentId] || {}), advanced };
    if (!writeSettings(settings)) return false;
    updateCards();
    window.dispatchEvent(new CustomEvent("elyon:ai-workforce-advanced-settings-changed", { detail: { agentId, advanced } }));
    return true;
  }

  function openModal(agentId) {
    const definition = AGENTS[agentId];
    if (!definition) return;
    installStyles();
    document.getElementById(MODAL_ID)?.remove();
    const values = advancedFor(agentId);
    const backdrop = document.createElement("div");
    backdrop.id = MODAL_ID;
    backdrop.className = "aiwa-backdrop";
    backdrop.innerHTML = `<aside class="aiwa-panel" role="dialog" aria-modal="true" aria-labelledby="aiwaTitle"><div class="aiwa-head"><div class="aiwa-title"><div class="aiwa-icon">${definition.icon}</div><div><h2 id="aiwaTitle">${escapeHtml(definition.name)} einstellen</h2><p>${escapeHtml(definition.description)}</p></div></div><button class="aiwa-close" data-aiwa-action="close" aria-label="Schließen">✕</button></div><section class="aiwa-section"><h3>Allgemeine Arbeitsweise</h3><div class="aiwa-grid">${COMMON_FIELDS.map((field) => renderField(field, values)).join("")}</div></section>${definition.sections.map((section) => `<section class="aiwa-section"><h3>${escapeHtml(section.title)}</h3><div class="aiwa-grid">${section.fields.map((field) => renderField(field, values)).join("")}</div></section>`).join("")}<div class="aiwa-safety"><strong>Sicherheitsgrenzen bleiben fest:</strong> Keine automatische Veröffentlichung, Preisänderung, Lieferantenbestellung, Kundennachricht, Rückerstattung, Produktlöschung oder Änderung rechtlicher Daten. Ergebnisse bleiben prüf- und freigabepflichtig.</div><div class="aiwa-actions"><button data-aiwa-action="save">Einstellungen speichern</button><button class="aiw-secondary" data-aiwa-action="test">Speichern und Testlauf</button><button class="aiwa-reset" data-aiwa-action="reset">Standard wiederherstellen</button></div></aside>`;
    backdrop.addEventListener("click", (event) => {
      const action = event.target.closest("[data-aiwa-action]")?.dataset.aiwaAction;
      if (!action && event.target === backdrop) backdrop.remove();
      if (action === "close") backdrop.remove();
      if (action === "save" && saveFromModal(agentId)) toast(`${definition.name}: Einstellungen gespeichert.`);
      if (action === "reset") {
        const settings = readSettings();
        if (settings.agents?.[agentId]) delete settings.agents[agentId].advanced;
        writeSettings(settings);
        openModal(agentId);
        updateCards();
        toast(`${definition.name}: Standardwerte wiederhergestellt.`);
      }
      if (action === "test" && saveFromModal(agentId)) {
        backdrop.remove();
        window.ElyonAIWorkforce?.runAgent?.(agentId, { test: true });
      }
    });
    document.body.appendChild(backdrop);
  }

  function updateCards() {
    document.querySelectorAll(".aiw-card[data-agent-id]").forEach((card) => {
      const agentId = card.dataset.agentId;
      if (!AGENTS[agentId]) return;
      const actions = card.querySelector(".aiw-actions");
      if (actions && !actions.querySelector('[data-action="advanced-settings"]')) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "aiw-secondary aiwa-open";
        button.dataset.action = "advanced-settings";
        button.textContent = "⚙️ Erweiterte Einstellungen";
        button.addEventListener("click", () => openModal(agentId));
        actions.appendChild(button);
      }
      let summaryNode = card.querySelector(".aiwa-summary");
      if (!summaryNode) {
        summaryNode = document.createElement("div");
        summaryNode.className = "aiwa-summary";
        card.querySelector(".aiw-fields")?.insertAdjacentElement("afterend", summaryNode);
      }
      summaryNode.textContent = summary(agentId, advancedFor(agentId));
    });
  }

  function temperatureFor(advanced) {
    if (advanced.common.creativity === "creative") return 0.7;
    if (advanced.common.creativity === "balanced") return 0.35;
    return 0.15;
  }

  function installFetchBridge() {
    if (window.fetch?.elyonAdvancedWorkforceWrapped) return;
    const originalFetch = window.fetch.bind(window);
    const wrapped = async function (input, init = {}) {
      const sourceUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input?.url;
      if (!sourceUrl) return originalFetch(input, init);
      let parsed;
      try { parsed = new URL(sourceUrl, window.location.origin); } catch { return originalFetch(input, init); }
      if (parsed.pathname !== ENDPOINT) return originalFetch(input, init);
      parsed.pathname = ADVANCED_ENDPOINT;
      const nextInit = { ...init };
      const method = String(nextInit.method || (typeof input !== "string" && input?.method) || "GET").toUpperCase();
      if (method === "POST" && typeof nextInit.body === "string") {
        try {
          const body = JSON.parse(nextInit.body);
          const agentId = String(body.agentId || body.task?.agentId || "");
          if (AGENTS[agentId]) {
            const advanced = advancedFor(agentId);
            body.agent = { ...(body.agent || {}), advanced, temperature: temperatureFor(advanced), maxTokens: advanced.common.maxTokens };
            body.priority = advanced.common.priority;
            nextInit.body = JSON.stringify(body);
          }
        } catch {}
      }
      return originalFetch(parsed.toString(), nextInit);
    };
    wrapped.elyonAdvancedWorkforceWrapped = true;
    wrapped.elyonOriginal = originalFetch;
    window.fetch = wrapped;
  }

  function install() {
    installStyles();
    installFetchBridge();
    updateCards();
    const observer = new MutationObserver(updateCards);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    [100, 500, 1200, 2400].forEach((delay) => setTimeout(updateCards, delay));
    window.ElyonAIWorkforceAdvancedSettings = {
      open: openModal,
      get: advancedFor,
      refresh: updateCards,
      agents: AGENTS,
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
