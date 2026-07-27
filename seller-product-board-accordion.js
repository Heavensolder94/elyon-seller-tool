(() => {
  "use strict";

  const LIST_SELECTOR = "#productListTab #list";
  const STYLE_ID = "elyonProductBoardAccordionStyles";
  const CONTROLS_ID = "elyonProductBoardAccordionControls";
  const EXPANDED_STORAGE_KEY = "elyonProductBoardExpandedCardsV1";
  const CARD_CLASS = "elyon-board-accordion-card";
  const EXPANDED_CLASS = "elyon-board-card-expanded";
  let observer = null;
  let scheduled = false;

  function safeText(value) {
    return String(value ?? "").trim();
  }

  function loadExpandedKeys() {
    try {
      const parsed = JSON.parse(localStorage.getItem(EXPANDED_STORAGE_KEY) || "[]");
      return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
      return new Set();
    }
  }

  function saveExpandedKeys(keys) {
    try {
      localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify([...keys]));
    } catch {}
  }

  function getCardProductId(card) {
    const aiButton = card.querySelector('[id^="productAiBtn_"]');
    if (aiButton?.id) return aiButton.id.replace(/^productAiBtn_/, "");

    const productButton = [...card.querySelectorAll("button")].find((button) => {
      const handler = safeText(button.getAttribute("onclick"));
      return /(?:editProduct|removeProduct|duplicateProduct|stopProduct)\s*\(/.test(handler);
    });
    const handler = safeText(productButton?.getAttribute("onclick"));
    const match = handler.match(/\((?:'|")?([^)'"\s]+)(?:'|")?\)/);
    return match ? match[1] : "";
  }

  function getCardKey(card) {
    const productId = getCardProductId(card);
    if (productId) return `id:${productId}`;
    const title = safeText(card.querySelector(".product-title")?.textContent).toLocaleLowerCase("de-DE");
    return `title:${title || Math.random().toString(36).slice(2)}`;
  }

  function getProductRecord(card) {
    const productId = getCardProductId(card);
    try {
      if (productId && typeof products !== "undefined" && Array.isArray(products)) {
        return products.find((product) => String(product?.id) === String(productId)) || null;
      }
    } catch {}
    return null;
  }

  function parseGermanMoney(value) {
    const cleaned = safeText(value)
      .replace(/[^0-9,.-]/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".");
    const number = Number.parseFloat(cleaned);
    return Number.isFinite(number) ? number : 0;
  }

  function findPillText(card, prefix) {
    const pill = [...card.querySelectorAll(".details-box .pill")].find((node) =>
      safeText(node.textContent).startsWith(prefix),
    );
    return safeText(pill?.textContent);
  }

  function ensureEssentialPills(card) {
    const main = card.firstElementChild;
    if (!main) return;

    const existingRow = [...main.querySelectorAll(":scope > .pill-row")][0] || main.querySelector(".pill-row");
    if (!existingRow || existingRow.querySelector("[data-elyon-essential-pill]")) return;

    const product = getProductRecord(card);
    const totalCostText = findPillText(card, "EK+Versand:");
    const visiblePills = [...existingRow.querySelectorAll(".pill")].map((node) => safeText(node.textContent));
    const sellText = visiblePills.find((value) => value.startsWith("VK:")) || "";
    const profitText = visiblePills.find((value) => value.startsWith("Gewinn:")) || "";
    const sell = product ? Number(product.sell) || 0 : parseGermanMoney(sellText);
    const profit = (() => {
      if (product && typeof calcProduct === "function") {
        try {
          return Number(calcProduct(product)?.profit) || 0;
        } catch {}
      }
      return parseGermanMoney(profitText);
    })();
    const margin = sell > 0 ? (profit / sell) * 100 : 0;

    const additions = [];
    if (totalCostText && !visiblePills.some((value) => value.startsWith("EK+Versand:"))) {
      additions.push(totalCostText);
    }
    if (sell > 0) additions.push(`Marge: ${margin.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`);

    const risk = safeText(product?.risk).toLowerCase();
    if (risk) {
      const label = risk === "low" ? "niedrig" : risk === "medium" ? "mittel" : risk === "high" ? "hoch" : risk;
      additions.push(`Risiko: ${label}`);
    }

    additions.forEach((label) => {
      const pill = document.createElement("span");
      pill.className = "pill elyon-essential-pill";
      pill.dataset.elyonEssentialPill = "true";
      pill.textContent = label;
      existingRow.appendChild(pill);
    });
  }

  function updateToggle(card, expanded) {
    const toggle = card.querySelector(":scope > .elyon-product-card-toggle");
    if (!toggle) return;
    const state = expanded ? "expanded" : "collapsed";
    if (toggle.dataset.elyonAccordionState === state) return;
    toggle.dataset.elyonAccordionState = state;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.innerHTML = expanded
      ? '<span>Artikel einklappen</span><span class="elyon-card-chevron" aria-hidden="true">⌃</span>'
      : '<span>Artikel aufklappen</span><span class="elyon-card-chevron" aria-hidden="true">⌄</span>';
  }

  function setCardExpanded(card, expanded, persist = true) {
    card.classList.toggle(EXPANDED_CLASS, expanded);
    updateToggle(card, expanded);

    card.querySelectorAll(":scope > :first-child .details-box").forEach((details) => {
      if (details instanceof HTMLDetailsElement) details.open = expanded;
    });

    if (!persist) return;
    const keys = loadExpandedKeys();
    const key = card.dataset.elyonProductCardKey || getCardKey(card);
    if (expanded) keys.add(key);
    else keys.delete(key);
    saveExpandedKeys(keys);
  }

  function addToggle(card) {
    if (card.querySelector(":scope > .elyon-product-card-toggle")) return;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "secondary elyon-product-card-toggle";
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setCardExpanded(card, !card.classList.contains(EXPANDED_CLASS));
    });

    const actions = [...card.children].find((child) => child.classList?.contains("actions"));
    card.insertBefore(toggle, actions || null);
  }

  function decorateCard(card) {
    if (!(card instanceof HTMLElement)) return;
    if (card.classList.contains("small-card") || card.closest(".kanban-board, .kanban-column, .kanban-shell")) return;

    const key = getCardKey(card);
    const expanded = loadExpandedKeys().has(key);
    card.classList.add(CARD_CLASS);
    card.dataset.elyonProductCardKey = key;
    addToggle(card);
    ensureEssentialPills(card);
    setCardExpanded(card, expanded, false);
  }

  function getBoardCards() {
    const list = document.querySelector(LIST_SELECTOR);
    if (!list) return [];
    return [...list.children].filter(
      (child) => child instanceof HTMLElement && child.classList.contains("product-card") && !child.classList.contains("small-card"),
    );
  }

  function setAllCards(expanded) {
    const cards = getBoardCards();
    const keys = loadExpandedKeys();
    cards.forEach((card) => {
      decorateCard(card);
      const key = card.dataset.elyonProductCardKey || getCardKey(card);
      card.classList.toggle(EXPANDED_CLASS, expanded);
      updateToggle(card, expanded);
      card.querySelectorAll(":scope > :first-child .details-box").forEach((details) => {
        if (details instanceof HTMLDetailsElement) details.open = expanded;
      });
      if (expanded) keys.add(key);
      else keys.delete(key);
    });
    saveExpandedKeys(keys);
  }

  function ensureControls() {
    const list = document.querySelector(LIST_SELECTOR);
    if (!list || document.getElementById(CONTROLS_ID)) return;

    const controls = document.createElement("div");
    controls.id = CONTROLS_ID;
    controls.className = "elyon-product-board-accordion-controls";
    controls.innerHTML = `
      <span class="muted">Kompakte Artikelkarten</span>
      <div>
        <button type="button" class="secondary" data-elyon-board-expand-all>Alle aufklappen</button>
        <button type="button" class="secondary" data-elyon-board-collapse-all>Alle einklappen</button>
      </div>
    `;
    controls.querySelector("[data-elyon-board-expand-all]")?.addEventListener("click", () => setAllCards(true));
    controls.querySelector("[data-elyon-board-collapse-all]")?.addEventListener("click", () => setAllCards(false));
    list.parentElement?.insertBefore(controls, list);
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .elyon-product-board-accordion-controls{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 14px;padding:10px 12px;border-radius:16px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08)}
      .elyon-product-board-accordion-controls>div{display:flex;gap:8px;flex-wrap:wrap}.elyon-product-board-accordion-controls button{padding:8px 11px;border-radius:11px;font-size:12px}
      #list>.${CARD_CLASS}{position:relative;grid-template-columns:minmax(0,1fr) minmax(210px,280px);align-items:start;transition:border-color .18s ease,box-shadow .18s ease,background .18s ease}
      #list>.${CARD_CLASS}:not(.${EXPANDED_CLASS}){background:rgba(2,6,23,.44)}
      #list>.${CARD_CLASS}:not(.${EXPANDED_CLASS})>:first-child .ai-product-card,
      #list>.${CARD_CLASS}:not(.${EXPANDED_CLASS})>:first-child .details-box,
      #list>.${CARD_CLASS}:not(.${EXPANDED_CLASS})>.actions{display:none!important}
      #list>.${CARD_CLASS}>.elyon-product-card-toggle{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;width:100%;margin-top:2px;padding:10px 13px;border-radius:13px;background:rgba(255,255,255,.055);border:1px solid rgba(148,163,184,.14);color:#dbeafe;font-size:12px}
      #list>.${CARD_CLASS}>.elyon-product-card-toggle:hover{background:rgba(59,130,246,.12);border-color:rgba(96,165,250,.28)}
      #list>.${CARD_CLASS}>.elyon-product-card-toggle .elyon-card-chevron{font-size:18px;line-height:1;transition:transform .18s ease}
      #list>.${CARD_CLASS}.${EXPANDED_CLASS}{border-color:rgba(96,165,250,.32);box-shadow:0 22px 64px rgba(0,0,0,.28),0 0 0 3px rgba(59,130,246,.06)}
      #list>.${CARD_CLASS}.${EXPANDED_CLASS}>.actions{grid-column:1/-1;display:flex!important;flex-direction:row;flex-wrap:wrap;padding-top:13px;border-top:1px solid rgba(148,163,184,.13)}
      #list>.${CARD_CLASS}.${EXPANDED_CLASS}>.actions button{flex:1 1 180px}
      #list>.${CARD_CLASS} .elyon-essential-pill{background:rgba(59,130,246,.1);border-color:rgba(96,165,250,.2);color:#dbeafe}
      #list>.${CARD_CLASS}:not(.${EXPANDED_CLASS}) .product-title{margin-right:6px}
      @media(max-width:760px){
        .elyon-product-board-accordion-controls{align-items:stretch}.elyon-product-board-accordion-controls>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%}
        #list>.${CARD_CLASS}{grid-template-columns:1fr}
        #list>.${CARD_CLASS}>.score-wrap{grid-column:1}
        #list>.${CARD_CLASS}.${EXPANDED_CLASS}>.actions button{flex-basis:calc(50% - 8px)}
      }
      @media(max-width:460px){#list>.${CARD_CLASS}.${EXPANDED_CLASS}>.actions button{flex-basis:100%}}
    `;
    document.head.appendChild(style);
  }

  function decorateBoard() {
    scheduled = false;
    installStyles();
    ensureControls();
    getBoardCards().forEach(decorateCard);
  }

  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(decorateBoard);
  }

  function start() {
    decorateBoard();
    if (observer) return;
    observer = new MutationObserver(scheduleDecorate);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("input", scheduleDecorate, true);
    document.addEventListener("change", scheduleDecorate, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
