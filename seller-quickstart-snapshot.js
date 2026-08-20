import { text } from "./seller-quickstart-core.js";

const DASHBOARD_ID = "elyonSellerDashboard";
const RETIRED_PRE_EBAY_TABS = new Set(["productListTab", "ebayListingTab"]);

function countFromText(value) {
  const normalized = text(value).replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function emptyDashboardSnapshot() {
  return {
    ready: false,
    loading: false,
    badges: [],
    kpis: [],
    tasks: [],
    pipeline: { draftListings: 0, activeListings: 0, openOrders: 0, fulfilledOrders: 0 },
    updatedLabel: "noch nicht geladen",
  };
}

export function dashboardSnapshotFromDocument(documentRef) {
  const root = documentRef?.getElementById?.(DASHBOARD_ID) || null;
  if (!root) return emptyDashboardSnapshot();

  const badges = [...root.querySelectorAll(".sd-badge")].map((node) => text(node.textContent)).filter(Boolean);
  const kpis = [...root.querySelectorAll(".sd-kpi")]
    .filter((node) => !/^Listingbereit$/i.test(text(node.querySelector("small")?.textContent)))
    .map((node) => ({
      label: text(node.querySelector("small")?.textContent),
      value: text(node.querySelector("strong")?.textContent),
      detail: text(node.querySelector("span")?.textContent),
    }));
  const tasks = [...root.querySelectorAll(".sd-task")].map((node) => ({
    title: text(node.querySelector("strong")?.textContent),
    detail: text(node.querySelector("p")?.textContent),
    tab: text(node.querySelector("[data-sd-tab]")?.dataset?.sdTab),
    tone: ["danger", "warning", "success", "neutral", "info"].find((tone) => node.classList.contains(tone)) || "info",
  })).filter((task) => task.title && !RETIRED_PRE_EBAY_TABS.has(task.tab));
  const steps = [...root.querySelectorAll(".sd-pipeline .sd-step")].map((node) => ({
    label: text(node.querySelector("span")?.textContent).toLowerCase(),
    value: countFromText(node.querySelector("strong")?.textContent),
  }));
  const stepValue = (needle) => steps.find((step) => step.label.includes(needle))?.value || 0;
  const updatedBadge = badges.find((badge) => badge.toLowerCase().startsWith("aktualisiert"));

  return {
    ready: kpis.length > 0,
    loading: /lädt/i.test(text(root.querySelector("#sdRefresh")?.textContent)),
    badges,
    kpis,
    tasks,
    pipeline: {
      draftListings: stepValue("ebay unpublished"),
      activeListings: stepValue("ebay published"),
      openOrders: stepValue("orders offen"),
      fulfilledOrders: stepValue("abgeschlossen"),
    },
    updatedLabel: updatedBadge ? updatedBadge.replace(/^Aktualisiert\s*/i, "") : "noch nicht geladen",
  };
}
