export const QUICKSTART_PRIMARY_WORKFLOW = Object.freeze([
  Object.freeze({ id: "companyOs", step: 1, icon: "🏢", label: "Company OS Eingang", description: "Final freigegebene Company-OS-Produkte im Seller Tool übernehmen.", tab: "productListTab", runtimeGroup: "productListTab", anchor: "elyonApprovedCompanyOsInbox" }),
  Object.freeze({ id: "productMaster", step: 2, icon: "📦", label: "Seller Product Master", description: "Seller-Produkte, Readiness, Blocker und Arbeitskopien verwalten.", tab: "productListTab", runtimeGroup: "productListTab", anchor: "productListTab" }),
  Object.freeze({ id: "listingPackage", step: 3, icon: "🧾", label: "Listing-Paket", description: "Titel, Beschreibung, Artikelmerkmale und Pflichtfelder final prüfen.", tab: "ebayListingTab", runtimeGroup: "ebayListingTab", sellingPanel: "ready", anchor: "sellerReadyRoot" }),
  Object.freeze({ id: "ebay", step: 4, icon: "🛒", label: "eBay", description: "Manuelles eBay-Listing dokumentieren und Artikelnummer hinterlegen.", tab: "ebayListingTab", runtimeGroup: "ebayListingTab", sellingPanel: "ready", anchor: "sellerReadyItemId" }),
  Object.freeze({ id: "orders", step: 5, icon: "📥", label: "Bestellungen", description: "Echte eBay-Bestellungen und offene Bearbeitungsschritte öffnen.", tab: "ordersTab" }),
  Object.freeze({ id: "shipping", step: 6, icon: "🚚", label: "Versand", description: "Versandstatus, Tracking und offene Fulfillment-Fälle bearbeiten.", tab: "automationTab" }),
  Object.freeze({ id: "invoices", step: 7, icon: "🧮", label: "Rechnungen", description: "Rechnungsübersicht, Status und Exporte verwalten.", tab: "invoiceTab", anchor: "invoiceTab" }),
  Object.freeze({ id: "returns", step: 8, icon: "↩️", label: "Retouren", description: "Rückgaben, Erstattungen und Problemfälle bearbeiten.", tab: "returnsTab", anchor: "returnsTab" }),
]);

export const QUICKSTART_SECONDARY_LINKS = Object.freeze([
  Object.freeze({ id: "jarvis", icon: "◉", label: "JARVIS", description: "Übersicht, Brain, Integrationen, Modelle und Systemsteuerung öffnen.", tab: "jarvisCommandCenterTab" }),
  Object.freeze({ id: "agents", icon: "🧑‍💼", label: "Virtuelle Mitarbeiter", description: "KI-Agenten, Aufgaben und Freigaben öffnen.", tab: "virtualAgentsTab", runtimeGroup: "virtualAgentsTab" }),
  Object.freeze({ id: "settings", icon: "⚙️", label: "System- & API-Einstellungen", description: "eBay, Product Master, Integrationen und Systemstatus prüfen.", tab: "settingsTab", runtimeGroup: "settingsTab", anchor: "elyonSystemDataStatusSettings" }),
]);

export const QUICKSTART_ROUTES = Object.freeze([...QUICKSTART_PRIMARY_WORKFLOW, ...QUICKSTART_SECONDARY_LINKS]);

export const text = (value) => String(value ?? "").trim();
export const escapeHtml = (value) => text(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

export function routeById(id) {
  return QUICKSTART_ROUTES.find((route) => route.id === id) || null;
}

export function routeForTab(tabId) {
  const map = {
    productListTab: "productMaster",
    ebayListingTab: "listingPackage",
    ordersTab: "orders",
    automationTab: "shipping",
    invoiceTab: "invoices",
    returnsTab: "returns",
    jarvisCommandCenterTab: "jarvis",
    virtualAgentsTab: "agents",
    settingsTab: "settings",
  };
  return map[text(tabId)] || "productMaster";
}

export function shouldRequestDashboardRefresh({ manual = false, ready = false, loading = false } = {}) {
  return manual === true && ready === true && loading !== true;
}

export function createSharedRefresh(refresh) {
  let inFlight = null;
  return (...args) => {
    if (inFlight) return inFlight;
    inFlight = Promise.resolve().then(() => refresh(...args)).finally(() => { inFlight = null; });
    return inFlight;
  };
}

export function selectQuickstartRecommendation(tasks = [], pipeline = {}) {
  const firstTask = Array.isArray(tasks) ? tasks.find((task) => text(task?.title)) : null;
  if (firstTask) {
    return {
      routeId: routeForTab(firstTask.tab),
      eyebrow: "Nächster sinnvoller Schritt",
      title: text(firstTask.title),
      detail: text(firstTask.detail) || "Öffne den passenden Seller-Bereich und prüfe den nächsten Schritt.",
      tone: text(firstTask.tone) || "info",
    };
  }
  if (Number(pipeline.openOrders) > 0) {
    return { routeId: "orders", eyebrow: "Tagesgeschäft", title: `${pipeline.openOrders} offene Bestellung${Number(pipeline.openOrders) === 1 ? "" : "en"}`, detail: "Versand und Bearbeitungsstatus prüfen.", tone: "warning" };
  }
  if (Number(pipeline.readyProducts) > 0) {
    return { routeId: "listingPackage", eyebrow: "Listingbereit", title: `${pipeline.readyProducts} Produkt${Number(pipeline.readyProducts) === 1 ? " ist" : "e sind"} listingbereit`, detail: "Listing-Paket kontrollieren und anschließend bewusst manuell bei eBay einstellen.", tone: "success" };
  }
  if (Number(pipeline.products) > 0) {
    return { routeId: "productMaster", eyebrow: "Produktarbeit", title: "Product Master prüfen", detail: "Readiness, Blocker und Arbeitskopien kontrollieren.", tone: "info" };
  }
  return { routeId: "companyOs", eyebrow: "Erster Schritt", title: "Company-OS-Eingang öffnen", detail: "Übernimm ein final freigegebenes Produkt in den Seller Product Master.", tone: "info" };
}
