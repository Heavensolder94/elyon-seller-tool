import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  QUICKSTART_PRIMARY_WORKFLOW,
  QUICKSTART_SECONDARY_LINKS,
  createSharedRefresh,
  selectQuickstartRecommendation,
  shouldRequestDashboardRefresh,
} from "../seller-quickstart-core.js";

const expectedWorkflow = [
  "Company OS Eingang",
  "Seller Product Master",
  "Listing-Paket",
  "eBay",
  "Bestellungen",
  "Versand",
  "Rechnungen",
  "Retouren",
];

test("uses the current Seller workflow in the required order", () => {
  assert.deepEqual(QUICKSTART_PRIMARY_WORKFLOW.map((route) => route.label), expectedWorkflow);
  assert.deepEqual(QUICKSTART_PRIMARY_WORKFLOW.map((route) => route.step), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("offers virtual employees and system/API settings as secondary areas", () => {
  assert.deepEqual(QUICKSTART_SECONDARY_LINKS.map((route) => route.label), [
    "Virtuelle Mitarbeiter",
    "System- & API-Einstellungen",
  ]);
});

test("does not advertise retired Shopify, calculation or laboratory areas", () => {
  const visibleCopy = [...QUICKSTART_PRIMARY_WORKFLOW, ...QUICKSTART_SECONDARY_LINKS]
    .flatMap((route) => [route.label, route.description])
    .join(" ");
  assert.doesNotMatch(visibleCopy, /Shopify|Kalkulation|Labor|Produktprüfung|Marktcheck/i);
});

test("maps dashboard tasks to the modern workflow", () => {
  assert.equal(selectQuickstartRecommendation([
    { title: "2 Bestellungen offen", detail: "Versand prüfen", tab: "ordersTab", tone: "warning" },
  ]).routeId, "orders");
  assert.equal(selectQuickstartRecommendation([
    { title: "3 Produkte listingbereit", detail: "Paket prüfen", tab: "ebayListingTab", tone: "success" },
  ]).routeId, "listingPackage");
  assert.equal(selectQuickstartRecommendation([], { products: 0 }).routeId, "companyOs");
});

test("refreshes only on an explicit menu opening with a ready, idle dashboard", () => {
  assert.equal(shouldRequestDashboardRefresh({ manual: false, ready: true, loading: false }), false);
  assert.equal(shouldRequestDashboardRefresh({ manual: true, ready: false, loading: false }), false);
  assert.equal(shouldRequestDashboardRefresh({ manual: true, ready: true, loading: true }), false);
  assert.equal(shouldRequestDashboardRefresh({ manual: true, ready: true, loading: false }), true);
});

test("deduplicates concurrent dashboard refresh requests", async () => {
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const refresh = createSharedRefresh(async () => { calls += 1; await pending; return "ok"; });
  const first = refresh();
  const second = refresh();
  assert.equal(first, second);
  assert.equal(calls, 0);
  await Promise.resolve();
  assert.equal(calls, 1);
  release();
  assert.equal(await first, "ok");
  assert.equal(await second, "ok");
});

test("quickstart contains no direct Product Master or eBay API request", async () => {
  const sources = await Promise.all(["core", "snapshot", "view", "menu"].map((name) => readFile(new URL(`../seller-quickstart-${name}.js`, import.meta.url), "utf8")));
  const source = sources.join("\n");
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /\/api\/products|\/api\/ebay\/status|\/api\/ebay\/orders/);
  assert.match(source, /installDashboardBridge/);
  assert.match(source, /elyonSellerDashboard/);
});

test("runtime loader keeps quickstart lazy and supports automatic visible-modal hydration", async () => {
  const source = await readFile(new URL("../seller-runtime-loader.js", import.meta.url), "utf8");
  assert.match(source, /quickstart:\s*\[/);
  assert.match(source, /seller-quickstart-menu\.js/);
  assert.match(source, /requestQuickstart\(false\)/);
  assert.doesNotMatch(source, /MutationObserver/);
  assert.doesNotMatch(source, /setInterval/);
});

test("production preparation mirrors quickstart without adding it to startup scripts", async () => {
  const source = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  const startupBlock = source.match(/function injectDesktopSecurity\(html\) \{([\s\S]*?)return injectMarkedBlock/)?.[1] || "";
  assert.match(source, /seller-quickstart-core\.js", "public\/seller-quickstart-core\.js/);
  assert.match(source, /seller-quickstart-menu\.js", "public\/seller-quickstart-menu\.js/);
  assert.doesNotMatch(startupBlock, /seller-quickstart-menu\.js/);
  assert.match(startupBlock, /seller-runtime-loader\.js/);
});
