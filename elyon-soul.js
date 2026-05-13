(function () {
  "use strict";

  const CONFIG = {
    storageKey: "elyonProducts",
    endpoint: "/api/elyon-soul",
    stateKey: "elyonSoulOpen",
    refreshMs: 12000,
  };

  const RULE_RESPONSES = {
    "Tagesfokus": "Prüfe heute zuerst offene Produkte mit fehlender Marge oder Lieferzeit.",
    "Risiken prüfen": "Achte besonders auf Produkte mit Batterie, Elektronik, Markenbezug oder unklarer Lieferzeit.",
    "Schwache Margen": "Produkte mit niedriger Marge gefährden deinen Cashflow. Prüfe Einkaufspreis, Versandkosten und eBay-Gebühren.",
    "Nächster Schritt": "Schließe zuerst unvollständige Produktanalysen ab, bevor du neue Produkte importierst.",
    "Backup-Hinweis": "Exportiere regelmäßig ein Backup, solange noch keine echte Cloud-Datenbank angebunden ist.",
  };

  const state = {
    open: localStorage.getItem(CONFIG.stateKey) === "1",
    aiEnabled: false,
    aiChecked: false,
    loading: false,
    summary: null,
    messages: [],
  };

  let root;
  let panel;
  let feed;
  let hintBox;
  let metricsBox;
  let statusPill;
  let fab;
  let aiButton;

  function num(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function unique(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function parseProducts() {
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch (error) {
      return [];
    }
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
  }

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
  }

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

    let recommendation = "Starte mit den unvollständigen Produkten und sichere zuerst die Grunddaten ab.";
    if (total === 0) {
      recommendation = "Noch keine Produkte gespeichert. Lege erst ein Produkt an, dann kann die Soul sinnvoll coachen.";
    } else if (complianceRiskCount > 0) {
      recommendation = "Erst Compliance-Risiken prüfen, dann nur die sauberen Produkte weiterlisten.";
    } else if (missingMarginCount > 0) {
      recommendation = "Produkte ohne valide Marge zuerst nachpflegen oder pausieren, damit kein Blindflug entsteht.";
    } else if (missingDeliveryCount > 0) {
      recommendation = "Lieferzeiten ergänzen, bevor du neue Produkte importierst oder bewertest.";
    } else if (weakMarginCount > 0) {
      recommendation = "Schwache Margen zuerst nachverhandeln oder streichen, damit der Cashflow stabil bleibt.";
    } else {
      recommendation = "Solide Basis. Jetzt die stärksten Produkte fokussieren und regelmäßig Backups ziehen.";
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
  }

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
  }

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
  }

  function ensureShell() {
    if (root) return;

    root = document.createElement("div");
    root.className = "elyon-soul-shell";
    root.innerHTML = `
      <button id="elyonSoulFab" class="elyon-soul-fab" type="button" aria-expanded="false" aria-controls="elyonSoulPanel">
        <span aria-hidden="true">✦</span>
        <strong>Elyon Soul</strong>
      </button>
      <section id="elyonSoulPanel" class="elyon-soul-panel" role="dialog" aria-modal="false" aria-label="Elyon Soul" hidden>
        <header class="elyon-soul-header">
          <div>
            <div class="elyon-soul-eyebrow">Elyon Soul</div>
            <h2>Business Coach</h2>
            <p>Willkommen zurück, Raoul. Heute zählt Klarheit vor Masse.</p>
          </div>
          <button class="elyon-soul-close" type="button" aria-label="Schliessen">✕</button>
        </header>
        <div class="elyon-soul-status" id="elyonSoulStatus">Regelbasiert aktiv</div>
        <div class="elyon-soul-metrics" id="elyonSoulMetrics"></div>
        <div class="elyon-soul-hints">
          <div class="elyon-soul-section-title">Coach-Hinweise</div>
          <div id="elyonSoulHint" class="elyon-soul-hint-box"></div>
        </div>
        <div class="elyon-soul-chat">
          <div class="elyon-soul-section-title">Antworten</div>
          <div id="elyonSoulFeed" class="elyon-soul-feed" aria-live="polite"></div>
        </div>
        <div class="elyon-soul-quick" id="elyonSoulQuick"></div>
        <button id="elyonSoulAiButton" class="elyon-soul-ai" type="button">KI-Analyse starten</button>
        <p class="elyon-soul-footnote">Vor dem KI-Modus werden nur anonymisierte Produktdaten gesendet. Keine Namen, Adressen, Telefonnummern, E-Mails oder Bestellnummern.</p>
      </section>
    `;

    document.body.appendChild(root);

    fab = root.querySelector("#elyonSoulFab");
    panel = root.querySelector("#elyonSoulPanel");
    feed = root.querySelector("#elyonSoulFeed");
    hintBox = root.querySelector("#elyonSoulHint");
    metricsBox = root.querySelector("#elyonSoulMetrics");
    statusPill = root.querySelector("#elyonSoulStatus");
    aiButton = root.querySelector("#elyonSoulAiButton");

    const closeButton = root.querySelector(".elyon-soul-close");
    fab.addEventListener("click", togglePanel);
    closeButton.addEventListener("click", closePanel);
    aiButton.addEventListener("click", runAiAnalysis);

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
  }

  function setOpen(nextOpen) {
    state.open = Boolean(nextOpen);
    localStorage.setItem(CONFIG.stateKey, state.open ? "1" : "0");
    fab.setAttribute("aria-expanded", String(state.open));
    panel.hidden = !state.open;
    panel.classList.toggle("is-open", state.open);
    if (state.open) {
      refreshSummary();
      renderMessages();
    }
  }

  function togglePanel() {
    setOpen(!state.open);
  }

  function closePanel() {
    setOpen(false);
  }

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
  }

  function updateHint(summary) {
    if (!hintBox || !statusPill) return;

    hintBox.textContent = buildCoachHint(summary);
    const statusText = summary.total === 0
      ? "Warte auf Produktdaten"
      : state.aiEnabled
        ? "KI verfügbar"
        : "Regelbasiert aktiv";
    statusPill.textContent = statusText;
  }

  function addMessage(role, title, body) {
    state.messages.push({ role, title, body });
    if (state.messages.length > 8) {
      state.messages = state.messages.slice(-8);
    }
    renderMessages();
  }

  function renderMessages() {
    if (!feed) return;

    if (!state.messages.length) {
      feed.innerHTML = `
        <div class="elyon-soul-message is-assistant">
          <small>Elyon Soul</small>
          <p>Wähle einen Schnellbutton oder starte die KI-Analyse, sobald sie verfügbar ist.</p>
        </div>
      `;
      return;
    }

    feed.innerHTML = state.messages
      .map((message) => `
        <div class="elyon-soul-message ${message.role === "user" ? "is-user" : "is-assistant"}">
          <small>${message.title}</small>
          <p>${String(message.body).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "<br>")}</p>
        </div>
      `)
      .join("");

    feed.scrollTop = feed.scrollHeight;
  }

  function refreshSummary() {
    const products = parseProducts();
    state.summary = summarizeProducts(products);
    updateMetrics(state.summary);
    updateHint(state.summary);
    updateAiButton();
  }

  function updateAiButton() {
    if (!aiButton) return;

    if (!state.aiChecked) {
      aiButton.disabled = true;
      aiButton.classList.add("is-disabled");
      aiButton.textContent = "KI-Modus prüft...";
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
      addMessage("assistant", "Elyon Soul", "KI-Modus konnte gerade nicht geprüft werden. Regelbasierte Soul bleibt aktiv.");
    } finally {
      updateAiButton();
      updateHint(state.summary || summarizeProducts(parseProducts()));
    }
  }

  async function runAiAnalysis() {
    if (state.loading || !state.aiEnabled) return;

    const products = parseProducts();
    const summary = summarizeProducts(products);
    const anonymizedProducts = anonymizeProducts(summary.products);

    state.loading = true;
    aiButton.disabled = true;
    aiButton.classList.add("is-disabled");
    aiButton.innerHTML = '<span class="elyon-soul-loading"><span class="elyon-soul-spinner" aria-hidden="true"></span>Analysiere anonymisierte Daten...</span>';

    addMessage("user", "KI-Analyse", "Bitte analysiere die anonymisierten Produktdaten.");
    addMessage("assistant", "Elyon Soul", "DeepSeek analysiert jetzt nur Produktzahlen, Margen, Lieferzeiten und Risiko-Tags.");

    try {
      const response = await fetch(CONFIG.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "analyze",
          summary: {
            total: summary.total,
            missingMarginCount: summary.missingMarginCount,
            missingDeliveryCount: summary.missingDeliveryCount,
            complianceRiskCount: summary.complianceRiskCount,
            weakMarginCount: summary.weakMarginCount,
            averageProfit: summary.averageProfit,
            averageMargin: summary.averageMargin,
          },
          products: anonymizedProducts,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(data.message || data.error || "Die KI-Analyse konnte nicht abgeschlossen werden.");
      }

      const recommendation = text(data.recommendation || data.message || "Die KI hat keine klare Empfehlung geliefert.");
      addMessage("assistant", "DeepSeek", recommendation);
    } catch (error) {
      addMessage("assistant", "Elyon Soul", "KI-Analyse ist gerade nicht verfügbar. Die regelbasierte Soul bleibt aktiv.");
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
