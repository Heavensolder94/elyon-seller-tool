(() => {
  "use strict";

  const TAB_ID = "productListTab";
  const HUB_ID = "elyonProductsHub";
  const VIEW_KEY = "elyonProductsHubView";
  const LOCAL_KEY = "elyonProducts";
  const HIGHLIGHT_CLASS = "elyon-products-hub-focus";
  let currentView = "board";
  let importObserver = null;

  const text = (value) => String(value ?? "").trim();

  function normalize(value) {
    return text(value).toLocaleLowerCase("de-DE").replace(/\s+/g, " ");
  }

  function parseList(raw) {
    try {
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function installStyles() {
    if (document.getElementById("elyonProductsHubStyles")) return;
    const style = document.createElement("style");
    style.id = "elyonProductsHubStyles";
    style.textContent = `
      #${HUB_ID}{margin:0 0 18px;padding:20px;border-radius:24px;background:linear-gradient(145deg,rgba(15,23,42,.96),rgba(30,41,59,.84));border:1px solid rgba(96,165,250,.25);box-shadow:0 18px 56px rgba(0,0,0,.22)}
      .elyon-products-hub-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;flex-wrap:wrap}.elyon-products-hub-copy h2{margin:0 0 7px;font-size:25px}.elyon-products-hub-copy p{margin:0;max-width:760px;color:#cbd5e1;font-size:13px;line-height:1.55}
      .elyon-products-hub-summary{display:flex;gap:8px;flex-wrap:wrap}.elyon-products-hub-summary span{display:inline-flex;align-items:center;gap:6px;padding:8px 11px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#dbeafe;font-size:12px;font-weight:850}
      .elyon-products-hub-nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:17px}.elyon-products-hub-tab{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:66px;padding:13px 15px;text-align:left;background:rgba(2,6,23,.38);border:1px solid rgba(148,163,184,.16);border-radius:17px}.elyon-products-hub-tab strong{display:block;font-size:14px}.elyon-products-hub-tab small{display:block;margin-top:3px;color:#94a3b8;font-size:11px;line-height:1.35}.elyon-products-hub-tab em{display:grid;place-items:center;min-width:30px;height:30px;padding:0 8px;border-radius:999px;background:rgba(255,255,255,.08);color:#dbeafe;font-style:normal;font-size:12px}.elyon-products-hub-tab.active{background:linear-gradient(135deg,rgba(37,99,235,.3),rgba(124,58,237,.24));border-color:rgba(96,165,250,.48);box-shadow:0 0 0 3px rgba(59,130,246,.08)}
      .elyon-products-hub-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.elyon-products-hub-actions[hidden]{display:none!important}.elyon-products-hub-actions button{padding:9px 11px;font-size:12px;border-radius:12px}
      [data-products-hub-panel][hidden]{display:none!important}
      .elyon-import-item.elyon-products-hub-enhanced{grid-template-columns:54px minmax(0,1fr) auto minmax(150px,auto)}.elyon-products-hub-import-actions{display:grid;gap:7px}.elyon-products-hub-import-actions button{padding:8px 10px;border-radius:11px;font-size:11px;white-space:nowrap}.elyon-products-hub-board-pill{display:inline-flex!important;width:max-content;align-items:center;padding:4px 7px;border-radius:999px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.22);color:#bbf7d0!important;font-size:10px!important;font-weight:850}
      .${HIGHLIGHT_CLASS}{outline:3px solid rgba(96,165,250,.65)!important;box-shadow:0 0 0 7px rgba(59,130,246,.12),0 22px 60px rgba(0,0,0,.28)!important;transition:outline-color .2s ease,box-shadow .2s ease}
      .elyon-products-hub-note{margin-top:10px;padding:9px 11px;border-radius:12px;background:rgba(59,130,246,.08);border:1px solid rgba(96,165,250,.2);color:#bfdbfe;font-size:12px;line-height:1.45}
      @media(max-width:760px){.elyon-products-hub-nav{grid-template-columns:1fr}.elyon-products-hub-summary{width:100%}.elyon-products-hub-summary span{flex:1;justify-content:center}.elyon-import-item.elyon-products-hub-enhanced{grid-template-columns:46px minmax(0,1fr)}.elyon-products-hub-import-actions{grid-column:1/-1;grid-template-columns:repeat(2,minmax(0,1fr))}.elyon-products-hub-import-actions button{white-space:normal}}
    `;
    document.head.appendChild(style);
  }

  function getNodes() {
    const tab = document.getElementById(TAB_ID);
    if (!tab) return {};
    const metrics = [...tab.children].find((node) => node.classList?.contains("dashboard"));
    const boardCard = document.getElementById("list")?.closest(".card");
    const importCard = document.getElementById("browserImportsBadge")?.closest(".card");
    return { tab, metrics, boardCard, importCard };
  }

  function renameMenuEntry() {
    const option = document.querySelector('#mainMenu option[value="productListTab"]');
    if (option) option.textContent = "4. 📦 Produkte";
    const launcher = document.getElementById("launcherBoard");
    const strong = launcher?.querySelector("strong");
    const small = launcher?.querySelector("small");
    if (strong) strong.textContent = "📦 Produkte öffnen";
    if (small) small.textContent = "Importe und Produktboard an einem Ort";
  }

  function getBoardCount() {
    return parseList(localStorage.getItem(LOCAL_KEY)).length;
  }

  function getCompanyImportCount() {
    return document.querySelectorAll("#elyonCompanyOsProductImportList .elyon-import-item").length;
  }

  function getChromeImportCount() {
    const value = Number(text(document.getElementById("browserImportsCount")?.textContent).replace(/[^0-9]/g, ""));
    return Number.isFinite(value) ? value : 0;
  }

  function updateCounts() {
    const boardCount = getBoardCount();
    const importCount = getCompanyImportCount() + getChromeImportCount();
    document.querySelectorAll("[data-products-hub-board-count]").forEach((node) => { node.textContent = String(boardCount); });
    document.querySelectorAll("[data-products-hub-import-count]").forEach((node) => { node.textContent = String(importCount); });
  }

  function setActionsVisibility(view) {
    const importActions = document.querySelector("[data-products-hub-import-actions]");
    const boardActions = document.querySelector("[data-products-hub-board-actions]");
    if (importActions) importActions.hidden = view !== "import";
    if (boardActions) boardActions.hidden = view !== "board";
  }

  function setView(view, options = {}) {
    const next = view === "import" ? "import" : "board";
    currentView = next;
    localStorage.setItem(VIEW_KEY, next);
    document.querySelectorAll("[data-products-hub-view]").forEach((button) => {
      const active = button.dataset.productsHubView === next;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-products-hub-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.productsHubPanel !== next;
    });
    setActionsVisibility(next);
    updateCounts();
    if (options.scroll !== false) {
      const target = document.querySelector(`[data-products-hub-panel="${next}"]`);
      window.setTimeout(() => target?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
    }
  }

  function clickExisting(id) {
    const button = document.getElementById(id);
    if (button) button.click();
  }

  function ensureHub() {
    installStyles();
    renameMenuEntry();
    const { tab, metrics, boardCard, importCard } = getNodes();
    if (!tab || !boardCard || !importCard) return null;

    metrics?.setAttribute("data-products-hub-panel", "board");
    boardCard.setAttribute("data-products-hub-panel", "board");
    importCard.setAttribute("data-products-hub-panel", "import");

    let hub = document.getElementById(HUB_ID);
    if (!hub) {
      hub = document.createElement("section");
      hub.id = HUB_ID;
      hub.innerHTML = `
        <div class="elyon-products-hub-head">
          <div class="elyon-products-hub-copy">
            <div class="badge">Produkte-Zentrale</div>
            <h2>📦 Produkte</h2>
            <p>Neue Artikel kommen im Produkt Import an. Im Produktboard prüfst, bearbeitest und entwickelst du sie weiter. Beide Ansichten arbeiten mit demselben Produktbestand.</p>
          </div>
          <div class="elyon-products-hub-summary">
            <span>📥 Eingänge <b data-products-hub-import-count>0</b></span>
            <span>🧭 Im Board <b data-products-hub-board-count>0</b></span>
          </div>
        </div>
        <div class="elyon-products-hub-nav" role="tablist" aria-label="Produkte-Ansichten">
          <button type="button" class="elyon-products-hub-tab" data-products-hub-view="import" role="tab">
            <span><strong>📥 Produkt Import</strong><small>Company OS, Chrome/Nova, CSV und Google Sheets</small></span><em data-products-hub-import-count>0</em>
          </button>
          <button type="button" class="elyon-products-hub-tab" data-products-hub-view="board" role="tab">
            <span><strong>🧭 Produktboard</strong><small>Bearbeiten, kalkulieren, prüfen und Listing vorbereiten</small></span><em data-products-hub-board-count>0</em>
          </button>
        </div>
        <div class="elyon-products-hub-actions" data-products-hub-import-actions>
          <button type="button" class="secondary" data-hub-action="company-refresh">Company OS aktualisieren</button>
          <button type="button" class="secondary" data-hub-action="chrome-refresh">Chrome/Nova aktualisieren</button>
          <button type="button" class="secondary" data-hub-action="file-import">CSV/XLSX importieren</button>
          <button type="button" class="secondary" data-hub-action="sheet-import">Google Sheets importieren</button>
        </div>
        <div class="elyon-products-hub-actions" data-products-hub-board-actions>
          <button type="button" data-hub-action="new-product">+ Neues Produkt</button>
          <button type="button" class="secondary" data-hub-action="strong-products">🔥 Starke Kandidaten</button>
          <button type="button" class="secondary" data-hub-action="kanban">Kanban / Liste wechseln</button>
        </div>
        <div class="elyon-products-hub-note">Import ist der Eingang. Die vollständigen Produktaktionen bleiben bewusst im Produktboard, sind aber von jedem Company-OS-Eingang direkt erreichbar.</div>
      `;
      tab.insertBefore(hub, tab.firstChild);

      hub.querySelectorAll("[data-products-hub-view]").forEach((button) => {
        button.addEventListener("click", () => setView(button.dataset.productsHubView));
      });
      hub.querySelector('[data-hub-action="company-refresh"]')?.addEventListener("click", () => clickExisting("elyonCompanyOsProductImportRefresh"));
      hub.querySelector('[data-hub-action="chrome-refresh"]')?.addEventListener("click", () => clickExisting("browserImportsRefreshBtn"));
      hub.querySelector('[data-hub-action="file-import"]')?.addEventListener("click", () => clickExisting("localCsvImportBtn") || clickExisting("importBtn"));
      hub.querySelector('[data-hub-action="sheet-import"]')?.addEventListener("click", () => {
        clickExisting("importBtn");
        window.setTimeout(() => clickExisting("googleCsvImportBtn"), 50);
      });
      hub.querySelector('[data-hub-action="new-product"]')?.addEventListener("click", () => clickExisting("newProductBtn"));
      hub.querySelector('[data-hub-action="strong-products"]')?.addEventListener("click", () => clickExisting("winnerFilterBtn"));
      hub.querySelector('[data-hub-action="kanban"]')?.addEventListener("click", () => clickExisting("toggleViewBtn"));
    }

    setView(localStorage.getItem(VIEW_KEY) || "board", { scroll: false });
    decorateCompanyImports();
    observeCompanyImports();
    updateCounts();
    return hub;
  }

  function findProductCard(title, id) {
    const wantedTitle = normalize(title);
    const wantedId = normalize(id);
    const cards = [...document.querySelectorAll("#list .product-card")];
    return cards.find((card) => {
      const haystack = normalize(card.textContent);
      const cardId = normalize(card.dataset.productId || card.dataset.id || "");
      return Boolean((wantedId && (haystack.includes(wantedId) || cardId === wantedId)) || (wantedTitle && haystack.includes(wantedTitle)));
    }) || cards[0] || null;
  }

  function showProductInBoard(title, id, edit = false) {
    try {
      if (typeof window.showTab === "function") window.showTab(TAB_ID);
      else if (typeof showTab === "function") showTab(TAB_ID);
    } catch {}
    setView("board", { scroll: false });

    const search = document.getElementById("search");
    if (search) {
      search.value = title || id || "";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      search.dispatchEvent(new Event("change", { bubbles: true }));
    }

    window.setTimeout(() => {
      const card = findProductCard(title, id);
      if (!card) {
        document.querySelector('[data-products-hub-panel="board"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((node) => node.classList.remove(HIGHLIGHT_CLASS));
      card.classList.add(HIGHLIGHT_CLASS);
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => card.classList.remove(HIGHLIGHT_CLASS), 3200);

      if (edit) {
        const editButton = [...card.querySelectorAll("button")].find((button) => /bearbeiten|edit/i.test(text(button.textContent || button.title || button.getAttribute("aria-label"))));
        if (editButton) window.setTimeout(() => editButton.click(), 180);
      }
    }, 220);
  }

  function parseSellerId(item) {
    const raw = text(item.querySelector(".elyon-import-id")?.textContent);
    const separator = raw.indexOf(":");
    return separator >= 0 ? text(raw.slice(separator + 1)) : raw;
  }

  function decorateCompanyImports() {
    document.querySelectorAll("#elyonCompanyOsProductImportList .elyon-import-item").forEach((item) => {
      if (item.dataset.productsHubEnhanced === "true") return;
      item.dataset.productsHubEnhanced = "true";
      item.classList.add("elyon-products-hub-enhanced");
      const title = text(item.querySelector(".elyon-import-copy strong")?.textContent);
      const id = parseSellerId(item);
      const copy = item.querySelector(".elyon-import-copy");
      if (copy && !copy.querySelector(".elyon-products-hub-board-pill")) {
        const pill = document.createElement("span");
        pill.className = "elyon-products-hub-board-pill";
        pill.textContent = "✓ Im Produktboard";
        copy.appendChild(pill);
      }
      const actions = document.createElement("div");
      actions.className = "elyon-products-hub-import-actions";
      actions.innerHTML = `
        <button type="button" data-hub-open-product>Im Produktboard öffnen</button>
        <button type="button" class="secondary" data-hub-edit-product>Produkt bearbeiten</button>
      `;
      actions.querySelector("[data-hub-open-product]")?.addEventListener("click", () => showProductInBoard(title, id, false));
      actions.querySelector("[data-hub-edit-product]")?.addEventListener("click", () => showProductInBoard(title, id, true));
      item.appendChild(actions);
    });
    updateCounts();
  }

  function observeCompanyImports() {
    const list = document.getElementById("elyonCompanyOsProductImportList");
    if (!list || importObserver) return;
    importObserver = new MutationObserver(() => decorateCompanyImports());
    importObserver.observe(list, { childList: true, subtree: true });
  }

  function install() {
    ensureHub();
    let tries = 0;
    const retry = window.setInterval(() => {
      tries += 1;
      ensureHub();
      if ((document.getElementById(HUB_ID) && document.getElementById("elyonCompanyOsProductImportList")) || tries >= 30) window.clearInterval(retry);
    }, 300);
    window.setInterval(updateCounts, 1500);
  }

  window.ElyonProductsHub = {
    install,
    showImport: () => setView("import"),
    showBoard: () => setView("board"),
    openProduct: showProductInBoard,
    get view() { return currentView; },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
