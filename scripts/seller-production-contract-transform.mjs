const ACTIVE_MODULES_PATTERN = /  const ACTIVE_MODULES = \[[\s\S]*?\n  \];/;
const LEGACY_FINANCE_INACTIVE_PATTERN = /\n    \{ id: "financeTab", label: "Vorab-Kalkulation"[^\n]*\},/;
const TEAM_RENDER_MARKER = '      window.ElyonAIWorkforceTeamV6?.render?.();';
const COMPANY_ACTIVATION = '      window.ElyonAIWorkforceCompanyEntry?.showCompany?.();';

const PRODUCTION_ACTIVE_MODULES = `  const ACTIVE_MODULES = [
    { id: "dashboardTab", label: "Übersicht", role: "Post-eBay Seller-Betrieb und nächste Aufgaben" },
    { id: "draftsTab", label: "eBay-Entwürfe", role: "Echte UNPUBLISHED-Angebote aus dem eBay-Verkäuferkonto" },
    { id: "activeListingsTab", label: "Aktive Listings", role: "Echte PUBLISHED-Angebote aus dem eBay-Verkäuferkonto" },
    { id: "ordersTab", label: "Bestellungen", role: "eBay-Orders kontrolliert bearbeiten" },
    { id: "financeTab", label: "Finanzen", role: "Umsatz, Kosten, Rechnungen, Auszahlungen und tatsächlichen Gewinn verwalten" },
    { id: "automationTab", label: "Versand", role: "Versand und Tracking verwalten" },
    { id: "returnsTab", label: "Retouren", role: "Rückgaben und Verluste dokumentieren" },
    { id: "settingsTab", label: "Einstellungen", role: "eBay, Product Master, Sicherheit und Backups" },
    { id: "virtualAgentsTab", label: "Virtuelle Mitarbeiter", role: "Operative KI-Agenten, Aufgaben und Freigaben verwalten" },
    { id: "jarvisCommandCenterTab", label: "◉ JARVIS / Brain Control", role: "Jarvis überwacht, koordiniert und verwaltet Freigaben" },
    { id: "jarvisIntegrationCenterTab", label: "Jarvis Integration Center", role: "KI-Modelle, APIs, Routing, Kosten und Logs verwalten" },
  ];`;

export function alignSellerProductionNavigation(source) {
  const input = String(source || "");
  if (!ACTIVE_MODULES_PATTERN.test(input)) {
    throw new Error("Seller production navigation transform failed: ACTIVE_MODULES block not found.");
  }

  const output = input
    .replace(ACTIVE_MODULES_PATTERN, PRODUCTION_ACTIVE_MODULES)
    .replace(LEGACY_FINANCE_INACTIVE_PATTERN, "");

  if (/const ACTIVE_MODULES = \[[\s\S]*?id: "productListTab"/.test(output)) {
    throw new Error("Seller production navigation transform failed: legacy productListTab stayed active.");
  }
  if (/const ACTIVE_MODULES = \[[\s\S]*?id: "ebayListingTab"/.test(output)) {
    throw new Error("Seller production navigation transform failed: legacy ebayListingTab stayed active.");
  }
  return output;
}

export function ensureVirtualEmployeesCompanyActivation(source) {
  const input = String(source || "");
  if (input.includes(COMPANY_ACTIVATION)) return input;
  if (!input.includes(TEAM_RENDER_MARKER)) {
    throw new Error("Seller production runtime transform failed: Team V6 activation marker not found.");
  }
  return input.replace(TEAM_RENDER_MARKER, `${TEAM_RENDER_MARKER}\n${COMPANY_ACTIVATION}`);
}
