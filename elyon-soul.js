(function () {
  "use strict";

  const CONFIG = {
    storageKey: "elyonProducts",
    endpoint: "/api/elyon-soul",
    stateKey: "elyonSoulOpen",
    refreshMs: 12000,
  };

  const RULE_RESPONSES = {
    "Tagesfokus": "PrÃ¼fe heute zuerst offene Produkte mit fehlender Marge oder Lieferzeit.",
    "Risiken prÃ¼fen": "Achte besonders auf Produkte mit Batterie, Elektronik, Markenbezug oder unklarer Lieferzeit.",
    "Schwache Margen": "Produkte mit niedriger Marge gefÃ¤hrden deinen Cashflow. PrÃ¼fe Einkaufspreis, Versandkosten und eBay-GebÃ¼hren.",
    "NÃ¤chster Schritt": "SchlieÃŸe zuerst unvollstÃ¤ndige Produktanalysen ab, bevor du neue Produkte importierst.",
    "Backup-Hinweis": "Exportiere regelmÃ¤ÃŸig ein Backup, solange noch keine echte Cloud-Datenbank angebunden ist.",
  };

  const state = {
    open: localStorage.getItem(CONFIG.stateKey) === "1",
    aiEnabled: false,
    aiChecked: false,
    loading: false,
    summary: null,
    messages: [],
  };

  const MAX_VISIBLE_MESSAGES = 3;

  let root;
  let panel;
  let feed;
  let scrollArea;
  let hintBox;
  let metricsBox;
  let statusPill;
  let fab;
  let composerInput;
  let feedbackBox;
  let aiButton;

  function num(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean)));

  function scrollToLatest() {
    if (scrollArea) {
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }

    if (feed) {
      feed.scrollTop = feed.scrollHeight;
    }

  function setFeedback(title, body) {
    if (!feedbackBox) return;

    feedbackBox.innerHTML = `
      <div class="elyon-soul-feedback-card">
        <small>${escapeHtml(title)}</small>
        <p>${escapeHtml(body).replaceAll("\n", "<br>")}</p>
      </div>
    `;

  function getRuleBasedReply(input) {
    const query = text(input).toLowerCase();

    if (!query) return "Beschreibe kurz dein Ziel, zum Beispiel Fokus, Risiko, Marge, Backup oder den nÃ¤chsten Schritt.";
    if (/(tagesfokus|fokus|heute|prior)/.test(query)) return RULE_RESPONSES["Tagesfokus"];
    if (/(risiko|risk|gefÃ¤hr|gefahr|compliance)/.test(query)) return RULE_RESPONSES["Risiken prÃ¼fen"];
    if (/(marge|profit|gewinn|cashflow)/.test(query)) return RULE_RESPONSES["Schwache Margen"];
    if (/(nÃ¤chster schritt|nÃ¤chste schritte|next step|weiter|soll ich|was jetzt)/.test(query)) return RULE_RESPONSES["NÃ¤chster Schritt"];
    if (/(backup|sicherung|export|speichern)/.test(query)) return RULE_RESPONSES["Backup-Hinweis"];

    return "Ich halte es bewusst einfach: Nutze Fokus, Risiken, Margen, Backup oder den nÃ¤chsten Schritt als schnelle Steuerung.";

  function sanitizePrompt(input) {
    return text(input)
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]")
      .replace(/\+?\d[\d\s()./-]{7,}\d/g, "[redacted]")
      .replace(/\b(?:[A-Z]{2,}-?\d{4,}|[0-9]{6,})\b/g, "[redacted]")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);

  function buildAiPayload(prompt, action) {
    const products = parseProducts();
    const summary = summarizeProducts(products);
    return {
      action,
      prompt: sanitizePrompt(prompt),
      summary: {
        total: summary.total,
        missingMarginCount: summary.missingMarginCount,
        missingDeliveryCount: summary.missingDeliveryCount,
        complianceRiskCount: summary.complianceRiskCount,
        weakMarginCount: summary.weakMarginCount,
        averageProfit: summary.averageProfit,
        averageMargin: summary.averageMargin,
      },
      products: anonymizeProducts(summary.products),
    };

  async function requestDeepSeek(prompt, action) {
    let response;
    try {
      response = await fetch(CONFIG.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildAiPayload(prompt, action)),
      });
    } catch (error) {
      const networkError = new Error("Netzwerkfehler: API-Route nicht erreichbar.");
      networkError.cause = error;
      networkError.kind = "network";
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
      const apiError = new Error(data.message || data.error || "Die KI-Analyse konnte nicht abgeschlossen werden.");
      apiError.kind = "api";
      apiError.status = response.status;
      apiError.code = data.error?.code || data.code || null;
      apiError.details = data.details || data.raw || null;
      throw apiError;
    }

    return data;

  function formatDeepSeekError(error) {
    if (!error) return "DeepSeek ist gerade nicht verfÃ¼gbar. Regelbasierte Soul ist aktiv.";

    if (error.kind === "network") {
      return "DeepSeek ist gerade nicht erreichbar. Regelbasierte Soul ist aktiv.";
    }

    const parts = [];
    if (error.status) parts.push(`Status ${error.status}`);
    if (error.code) parts.push(String(error.code));
    if (error.message) parts.push(error.message);

    return parts.length
      ? `DeepSeek-Fehler: ${parts.join(" | ")}`
      : "DeepSeek ist gerade nicht verfÃ¼gbar. Regelbasierte Soul ist aktiv.";

  function handlePanelWheel(event) {
    if (!state.open || !scrollArea) return;
    if (event.ctrlKey) return;

    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (!delta) return;

    event.preventDefault();
    scrollArea.scrollTop = Math.max(0, Math.min(scrollArea.scrollHeight, scrollArea.scrollTop + delta));

  function parseProducts() {
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch (error) {
      return [];
    }

  function buildRiskTags(product) {
    const bag = text([product.name, product.notes, product.status, product.risk].join(" ")).toLowerCase();
    const tags = [];

    if (/batter|akku|battery/.test(bag)) tags.push("battery");
    if (/elektro|electro|electronics|usb|lade/.test(bag)) tags.push("electronics");
    if (/marke|brand|logo/.test(bag)) tags.push("brand");
    if (/weee|lucid|epr|verpack/.test(bag)) tags.push("compliance");
    if (/kosmetik|medizin|spielzeug|kind/.test(bag)) tags.push("regulated");

    return unique(tags);

  function scoreProduct(product, index) {
    const buy = num(product.buy);
    const sell = num(product.sell);
    const ship = num(product.ship);
    const feePercent = num(product.fee) || 15;
    const bufferPercent = num(product.riskBuffer) || 5;
    const delivery = num(product.delivery);
    const sales = num(product.sales);
    const competition = num(product.competition);
    const fee = sell > 0 ? sell * (feePercent / 100) : 0;
    const buffer = sell > 0 ? sell * (bufferPercent / 100) : 0;
    const profit = sell - buy - ship - fee - buffer;
    const marginPercent = sell > 0 ? (profit / sell) * 100 : null;
    const missingMargin = buy <= 0 || sell <= 0 || !Number.isFinite(profit);
    const missingDelivery = delivery <= 0;
    const weakMargin = !missingMargin && profit < 5;
    const riskTag = text(product.risk).toLowerCase() || "low";
    const riskTags = buildRiskTags(product);
    const complianceRisk = riskTag === "high" || riskTags.length > 0;
    const status = text(product.status) || "Idee";

    return {
      id: String(product.id ?? index + 1),
      status,
      riskTag,
      riskTags,
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
      shopifyCandidate: Boolean(product.shopifyCandidate),
    };

  function summarizeProducts(products) {
    const scored = products.map(scoreProduct);
    const total = scored.length;
    const missingMarginCount = scored.filter((item) => item.missingMargin).length;
    const missingDeliveryCount = scored.filter((item) => item.missingDelivery).length;
    const complianceRiskCount = scored.filter((item) => item.complianceRisk).length;
    const weakMarginCount = scored.filter((item) => item.weakMargin).length;
    const averageProfit = total ? scored.reduce((sum, item) => sum + item.profit, 0) / total : 0;
    const validMargins = scored.filter((item) => Number.isFinite(item.marginPercent));
    const averageMargin = validMargins.length
      ? validMargins.reduce((sum, item) => sum + item.marginPercent, 0) / validMargins.length
      : 0;

    let recommendation = "Starte mit den unvollstÃ¤ndigen Produkten und sichere zuerst die Grunddaten ab.";
    if (total === 0) {
      recommendation = "Noch keine Produkte gespeichert. Lege erst ein Produkt an, dann kann die Soul sinnvoll coachen.";
    } else if (complianceRiskCount > 0) {
      recommendation = "Erst Compliance-Risiken prÃ¼fen, dann nur die sauberen Produkte weiterlisten.";
    } else if (missingMarginCount > 0) {
      recommendation = "Produkte ohne valide Marge zuerst nachpflegen oder pausieren, damit kein Blindflug entsteht.";
    } else if (missingDeliveryCount > 0) {
      recommendation = "Lieferzeiten ergÃ¤nzen, bevor du neue Produkte importierst oder bewertest.";
    } else if (weakMarginCount > 0) {
      recommendation = "Schwache Margen zuerst nachverhandeln oder streichen, damit der Cashflow stabil bleibt.";
    } else {
      recommendation = "Solide Basis. Jetzt die stÃ¤rksten Produkte fokussieren und regelmÃ¤ÃŸig Backups ziehen.";
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
      products: scored,
    };

  function anonymizeProducts(scoredProducts) {
    return scoredProducts.map((item, index) => ({
      id: `P${index + 1}`,
      status: item.status,
      riskTag: item.riskTag,
      riskTags: item.riskTags,
      buy: item.buy,
      sell: item.sell,
      ship: item.ship,
      delivery: item.delivery,
      sales: item.sales,
      competition: item.competition,
      feePercent: item.feePercent,
      bufferPercent: item.bufferPercent,
      profit: item.profit,
      marginPercent: item.marginPercent,
      missingMargin: item.missingMargin,
      missingDelivery: item.missingDelivery,
      weakMargin: item.weakMargin,
      complianceRisk: item.complianceRisk,
      shopifyCandidate: item.shopifyCandidate,
    }));

  function buildCoachHint(summary) {
    if (!summary) return "Lade Produktdaten...";

    return [
      `Gespeicherte Produkte: ${summary.total}`,
      `Produkte mit fehlender Marge: ${summary.missingMarginCount}`,
      `Produkte mit fehlender Lieferzeit: ${summary.missingDeliveryCount}`,
      `Produkte mit Compliance-Risiko: ${summary.complianceRiskCount}`,
      `Produkte mit schwacher Marge: ${summary.weakMarginCount}`,
      `Konkrete Empfehlung: ${summary.recommendation}`,
    ].join("\n");

  function ensureShell() {
    if (root) return;

    root = document.createElement("div");
    root.className = "elyon-soul-shell";
    root.innerHTML = `
      <button id="elyonSoulFab" class="elyon-soul-fab" type="button" aria-expanded="false" aria-controls="elyonSoulPanel">
        <span aria-hidden="true">âœ¦</span>
        <strong>Elyon Soul</strong>
      </button>
      <section id="elyonSoulPanel" class="elyon-soul-panel" role="dialog" aria-modal="false" aria-label="Elyon Soul" hidden>
        <header class="elyon-soul-header">
          <div>
            <div class="elyon-soul-eyebrow">Elyon Soul</div>
            <h2>Business Coach</h2>
            <p>Willkommen zurÃ¼ck, Raoul. Heute zÃ¤hlt Klarheit vor Masse.</p>
          </div>
          <button class="elyon-soul-close" type="button" aria-label="Schliessen">âœ•</button>
        </header>
        <div class="elyon-soul-body">
          <div class="elyon-soul-status" id="elyonSoulStatus">Regelbasiert aktiv</div>
          <div class="elyon-soul-metrics" id="elyonSoulMetrics"></div>
          <div class="elyon-soul-scroll">
            <div class="elyon-soul-hints">
              <div class="elyon-soul-section-title">Coach-Hinweise</div>
              <div id="elyonSoulHint" class="elyon-soul-hint-box"></div>
            </div>
            <div class="elyon-soul-chat">
              <div class="elyon-soul-section-title">Antworten</div>
              <div id="elyonSoulFeed" class="elyon-soul-feed" aria-live="polite"></div>
            </div>
          </div>
        </div>
        <div class="elyon-soul-footer">
          <div id="elyonSoulFeedback" class="elyon-soul-feedback" aria-live="polite"></div>
          <form id="elyonSoulComposer" class="elyon-soul-composer">
            <input id="elyonSoulInput" type="text" placeholder="Frag die Soul nach Fokus, Risiko oder dem nÃ¤chsten Schritt..." autocomplete="off" />
            <button type="submit">Senden</button>
          </form>
          <div class="elyon-soul-quick" id="elyonSoulQuick"></div>
          <button id="elyonSoulAiButton" class="elyon-soul-ai" type="button">KI-Analyse starten</button>
          <p class="elyon-soul-footnote">Vor dem KI-Modus werden nur anonymisierte Produktdaten gesendet. Keine Namen, Adressen, Telefonnummern, E-Mails oder Bestellnummern.</p>
        </div>
      </section>
    `;

    document.body.appendChild(root);

    fab = root.querySelector("#elyonSoulFab");
    panel = root.querySelector("#elyonSoulPanel");
    feed = root.querySelector("#elyonSoulFeed");
    scrollArea = root.querySelector(".elyon-soul-scroll");
    hintBox = root.querySelector("#elyonSoulHint");
    metricsBox = root.querySelector("#elyonSoulMetrics");
    statusPill = root.querySelector("#elyonSoulStatus");
    composerInput = root.querySelector("#elyonSoulInput");
    feedbackBox = root.querySelector("#elyonSoulFeedback");
    aiButton = root.querySelector("#elyonSoulAiButton");

    const closeButton = root.querySelector(".elyon-soul-close");
    fab.addEventListener("click", togglePanel);
    closeButton.addEventListener("click", closePanel);
    aiButton.addEventListener("click", runAiAnalysis);
    panel.addEventListener("wheel", handlePanelWheel, { passive: false });

    const composer = root.querySelector("#elyonSoulComposer");
    composer.addEventListener("submit", handleComposerSubmit);

    const quickHost = root.querySelector("#elyonSoulQuick");
    Object.keys(RULE_RESPONSES).forEach((label) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", () => handleRuleAction(label));
      quickHost.appendChild(button);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePanel();
    });

  function setOpen(nextOpen) {
    state.open = Boolean(nextOpen);
    localStorage.setItem(CONFIG.stateKey, state.open ? "1" : "0");
    fab.setAttribute("aria-expanded", String(state.open));
    panel.hidden = !state.open;
    panel.classList.toggle("is-open", state.open);
    if (state.open) {
      refreshSummary();
      renderMessages();
      requestAnimationFrame(() => {
        scrollToLatest();
      });
    }

  function togglePanel() {
    setOpen(!state.open);

  function closePanel() {
    setOpen(false);

  function updateMetrics(summary) {
    if (!metricsBox) return;

    const items = [
      ["Produkte gesamt", summary.total],
      ["Fehlende Marge", summary.missingMarginCount],
      ["Fehlende Lieferzeit", summary.missingDeliveryCount],
      ["Compliance-Risiko", summary.complianceRiskCount],
    ];

    metricsBox.innerHTML = items
      .map(([label, value]) => `
        <div class="elyon-soul-metric">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `)
      .join("");

  function updateHint(summary) {
    if (!hintBox || !statusPill) return;

    hintBox.textContent = buildCoachHint(summary);
    const statusText = summary.total === 0
      ? "Warte auf Produktdaten"
      : state.aiEnabled
        ? "KI verfÃ¼gbar"
        : "Regelbasiert aktiv";
    statusPill.textContent = statusText;

  function addMessage(role, title, body) {
    state.messages.push({ role, title, body });
    if (state.messages.length > 8) {
      state.messages = state.messages.slice(-8);
    }
    renderMessages();

  function renderMessages() {
    if (!feed) return;

    if (!state.messages.length) {
      feed.innerHTML = `
        <div class="elyon-soul-message is-assistant">
          <small>Elyon Soul</small>
          <p>WÃ¤hle einen Schnellbutton oder starte die KI-Analyse, sobald sie verfÃ¼gbar ist.</p>
        </div>
      `;
      return;
    }

    const visibleMessages = state.messages.slice(-MAX_VISIBLE_MESSAGES);
    const hiddenCount = Math.max(0, state.messages.length - visibleMessages.length);

    feed.innerHTML = [
      hiddenCount
        ? `
          <div class="elyon-soul-compact-note">
            Verlauf komprimiert: ${hiddenCount} Ã¤ltere Antwort${hiddenCount === 1 ? "" : "en"} ausgeblendet.
          </div>
        `
        : "",
      ...visibleMessages
        .map((message) => `
        <div class="elyon-soul-message ${message.role === "user" ? "is-user" : "is-assistant"}">
          <small>${escapeHtml(message.title)}</small>
          <p>${escapeHtml(message.body).replaceAll("\n", "<br>")}</p>
        </div>
      `)
    ].join("");

    scrollToLatest();

  function refreshSummary() {
    const products = parseProducts();
    state.summary = summarizeProducts(products);
    updateMetrics(state.summary);
    updateHint(state.summary);
    updateAiButton();

  function updateAiButton() {
    if (!aiButton) return;

    if (!state.aiChecked) {
      aiButton.disabled = true;
      aiButton.classList.add("is-disabled");
      aiButton.textContent = "KI-Modus prÃ¼ft...";
      return;
    }

    if (state.aiEnabled) {
      aiButton.disabled = false;
      aiButton.classList.remove("is-disabled");
      aiButton.textContent = "KI-Analyse starten";
      return;
    }

    aiButton.disabled = true;
    aiButton.classList.add("is-disabled");
    aiButton.textContent = "KI-Modus nicht aktiviert";
  }

  function handleRuleAction(label) {
    const response = RULE_RESPONSES[label] || "Regelbasiert bleibt die Soul ruhig, klar und fokussiert.";
    addMessage("user", label, label);
    addMessage("assistant", "Elyon Soul", response);
    setFeedback(label, response);
  }

  async function handleComposerSubmit(event) {
    event.preventDefault();
    if (!composerInput) return;

    const message = text(composerInput.value);
    if (!message) return;

    addMessage("user", "Du", message);
    composerInput.value = "";
    composerInput.focus();

    if (!state.aiChecked) {
      await probeCapabilities();
    }

    if (!state.aiEnabled) {
      const reply = getRuleBasedReply(message);
      addMessage("assistant", "Elyon Soul", reply);
      setFeedback("Elyon Soul", reply);
      return;
    }

    state.loading = true;
    updateAiButton();
    setFeedback("Elyon Soul", "DeepSeek analysiert deine Eingabe...");

    try {
      const data = await requestDeepSeek(message, "chat");
      const reply = text(data.recommendation || data.message || "Die KI hat keine klare Empfehlung geliefert.");
      addMessage("assistant", "DeepSeek", reply);
      setFeedback("DeepSeek", reply);
    } catch (error) {
      const fallback = getRuleBasedReply(message);
      addMessage("assistant", "Elyon Soul", fallback);
      setFeedback("Elyon Soul", formatDeepSeekError(error));
    } finally {
      state.loading = false;
      updateAiButton();
    }
  }

  async function probeCapabilities() {
    try {
      const response = await fetch(CONFIG.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ probe: true, products: [] }),
      });

      const data = await response.json().catch(() => ({}));
      state.aiEnabled = Boolean(data.aiEnabled);
      state.aiChecked = true;

      if (!state.aiEnabled) {
        addMessage("assistant", "Elyon Soul", data.message || "KI-Modus ist noch nicht aktiviert. Regelbasierte Soul ist aktiv.");
      } else {
        addMessage("assistant", "Elyon Soul", "KI-Modus ist bereit. Ich analysiere nur anonymisierte Produktdaten.");
      }
    } catch (error) {
      state.aiEnabled = false;
      state.aiChecked = true;
      addMessage("assistant", "Elyon Soul", "KI-Modus konnte gerade nicht geprÃ¼ft werden. Regelbasierte Soul bleibt aktiv.");
    } finally {
      updateAiButton();
      updateHint(state.summary || summarizeProducts(parseProducts()));
    }
  }

  async function runAiAnalysis() {
    if (state.loading || !state.aiEnabled) return;

    state.loading = true;
    aiButton.disabled = true;
    aiButton.classList.add("is-disabled");
    aiButton.innerHTML = '<span class="elyon-soul-loading"><span class="elyon-soul-spinner" aria-hidden="true"></span>Analysiere anonymisierte Daten...</span>';

    addMessage("user", "KI-Analyse", "Bitte analysiere die anonymisierten Produktdaten.");
    addMessage("assistant", "Elyon Soul", "DeepSeek analysiert jetzt nur Produktzahlen, Margen, Lieferzeiten und Risiko-Tags.");
    setFeedback("Elyon Soul", "DeepSeek analysiert deine Produktdaten...");

    try {
      const data = await requestDeepSeek("Bitte analysiere die anonymisierten Produktdaten.", "analyze");
      const recommendation = text(data.recommendation || data.message || "Die KI hat keine klare Empfehlung geliefert.");
      addMessage("assistant", "DeepSeek", recommendation);
      setFeedback("DeepSeek", recommendation);
    } catch (error) {
      addMessage("assistant", "Elyon Soul", "KI-Analyse ist gerade nicht verfügbar. Die regelbasierte Soul bleibt aktiv.");
      setFeedback("Elyon Soul", formatDeepSeekError(error));
    } finally {
      state.loading = false;
      aiButton.innerHTML = "KI-Analyse starten";
      updateAiButton();
    }
  }

  function syncFromStorage() {
    refreshSummary();
    if (state.open) {
      renderMessages();
    }
  }

  function initMessages() {
    state.messages = [
      {
        role: "assistant",
        title: "Elyon Soul",
        body: "Willkommen. Ich halte den Fokus klein, klar und umsetzbar.",
      },
    ];
    renderMessages();
  }

  function init() {
    ensureShell();
    refreshSummary();
    initMessages();
    updateAiButton();
    setOpen(state.open);
    probeCapabilities();

    window.addEventListener("storage", (event) => {
      if (event.key === CONFIG.storageKey) {
        syncFromStorage();
      }
    });

    window.setInterval(syncFromStorage, CONFIG.refreshMs);

    if (!state.open) {
      panel.hidden = true;
      panel.classList.remove("is-open");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

