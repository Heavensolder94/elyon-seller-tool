import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  transformSellerDashboard,
  transformSellerRuntimeLoader,
} from "./seller-listing-parity-transform.mjs";
import { optimizeCompanyEntryRuntime } from "./workforce-company-entry-runtime-optimization.mjs";
import { stabilizeWorkforceCockpitMount } from "./workforce-cockpit-mount-transform.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const publicRoot = path.join(appRoot, "public");
const SELLER_OS_VERSION = "20260823-workforce-cockpit-4";
const WORKFORCE_ASSET_VERSION = "workforce-cockpit-20260823-2";

const sourcePolishPath = path.join(appRoot, "elyon-preview-polish.css");
const sourceOrgchartPath = path.join(appRoot, "seller-ai-workforce-orgchart-v1.js");
const sourceCompanyEntryPath = path.join(appRoot, "seller-ai-workforce-company-entry-preview.js");
const sourceTaskCenterPath = path.join(appRoot, "seller-ai-task-center-live.js");

const outputPolishPath = path.join(publicRoot, "elyon-seller-os-polish.css");
const outputOrgchartPath = path.join(publicRoot, "seller-ai-workforce-orgchart-v1.js");
const outputCompanyEntryPath = path.join(publicRoot, "seller-ai-workforce-company-entry.js");
const outputTaskCenterPath = path.join(publicRoot, "seller-ai-task-center-live.js");
const runtimeLoaderPath = path.join(publicRoot, "seller-runtime-loader.js");
const dashboardPath = path.join(publicRoot, "seller-dashboard-v2.js");
const outputHtmlPath = path.join(publicRoot, "index.html");

const [polishSource, orgchartSource, companyEntrySource, taskCenterSource, runtimeLoaderSource, dashboardSource, htmlSource] = await Promise.all([
  readFile(sourcePolishPath, "utf8"),
  readFile(sourceOrgchartPath, "utf8"),
  readFile(sourceCompanyEntryPath, "utf8"),
  readFile(sourceTaskCenterPath, "utf8"),
  readFile(runtimeLoaderPath, "utf8"),
  readFile(dashboardPath, "utf8"),
  readFile(outputHtmlPath, "utf8"),
]);

const productionPolish = polishSource
  .replace("Preview-only finishing pass.", "Production visual finishing pass.");
const productionOrgchart = stabilizeWorkforceCockpitMount(orgchartSource);
const productionCompanyEntry = optimizeCompanyEntryRuntime(companyEntrySource)
  .replaceAll("elyonCompanyEntryPreviewStyles", "elyonCompanyEntryStyles")
  .replaceAll("ElyonAIWorkforceCompanyEntryPreview", "ElyonAIWorkforceCompanyEntry");

const teamMarker = '      { src: "/seller-ai-workforce-team-v6.js" },';
if (!runtimeLoaderSource.includes(teamMarker)) {
  throw new Error("Seller OS finalization failed: Team V6 runtime marker not found.");
}

const runtimeWithoutSellerOs = runtimeLoaderSource
  .replace(/\n\s*\{ src: "\/seller-ai-workforce-orgchart-v1\.js" \},/g, "")
  .replace(/\n\s*\{ src: "\/seller-ai-workforce-company-entry\.js" \},/g, "");
const runtimeWithSellerOs = runtimeWithoutSellerOs.replace(teamMarker, [
  teamMarker,
  '      { src: "/seller-ai-workforce-orgchart-v1.js" },',
  '      { src: "/seller-ai-workforce-company-entry.js" },',
].join("\n"));
const productionRuntimeLoader = transformSellerRuntimeLoader(runtimeWithSellerOs)
  .replace(/const VERSION = "[^"]+";/, `const VERSION = "${WORKFORCE_ASSET_VERSION}";`);
const productionDashboard = transformSellerDashboard(dashboardSource);

if (!htmlSource.includes("</head>")) {
  throw new Error("Seller OS finalization failed: </head> not found in public/index.html.");
}

const sellerOsAssets = [
  `<link rel="stylesheet" href="/elyon-clean.css?v=${SELLER_OS_VERSION}" data-elyon-seller-os-design="true" />`,
  `<link rel="stylesheet" href="/elyon-seller-os-polish.css?v=${SELLER_OS_VERSION}" data-elyon-seller-os-polish="true" />`,
  `<script defer src="/seller-ai-task-center-live.js?v=${SELLER_OS_VERSION}" data-elyon-task-center-live="true"></script>`,
].join("\n");

const cleanedHtml = htmlSource
  .replace(/<script defer src="\/seller-runtime-loader\.js(?:\?v=[^"]*)?"><\/script>/, `<script defer src="/seller-runtime-loader.js?v=${SELLER_OS_VERSION}"></script>`)
  .replace(/\s*<link[^>]+data-elyon-seller-os-design=["']true["'][^>]*>\s*/gi, "\n")
  .replace(/\s*<link[^>]+data-elyon-seller-os-polish=["']true["'][^>]*>\s*/gi, "\n")
  .replace(/\s*<script[^>]+data-elyon-task-center-live=["']true["'][^>]*><\/script>\s*/gi, "\n")
  .replace(/\s*<link[^>]+data-elyon-preview-design=["']true["'][^>]*>\s*/gi, "\n")
  .replace(/\s*<link[^>]+data-elyon-preview-polish=["']true["'][^>]*>\s*/gi, "\n")
  .replace(/\s*<script[^>]+data-elyon-preview-orgchart=["']true["'][^>]*><\/script>\s*/gi, "\n")
  .replace(/\s*<script[^>]+data-elyon-preview-company-entry=["']true["'][^>]*><\/script>\s*/gi, "\n");
const productionHtml = cleanedHtml.replace("</head>", `  ${sellerOsAssets}\n</head>`);

await Promise.all([
  writeFile(outputPolishPath, productionPolish, "utf8"),
  writeFile(outputOrgchartPath, productionOrgchart, "utf8"),
  writeFile(outputCompanyEntryPath, productionCompanyEntry, "utf8"),
  writeFile(outputTaskCenterPath, taskCenterSource, "utf8"),
  writeFile(runtimeLoaderPath, productionRuntimeLoader, "utf8"),
  writeFile(dashboardPath, productionDashboard, "utf8"),
  writeFile(outputHtmlPath, productionHtml, "utf8"),
]);

console.log(`Finalized production Seller OS ${SELLER_OS_VERSION} with Seller Hub listing parity safeguards and stable workforce cockpit mount.`);
