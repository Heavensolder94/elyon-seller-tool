(() => {
  "use strict";

  const VERSION = "seller-operations-20260810-2";
  const LEGACY_QUICKSTART_BRIDGE_FLAG = "__elyonModernQuickstartBridge";
  const DRAFT_TAB_ID = "draftsTab";
  const DRAFT_STYLE_ID = "elyonSellerDraftWorkspaceStyles";
  const loaded = new Map();
  const groupLoads = new Map();
  const AI_MODEL_GUARD = { src: "/seller-ai-provider-model-guard.js" };
  const PRICE_PROVENANCE = { src: "/seller-price-provenance.js", type: "module" };
  let draftLoading = false;
  let draftProducts = [];

  const GROUPS = {
    quickstart: [
      { src: "/seller-quickstart-menu.js", type: "module" },
    ],
    draftsTab: [],
    ebayListingTab: [
      PRICE_PROVENANCE,
      { src: "/seller-selling-flow-capture.js" },
      { src: "/seller-selling-flow.js", type: "module" },
      { src: "/seller-selling-flow-event-guard.js" },
      { src: "/seller-listing-visual-designer.js", type: "module" },
      { src: "/seller-auto-lister-parity.js", type: "module" },
      { src: "/seller-category-engine.js", type: "module" },
      { src: "/seller-selling-flow-resilience.js" },
      { src: "/seller-selling-flow-visibility-fix.js" },
      { src: "/seller-selling-flow-focused-ui.js", type: "module" },
    ],
    productListTab: [
      PRICE_PROVENANCE,
      { src: "/seller-company-os-inbox.js" },
      { src: "/seller-product-health-state.js", type: "module" },
      { src: "/seller-product-board-accordion.js" },
      { src: "/seller-product-board-accordion-compat.js" },
      { src: "/seller-product-delete.js" },
      { src: "/seller-button-integrity.js" },
    ],
    financeTab: [
      { src: "/seller-finance.js", type: "module" },
      { src: "/seller-order-invoices.js", type: "module" },
    ],
    settingsTab: [
      { src: "/seller-system-status-settings.js" },
      { src: "/seller-settings-layout-experiment.js" },
      { src: "/seller-ai-settings-label.js" },
      { src: "/seller-ebay-api-status.js" },
    ],
    virtualAgentsTab: [
      { src: "/seller-virtual-agents-legacy.js" },
      { src: "/ai-workforce-client.js" },
      { src: "/ai-workforce-mount-fix.js" },
      { src: "/seller-ai-workforce-advanced-settings.js" },
      { src: "/seller-ai-workforce-team-v6.js" },
      { src: "/seller-ai-task-prompt-helper.js" },
    ],
  };

  const text = (value) => String(value ?? "").trim();
  const escapeHtml = (value) => text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function money(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed)
      ? parsed.toLocaleString("de-DE", { style: "currency", currency: "EUR" })
      : "0,00 €";
  }

  function normalizedSrc(src) {
    return `${src}?v=${VERSION}`;
  }

  function findExisting(src) {
    return [...document.scripts].find((script) => {
      try {
        return new URL(script.src, window.location.href).pathname === src;
      } catch {
        return false;
      }
    }) || null;
  }

  function loadScript(entry) {
    const src = entry.src;
    if (loaded.has(src)) return loaded.get(src);

    const existing = findExisting(src);
    if (existing) {
      const ready = Promise.resolve(existing);
      loaded.set(src, ready);
      return ready;
    }

    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = normalizedSrc(src);
      script.dataset.elyonRuntimeModule = src;
      script.async = true;
      if (entry.type === "module") script.type = "module";
      script.addEventListener("load", () => resolve(script), { once: true });
      script.addEventListener("error", () => {
        loaded.delete(src);
        reject(new Error(`Modul konnte nicht geladen werden: ${src}`));
      }, { once: true });
      document.head.appendChild(script);
    });

    loaded.set(src, promise);
    return promise;
  }

  function ensureGroup(groupId) {
    if (groupLoads.has(groupId)) return groupLoads.get(groupId);
    const entries = GROUPS[groupId];
    if (!entries) return Promise.resolve([]);

    const promise = (async () => {
      const scripts = [];
      for (const entry of entries) scripts.push(await loadScript(entry));
      if (groupId === "settingsTab" || groupId === "virtualAgentsTab") {
        scripts.push(await loadScript(AI_MODEL_GUARD));
      }
      return scripts;
    })().catch((error) => {
      groupLoads.delete(groupId);
      throw error;
    });

    groupLoads.set(groupId, promise);
    return promise;
  }

  function productItemIds(product) {
    const listing = product?.listing || {};
    const raw = product?.raw || {};
    return [
      listing.ebayItemId,
      product?.ebayItemId,
      product?.listingId,
      raw?.ebayItemId,
      raw?.listing?.ebayItemId,
    ].map(text).filter(Boolean);
  }

  function isDraftProduct(product) {
    const listing = product?.listing || {};
    const status = text(listing.status || product?.listingStatus || product?.status || "draft").toLowerCase();
    return productItemIds(product).length === 0
      && ["draft", "entwurf", "ready_for_manual_listing", "not_listed"].includes(status);
  }

  function installDraftStyles() {
    if (document.getElementById(DRAFT_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = DRAFT_STYLE_ID;
    style.textContent = `
      #${DRAFT_TAB_ID}{display:none}
      #${DRAFT_TAB_ID}.active{display:block}
      .elyon-drafts-shell{display:grid;gap:16px}
      .elyon-drafts-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
      .elyon-drafts-head h2{margin:0 0 7px;font-size:28px;letter-spacing:-.035em}
      .elyon-drafts-head p{margin:0;max-width:780px;color:#cbd5e1;font-size:13px;line-height:1.55}
      .elyon-drafts-list{display:grid;gap:12px}
      .elyon-draft-card{display:grid;grid-template-columns:76px minmax(0,1fr) auto;gap:14px;align-items:center;padding:15px;border-radius:20px;background:rgba(2,6,23,.45);border:1px solid rgba(96,165,250,.18)}
      .elyon-draft-image{width:76px;height:76px;border-radius:16px;display:grid;place-items:center;overflow:hidden;background:#020617;border:1px solid rgba(255,255,255,.1);font-size:28px}
      .elyon-draft-image img{width:100%;height:100%;object-fit:cover}
      .elyon-draft-copy{min-width:0}.elyon-draft-copy strong{display:block;color:#f8fafc;font-size:16px;line-height:1.35;overflow-wrap:anywhere}
      .elyon-draft-copy p{margin:5px 0 0;color:#94a3b8;font-size:11px;line-height:1.45}
      .elyon-draft-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}
      .elyon-draft-pill{display:inline-flex;padding:5px 8px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:#dbeafe;font-size:10px;font-weight:850}
      .elyon-draft-pill.ready{color:#bbf7d0;background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.23)}
      .elyon-draft-pill.blocked{color:#fde68a;background:rgba(245,158,11,.09);border-color:rgba(245,158,11,.22)}
      .elyon-draft-actions{display:grid;gap:8px;min-width:150px}.elyon-draft-actions button{padding:9px 11px;font-size:11px;border-radius:12px}
      .elyon-drafts-status{padding:12px 14px;border-radius:15px;background:rgba(59,130,246,.09);border:1px solid rgba(96,165,250,.2);color:#dbeafe;font-size:12px;line-height:1.45}
      .elyon-drafts-status.error{color:#fecaca;background:rgba(239,68,68,.09);border-color:rgba(239,68,68,.25)}
      .elyon-drafts-empty{padding:28px 18px;text-align:center;border-radius:18px;border:1px dashed rgba(148,163,184,.22);color:#94a3b8;font-size:12px;line-height:1.55}
      @media(max-width:760px){.elyon-draft-card{grid-template-columns:58px minmax(0,1fr)}.elyon-draft-image{width:58px;height:58px}.elyon-draft-actions{grid-column:1/-1;grid-template-columns:1fr;min-width:0}}
    `;
    document.head.appendChild(style);
  }

  function ensureDraftWorkspace() {
    installDraftStyles();
    const menu = document.getElementById("mainMenu");
    if (menu && !menu.querySelector(`option[value="${DRAFT_TAB_ID}"]`)) {
      const option = document.createElement("option");
      option.value = DRAFT_TAB_ID;
      option.textContent = "📝 Listing-Entwürfe";
      const productOption = menu.querySelector('option[value="productListTab"]');
      if (productOption) productOption.insertAdjacentElement("afterend", option);
      else menu.appendChild(option);
    }

    let tab = document.getElementById(DRAFT_TAB_ID);
    if (!tab) {
      tab = document.createElement("section");
      tab.id = DRAFT_TAB_ID;
      tab.className = "tab";
      const productTab = document.getElementById("productListTab");
      if (productTab) productTab.insertAdjacentElement("afterend", tab);
      else document.querySelector("main.container")?.appendChild(tab);
    }
    return tab;
  }

  function showDraftWorkspace() {
    const tab = ensureDraftWorkspace();
    if (!tab) return;
    document.querySelectorAll(".tab").forEach((node) => node.classList.toggle("active", node === tab));
    const menu = document.getElementById("mainMenu");
    if (menu) menu.value = DRAFT_TAB_ID;
  }

  function draftCard(product, index) {
    const pricing = product?.pricing || {};
    const readiness = product?.readiness || {};
    const blockers = Array.isArray(readiness.blockers) ? readiness.blockers.filter(Boolean) : [];
    const ready = text(readiness.state).toLowerCase() === "ready_for_manual_listing" && blockers.length === 0;
    const supplier = text(product?.supplier?.name || product?.supplierName || product?.supplier) || "Lieferant offen";
    const title = text(product?.title || product?.listing?.title || product?.name) || "Unbenannter Listing-Entwurf";
    const imageUrl = Array.isArray(product?.images) ? text(product.images[0]) : "";
    const image = imageUrl
      ? `<div class="elyon-draft-image"><img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`
      : '<div class="elyon-draft-image">📝</div>';
    const status = text(product?.listing?.status || product?.listingStatus || product?.status || "draft");
    return `
      <article class="elyon-draft-card" data-draft-index="${index}">
        ${image}
        <div class="elyon-draft-copy">
          <strong>${escapeHtml(title)}</strong>
          <p>${escapeHtml(supplier)} · EK ${escapeHtml(money(pricing.buyPrice))} · VK ${escapeHtml(money(pricing.salePrice))} · ${Number(pricing.marginPercent || 0).toLocaleString("de-DE", { maximumFractionDigits: 1 })} % Marge</p>
          <div class="elyon-draft-meta">
            <span class="elyon-draft-pill">${escapeHtml(status || "draft")}</span>
            <span class="elyon-draft-pill ${ready ? "ready" : "blocked"}">${ready ? "Listingbereit" : `${blockers.length} Blocker`}</span>
            <span class="elyon-draft-pill">Score ${Number(readiness.score || 0).toLocaleString("de-DE", { maximumFractionDigits: 0 })}</span>
            <span class="elyon-draft-pill">Noch ohne eBay-Artikelnummer</span>
          </div>
        </div>
        <div class="elyon-draft-actions">
          <button type="button" class="secondary" data-draft-open="${index}">Im Verkaufen-Bereich öffnen</button>
        </div>
      </article>`;
  }

  function renderDraftWorkspace(message = "") {
    const tab = ensureDraftWorkspace();
    if (!tab) return;
    const readyCount = draftProducts.filter((product) => {
      const readiness = product?.readiness || {};
      return text(readiness.state).toLowerCase() === "ready_for_manual_listing"
        && !(Array.isArray(readiness.blockers) ? readiness.blockers.filter(Boolean).length : 0);
    }).length;
    const blockedCount = Math.max(0, draftProducts.length - readyCount);
    tab.innerHTML = `
      <div class="elyon-drafts-shell">
        <section class="card">
          <div class="elyon-drafts-head">
            <div><div class="badge">📝 Entwürfe</div><h2>Listing-Entwürfe</h2><p>Hier landen die internen Seller-Entwürfe aus dem persistenten Product Master. Diese Liste ist getrennt vom Bereich „Verkaufen“ und löst keine eBay-Veröffentlichung aus.</p></div>
            <button type="button" class="secondary" id="elyonDraftsRefresh">${draftLoading ? "Lädt …" : "Neu laden"}</button>
          </div>
          <div class="dashboard" style="margin-top:16px;margin-bottom:0">
            <div class="metric"><small>Listing-Entwürfe</small><strong>${draftProducts.length}</strong></div>
            <div class="metric"><small>Listingbereit</small><strong>${readyCount}</strong></div>
            <div class="metric"><small>Mit Blockern</small><strong>${blockedCount}</strong></div>
            <div class="metric"><small>Datenquelle</small><strong style="font-size:14px">Product Master</strong></div>
          </div>
        </section>
        ${message ? `<div class="elyon-drafts-status ${message.startsWith("Fehler:") ? "error" : ""}">${escapeHtml(message)}</div>` : ""}
        <section class="card">
          <div class="elyon-drafts-list">
            ${draftLoading
              ? '<div class="elyon-drafts-empty">Listing-Entwürfe werden geladen …</div>'
              : draftProducts.length
                ? draftProducts.map(draftCard).join("")
                : '<div class="elyon-drafts-empty">Aktuell gibt es keine internen Listing-Entwürfe ohne eBay-Artikelnummer.</div>'}
          </div>
        </section>
      </div>`;

    tab.querySelector("#elyonDraftsRefresh")?.addEventListener("click", () => refreshDraftWorkspace(true));
    tab.querySelectorAll("[data-draft-open]").forEach((button) => button.addEventListener("click", () => {
      const index = Number(button.dataset.draftOpen);
      if (!Number.isInteger(index) || !draftProducts[index]) return;
      openDraftForSelling(draftProducts[index], button);
    }));
  }

  async function refreshDraftWorkspace(manual = false) {
    if (draftLoading) return;
    draftLoading = true;
    renderDraftWorkspace();
    let message = "";
    try {
      const response = await fetch("/api/products", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        const error = new Error(data.message || data.error || `HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      draftProducts = (Array.isArray(data.products) ? data.products : []).filter(isDraftProduct);
      message = `${draftProducts.length} Listing-Entwurf${draftProducts.length === 1 ? "" : "e"} aus dem Product Master geladen.`;
    } catch (error) {
      draftProducts = [];
      const authHint = error?.status === 403 ? " Bitte Seller-Sitzung erneut anmelden." : "";
      message = `Fehler: Entwürfe konnten nicht geladen werden: ${text(error?.message) || "Unbekannter Fehler"}.${authHint}`;
    } finally {
      draftLoading = false;
      renderDraftWorkspace(message);
      if (manual) document.getElementById(DRAFT_TAB_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function openDraftForSelling(product, button) {
    const previousText = button?.textContent || "Im Verkaufen-Bereich öffnen";
    if (button) { button.disabled = true; button.textContent = "Öffne …"; }
    try {
      await loadGroup("productListTab");
      if (typeof window.ElyonCompanyOsInbox?.adopt !== "function") {
        throw new Error("Product-Master-Übernahme ist nicht verfügbar.");
      }
      window.ElyonCompanyOsInbox.adopt(product, false);
      await loadGroup("ebayListingTab");
      if (typeof window.showTab === "function") window.showTab("ebayListingTab");
      else {
        document.querySelectorAll(".tab").forEach((node) => node.classList.toggle("active", node.id === "ebayListingTab"));
        const menu = document.getElementById("mainMenu");
        if (menu) menu.value = "ebayListingTab";
      }
    } catch (error) {
      renderDraftWorkspace(`Fehler: Entwurf konnte nicht im Verkaufen-Bereich geöffnet werden: ${text(error?.message) || "Unbekannter Fehler"}`);
    } finally {
      if (button?.isConnected) { button.disabled = false; button.textContent = previousText; }
    }
  }

  function isDashboardDraftTaskClick(target) {
    if (!(target instanceof Element)) return false;
    const button = target.closest("#dashboardTab [data-sd-tab], #dashboardTab [data-seller-open-tab]");
    if (!button) return false;
    const task = button.closest(".sd-task,.seller-task");
    const title = text(task?.querySelector("strong")?.textContent);
    return /Listing-Entwurf/i.test(title);
  }

  function activateGroup(groupId) {
    if (groupId === DRAFT_TAB_ID) {
      showDraftWorkspace();
      refreshDraftWorkspace(false);
    } else if (groupId === "ebayListingTab") {
      window.ElyonSellerPriceProvenance?.enrichSelectedWorkingCopy?.();
      window.ElyonSellerPriceProvenance?.render?.();
      window.ElyonSellerSellingFlowCapture?.restore?.();
      window.ElyonSellerSellingFlow?.render?.();
    } else if (groupId === "productListTab") {
      window.ElyonSellerPriceProvenance?.enrichSelectedWorkingCopy?.();
      window.ElyonCompanyOsInbox?.install?.();
      window.ElyonProductBoardAccordion?.refresh?.();
      window.ElyonProductHealthState?.refresh?.();
    } else if (groupId === "financeTab") {
      window.ElyonSellerFinance?.open?.();
      window.ElyonOrderInvoices?.mount?.();
    } else if (groupId === "settingsTab") {
      window.ElyonSystemStatusSettings?.install?.();
      window.ElyonSystemStatusSettings?.move?.();
      window.ElyonSettingsLayoutExperiment?.refresh?.();
      window.ElyonAiSettingsLabel?.apply?.();
      window.ElyonAiProviderModelGuard?.apply?.();
      window.ElyonEbayApiStatus?.status?.();
    } else if (groupId === "virtualAgentsTab") {
      window.ElyonAIWorkforce?.mount?.();
      window.ElyonAIWorkforceMountFix?.refresh?.();
      window.ElyonAIWorkforceAdvancedSettings?.refresh?.();
      window.ElyonAIWorkforceTeamV6?.render?.();
      window.ElyonAITaskPromptHelper?.refresh?.();
      window.ElyonAiProviderModelGuard?.apply?.();
      window.ElyonAiProviderModelGuard?.syncWorkforce?.();
    }
  }

  async function loadGroup(groupId) {
    const entries = GROUPS[groupId];
    if (!entries) return [];
    const scripts = await ensureGroup(groupId);
    activateGroup(groupId);
    window.dispatchEvent(new CustomEvent("elyon:runtime-group-loaded", {
      detail: { tabId: groupId, modules: entries.map((entry) => entry.src) },
    }));
    return scripts;
  }

  function activeTabId() {
    const menuValue = document.getElementById("mainMenu")?.value;
    if (menuValue && GROUPS[menuValue]) return menuValue;
    const active = document.querySelector(".tab.active[id]");
    return active?.id && GROUPS[active.id] ? active.id : "";
  }

  function requestGroup(groupId) {
    if (!GROUPS[groupId]) return Promise.resolve([]);
    return loadGroup(groupId).catch((error) => {
      console.error("[Elyon Runtime Loader]", error);
      window.dispatchEvent(new CustomEvent("elyon:runtime-group-error", {
        detail: { tabId: groupId, message: error.message },
      }));
      throw error;
    });
  }

  function requestQuickstart(manual = true) {
    return requestGroup("quickstart")
      .then(() => window.ElyonSellerQuickstart?.open?.({ manual }))
      .catch(() => false);
  }

  function installLegacyQuickstartBridge() {
    const legacyOpen = window.openStartLauncher;
    if (typeof legacyOpen !== "function") return false;
    if (legacyOpen[LEGACY_QUICKSTART_BRIDGE_FLAG] === true) return true;

    function openModernQuickstartFromLegacy() {
      requestQuickstart(false);
    }

    Object.defineProperty(openModernQuickstartFromLegacy, LEGACY_QUICKSTART_BRIDGE_FLAG, {
      value: true,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    Object.defineProperty(openModernQuickstartFromLegacy, "legacyOpenStartLauncher", {
      value: legacyOpen,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    window.openStartLauncher = openModernQuickstartFromLegacy;
    return window.openStartLauncher === openModernQuickstartFromLegacy;
  }

  function installFinanceEntry() {
    const menu = document.getElementById("mainMenu");
    if (menu && !menu.querySelector('option[value="financeTab"]')) {
      const option = document.createElement("option");
      option.value = "financeTab";
      option.textContent = "Finanzen & Buchhaltung";
      menu.appendChild(option);
    }

    const nav = document.querySelector(".nav-menu");
    if (nav && !document.getElementById("elyonFinanceRuntimeNav")) {
      const link = document.createElement("a");
      link.id = "elyonFinanceRuntimeNav";
      link.href = "#finance";
      link.className = "nav-item";
      link.dataset.tab = "financeTab";
      link.innerHTML = '<span class="nav-icon">€</span><span>Finanzen</span>';
      link.addEventListener("click", (event) => {
        event.preventDefault();
        if (menu) menu.value = "financeTab";
        requestGroup("financeTab").catch(() => {});
      });
      nav.appendChild(link);
    }
  }

  function tabFromClick(target) {
    if (!(target instanceof Element)) return "";
    const explicit = target.closest("[data-tab],[data-tab-id],[data-target-tab],[data-sd-tab],[data-seller-open-tab]");
    const candidate = explicit?.dataset.tab || explicit?.dataset.tabId || explicit?.dataset.targetTab || explicit?.dataset.sdTab || explicit?.dataset.sellerOpenTab;
    if (candidate && GROUPS[candidate]) return candidate;

    if (target.closest("#settingsBtn,#openAiDashboardBtn")) return "settingsTab";
    if (target.closest("#launcherGenerator")) return "ebayListingTab";
    if (target.closest("#launcherBoard")) return "productListTab";

    const inline = target.closest("[onclick]")?.getAttribute("onclick") || "";
    const match = inline.match(/showTab\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    return match && GROUPS[match[1]] ? match[1] : "";
  }

  function quickstartIsOpen() {
    const modal = document.getElementById("startLauncherModal");
    return Boolean(modal && !modal.classList.contains("hidden"));
  }

  function install() {
    installLegacyQuickstartBridge();
    installFinanceEntry();
    ensureDraftWorkspace();

    document.addEventListener("change", (event) => {
      if (event.target?.id === "mainMenu") requestGroup(event.target.value).catch(() => {});
    }, true);

    document.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest("#startLauncherBtn")) {
        event.preventDefault();
        event.stopPropagation();
        requestQuickstart(true);
        return;
      }
      if (isDashboardDraftTaskClick(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        requestGroup(DRAFT_TAB_ID).catch(() => {});
        return;
      }
      const tabId = tabFromClick(event.target);
      if (tabId) requestGroup(tabId).catch(() => {});
    }, true);

    window.addEventListener("elyon:tab-changed", (event) => {
      const tabId = event.detail?.tabId || event.detail;
      if (typeof tabId === "string") requestGroup(tabId).catch(() => {});
    });

    window.addEventListener("elyon:seller-authenticated", () => {
      if (document.getElementById(DRAFT_TAB_ID)?.classList.contains("active")) refreshDraftWorkspace(false);
    });

    window.addEventListener("hashchange", () => {
      if (window.location.hash === "#finance") requestGroup("financeTab").catch(() => {});
    });

    const initial = window.location.hash === "#finance" ? "financeTab" : activeTabId();
    if (initial) {
      const start = () => requestGroup(initial).catch(() => {});
      if ("requestIdleCallback" in window) {
        window.requestIdleCallback(start, { timeout: 700 });
      } else {
        window.setTimeout(start, 0);
      }
    }

    if (quickstartIsOpen()) requestQuickstart(false);

    window.ElyonRuntimeLoader = {
      loadGroup,
      loadScript: (src, type = "") => loadScript({ src, type }),
      openQuickstart: requestQuickstart,
      openDrafts: () => requestGroup(DRAFT_TAB_ID),
      refreshDrafts: refreshDraftWorkspace,
      loaded: () => [...loaded.keys()],
      loadedGroups: () => [...groupLoads.keys()],
      groups: GROUPS,
    };
  }

  installLegacyQuickstartBridge();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
