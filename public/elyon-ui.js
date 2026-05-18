(function () {
  "use strict";

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const routeLabels = {
    dashboard: "Dashboard",
    research: "Product Research",
    workflow: "Produktverwaltung",
    listing: "Listing Center",
    orders: "Orders",
    customers: "Kundenstatus",
    automation: "Automation",
    analytics: "Analytics",
    tools: "API & Systeme",
  };

  function toast(message, eyebrow = "Elyon") {
    const shell = qs("#actionToast");
    const text = qs("#actionToastText");
    if (!shell || !text) return;

    const label = qs(".k", shell);
    if (label) label.textContent = eyebrow;
    text.textContent = message;
    shell.classList.add("show");
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => shell.classList.remove("show"), 2800);
  }

  function dispatch(el, type) {
    if (!el) return;
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  function go(hash) {
    const next = hash.startsWith("#") ? hash : `#${hash}`;
    if (window.location.hash !== next) {
      window.location.hash = next;
    }
    if (typeof window.applyViewFromHash === "function") {
      window.applyViewFromHash();
    }
    closeMobileSidebar();
  }

  function syncSearch(value) {
    const main = qs("#mainSearch");
    const side = qs("#sidebarSearch");
    if (main) {
      main.value = value;
      dispatch(main, "input");
    }
    if (side) {
      side.value = value;
      dispatch(side, "input");
    }
  }

  function setSelectValue(selector, value) {
    const select = qs(selector);
    if (!select) return;
    select.value = value;
    dispatch(select, "change");
  }

  function addTopbarTools() {
    const topActions = qs(".top-actions");
    if (!topActions || qs(".elyon-global-search")) return;

    const search = document.createElement("label");
    search.className = "elyon-global-search";
    search.innerHTML = `
      <span>Search</span>
      <input type="search" placeholder="Suche Produkte, Orders, API..." autocomplete="off" />
      <kbd>Ctrl K</kbd>
    `;

    const input = qs("input", search);
    input.addEventListener("input", () => {
      go("#research");
      syncSearch(input.value);
    });

    const commandButton = document.createElement("button");
    commandButton.className = "btn btn-secondary elyon-command-trigger";
    commandButton.type = "button";
    commandButton.textContent = "Command";
    commandButton.addEventListener("click", openCommandPalette);

    topActions.prepend(commandButton);
    topActions.prepend(search);
  }

  function addMobileShellControls() {
    if (qs(".elyon-shell-toggle")) return;

    const toggle = document.createElement("button");
    toggle.className = "elyon-shell-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Navigation oeffnen");
    toggle.textContent = "Menu";
    toggle.addEventListener("click", () => document.body.classList.add("sidebar-open"));
    document.body.prepend(toggle);

    const overlay = document.createElement("button");
    overlay.className = "elyon-sidebar-overlay";
    overlay.type = "button";
    overlay.setAttribute("aria-label", "Navigation schliessen");
    overlay.addEventListener("click", closeMobileSidebar);
    document.body.appendChild(overlay);
  }

  function closeMobileSidebar() {
    document.body.classList.remove("sidebar-open");
  }

  function commandItems() {
    return [
      { title: "Dashboard oeffnen", hint: "Uebersicht und KPIs", run: () => go("#dashboard") },
      { title: "eBay Suche", hint: "Research auf eBay filtern", run: () => { go("#research"); setSelectValue("#sourceFilter", "eBay"); toast("eBay Suche ist aktiv."); } },
      { title: "CJ Suche", hint: "Research auf CJ filtern", run: () => { go("#research"); setSelectValue("#sourceFilter", "CJ"); toast("CJ Suche ist aktiv."); } },
      { title: "Trending Produkte", hint: "Recherche mit Trend-Suche", run: () => { go("#research"); syncSearch("light"); toast("Trending-Suche vorbereitet."); } },
      { title: "Gewinner Produkte", hint: "Score-Filter auf gut", run: () => { go("#research"); setSelectValue("#scoreFilter", "good"); toast("Gewinner-Produkte gefiltert."); } },
      { title: "Gespeicherte Produkte", hint: "Lokale Favoriten anzeigen", run: () => { go("#workflow"); setSelectValue("#sourceFilter", "Saved"); toast("Gespeicherte Produkte werden im Research gefiltert."); } },
      { title: "Listing Center", hint: "Generator und Entwuerfe", run: () => go("#listing") },
      { title: "Orders", hint: "Bestellungen pruefen", run: () => go("#orders") },
      { title: "Automation", hint: "Automationsbereich", run: () => go("#automation") },
      { title: "API Status", hint: "Health, eBay, CJ, Env", run: () => go("#tools") },
    ];
  }

  function ensureCommandPalette() {
    let palette = qs(".elyon-command-backdrop");
    if (palette) return palette;

    palette = document.createElement("div");
    palette.className = "elyon-command-backdrop";
    palette.innerHTML = `
      <section class="elyon-command" role="dialog" aria-modal="true" aria-label="Command Palette">
        <div class="elyon-command-search">
          <span>Command Palette</span>
          <input type="search" placeholder="Aktion oder Bereich suchen..." autocomplete="off" />
        </div>
        <div class="elyon-command-list"></div>
      </section>
    `;
    document.body.appendChild(palette);

    const input = qs("input", palette);
    const list = qs(".elyon-command-list", palette);

    function render(filter = "") {
      const items = commandItems().filter((item) => `${item.title} ${item.hint}`.toLowerCase().includes(filter.toLowerCase()));
      list.innerHTML = "";
      items.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "elyon-command-item";
        button.innerHTML = `<strong>${item.title}</strong><span>${item.hint}</span>`;
        button.addEventListener("click", () => {
          item.run();
          closeCommandPalette();
        });
        list.appendChild(button);
      });
      if (!items.length) {
        list.innerHTML = `<div class="elyon-empty">Keine Aktion gefunden.</div>`;
      }
    }

    input.addEventListener("input", () => render(input.value));
    palette.addEventListener("click", (event) => {
      if (event.target === palette) closeCommandPalette();
    });
    render();
    return palette;
  }

  function openCommandPalette() {
    const palette = ensureCommandPalette();
    palette.classList.add("is-open");
    const input = qs("input", palette);
    if (input) {
      input.value = "";
      input.dispatchEvent(new Event("input"));
      window.setTimeout(() => input.focus(), 30);
    }
  }

  function closeCommandPalette() {
    const palette = qs(".elyon-command-backdrop");
    if (palette) palette.classList.remove("is-open");
  }

  function handleNavAction(event) {
    const link = event.target.closest("[data-ui-action]");
    if (!link) return;

    const action = link.dataset.uiAction;
    const href = link.getAttribute("href") || "#dashboard";
    const tool = link.dataset.tool;

    if (action === "open-view") {
      go(href);
      return;
    }

    event.preventDefault();

    if (action === "research-source") {
      go("#research");
      setSelectValue("#sourceFilter", link.dataset.source || "All");
      toast(`${link.dataset.source || "Alle"} Produkte gefiltert.`);
      return;
    }

    if (action === "research-query") {
      go("#research");
      syncSearch(link.dataset.query || "");
      toast("Trend-Suche gestartet.");
      return;
    }

    if (action === "research-score") {
      go("#research");
      setSelectValue("#scoreFilter", link.dataset.score || "all");
      toast("Score-Filter angewendet.");
      return;
    }

    if (action === "saved-products") {
      go("#workflow");
      setSelectValue("#sourceFilter", "Saved");
      toast("Favoriten-Ansicht vorbereitet. Gespeichert wird lokal im Browser.");
      return;
    }

    if (action === "listing-tool") {
      go("#listing");
      prepareListingTool(tool);
      return;
    }

    if (["orders-tool", "automation-tool", "analytics-tool", "import-export", "system-tool", "settings-tool"].includes(action)) {
      go(href);
      toast(`${labelForTool(action, tool)} ist vorbereitet. Backend-Hooks bleiben unveraendert.`, "Coming Soon");
    }
  }

  function labelForTool(action, tool) {
    const labels = {
      "listing-tool": { title: "Titel Generator", seo: "SEO Generator", drafts: "Listing Entwuerfe" },
      "orders-tool": { tracking: "Tracking" },
      "automation-tool": { "auto-import": "Auto Import", "price-watch": "Preisueberwachung", stock: "Lagerstatus", alerts: "Auto Alerts" },
      "analytics-tool": { revenue: "Umsatzanalyse", profit: "Gewinnanalyse", performance: "Produkt Performance" },
      "import-export": { csv: "CSV Import", sheets: "Google Sheets", export: "Export Center" },
      "system-tool": { openai: "OpenAI API" },
      "settings-tool": { general: "Allgemeine Einstellungen", accounts: "Accounts", security: "Sicherheit", theme: "Theme" },
    };
    return (labels[action] && labels[action][tool]) || routeLabels[tool] || "Bereich";
  }

  function prepareListingTool(tool) {
    const title = qs("#listingTitle");
    const body = qs("#listingBody");
    const notes = qs("#listingNotes");
    if (!title || !body) {
      toast("Listing Center geoeffnet.");
      return;
    }

    const selectedTitle = qs("#selectedTitle")?.textContent?.trim() || "Produkt";
    const templates = {
      title: {
        title: `${selectedTitle} | Premium eBay Listing`,
        body: "Titel-Entwurf vorbereitet. Du kannst ihn direkt anpassen und spaeter mit echten Produktdaten verbinden.",
      },
      seo: {
        title: `SEO Keywords fuer ${selectedTitle}`,
        body: "Keyword-Struktur: Problem, Nutzen, Material, Zielgruppe, Versandvorteil. Bestehende Generator-Felder bleiben erhalten.",
      },
      drafts: {
        title: "Listing Entwurf",
        body: "Entwurf lokal vorbereitet. Speichern/Export bleibt ueber die bestehenden Listing-Funktionen angebunden.",
      },
    };
    const next = templates[tool] || templates.title;
    title.value = next.title;
    body.value = next.body;
    if (notes) {
      notes.value = next.title === "Listing Entwurf"
        ? "Lokaler Listing-Entwurf vorbereitet. Titel, Beschreibung und SEO später feinjustieren."
        : "Listing intern vorbereitet. Titel, Beschreibung und SEO prüfen, dann manuell auf eBay einfügen.";
    }
    toast(`${labelForTool("listing-tool", tool)} im Listing Center vorbereitet.`);
  }

  function ensureProductModal() {
    let modal = qs(".elyon-modal-backdrop");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.className = "elyon-modal-backdrop";
    modal.innerHTML = `
      <section class="elyon-modal" role="dialog" aria-modal="true" aria-label="Produktdetails">
        <button class="elyon-modal-close" type="button" aria-label="Schliessen">Close</button>
        <p class="eyebrow">Produktanalyse</p>
        <h2 id="elyonModalTitle">Produktdetails</h2>
        <div class="elyon-modal-grid">
          <div><span>Score</span><strong id="elyonModalScore">-</strong></div>
          <div><span>Marge</span><strong id="elyonModalMargin">-</strong></div>
          <div><span>Risiko</span><strong id="elyonModalRisk">-</strong></div>
        </div>
        <p id="elyonModalRecommendation" class="elyon-modal-copy"></p>
      </section>
    `;
    document.body.appendChild(modal);

    qs(".elyon-modal-close", modal).addEventListener("click", closeProductModal);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeProductModal();
    });
    return modal;
  }

  function openProductModal() {
    const modal = ensureProductModal();
    qs("#elyonModalTitle").textContent = qs("#selectedTitle")?.textContent?.trim() || "Kein Produkt ausgewaehlt";
    qs("#elyonModalScore").textContent = qs("#selectedScore")?.textContent?.trim() || "-";
    qs("#elyonModalMargin").textContent = qs("#selectedMargin")?.textContent?.trim() || "-";
    qs("#elyonModalRisk").textContent = qs("#selectedRisk")?.textContent?.trim() || "Bitte analysieren";
    qs("#elyonModalRecommendation").textContent = qs("#selectedRecommendation")?.textContent?.trim() || "Waehle ein Produkt aus und starte die Analyse.";
    modal.classList.add("is-open");
  }

  function closeProductModal() {
    const modal = qs(".elyon-modal-backdrop");
    if (modal) modal.classList.remove("is-open");
  }

  function addDetailButton() {
    const actionRow = qs(".action-row");
    if (!actionRow || qs("#productDetailsBtn")) return;
    const button = document.createElement("button");
    button.className = "btn btn-secondary";
    button.type = "button";
    button.id = "productDetailsBtn";
    button.textContent = "Details";
    button.addEventListener("click", openProductModal);
    actionRow.appendChild(button);
  }

  function addActivityFeed() {
    if (qs(".elyon-activity")) return;
    const host = qs(".bottom-grid") || qs("main") || document.body;
    const panel = document.createElement("aside");
    panel.className = "elyon-activity";
    panel.innerHTML = `
      <div class="panel-head">
        <div>
          <p class="eyebrow">Activity</p>
          <h2>Workflow Feed</h2>
        </div>
        <span class="status-pill ok">Live</span>
      </div>
      <div class="elyon-feed">
        <div><span></span><strong>API Status wird automatisch geladen</strong><small>Health, eBay und CJ bleiben angebunden.</small></div>
        <div><span></span><strong>Favoriten lokal aktiv</strong><small>Gespeicherte Produkte bleiben im Browser erhalten.</small></div>
        <div><span></span><strong>Command Palette bereit</strong><small>Mit Ctrl + K schnell navigieren.</small></div>
      </div>
    `;
    host.appendChild(panel);
  }

  function bindKeyboard() {
    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openCommandPalette();
      }
      if (event.key === "Escape") {
        closeCommandPalette();
        closeProductModal();
        closeMobileSidebar();
      }
    });
  }

  function bindNavState() {
    const update = () => {
      const hash = (window.location.hash || "#dashboard").replace("#", "");
      qsa(".nav-menu .nav-item").forEach((item) => {
        const itemHash = (item.getAttribute("href") || "").replace("#", "");
        item.classList.toggle("active", itemHash === hash);
      });
    };
    window.addEventListener("hashchange", update);
    update();
  }

  function init() {
    addTopbarTools();
    addMobileShellControls();
    addDetailButton();
    addActivityFeed();
    bindKeyboard();
    bindNavState();
    document.addEventListener("click", handleNavAction);
    toast("Apple x Notion x Linear UI lokal geladen.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
