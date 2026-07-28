(() => {
  "use strict";

  const LIST_SELECTOR = "#productListTab #list";
  const CARD_SELECTOR = ".product-card:not(.small-card)";
  const CARD_CLASS = "elyon-board-accordion-card";
  const EXPANDED_CLASS = "elyon-board-card-expanded";
  const TOGGLE_SELECTOR = "[data-elyon-board-toggle]";
  const CONTROLS_ID = "elyonProductBoardAccordionControls";
  const STYLE_ID = "elyonProductBoardAccordionCompatStyles";
  const STORAGE_KEY = "elyonProductBoardExpandedCardsV3";
  const LEGACY_STORAGE_KEYS = [
    "elyonProductBoardExpandedCardsV1",
    "elyonProductBoardExpandedCardsV2",
  ];

  let observer = null;
  let observedList = null;
  let scheduled = false;
  let clickInstalled = false;

  const text = (value) => String(value ?? "").trim();

  function clearLegacyState() {
    try {
      LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch {}
  }

  function loadExpandedKeys() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
      return new Set();
    }
  }

  function saveExpandedKeys(keys) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
    } catch {}
  }

  function isBoardCard(card, list = document.querySelector(LIST_SELECTOR)) {
    return Boolean(
      list
      && card instanceof HTMLElement
      && list.contains(card)
      && card.matches(CARD_SELECTOR)
      && !card.closest(".kanban-board, .kanban-column, .kanban-shell"),
    );
  }

  function cardId(card) {
    const aiButton = card.querySelector('[id^="productAiBtn_"]');
    if (aiButton?.id) return aiButton.id.replace(/^productAiBtn_/, "");

    const stable = card.querySelector("[data-elyon-stable-id]")?.dataset.elyonStableId;
    if (stable) return text(stable);

    const deleteId = card.querySelector("[data-elyon-delete-product]")?.dataset.elyonDeleteProduct;
    if (deleteId) return text(deleteId);

    const inline = [...card.querySelectorAll("button[onclick]")].find((button) =>
      /(?:editProduct|removeProduct|duplicateProduct|stopProduct|prepareProductForEbayDraft)\s*\(/.test(text(button.getAttribute("onclick"))),
    );
    const match = text(inline?.getAttribute("onclick")).match(/\((?:'|")?([^)'"\s]+)(?:'|")?\)/);
    return match ? match[1] : "";
  }

  function cardKey(card) {
    if (card.dataset.elyonProductCardCompatKey) return card.dataset.elyonProductCardCompatKey;
    const id = cardId(card);
    if (id) return `id:${id}`;

    const title = text(card.querySelector(".product-title")?.textContent).toLocaleLowerCase("de-DE");
    if (title) return `title:${title}`;

    const list = card.closest("#list");
    const cards = list ? [...list.querySelectorAll(CARD_SELECTOR)].filter((entry) => isBoardCard(entry, list)) : [];
    return `position:${Math.max(0, cards.indexOf(card))}`;
  }

  function updateToggle(card, expanded) {
    const toggle = card.querySelector(`:scope > ${TOGGLE_SELECTOR}`);
    if (!toggle) return;
    toggle.dataset.elyonAccordionState = expanded ? "expanded" : "collapsed";
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-label", expanded ? "Artikel einklappen" : "Details anzeigen");
    toggle.innerHTML = expanded
      ? '<span>Artikel einklappen</span><span class="elyon-card-chevron" aria-hidden="true">⌃</span>'
      : '<span>Details anzeigen</span><span class="elyon-card-chevron" aria-hidden="true">⌄</span>';
  }

  function syncDetails(card, expanded) {
    card.querySelectorAll(".details-box").forEach((details) => {
      if (details.tagName === "DETAILS") details.open = expanded;
    });
  }

  function setExpanded(card, expanded, persist = true) {
    if (!isBoardCard(card)) return;
    const key = cardKey(card);
    card.dataset.elyonProductCardCompatKey = key;

    if (persist) {
      const keys = loadExpandedKeys();
      if (expanded) keys.add(key);
      else keys.delete(key);
      saveExpandedKeys(keys);
    }

    card.classList.toggle(EXPANDED_CLASS, expanded);
    updateToggle(card, expanded);
    syncDetails(card, expanded);
  }

  function ensureToggle(card) {
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
    if (!isBoardCard(card)) return;
    const firstCompatPass = card.dataset.elyonAccordionCompatReady !== "true";
    const key = cardKey(card);

    card.classList.add(CARD_CLASS);
    card.dataset.elyonProductCardCompatKey = key;
    card.dataset.elyonAccordionCompatReady = "true";
    ensureToggle(card);

    const expanded = firstCompatPass
      ? loadExpandedKeys().has(key)
      : card.classList.contains(EXPANDED_CLASS);
    setExpanded(card, expanded, false);
  }

  function getCards() {
    const list = document.querySelector(LIST_SELECTOR);
    if (!list) return [];
    return [...list.querySelectorAll(CARD_SELECTOR)].filter((card) => isBoardCard(card, list));
  }

  function setAll(expanded) {
    const cards = getCards();
    cards.forEach(decorateCard);

    const keys = loadExpandedKeys();
    cards.forEach((card) => {
      const key = cardKey(card);
      if (expanded) keys.add(key);
      else keys.delete(key);
    });
    saveExpandedKeys(keys);
    cards.forEach((card) => setExpanded(card, expanded, false));
  }

  function updateControlsText() {
    const controls = document.getElementById(CONTROLS_ID);
    const label = controls?.querySelector(":scope > .muted");
    if (label) label.textContent = "Standardmäßig geschlossen · kompakte Vorschau mit Titel, Kennzahlen, Status und Score";
  }

  function handleClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest(`#${CONTROLS_ID} [data-elyon-board-expand-all]`)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setAll(true);
      return;
    }

    if (target.closest(`#${CONTROLS_ID} [data-elyon-board-collapse-all]`)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setAll(false);
      return;
    }

    const toggle = target.closest(TOGGLE_SELECTOR);
    if (!toggle) return;
    const card = toggle.closest(".product-card");
    if (!isBoardCard(card)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    setExpanded(card, !card.classList.contains(EXPANDED_CLASS));
  }

  function installClickHandler() {
    if (clickInstalled) return;
    clickInstalled = true;
    // Window capture runs before the older document handler and prevents a
    // double toggle while still supporting cards nested inside status groups.
    window.addEventListener("click", handleClick, true);
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #productListTab #list .${CARD_CLASS}{position:relative;transition:border-color .18s ease,box-shadow .18s ease,background .18s ease,padding .18s ease}
      #productListTab #list .${CARD_CLASS}:not(.${EXPANDED_CLASS}){grid-template-columns:minmax(0,1fr) minmax(132px,170px)!important;align-items:center!important;gap:10px!important;padding:13px 14px!important;background:rgba(2,6,23,.44)!important}
      #productListTab #list .${CARD_CLASS}:not(.${EXPANDED_CLASS})>:first-child{min-width:0}
      #productListTab #list .${CARD_CLASS}:not(.${EXPANDED_CLASS}) .ai-product-card,
      #productListTab #list .${CARD_CLASS}:not(.${EXPANDED_CLASS}) .details-box,
      #productListTab #list .${CARD_CLASS}:not(.${EXPANDED_CLASS})>.actions,
      #productListTab #list .${CARD_CLASS}:not(.${EXPANDED_CLASS})>.elyon-board-delete-quick,
      #productListTab #list .${CARD_CLASS}:not(.${EXPANDED_CLASS}) .elyon-product-decision-note{display:none!important}
      #productListTab #list .${CARD_CLASS}:not(.${EXPANDED_CLASS})>:first-child .product-title{margin:0 6px 5px 0!important;font-size:16px!important;line-height:1.25!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #productListTab #list .${CARD_CLASS}:not(.${EXPANDED_CLASS})>:first-child .muted{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:1;line-clamp:1;font-size:11px!important;line-height:1.35!important}
      #productListTab #list .${CARD_CLASS}:not(.${EXPANDED_CLASS})>:first-child .pill-row{flex-wrap:nowrap!important;max-height:27px;margin-top:7px!important;overflow:hidden}
      #productListTab #list .${CARD_CLASS}:not(.${EXPANDED_CLASS})>:first-child .pill{flex:0 0 auto;padding:4px 7px!important;font-size:10px!important;white-space:nowrap}
      #productListTab #list .${CARD_CLASS}:not(.${EXPANDED_CLASS}) .score-wrap{min-width:0!important;padding:0!important}
      #productListTab #list .${CARD_CLASS}:not(.${EXPANDED_CLASS}) .score-wrap>*{display:none!important}
      #productListTab #list .${CARD_CLASS}:not(.${EXPANDED_CLASS}) .score-wrap>.score-top{display:flex!important;margin-bottom:5px!important}
      #productListTab #list .${CARD_CLASS}:not(.${EXPANDED_CLASS}) .score-wrap>.progress{display:block!important;height:7px!important}
      #productListTab #list .${CARD_CLASS}:not(.${EXPANDED_CLASS}) .score-wrap>.pill-row{display:flex!important;flex-wrap:nowrap!important;max-height:27px;margin-top:7px!important;overflow:hidden}
      #productListTab #list .${CARD_CLASS}:not(.${EXPANDED_CLASS}) .score-wrap .score-number{font-size:22px!important}
      #productListTab #list .${CARD_CLASS}>.elyon-product-card-toggle{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;width:100%;margin-top:2px;padding:10px 13px;border-radius:13px;background:rgba(255,255,255,.055);border:1px solid rgba(148,163,184,.14);color:#dbeafe;font-size:12px}
      #productListTab #list .${CARD_CLASS}:not(.${EXPANDED_CLASS})>.elyon-product-card-toggle{margin-top:0;padding:7px 10px;font-size:11px}
      #productListTab #list .${CARD_CLASS}.${EXPANDED_CLASS}>.actions{grid-column:1/-1;display:flex!important;flex-direction:row;flex-wrap:wrap;padding-top:13px;border-top:1px solid rgba(148,163,184,.13)}
      @media(max-width:760px){
        #productListTab #list .${CARD_CLASS},#productListTab #list .${CARD_CLASS}:not(.${EXPANDED_CLASS}){grid-template-columns:1fr!important}
        #productListTab #list .${CARD_CLASS}:not(.${EXPANDED_CLASS}) .score-wrap{padding-top:8px!important;border-top:1px solid rgba(148,163,184,.1)}
      }
    `;
    document.head.appendChild(style);
  }

  function observe() {
    const list = document.querySelector(LIST_SELECTOR);
    if (!list) return;
    if (!observer) observer = new MutationObserver(schedule);
    if (observedList === list) return;
    observer.disconnect();
    observedList = list;
    observer.observe(list, { childList: true, subtree: true });
  }

  function decorate() {
    scheduled = false;
    observer?.disconnect();
    observedList = null;
    try {
      installStyles();
      updateControlsText();
      getCards().forEach(decorateCard);
    } finally {
      observe();
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(decorate);
  }

  function start() {
    clearLegacyState();
    installClickHandler();
    decorate();

    let tries = 0;
    const retry = setInterval(() => {
      tries += 1;
      decorate();
      if ((document.querySelector(LIST_SELECTOR) && getCards().length) || tries >= 40) clearInterval(retry);
    }, 250);

    window.addEventListener("elyon:products-updated", schedule);
    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEY) schedule();
    });

    const previous = window.ElyonProductBoardAccordion || {};
    window.ElyonProductBoardAccordion = {
      ...previous,
      refresh: schedule,
      expandAll: () => setAll(true),
      collapseAll: () => setAll(false),
      setCardExpanded: setExpanded,
      get expandedKeys() { return [...loadExpandedKeys()]; },
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
