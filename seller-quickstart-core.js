export const QUICKSTART_PRIMARY_WORKFLOW = Object.freeze([
  Object.freeze({ id: "drafts", step: 1, icon: "📝", label: "eBay-Entwürfe", description: "Direkt von eBay: UNPUBLISHED-Angebote prüfen und überwachen.", tab: "draftsTab", runtimeGroup: "draftsTab", anchor: "draftsTab" }),
  Object.freeze({ id: "activeListings", step: 2, icon: "🟢", label: "Aktive Listings", description: "Direkt von eBay: veröffentlichte Angebote und ihren Status überwachen.", tab: "activeListingsTab", runtimeGroup: "activeListingsTab", anchor: "activeListingsTab" }),
  Object.freeze({ id: "orders", step: 3, icon: "📥", label: "Bestellungen", description: "Echte eBay-Bestellungen und offene Bearbeitungsschritte öffnen.", tab: "ordersTab" }),
  Object.freeze({ id: "shipping", step: 4, icon: "🚚", label: "Versand", description: "Versandstatus, Tracking und offene Fulfillment-Fälle bearbeiten.", tab: "automationTab" }),
  Object.freeze({ id: "finance", step: 5, icon: "💶", label: "Finanzen", description: "Umsatz, Kosten, Auszahlungen, Rechnungen und tatsächlichen Gewinn auswerten.", tab: "financeTab", runtimeGroup: "financeTab", anchor: "financeTab" }),
  Object.freeze({ id: "returns", step: 6, icon: "↩️", label: "Retouren", description: "Rückgaben, Erstattungen und Problemfälle bearbeiten.", tab: "returnsTab", anchor: "returnsTab" }),
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
    draftsTab: "drafts",
    activeListingsTab: "activeListings",
    ordersTab: "orders",
    automationTab: "shipping",
    financeTab: "finance",
    invoiceTab: "finance",
    returnsTab: "returns",
    jarvisCommandCenterTab: "jarvis",
    virtualAgentsTab: "agents",
    settingsTab: "settings",
    // Legacy preparation routes are intentionally redirected into the live eBay view.
    productListTab: "activeListings",
    ebayListingTab: "activeListings",
  };
  return map[text(tabId)] || "activeListings";
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
  const visibleTasks = Array.isArray(tasks)
    ? tasks.filter((task) => !["productListTab", "ebayListingTab"].includes(text(task?.tab)))
    : [];
  const firstTask = visibleTasks.find((task) => text(task?.title)) || null;
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
    return { routeId: "orders", eyebrow: "Tagesgeschäft", title: `${pipeline.openOrders} offene Bestellung${Number(pipeline.openOrders) === 1 ? "" : "en"}`, detail: "Bearbeitungsstatus, Lieferantenbestellung und Versand prüfen.", tone: "warning" };
  }
  if (Number(pipeline.draftListings) > 0) {
    return { routeId: "drafts", eyebrow: "eBay", title: `${pipeline.draftListings} eBay-Entwurf${Number(pipeline.draftListings) === 1 ? "" : "e"}`, detail: "UNPUBLISHED-Angebote direkt bei eBay prüfen.", tone: "info" };
  }
  if (Number(pipeline.activeListings) > 0) {
    return { routeId: "activeListings", eyebrow: "eBay", title: `${pipeline.activeListings} aktive${Number(pipeline.activeListings) === 1 ? "s" : ""} Listing${Number(pipeline.activeListings) === 1 ? "" : "s"}`, detail: "Veröffentlichte eBay-Angebote überwachen.", tone: "success" };
  }
  return { routeId: "activeListings", eyebrow: "Seller-Betrieb", title: "eBay-Bestand prüfen", detail: "Öffne die aktiven Listings oder eBay-Entwürfe. Die Listing-Erstellung findet im Company OS statt.", tone: "info" };
}
