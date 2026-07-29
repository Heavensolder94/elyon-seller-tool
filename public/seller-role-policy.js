(() => {
  "use strict";

  const ACTIVE_MODULES = [
    { id: "dashboardTab", label: "Übersicht", role: "Seller-Betrieb und nächste Aufgaben" },
    { id: "productListTab", label: "Produkte", role: "Freigegebene Company-OS-Produkte und Arbeitskopien" },
    { id: "ebayListingTab", label: "Listing-Paket", role: "Paket prüfen, kopieren und manuelles eBay-Listing dokumentieren" },
    { id: "ordersTab", label: "Bestellungen", role: "eBay-Orders kontrolliert bearbeiten" },
    { id: "invoiceTab", label: "Rechnungen", role: "Rechnungen und Belege verwalten" },
    { id: "automationTab", label: "Versand", role: "Versand und Tracking verwalten" },
    { id: "returnsTab", label: "Retouren", role: "Rückgaben und Verluste dokumentieren" },
    { id: "settingsTab", label: "Einstellungen", role: "eBay, Company OS, Sicherheit und Backups" },
  ];

  const INACTIVE_MODULES = [
    { id: "productSearchTab", label: "Produktbeschaffung", reason: "Aufgabe von Elyon Nova und Company OS" },
    { id: "productAnalysisTab", label: "Produktanalyse", reason: "Aufgabe der Company-OS-Produktprüfung" },
    { id: "marketCheckTab", label: "Marktcheck", reason: "Nur als eingebettetes Hilfswerkzeug verwenden" },
    { id: "financeTab", label: "Vorab-Kalkulation", reason: "Verbindliche Kalkulation kommt aus Company OS" },
    { id: "listingCheckTab", label: "Zweiter Listing-Check", reason: "Listing-Paket wird in Company OS abgeschlossen" },
    { id: "productStatusTab", label: "Doppelter Produktstatus", reason: "Product Master ist die einzige Seller-Wahrheit" },
    { id: "virtualAgentsTab", label: "Virtuelle Mitarbeiter", reason: "Erst nach echten Verkäufen weiterführen" },
    { id: "trackingTab", label: "Gewinner-Tracking Labor", reason: "Später in Auswertung integrieren" },
    { id: "budgetTab", label: "Testbudget Labor", reason: "Aktuell nicht Teil des Seller-Betriebs" },
    { id: "priceTab", label: "Zielpreis Labor", reason: "Company OS liefert finale Kostenrechnung" },
    { id: "legalTab", label: "Zweiter Rechtscheck", reason: "Company OS prüft vor der Übergabe" },
    { id: "warningTab", label: "Doppeltes Warnsystem", reason: "Company OS liefert Prüfstatus und Blocker" },
    { id: "shopifyTab", label: "Shopify Lab", reason: "eBay-Start hat Vorrang" },
  ];

  const LOCAL_KEY = "elyonProducts";
  const SELECTED_KEY = "elyonSelectedSellerProductId";
  const STYLE_ID = "elyonSellerRolePolicyStyles";
  const BANNER_ID = "elyonSellerRoleBanner";

  const text = (value) => String(value ?? "").trim();
  const escapeHtml = (value) => text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .elyon-role-hidden{display:none!important}
      #${BANNER_ID}{margin:0 0 18px;padding:16px 18px;border-radius:20px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.24)}
      #${BANNER_ID} strong{display:block;color:#bbf7d0;font-size:15px;margin-bottom:5px}
      #${BANNER_ID} p{margin:0;color:#cbd5e1;font-size:12px;line-height:1.5}
      .elyon-listing-package-shell{display:grid;gap:16px}
      .elyon-listing-package-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}
      .elyon-listing-package-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(300px,.8fr);gap:16px}
      .elyon-listing-package-box{padding:16px;border-radius:18px;background:rgba(2,6,23,.36);border:1px solid rgba(148,163,184,.14)}
      .elyon-listing-package-box h3{margin:0 0 10px;color:#bfdbfe}
      .elyon-package-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .elyon-package-actions button{padding:9px 11px;font-size:12px;border-radius:12px}
      .elyon-package-blockers{display:grid;gap:7px;margin-top:10px}
      .elyon-package-blocker{padding:8px 10px;border-radius:11px;background:rgba(239,68,68,.09);border:1px solid rgba(239,68,68,.22);color:#fecaca;font-size:12px}
      .elyon-package-ready{padding:10px 12px;border-radius:13px;background:rgba(34,197,94,.09);border:1px solid rgba(34,197,94,.24);color:#bbf7d0;font-size:12px}
      .elyon-package-pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;color:#e2e8f0;font-size:13px;line-height:1.55}
      @media(max-width:900px){.elyon-listing-package-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function hideNode(node) {
    if (!node) return;
    node.classList.add("elyon-role-hidden");
    node.hidden = true;
    node.setAttribute("aria-hidden", "true");
  }

  function hideInactiveTabs() {
    INACTIVE_MODULES.forEach((module) => hideNode(document.getElementById(module.id)));
    hideNode(document.getElementById("shopifyMenu"));
    hideNode(document.getElementById("importBtn"));
    hideNode(document.getElementById("csvImport"));
    hideNode(document.getElementById("clearBtn"));
    hideNode(document.getElementById("launcherNewProduct"));
    hideNode(document.getElementById("newProductBtn"));
    hideNode(document.getElementById("browserImportsRefreshBtn"));
    hideNode(document.getElementById("browserImportsOpenBtn"));

    const browserBadge = document.getElementById("browserImportsBadge");
    if (browserBadge) hideNode(browserBadge.closest(".card,section"));

    const headings = [...document.querySelectorAll("h1,h2,h3")];
    for (const heading of headings) {
      if (/Google Sheets Sync/i.test(text(heading.textContent))) hideNode(heading.closest(".card,section"));
      if (/Shopify/i.test(text(heading.textContent)) && !heading.closest("#returnsTab")) hideNode(heading.closest(".card,section"));
    }

    const duplicateSalesButtons = [...document.querySelectorAll("#syncSalesGoogleSheetsBtn")];
    duplicateSalesButtons.slice(1).forEach(hideNode);
  }

  function rebuildMainMenu() {
    const menu = document.getElementById("mainMenu");
    if (!menu) return;
    const selected = ACTIVE_MODULES.some((item) => item.id === menu.value) ? menu.value : "dashboardTab";
    menu.innerHTML = ACTIVE_MODULES.map((item, index) => `<option value="${item.id}">${index + 1}. ${escapeHtml(item.label)}</option>`).join("");
    menu.value = selected;
    menu.setAttribute("aria-label", "Aktiver Seller-Workflow");
  }

  function installRoleBanner() {
    const dashboard = document.getElementById("dashboardTab");
    if (!dashboard || document.getElementById(BANNER_ID)) return;
    const banner = document.createElement("section");
    banner.id = BANNER_ID;
    banner.innerHTML = `
      <strong>Seller Tool = Betrieb nach der Company-OS-Freigabe</strong>
      <p>Nova sammelt. Company OS prüft und erstellt das Listing-Paket. Das Seller Tool übernimmt freigegebene Produkte, manuelle eBay-Dokumentation, Bestellungen, Versand, Rechnungen und Retouren.</p>
    `;
    dashboard.insertBefore(banner, dashboard.firstChild);
  }

  function readWorkingProducts() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function productKey(product) {
    const server = product?.rawServerProduct || product?.raw || product || {};
    return text(
      localStorage.getItem(SELECTED_KEY) ||
      product?.sellerToolMasterProductId ||
      server.id ||
      server.companyOsProductId ||
      product?.id
    );
  }

  function selectedProduct() {
    const list = readWorkingProducts();
    const selectedId = text(localStorage.getItem(SELECTED_KEY));
    if (!selectedId) return list[0] || null;
    return list.find((item) => {
      const server = item?.rawServerProduct || item?.raw || item || {};
      return [item?.id, item?.sellerToolMasterProductId, server.id, server.companyOsProductId]
        .map(text)
        .includes(selectedId);
    }) || list[0] || null;
  }

  function serverProduct(product) {
    return product?.rawServerProduct || product?.raw || product || {};
  }

  function normalizeListingView(product) {
    const server = serverProduct(product);
    const listing = server.listing || {};
    const pricing = server.pricing || {};
    const logistics = server.logistics || {};
    const readiness = server.readiness || {};
    return {
      id: text(server.id || product?.sellerToolMasterProductId || product?.id),
      title: text(server.title || product?.title || product?.name) || "Unbenanntes Produkt",
      listingTitle: text(listing.title || server.listingTitle || server.title || product?.title || product?.name),
      description: text(listing.descriptionHtml || server.listingDescription || server.description || product?.description),
      itemSpecifics: listing.itemSpecifics && typeof listing.itemSpecifics === "object" ? listing.itemSpecifics : {},
      conditionId: text(listing.conditionId || server.conditionId),
      price: Number(pricing.salePrice ?? product?.salePrice ?? product?.sell ?? 0),
      deliveryTime: text(logistics.deliveryTime || logistics.shippingInfo || server.deliveryTime),
      returnAddress: text(logistics.returnAddress || server.returnAddress),
      images: Array.isArray(server.images) ? server.images : Array.isArray(product?.images) ? product.images : [],
      readinessState: text(readiness.state || "not_ready"),
      readinessScore: Number(readiness.score || 0),
      blockers: Array.isArray(readiness.blockers) ? readiness.blockers : [],
      ebayItemId: text(listing.ebayItemId || server.ebayItemId || product?.ebayItemId),
      listingStatus: text(listing.status || server.listingStatus || product?.status || "draft"),
      server,
    };
  }

  async function copyText(value, statusNode, label) {
    try {
      await navigator.clipboard.writeText(text(value));
      if (statusNode) statusNode.textContent = `${label} kopiert.`;
    } catch {
      if (statusNode) statusNode.textContent = `${label} konnte nicht kopiert werden.`;
    }
  }

  async function saveListingMeta(view, itemId, status, statusNode) {
    if (!view?.id) return;
    const list = readWorkingProducts();
    const next = list.map((item) => {
      const itemServer = serverProduct(item);
      const ids = [item?.id, item?.sellerToolMasterProductId, itemServer.id, itemServer.companyOsProductId].map(text);
      if (!ids.includes(view.id)) return item;
      return {
        ...item,
        ebayItemId: itemId,
        status,
        rawServerProduct: {
          ...itemServer,
          ebayItemId: itemId,
          listingStatus: status,
          listing: { ...(itemServer.listing || {}), ebayItemId: itemId, status },
          updatedAt: new Date().toISOString(),
        },
      };
    });
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next));

    try {
      const response = await fetch("/api/products", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          product: {
            ...view.server,
            ebayItemId: itemId,
            listingStatus: status,
            listing: { ...(view.server.listing || {}), ebayItemId: itemId, status },
            updatedAt: new Date().toISOString(),
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${response.status}`);
      statusNode.textContent = "Seller-Status und eBay-Artikelnummer wurden gespeichert. Es wurde kein eBay-Angebot veröffentlicht.";
      renderListingPackage();
    } catch (error) {
      statusNode.textContent = `Lokal gespeichert, Serveraktualisierung fehlgeschlagen: ${error.message}`;
    }
  }

  function renderListingPackage() {
    const tab = document.getElementById("ebayListingTab");
    if (!tab) return;
    const product = selectedProduct();
    if (!product) {
      tab.innerHTML = `
        <div class="card"><h2>Listing-Paket / eBay-Freigabe</h2><div class="empty">Noch keine Arbeitskopie ausgewählt. Öffne „Produkte“ und übernimm ein freigegebenes Company-OS-Produkt.</div></div>
      `;
      return;
    }

    const view = normalizeListingView(product);
    const ready = view.readinessState === "ready_for_manual_listing" && view.blockers.length === 0;
    const specifics = JSON.stringify(view.itemSpecifics, null, 2);
    const packageText = [
      `Produkt: ${view.title}`,
      `eBay-Titel: ${view.listingTitle}`,
      `Preis: ${Number.isFinite(view.price) ? view.price.toLocaleString("de-DE", { style: "currency", currency: "EUR" }) : "offen"}`,
      `Condition ID: ${view.conditionId || "offen"}`,
      `Lieferzeit: ${view.deliveryTime || "offen"}`,
      `Rücksendeadresse: ${view.returnAddress || "offen"}`,
      `Artikelmerkmale: ${specifics}`,
      `Beschreibung:\n${view.description}`,
    ].join("\n\n");

    tab.innerHTML = `
      <section class="elyon-listing-package-shell">
        <div class="card">
          <div class="elyon-listing-package-head">
            <div><div class="badge">Company OS → Seller Tool</div><h2>Listing-Paket / eBay-Freigabe</h2><p class="hint">Keine erneute Produktprüfung und keine automatische Veröffentlichung. Hier kontrollierst und dokumentierst du das manuelle eBay-Listing.</p></div>
            <span class="status ${ready ? "good" : "bad"}">${ready ? "Bereit zum manuellen Einstellen" : "Noch blockiert"}</span>
          </div>
          ${ready ? '<div class="elyon-package-ready">Das Seller Tool erkennt keine offenen Übergabeblocker. Prüfe das Paket trotzdem bewusst vor dem manuellen eBay-Listing.</div>' : `<div class="elyon-package-blockers">${view.blockers.map((item) => `<div class="elyon-package-blocker">${escapeHtml(item)}</div>`).join("") || '<div class="elyon-package-blocker">Readiness-Status ist noch nicht freigegeben.</div>'}</div>`}
        </div>
        <div class="elyon-listing-package-grid">
          <div class="card">
            <div class="elyon-listing-package-box"><h3>eBay-Titel</h3><div class="elyon-package-pre">${escapeHtml(view.listingTitle)}</div><div class="elyon-package-actions"><button type="button" data-package-copy="title">Titel kopieren</button></div></div>
            <div class="elyon-listing-package-box" style="margin-top:14px"><h3>Beschreibung</h3><div class="elyon-package-pre">${escapeHtml(view.description)}</div><div class="elyon-package-actions"><button type="button" data-package-copy="description">Beschreibung kopieren</button></div></div>
          </div>
          <div class="card">
            <div class="elyon-listing-package-box"><h3>Paketdaten</h3><p class="hint">Preis: ${escapeHtml(view.price.toLocaleString("de-DE", { style: "currency", currency: "EUR" }))}<br>Condition ID: ${escapeHtml(view.conditionId || "offen")}<br>Lieferzeit: ${escapeHtml(view.deliveryTime || "offen")}<br>Rücksendeadresse: ${escapeHtml(view.returnAddress || "offen")}<br>Bilder: ${view.images.length}<br>Readiness: ${escapeHtml(view.readinessState)} (${view.readinessScore} %)</p><div class="elyon-package-actions"><button type="button" class="secondary" data-package-copy="all">Gesamtes Paket kopieren</button></div></div>
            <div class="elyon-listing-package-box" style="margin-top:14px"><h3>Artikelmerkmale</h3><pre class="elyon-package-pre">${escapeHtml(specifics)}</pre></div>
            <div class="elyon-listing-package-box" style="margin-top:14px"><h3>Manuelles eBay-Listing dokumentieren</h3><label>eBay-Artikelnummer</label><input id="sellerListingItemId" value="${escapeHtml(view.ebayItemId)}" placeholder="Nach dem manuellen Einstellen eintragen"><label>Status</label><select id="sellerListingStatus"><option value="draft">Entwurf</option><option value="manually_listed">Manuell eingestellt</option><option value="live">Live</option><option value="ended">Beendet</option></select><button type="button" id="sellerListingSaveBtn" class="full">Intern speichern</button><p class="hint" id="sellerListingSaveStatus">Keine Live-Aktion. Diese Schaltfläche speichert nur den internen Seller-Status.</p></div>
          </div>
        </div>
      </section>
    `;

    const statusSelect = document.getElementById("sellerListingStatus");
    if (statusSelect) statusSelect.value = ["draft", "manually_listed", "live", "ended"].includes(view.listingStatus) ? view.listingStatus : "draft";
    const saveStatus = document.getElementById("sellerListingSaveStatus");
    tab.querySelector('[data-package-copy="title"]')?.addEventListener("click", () => copyText(view.listingTitle, saveStatus, "Titel"));
    tab.querySelector('[data-package-copy="description"]')?.addEventListener("click", () => copyText(view.description, saveStatus, "Beschreibung"));
    tab.querySelector('[data-package-copy="all"]')?.addEventListener("click", () => copyText(packageText, saveStatus, "Listing-Paket"));
    document.getElementById("sellerListingSaveBtn")?.addEventListener("click", () => {
      const itemId = text(document.getElementById("sellerListingItemId")?.value);
      const status = text(statusSelect?.value || "draft");
      saveListingMeta(view, itemId, status, saveStatus);
    });
  }

  function renameLaunchers() {
    const generator = document.getElementById("launcherGenerator");
    if (generator) {
      const strong = generator.querySelector("strong");
      const small = generator.querySelector("small");
      if (strong) strong.textContent = "📋 Listing-Paket prüfen";
      if (small) small.textContent = "Company-OS-Paket kontrollieren und kopieren";
    }
    const board = document.getElementById("launcherBoard");
    if (board) {
      const strong = board.querySelector("strong");
      const small = board.querySelector("small");
      if (strong) strong.textContent = "📦 Seller-Produkte öffnen";
      if (small) small.textContent = "Company-OS-Eingang und Arbeitskopien";
    }
  }

  function apply() {
    installStyles();
    hideInactiveTabs();
    rebuildMainMenu();
    installRoleBanner();
    renameLaunchers();
    renderListingPackage();
  }

  window.ElyonSellerModules = {
    active: ACTIVE_MODULES,
    inactive: INACTIVE_MODULES,
    sourceOfTruth: "server_product_master",
    upstream: "Elyon Company OS",
    automaticListing: false,
    automaticOrder: false,
  };
  window.ElyonSellerRolePolicy = { apply, renderListingPackage };
  window.addEventListener("elyon:seller-product-selected", renderListingPackage);
  window.addEventListener("storage", (event) => {
    if ([LOCAL_KEY, SELECTED_KEY].includes(event.key)) renderListingPackage();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply, { once: true });
  else apply();
  window.setTimeout(apply, 500);
  window.setTimeout(apply, 1600);
})();
