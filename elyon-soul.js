(function () {
  "use strict";

  const CONFIG = {
    storageKey: "elyonProducts",
    stateKey: "elyonSoulOpen",
    endpoint: "/api/elyon-soul",
  };

  const QUICK_ACTIONS = [
    {
      label: "Tagesfokus",
      reply: "Pruefe heute zuerst offene Produkte mit fehlender Marge oder Lieferzeit.",
    },
    {
      label: "Risiken prüfen",
      reply: "Achte besonders auf Produkte mit Batterie, Elektronik, Markenbezug oder unklarer Lieferzeit.",
    },
    {
      label: "Schwache Margen",
      reply: "Produkte mit niedriger Marge gefaehrden deinen Cashflow. Pruefe Einkaufspreis, Versandkosten und eBay-Gebuehren.",
    },
    {
      label: "Nächster Schritt",
      reply: "Schliesse zuerst unvollstaendige Produktanalysen ab, bevor du neue Produkte importierst.",
    },
    {
      label: "Backup-Hinweis",
      reply: "Exportiere regelmaessig ein Backup, solange noch keine echte Cloud-Datenbank angebunden ist.",
    },
  ];

  const MAX_MESSAGES = 8;

  const state = {
    open: localStorage.getItem(CONFIG.stateKey) === "1",
    loading: false,
    aiChecked: false,
    aiEnabled: false,
    messages: [],
    summary: createEmptySummary(),
  };

  const ui = {
    shell: null,
    fab: null,
    panel: null,
    status: null,
    metrics: null,
    hint: null,
    feed: null,
    feedback: null,
    input: null,
    sendBtn: null,
    aiBtn: null,
    scroll: null,
    closeBtn: null,
  };

  function createEmptySummary() {
    return {
      total: 0,
      missingMarginCount: 0,
      missingDeliveryCount: 0,
      complianceRiskCount: 0,
      weakMarginCount: 0,
      averageProfit: 0,
      averageMargin: 0,
      recommendation: "Lege zuerst ein Produkt an, dann kann die Soul sinnvoll coachen.",
      products: [],
    };
  }

  function num(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function safeParseJson(raw) {
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function readProducts() {
    const raw = localStorage.getItem(CONFIG.storageKey);
    const parsed = safeParseJson(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.products)) return parsed.products;
    if (parsed && Array.isArray(parsed.items)) return parsed.items;
    return [];
  }

  function buildRiskTags(product) {
    const bag = [
      product.name,
      product.title,
      product.notes,
      product.status,
      product.risk,
      product.category,
      product.tags,
    ]
      .flat()
      .map(text)
      .join(" ")
      .toLowerCase();

    const tags = [];
    if (/batter|akku|battery/.test(bag)) tags.push("battery");
    if (/elektro|electronics|elektronik|usb|lade/.test(bag)) tags.push("electronics");
    if (/marke|brand|logo/.test(bag)) tags.push("brand");
    if (/weee|lucid|epr|verpack|compliance/.test(bag)) tags.push("compliance");
    if (/kosmetik|medizin|spielzeug|kind/.test(bag)) tags.push("regulated");
    return unique(tags);
  }

  function normalizeProduct(item, index) {
    const source = item && typeof item === "object" ? item : {};

    const buy = num(source.buy ?? source.purchasePrice ?? source.cost ?? source.einkaufspreis);
    const sell = num(source.sell ?? source.salePrice ?? source.price ?? source.verkaufspreis);
    const ship = num(source.ship ?? source.shipping ?? source.versandkosten);
    const delivery = num(source.delivery ?? source.deliveryDays ?? source.lieferzeit);
    const sales = num(source.sales ?? source.monthlySales ?? source.absatz);
    const competition = num(source.competition ?? source.competitors ?? source.konkurrenz);
    const feePercent = num(source.feePercent ?? source.fee ?? source.ebayFeePercent) || 15;
    const bufferPercent = num(source.bufferPercent ?? source.riskBuffer ?? source.puffer) || 5;
    const fee = sell > 0 ? sell * (feePercent / 100) : 0;
    const buffer = sell > 0 ? sell * (bufferPercent / 100) : 0;
    const profit = sell - buy - ship - fee - buffer;
    const marginPercent = sell > 0 ? (profit / sell) * 100 : null;
    const missingMargin = buy <= 0 || sell <= 0 || !Number.isFinite(profit);
    const missingDelivery = delivery <= 0;
    const weakMargin = !missingMargin && profit < 5;
    const riskTag = text(source.riskTag ?? source.risk).toLowerCase() || "low";
    const riskTags = buildRiskTags(source);
    const complianceRisk = riskTag === "high" || riskTags.length > 0 || Boolean(source.complianceRisk);

    return {
      id: text(source.id) || `P${index + 1}`,
      status: text(source.status) || "Idee",
      buy,
      sell,
      ship,
      delivery,
      sales,
      competition,
      feePercent,
      bufferPercent,
      profit,
      marginPercent,
      missingMargin,
      missingDelivery,
      weakMargin,
      complianceRisk,
      riskTag,
      riskTags,
      shopifyCandidate: Boolean(source.shopifyCandidate),
    };
  }

  function summarizeProducts(rawProducts) {
    const products = Array.isArray(rawProducts) ? rawProducts.map(normalizeProduct) : [];
    const total = products.length;
    const missingMarginCount = products.filter((product) => product.missingMargin).length;
    const missingDeliveryCount = products.filter((product) => product.missingDelivery).length;
    const complianceRiskCount = products.filter((product) => product.complianceRisk).length;
    const weakMarginCount = products.filter((product) => product.weakMargin).length;
    const averageProfit = total ? products.reduce((sum, product) => sum + product.profit, 0) / total : 0;
    const validMargins = products.filter((product) => Number.isFinite(product.marginPercent));
    const averageMargin = validMargins.length
      ? validMargins.reduce((sum, product) => sum + product.marginPercent, 0) / validMargins.length
      : 0;

    let recommendation = "Lege zuerst ein Produkt an, dann kann die Soul sinnvoll coachen.";
    if (total > 0) {
      if (complianceRiskCount > 0) {
        recommendation = "Erst Compliance-Risiken pruefen, dann nur die sauberen Produkte weiterlisten.";
      } else if (missingMarginCount > 0) {
        recommendation = "Produkte ohne valide Marge zuerst nachpflegen oder pausieren.";
      } else if (missingDeliveryCount > 0) {
        recommendation = "Lieferzeiten ergaenzen, bevor du neue Produkte importierst oder bewertest.";
      } else if (weakMarginCount > 0) {
        recommendation = "Schwache Margen zuerst nachverhandeln oder streichen, damit der Cashflow stabil bleibt.";
      } else {
        recommendation = "Solide Basis. Jetzt die staerksten Produkte fokussieren und regelmaessig Backups ziehen.";
      }
    }

    return {
      total,
      missingMarginCount,
      missingDeliveryCount,
      complianceRiskCount,
      weakMarginCount,
      averageProfit,
      averageMargin,
      recommendation,
      products,
    };
  }

  function anonymizeProduct(product) {
    return {
      id: product.id,
      status: product.status,
      buy: product.buy,
      sell: product.sell,
      ship: product.ship,
      delivery: product.delivery,
      sales: product.sales,
      competition: product.competition,
      feePercent: product.feePercent,
      bufferPercent: product.bufferPercent,
      profit: product.profit,
      marginPercent: product.marginPercent,
      missingMargin: product.missingMargin,
      missingDelivery: product.missingDelivery,
      weakMargin: product.weakMargin,
      complianceRisk: product.complianceRisk,
      riskTag: product.riskTag,
      riskTags: product.riskTags,
    };
  }

  function stripSummary(summary) {
    return {
      total: summary.total,
      missingMarginCount: summary.missingMarginCount,
      missingDeliveryCount: summary.missingDeliveryCount,
      complianceRiskCount: summary.complianceRiskCount,
      weakMarginCount: summary.weakMarginCount,
      averageProfit: summary.averageProfit,
      averageMargin: summary.averageMargin,
      recommendation: summary.recommendation,
    };
  }

  function sanitizePrompt(prompt) {
    return text(prompt)
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]")
      .replace(/\+?\d[\d\s().\/-]{7,}\d/g, "[redacted]")
      .replace(/\b(?:[A-Z]{2,}-?\d{4,}|[0-9]{6,})\b/g, "[redacted]")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);
  }

  function getRuleBasedReply(input) {
    const query = text(input).toLowerCase();
    if (!query) {
      return "Beschreibe kurz dein Ziel, zum Beispiel Fokus, Risiko, Marge, Backup oder den naechsten Schritt.";
    }
    if (/(tagesfokus|fokus|heute|prior)/.test(query)) return QUICK_ACTIONS[0].reply;
    if (/(risiko|risk|gefaehr|gefahr|compliance)/.test(query)) return QUICK_ACTIONS[1].reply;
    if (/(marge|profit|gewinn|cashflow)/.test(query)) return QUICK_ACTIONS[2].reply;
    if (/(naechster schritt|naechste schritte|next step|weiter|soll ich|was jetzt)/.test(query)) return QUICK_ACTIONS[3].reply;
    if (/(backup|sicherung|export|speichern)/.test(query)) return QUICK_ACTIONS[4].reply;
    return "Ich halte es bewusst einfach: Nutze Fokus, Risiken, Margen, Backup oder den naechsten Schritt als schnelle Steuerung.";
  }

  function getStatusTone(summary) {
    if (state.loading) {
      return { label: "Analyse laeuft...", tone: "info", detail: "Anfrage wird gerade verarbeitet." };
    }

    if (!state.aiChecked) {
      return summary.total > 0
        ? { label: "KI wird geprueft...", tone: "info", detail: "DeepSeek-Status wird noch abgefragt." }
        : { label: "Warte auf Produktdaten", tone: "info", detail: "Lokaler Coach aktiv. Lege zuerst Produkte an." };
    }

    if (state.aiEnabled) {
      return { label: "DeepSeek aktiv", tone: "good", detail: "Die Antworten laufen ueber DeepSeek V4 Flash." };
    }

    return {
      label: summary.total > 0 ? "Regelmodus aktiv" : "Warte auf Produktdaten",
      tone: "warn",
      detail: "DeepSeek ist nicht aktiv. Pruefe den Production-Key in Vercel.",
    };
  }

  function setStatus(textValue, tone, detailValue) {
    if (!ui.status) return;
    ui.status.textContent = textValue;
    if (ui.statusMeta) {
      const fallback =
        /DeepSeek aktiv/i.test(textValue)
          ? "Die Antworten laufen ueber DeepSeek V4 Flash."
          : /Analyse laeuft/i.test(textValue)
            ? "Anfrage wird gerade verarbeitet."
            : /Warte auf Produktdaten/i.test(textValue)
              ? "Lokaler Coach aktiv. Lege zuerst Produkte an."
              : /Regelmodus aktiv/i.test(textValue)
                ? "DeepSeek ist nicht aktiv. Pruefe den Production-Key in Vercel."
                : /KI-Modus nicht aktiv/i.test(textValue)
                  ? "DeepSeek ist nicht aktiv. Pruefe den Production-Key in Vercel."
                  : "Status wird geprueft.";
      ui.statusMeta.textContent = detailValue || fallback;
    }
    const colors = {
      good: ["#86efac", "rgba(34, 197, 94, 0.16)", "rgba(34, 197, 94, 0.24)"],
      warn: ["#fde68a", "rgba(250, 204, 21, 0.14)", "rgba(250, 204, 21, 0.22)"],
      info: ["#bfdbfe", "rgba(59, 130, 246, 0.14)", "rgba(59, 130, 246, 0.22)"],
      bad: ["#fca5a5", "rgba(239, 68, 68, 0.14)", "rgba(239, 68, 68, 0.22)"],
    };
    const [fg, bg, border] = colors[tone] || colors.info;
    ui.status.style.color = fg;
    ui.status.style.background = bg;
    ui.status.style.borderColor = border;
  }

  function renderMetrics(summary) {
    if (!ui.metrics) return;
    ui.metrics.innerHTML = [
      ["Produkte gesamt", summary.total],
      ["Fehlende Marge", summary.missingMarginCount],
      ["Fehlende Lieferzeit", summary.missingDeliveryCount],
      ["Compliance-Risiko", summary.complianceRiskCount],
    ]
      .map(([label, value]) => `
        <div class="elyon-soul-metric">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `)
      .join("");
  }

  function renderHint(summary) {
    if (!ui.hint) return;
    const lines = [
      `Gespeicherte Produkte: ${summary.total}`,
      `Produkte mit fehlender Marge: ${summary.missingMarginCount}`,
      `Produkte mit fehlender Lieferzeit: ${summary.missingDeliveryCount}`,
      `Produkte mit Compliance-Risiko: ${summary.complianceRiskCount}`,
      `Produkte mit schwacher Marge: ${summary.weakMarginCount}`,
      `Konkrete Empfehlung: ${summary.recommendation}`,
    ];
    ui.hint.textContent = lines.join("\n");
  }

  function renderFeedback(title, body) {
    if (!ui.feedback) return;
    ui.feedback.innerHTML = `
      <div class="elyon-soul-feedback-card">
        <small>${escapeHtml(title)}</small>
        <p>${escapeHtml(body).replace(/\n/g, "<br>")}</p>
      </div>
    `;
  }

  function renderMessages() {
    if (!ui.feed) return;
    const visible = state.messages.slice(-MAX_MESSAGES);
    if (!visible.length) {
      ui.feed.innerHTML = `
        <div class="elyon-soul-compact-note">
          Stelle eine kurze Frage oder nutze einen Schnellbutton. Die Antwort erscheint hier und im Feld darunter.
        </div>
      `;
      return;
    }

    ui.feed.innerHTML = visible
      .map((message) => `
        <article class="elyon-soul-message ${message.role === "user" ? "is-user" : "is-assistant"}">
          <small>${escapeHtml(message.title)}</small>
          <p>${escapeHtml(message.body).replace(/\n/g, "<br>")}</p>
        </article>
      `)
      .join("");

    scrollToLatest();
  }

  function pushMessage(role, title, body) {
    state.messages.push({ role, title, body });
    if (state.messages.length > 30) {
      state.messages.splice(0, state.messages.length - 30);
    }
    renderMessages();
  }

  function scrollToLatest() {
    if (ui.scroll) {
      ui.scroll.scrollTop = ui.scroll.scrollHeight;
    }
    if (ui.panel) {
      ui.panel.scrollTop = ui.panel.scrollHeight;
    }
  }

  function setLoading(isLoading) {
    state.loading = isLoading;
    if (ui.input) ui.input.disabled = isLoading;
    if (ui.sendBtn) ui.sendBtn.disabled = isLoading;
    updateAiButton();
    const summary = state.summary || createEmptySummary();
    const tone = isLoading ? "info" : getStatusTone(summary).tone;
    const label = isLoading ? "Analyse laeuft..." : getStatusTone(summary).label;
    setStatus(label, tone);
  }

  function updateAiButton() {
    if (!ui.aiBtn) return;
    ui.aiBtn.disabled = state.loading || !state.aiEnabled;
    ui.aiBtn.textContent = state.aiEnabled ? "KI-Analyse starten" : "KI-Modus nicht aktiv";
  }

  function buildPayload(prompt, action) {
    const products = readProducts().map(normalizeProduct);
    const summary = summarizeProducts(products);
    const compactSummary = stripSummary(summary);

    return {
      action,
      prompt: sanitizePrompt(prompt),
      summary: compactSummary,
      products: summary.products.map(anonymizeProduct),
    };
  }

  async function requestDeepSeek(prompt, action) {
    const payload = buildPayload(prompt, action);
    let response;

    try {
      response = await fetch(CONFIG.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      const networkError = new Error("DeepSeek ist gerade nicht erreichbar.");
      networkError.kind = "network";
      networkError.cause = error;
      throw networkError;
    }

    const rawText = await response.text().catch(() => "");
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (error) {
      data = { raw: rawText };
    }

    if (!response.ok || data.ok === false) {
      const apiError = new Error(text(data.error || data.message || "Die KI-Analyse konnte nicht abgeschlossen werden."));
      apiError.kind = "api";
      apiError.status = response.status;
      apiError.code = data?.error?.code || data?.code || null;
      apiError.details = data?.details || data?.raw || null;
      throw apiError;
    }

    return data;
  }

  function formatDeepSeekError(error) {
    if (!error) return "DeepSeek ist gerade nicht verfuegbar. Regelbasierte Soul ist aktiv.";
    if (error.kind === "network") return "DeepSeek ist gerade nicht erreichbar. Regelbasierte Soul ist aktiv.";

    const parts = [];
    if (error.status) parts.push(`Status ${error.status}`);
    if (error.code) parts.push(String(error.code));
    if (error.message) parts.push(error.message);
    return parts.length ? `DeepSeek-Fehler: ${parts.join(" | ")}` : "DeepSeek ist gerade nicht verfuegbar. Regelbasierte Soul ist aktiv.";
  }

  function applySummaryToUi(summary) {
    state.summary = summary;
    renderMetrics(summary);
    renderHint(summary);
    const status = getStatusTone(summary);
    setStatus(status.label, status.tone);
    updateAiButton();
  }

  function refreshSummary() {
    const summary = summarizeProducts(readProducts());
    applySummaryToUi(summary);
    return summary;
  }

  function setPanelOpen(isOpen) {
    state.open = isOpen;
    localStorage.setItem(CONFIG.stateKey, isOpen ? "1" : "0");
    if (ui.panel) {
      ui.panel.classList.toggle("is-open", isOpen);
      ui.panel.setAttribute("aria-hidden", String(!isOpen));
    }
    if (ui.fab) {
      ui.fab.setAttribute("aria-expanded", String(isOpen));
    }
    if (isOpen) {
      refreshSummary();
      renderMessages();
      setTimeout(scrollToLatest, 50);
    }
  }

  function togglePanel() {
    setPanelOpen(!state.open);
  }

  function handlePanelWheel(event) {
    if (!state.open || !ui.scroll) return;
    if (event.ctrlKey) return;
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (!delta) return;
    event.preventDefault();
    const maxScroll = Math.max(0, ui.scroll.scrollHeight - ui.scroll.clientHeight);
    ui.scroll.scrollTop = clamp(ui.scroll.scrollTop + delta, 0, maxScroll);
  }

  function handleQuickAction(action) {
    const summary = refreshSummary();
    const answer = action.reply || summary.recommendation;
    pushMessage("user", "Schnellbutton", action.label);
    pushMessage("assistant", "ELYON SOUL", answer);
    renderFeedback(action.label, answer);
    setStatus(state.aiEnabled ? "DeepSeek aktiv" : summary.total > 0 ? "Regelmodus aktiv" : "Warte auf Produktdaten", state.aiEnabled ? "good" : "warn");
  }

  async function handleComposerSubmit(event) {
    event.preventDefault();
    const prompt = text(ui.input ? ui.input.value : "");
    if (!prompt || state.loading) return;

    if (ui.input) ui.input.value = "";
    const summary = refreshSummary();
    pushMessage("user", "Du", prompt);
    setFeedback("ELYON SOUL", "Antworte...");
    setLoading(true);

    const tryAi = state.aiEnabled || !state.aiChecked;

    try {
      if (tryAi) {
        const result = await requestDeepSeek(prompt, "chat");
        state.aiChecked = true;
        state.aiEnabled = result.aiEnabled !== false && result.mode === "deepseek";
        const answer = text(result.recommendation) || getRuleBasedReply(prompt, summary);
        pushMessage("assistant", result.mode === "deepseek" ? "DEEPSEEK" : "ELYON SOUL", answer);
        renderFeedback(result.mode === "deepseek" ? "DEEPSEEK" : "ELYON SOUL", answer);
        setStatus(result.mode === "deepseek" ? "DeepSeek aktiv" : "Regelmodus aktiv", result.mode === "deepseek" ? "good" : "warn");
      } else {
        const answer = getRuleBasedReply(prompt, summary);
        pushMessage("assistant", "ELYON SOUL", answer);
        renderFeedback("ELYON SOUL", answer);
        setStatus(summary.total > 0 ? "Regelmodus aktiv" : "Warte auf Produktdaten", "warn");
      }
    } catch (error) {
      state.aiChecked = true;
      state.aiEnabled = false;
      const answer = formatDeepSeekError(error);
      pushMessage("assistant", "ELYON SOUL", answer);
      renderFeedback("ELYON SOUL", answer);
      setStatus(summary.total > 0 ? "Regelmodus aktiv" : "Warte auf Produktdaten", "warn");
    } finally {
      setLoading(false);
      scrollToLatest();
    }
  }

  async function runAiAnalysis() {
    if (state.loading) return;
    if (!state.aiEnabled) {
      renderFeedback("ELYON SOUL", "KI-Modus ist noch nicht aktiviert. Regelbasierte Soul ist aktiv.");
      return;
    }

    const summary = refreshSummary();
    setLoading(true);
    setFeedback("KI-Analyse", "DeepSeek analysiert die anonymisierten Produktdaten...");

    try {
      const result = await requestDeepSeek("Bitte erstelle eine kurze, klare Business-Empfehlung auf Basis der Produktdaten.", "analyze");
      state.aiChecked = true;
      state.aiEnabled = result.aiEnabled !== false && result.mode === "deepseek";
      const answer = text(result.recommendation) || summary.recommendation;
      pushMessage("assistant", result.mode === "deepseek" ? "DEEPSEEK" : "ELYON SOUL", answer);
      renderFeedback("KI-Analyse", answer);
      setStatus(result.mode === "deepseek" ? "DeepSeek aktiv" : "Regelmodus aktiv", result.mode === "deepseek" ? "good" : "warn");
    } catch (error) {
      state.aiChecked = true;
      state.aiEnabled = false;
      const answer = formatDeepSeekError(error);
      pushMessage("assistant", "ELYON SOUL", answer);
      renderFeedback("KI-Analyse", answer);
      setStatus(summary.total > 0 ? "Regelmodus aktiv" : "Warte auf Produktdaten", "warn");
    } finally {
      setLoading(false);
      scrollToLatest();
    }
  }

  async function probeCapabilities() {
    const summary = refreshSummary();
    try {
      const response = await fetch(CONFIG.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          probe: true,
          summary: stripSummary(summary),
          products: [],
        }),
      });

      const data = await response.json().catch(() => ({}));
      state.aiChecked = true;
      state.aiEnabled = Boolean(data && data.aiEnabled && data.mode === "deepseek");
      updateAiButton();
      const status = state.aiEnabled
        ? { label: "DeepSeek aktiv", tone: "good", detail: "Die Antworten laufen ueber DeepSeek V4 Flash." }
        : String(data?.message || "").toLowerCase().includes("nicht aktiviert")
          ? { label: "Production-Key fehlt", tone: "warn", detail: "Setze DEEPSEEK_API_KEY in Vercel, dann kann die KI antworten." }
          : { label: summary.total > 0 ? "Regelmodus aktiv" : "Warte auf Produktdaten", tone: "warn", detail: "DeepSeek ist nicht aktiv oder gerade nicht erreichbar." };
      setStatus(status.label, status.tone, status.detail);
    } catch (error) {
      state.aiChecked = true;
      state.aiEnabled = false;
      updateAiButton();
      const status = summary.total > 0
        ? { label: "API nicht erreichbar", tone: "bad", detail: "Die Backend-Route antwortet gerade nicht." }
        : { label: "Warte auf Produktdaten", tone: "warn", detail: "Lokaler Coach aktiv. Lege zuerst Produkte an." };
      setStatus(status.label, status.tone, status.detail);
    }
  }

  function buildShell() {
    if (document.querySelector(".elyon-soul-shell")) {
      return;
    }

    const shell = document.createElement("div");
    shell.className = "elyon-soul-shell";
    shell.innerHTML = `
      <button class="elyon-soul-fab" type="button" aria-expanded="false" aria-controls="elyon-soul-panel">
        <span>✦</span>
        <strong>Elyon Soul</strong>
      </button>
      <section class="elyon-soul-panel" id="elyon-soul-panel" aria-hidden="true">
        <div class="elyon-soul-header">
          <div>
            <div class="elyon-soul-eyebrow">ELYON SOUL</div>
            <h2>Business Coach</h2>
            <p>Willkommen zurueck, Raoul. Heute zaehlt Klarheit vor Masse.</p>
          </div>
          <div class="elyon-soul-status-wrap">
            <div class="elyon-soul-status">Warte auf Produktdaten</div>
            <div class="elyon-soul-status-meta">Lokaler Coach aktiv. Lege zuerst Produkte an.</div>
            <button class="elyon-soul-close" type="button" aria-label="Schliessen">×</button>
          </div>
        </div>

        <div class="elyon-soul-body">
          <div class="elyon-soul-scroll">
            <div class="elyon-soul-metrics"></div>

            <div class="elyon-soul-hints">
              <div class="elyon-soul-section-title">Coach-Hinweise</div>
              <div class="elyon-soul-hint-box"></div>
            </div>

            <div class="elyon-soul-chat">
              <div class="elyon-soul-section-title">Antworten</div>
              <div class="elyon-soul-feed"></div>
            </div>
          </div>

          <div class="elyon-soul-footer">
            <div class="elyon-soul-feedback"></div>
            <form class="elyon-soul-composer">
              <input type="text" placeholder="Frag die Soul nach Fokus, Risiko oder dem naechsten Schritt..." autocomplete="off" />
              <button type="submit">Senden</button>
            </form>
            <div class="elyon-soul-quick"></div>
            <button class="elyon-soul-ai" type="button">KI-Analyse starten</button>
            <p class="elyon-soul-footnote">Vor dem KI-Modus werden nur anonymisierte Produktdaten gesendet. Keine Namen, Adressen, Telefonnummern, E-Mails oder Bestellnummern.</p>
          </div>
        </div>
      </section>
    `;

    document.body.appendChild(shell);

    ui.shell = shell;
    ui.fab = shell.querySelector(".elyon-soul-fab");
    ui.panel = shell.querySelector(".elyon-soul-panel");
    ui.status = shell.querySelector(".elyon-soul-status");
    ui.metrics = shell.querySelector(".elyon-soul-metrics");
    ui.hint = shell.querySelector(".elyon-soul-hint-box");
    ui.feed = shell.querySelector(".elyon-soul-feed");
    ui.feedback = shell.querySelector(".elyon-soul-feedback");
    ui.input = shell.querySelector(".elyon-soul-composer input");
    ui.sendBtn = shell.querySelector(".elyon-soul-composer button");
    ui.aiBtn = shell.querySelector(".elyon-soul-ai");
    ui.scroll = shell.querySelector(".elyon-soul-scroll");
    ui.closeBtn = shell.querySelector(".elyon-soul-close");

    const quick = shell.querySelector(".elyon-soul-quick");
    quick.innerHTML = QUICK_ACTIONS.map((action) => `<button type="button" data-action="${escapeHtml(action.label)}">${escapeHtml(action.label)}</button>`).join("");
  }

  function bindEvents() {
    ui.fab.addEventListener("click", togglePanel);
    ui.closeBtn.addEventListener("click", () => setPanelOpen(false));
    ui.panel.addEventListener("wheel", handlePanelWheel, { passive: false });
    ui.panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setPanelOpen(false);
    });
    ui.panel.querySelector(".elyon-soul-composer").addEventListener("submit", handleComposerSubmit);
    ui.aiBtn.addEventListener("click", runAiAnalysis);
    ui.panel.querySelectorAll(".elyon-soul-quick button").forEach((button) => {
      button.addEventListener("click", () => {
        const action = QUICK_ACTIONS.find((item) => item.label === button.dataset.action) || QUICK_ACTIONS[0];
        handleQuickAction(action);
      });
    });

    ui.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        ui.panel.querySelector(".elyon-soul-composer").requestSubmit();
      }
    });

    window.addEventListener("storage", (event) => {
      if (event.key === CONFIG.storageKey) {
        refreshSummary();
      }
    });
  }

  function seedConversation() {
    const greeting = "Willkommen. Ich halte den Fokus klein, klar und umsetzbar.";
    state.messages = [{ role: "assistant", title: "ELYON SOUL", body: greeting }];
    renderMessages();
    renderFeedback("ELYON SOUL", greeting);
  }

  function init() {
    buildShell();
    bindEvents();
    refreshSummary();
    seedConversation();
    updateAiButton();
    setPanelOpen(state.open);
    probeCapabilities();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
