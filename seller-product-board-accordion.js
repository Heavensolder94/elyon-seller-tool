(() => {
  "use strict";

  const LIST_SELECTOR = "#productListTab #list";
  const STYLE_ID = "elyonProductBoardAccordionStyles";
  const CONTROLS_ID = "elyonProductBoardAccordionControls";
  const EXPANDED_STORAGE_KEY = "elyonProductBoardExpandedCardsV2";
  const LEGACY_EXPANDED_STORAGE_KEY = "elyonProductBoardExpandedCardsV1";
  const CARD_CLASS = "elyon-board-accordion-card";
  const EXPANDED_CLASS = "elyon-board-card-expanded";
  const TOGGLE_SELECTOR = "[data-elyon-board-toggle]";
  let observer = null;
  let observerTarget = null;
  let scheduled = false;
  let clickHandlerInstalled = false;

  function safeText(value) {
    return String(value ?? "").trim();
  }

  function resetLegacyExpandedState() {
    try {
      localStorage.removeItem(LEGACY_EXPANDED_STORAGE_KEY);
    } catch {}
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
    if (card.dataset.elyonProductCardKey) return card.dataset.elyonProductCardKey;
    const productId = getCardProductId(card);
    if (productId) return `id:${productId}`;
    const title = safeText(card.querySelector(".product-title")?.textContent).toLocaleLowerCase("de-DE");
    if (title) return `title:${title}`;
    const list = card.closest("#list");
    const position = list ? [...list.children].indexOf(card) : -1;
    return `position:${position}`;
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
    const toggle = card.querySelector(`:scope > ${TOGGLE_SELECTOR}`);
    if (!toggle) return;
    const state = expanded ? "expanded" : "collapsed";
    toggle.dataset.elyonAccordionState = state;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-label", expanded ? "Artikel einklappen" : "Artikel aufklappen");
    toggle.innerHTML = expanded
      ? '<span>Artikel einklappen</span><span class="elyon-card-chevron" aria-hidden="true">⌃</span>'
      : '<span>Details anzeigen</span><span class="elyon-card-chevron" aria-hidden="true">⌄</span>';
  }

  function syncNativeDetails(card, expanded) {
    card.querySelectorAll(":scope > :first-child .details-box").forEach((details) => {
      if (details.tagName === "DETAILS") details.open = expanded;
    });
  }

  function setCardExpanded(card, expanded, persist = true) {
    if (!(card instanceof HTMLElement)) return;
    const key = card.dataset.elyonProductCardKey || getCardKey(card);
    card.dataset.elyonProductCardKey = key;

    // Persist first. The Product Board can re-render immediately after a click;
    // storing the intended state before DOM mutations prevents that render from
    // restoring the previous value.
    if (persist) {
      const keys = loadExpandedKeys();
      if (expanded) keys.add(key);
      else keys.delete(key);
      saveExpandedKeys(keys);
    }

    card.classList.toggle(EXPANDED_CLASS, expanded);
    updateToggle(card, expanded);
    syncNativeDetails(card, expanded);
  }

  function addToggle(card) {
    let toggle = card.querySelector(`:scope > ${TOGGLE_SELECTOR}`);
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "secondary elyon-product-card-toggle";
      toggle.dataset.elyonBoardToggle = "true";
      const actions = [...card.children].find((child) => child.classList?.contains("actions"));
      card.insertBefore(toggle, actions || null);
    }
    toggle.type = "button";
    toggle.dataset.elyonBoardToggle = "true";
  }

  function decorateCard(card) {
    if (!(card instanceof HTMLElement)) return;
    if (card.classList.contains("small-card") || card.closest(".kanban-board, .kanban-column, .kanban-shell")) return;

    const wasDecorated = card.dataset.elyonAccordionReady === "true";
    const key = getCardKey(card);
    card.classList.add(CARD_CLASS);
    card.dataset.elyonProductCardKey = key;
    card.dataset.elyonAccordionReady = "true";
    addToggle(card);
    ensureEssentialPills(card);

    // A new card is closed by default. Only an explicit user choice stored in
    // the current storage version can restore it as expanded after a re-render.
    const expanded = wasDecorated
      ? card.classList.contains(EXPANDED_CLASS)
      : loadExpandedKeys().has(key);
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
    cards.forEach(decorateCard);

    const keys = loadExpandedKeys();
    cards.forEach((card) => {
      const key = card.dataset.elyonProductCardKey || getCardKey(card);
      if (expanded) keys.add(key);
      else keys.delete(key);
    });
    saveExpandedKeys(keys);

    cards.forEach((card) => setCardExpanded(card, expanded, false));
  }

  function ensureControls() {
    const list = document.querySelector(LIST_SELECTOR);
    if (!list || document.getElementById(CONTROLS_ID)) return;

    const controls = document.createElement("div");
    controls.id = CONTROLS_ID;
    controls.className = "elyon-product-board-accordion-controls";
    controls.innerHTML = `
      <span class="muted">Standardmäßig geschlossen · Titel, Kennzahlen und Status bleiben sichtbar</span>
      <div>
        <button type="button" class="secondary" data-elyon-board-expand-all>Alle aufklappen</button>
        <button type="button" class="secondary" data-elyon-board-collapse-all>Alle einklappen</button>
      </div>
    `;
    list.parentElement?.insertBefore(controls, list);
  }

  function handleAccordionClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const toggle = target.closest(TOGGLE_SELECTOR);
    if (toggle) {
      const card = toggle.closest(`${LIST_SELECTOR} > .product-card`);
      if (!card) return;
      event.preventDefault();
      event.stopPropagation();
      setCardExpanded(card, !card.classList.contains(EXPANDED_CLASS));
      return;
    }

    if (target.closest(`#${CONTROLS_ID} [data-elyon-board-expand-all]`)) {
      event.preventDefault();
      event.stopPropagation();
      setAllCards(true);
      return;
    }

    if (target.closest(`#${CONTROLS_ID} [data-elyon-board-collapse-all]`)) {
      event.preventDefault();
      event.stopPropagation();
      setAllCards(false);
    }
  }

  function installClickHandler() {
    if (clickHandlerInstalled) return;
    clickHandlerInstalled = true;
    document.addEventListener("click", handleAccordionClick, true);
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .elyon-product-board-accordion-controls{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 14px;padding:10px 12px;border-radius:16px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08)}
      .elyon-product-board-accordion-controls>div{display:flex;gap:8px;flex-wrap:wrap}.elyon-product-board-accordion-controls button{padding:8px 11px;border-radius:11px;font-size:12px}
      #list>.${CARD_CLASS}{position:relative;grid-template-columns:minmax(0,1fr) minmax(210px,280px);align-items:start;transition:border-color .18s ease,box-shadow .18s ease,background .18s ease,padding .18s ease}
      #list>.${CARD_CLASS}:not(.${EXPANDED_CLASS}){grid-template-columns:minmax(0,1fr) minmax(132px,170px);align-items:center;gap:10px;padding:13px 14px;background:rgba(2,6,23,.44)}
      #list>.${CARD_CLASS}:not(.${EXPANDED_CLASS})>:first-child{min-width:0}
      #list>.${CARD_CLASS}:not(.${EXPANDED_CLASS})>:first-child .ai-product-card,
      #list>.${CARD_CLASS}:not(.${EXPANDED_CLASS})>:first-child .details-box,
      #list>.${CARD_CLASS}:not(.${EXPANDED_CLASS})>.actions,
      #list>.${CARD_CLASS}:not(.${EXPANDED_CLASS})>.elyon-board-delete-quick{display:none!important}
      #list>.${CARD_CLASS}:not(.${EXPANDED_CLASS})>:first-child .product-title{margin:0 6px 5px 0;font-size:16px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #list>.${CARD_CLASS}:not(.${EXPANDED_CLASS})>:first-child .muted{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:1;line-clamp:1;font-size:11px;line-height:1.35}
      #list>.${CARD_CLASS}:not(.${EXPANDED_CLASS})>:first-child .pill-row{flex-wrap:nowrap;max-height:26px;margin-top:7px;overflow:hidden}
      #list>.${CARD_CLASS}:not(.${EXPANDED_CLASS})>:first-child .pill{flex:0 0 auto;padding:4px 7px;font-size:10px;white-space:nowrap}
      #list>.${CARD_CLASS}:not(.${EXPANDED_CLASS})>.score-wrap{min-width:0}
      #list>.${CARD_CLASS}:not(.${EXPANDED_CLASS})>.score-wrap .score-top{margin-bottom:5px}
      #list>.${CARD_CLASS}:not(.${EXPANDED_CLASS})>.score-wrap .score-number{font-size:22px}
      #list>.${CARD_CLASS}:not(.${EXPANDED_CLASS})>.score-wrap .progress{height:7px}
      #list>.${CARD_CLASS}>.elyon-product-card-toggle{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;width:100%;margin-top:2px;padding:10px 13px;border-radius:13px;background:rgba(255,255,255,.055);border:1px solid rgba(148,163,184,.14);color:#dbeafe;font-size:12px}
      #list>.${CARD_CLASS}:not(.${EXPANDED_CLASS})>.elyon-product-card-toggle{margin-top:0;padding:7px 10px;font-size:11px}
      #list>.${CARD_CLASS}>.elyon-product-card-toggle:hover{background:rgba(59,130,246,.12);border-color:rgba(96,165,250,.28)}
      #list>.${CARD_CLASS}>.elyon-product-card-toggle .elyon-card-chevron{font-size:18px;line-height:1;transition:transform .18s ease}
      #list>.${CARD_CLASS}.${EXPANDED_CLASS}{border-color:rgba(96,165,250,.32);box-shadow:0 22px 64px rgba(0,0,0,.28),0 0 0 3px rgba(59,130,246,.06)}
      #list>.${CARD_CLASS}.${EXPANDED_CLASS}>.actions{grid-column:1/-1;display:flex!important;flex-direction:row;flex-wrap:wrap;padding-top:13px;border-top:1px solid rgba(148,163,184,.13)}
      #list>.${CARD_CLASS}.${EXPANDED_CLASS}>.actions button{flex:1 1 180px}
      #list>.${CARD_CLASS} .elyon-essential-pill{background:rgba(59,130,246,.1);border-color:rgba(96,165,250,.2);color:#dbeafe}
      @media(max-width:760px){
        .elyon-product-board-accordion-controls{align-items:stretch}.elyon-product-board-accordion-controls>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%}
        #list>.${CARD_CLASS},#list>.${CARD_CLASS}:not(.${EXPANDED_CLASS}){grid-template-columns:1fr}
        #list>.${CARD_CLASS}>.score-wrap{grid-column:1}
        #list>.${CARD_CLASS}:not(.${EXPANDED_CLASS})>.score-wrap{padding-top:8px;border-top:1px solid rgba(148,163,184,.1)}
        #list>.${CARD_CLASS}.${EXPANDED_CLASS}>.actions button{flex-basis:calc(50% - 8px)}
      }
      @media(max-width:460px){#list>.${CARD_CLASS}.${EXPANDED_CLASS}>.actions button{flex-basis:100%}}
    `;
    document.head.appendChild(style);
  }

  function startObserver() {
    const list = document.querySelector(LIST_SELECTOR);
    if (!list) return;
    if (!observer) observer = new MutationObserver(scheduleDecorate);
    if (observerTarget === list) return;
    observer.disconnect();
    observerTarget = list;
    observer.observe(list, { childList: true, subtree: true });
  }

  function decorateBoard() {
    scheduled = false;
    observer?.disconnect();
    observerTarget = null;
    try {
      installStyles();
      ensureControls();
      getBoardCards().forEach(decorateCard);
    } finally {
      startObserver();
    }
  }

  function scheduleDecorate() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(decorateBoard);
  }

  function start() {
    resetLegacyExpandedState();
    installClickHandler();
    decorateBoard();
    let tries = 0;
    const retry = window.setInterval(() => {
      tries += 1;
      decorateBoard();
      if (document.querySelector(LIST_SELECTOR) || tries >= 30) window.clearInterval(retry);
    }, 300);
    window.addEventListener("elyon:products-updated", scheduleDecorate);
    window.addEventListener("storage", (event) => {
      if (event.key === EXPANDED_STORAGE_KEY) scheduleDecorate();
    });
  }

  window.ElyonProductBoardAccordion = {
    refresh: scheduleDecorate,
    expandAll: () => setAllCards(true),
    collapseAll: () => setAllCards(false),
    setCardExpanded,
    get expandedKeys() { return [...loadExpandedKeys()]; },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
