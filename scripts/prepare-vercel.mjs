import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { injectMarkedBlock } from "./html-injection.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const publicRoot = path.join(appRoot, "public");

await import("./check-layout.mjs");

const mobileModuleScripts = [
  "seller-auth.js",
  "mobile-live.js",
  "mobile-flags.js",
  "mobile-scanner-v2.js",
  "mobile-brain-v2.js",
  "mobile-push-v1.js",
  "mobile-agents-v1.js",
  "seller-ai-workforce-advanced-settings.js",
  "ai-workforce-client.js",
  "ai-workforce-mount-fix.js",
  "mobile-bootstrap.js",
  "mobile-more-ui.js",
  "mobile-selling-entry.js",
];

function injectMobileScripts(html) {
  const startMarker = "<!-- ELYON_MOBILE_MODULES -->";
  const endMarker = "<!-- /ELYON_MOBILE_MODULES -->";
  const version = Date.now();
  const content = [
    ...mobileModuleScripts.map((file) => `<script defer src="/${file}?v=${version}"></script>`),
    `<script type="module" src="/seller-category-engine.js?v=${version}"></script>`,
  ].join("\n");

  return injectMarkedBlock(html, { startMarker, endMarker, content });
}

function injectDesktopSecurity(html) {
  const startMarker = "<!-- ELYON_DESKTOP_SECURITY -->";
  const endMarker = "<!-- /ELYON_DESKTOP_SECURITY -->";
  const content = [
    '<script defer src="/seller-auth.js"></script>',
    '<script src="/seller-dashboard-compat.js"></script>',
    '<script defer src="/seller-selling-flow-capture.js"></script>',
    '<script defer src="/seller-role-policy.js"></script>',
    '<script defer src="/seller-virtual-agents-policy.js"></script>',
    '<script type="module" src="/seller-selling-flow.js"></script>',
    '<script defer src="/seller-selling-flow-event-guard.js"></script>',
    '<script type="module" src="/seller-listing-visual-designer.js"></script>',
    '<script type="module" src="/seller-auto-lister-parity.js"></script>',
    '<script type="module" src="/seller-category-engine.js"></script>',
    '<script defer src="/seller-selling-flow-resilience.js"></script>',
    '<script defer src="/seller-selling-flow-visibility-fix.js"></script>',
    '<script type="module" src="/seller-selling-flow-focused-ui.js"></script>',
    '<style>#elyonSellerSellingFlow.focused-selling-active > .card:first-of-type{display:none!important}</style>',
    '<script type="module" src="/seller-dashboard-v2.js"></script>',
    '<script defer src="/seller-system-status-settings.js"></script>',
    '<script defer src="/seller-settings-layout-experiment.js"></script>',
    '<script defer src="/seller-ai-settings-label.js"></script>',
    '<script defer src="/seller-ai-provider-model-guard.js"></script>',
    '<script defer src="/seller-ai-workforce-advanced-settings.js"></script>',
    '<script defer src="/ai-workforce-client.js"></script>',
    '<script defer src="/ai-workforce-mount-fix.js"></script>',
    '<script defer src="/seller-ebay-api-status.js"></script>',
    '<script defer src="/seller-company-os-inbox.js"></script>',
    '<script type="module" src="/seller-product-health-state.js"></script>',
    '<script defer src="/seller-product-board-accordion-foundation.js"></script>',
    '<script defer src="/seller-product-board-accordion-compat.js"></script>',
    '<script defer src="/seller-product-delete.js"></script>',
    '<script defer src="/seller-button-integrity.js"></script>',
  ].join("\n");

  return injectMarkedBlock(html, { startMarker, endMarker, content });
}

const filesToMirror = [
  ["elyon-clean.css", "public/elyon-clean.css"],
  ["elyon-ui.js", "public/elyon-ui.js"],
  ["seller-auth.js", "public/seller-auth.js"],
  ["seller-dashboard-compat.js", "public/seller-dashboard-compat.js"],
  ["seller-selling-flow-capture.js", "public/seller-selling-flow-capture.js"],
  ["seller-role-policy.js", "public/seller-role-policy.js"],
  ["seller-virtual-agents-policy.js", "public/seller-virtual-agents-policy.js"],
  ["seller-selling-flow-core.js", "public/seller-selling-flow-core.js"],
  ["seller-selling-flow.js", "public/seller-selling-flow.js"],
  ["seller-selling-flow-event-guard.js", "public/seller-selling-flow-event-guard.js"],
  ["seller-listing-visual-core.js", "public/seller-listing-visual-core.js"],
  ["seller-listing-visual-designer.js", "public/seller-listing-visual-designer.js"],
  ["seller-auto-lister-parity-core.js", "public/seller-auto-lister-parity-core.js"],
  ["seller-auto-lister-parity.js", "public/seller-auto-lister-parity.js"],
  ["seller-category-engine-core.js", "public/seller-category-engine-core.js"],
  ["seller-category-engine.js", "public/seller-category-engine.js"],
  ["seller-selling-flow-resilience.js", "public/seller-selling-flow-resilience.js"],
  ["seller-selling-flow-visibility-fix.js", "public/seller-selling-flow-visibility-fix.js"],
  ["seller-selling-flow-focused-ui.js", "public/seller-selling-flow-focused-ui.js"],
  ["seller-dashboard-v2.js", "public/seller-dashboard-v2.js"],
  ["seller-system-status-settings.js", "public/seller-system-status-settings.js"],
  ["seller-settings-layout-experiment.js", "public/seller-settings-layout-experiment.js"],
  ["seller-ai-settings-label.js", "public/seller-ai-settings-label.js"],
  ["seller-ai-provider-model-guard.js", "public/seller-ai-provider-model-guard.js"],
  ["seller-ai-workforce-advanced-settings.js", "public/seller-ai-workforce-advanced-settings.js"],
  ["ai-workforce-client.js", "public/ai-workforce-client.js"],
  ["ai-workforce-mount-fix.js", "public/ai-workforce-mount-fix.js"],
  ["seller-ebay-api-status.js", "public/seller-ebay-api-status.js"],
  ["seller-company-os-inbox.js", "public/seller-company-os-inbox.js"],
  ["seller-product-health-core.js", "public/seller-product-health-core.js"],
  ["seller-product-health-state.js", "public/seller-product-health-state.js"],
  ["seller-product-board-accordion-foundation.js", "public/seller-product-board-accordion-foundation.js"],
  ["seller-product-board-accordion-compat.js", "public/seller-product-board-accordion-compat.js"],
  ["seller-product-delete.js", "public/seller-product-delete.js"],
  ["seller-button-integrity.js", "public/seller-button-integrity.js"],
  ["elyon-soul.css", "public/elyon-soul.css"],
  ["elyon-soul.js", "public/elyon-soul.js"],
  ["mobile-live.js", "public/mobile-live.js"],
  ["mobile-flags.js", "public/mobile-flags.js"],
  ["mobile-scanner-v2.js", "public/mobile-scanner-v2.js"],
  ["mobile-brain-v2.js", "public/mobile-brain-v2.js"],
  ["mobile-push-v1.js", "public/mobile-push-v1.js"],
  ["mobile-agents-v1.js", "public/mobile-agents-v1.js"],
  ["mobile-bootstrap.js", "public/mobile-bootstrap.js"],
  ["mobile-more-ui.js", "public/mobile-more-ui.js"],
  ["mobile-selling-entry.js", "public/mobile-selling-entry.js"],
  ["manifest.json", "public/manifest.json"],
];

for (const [source, destination] of filesToMirror) {
  const sourcePath = path.join(appRoot, source);
  const destinationPath = path.join(publicRoot, path.relative("public", destination));
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
}

const desktopSourcePath = path.join(appRoot, "index.html");
const desktopDestinationPath = path.join(publicRoot, "index.html");
await mkdir(path.dirname(desktopDestinationPath), { recursive: true });
const desktopHtml = await readFile(desktopSourcePath, "utf8");
await writeFile(desktopDestinationPath, injectDesktopSecurity(desktopHtml), "utf8");

const mobileSourcePath = path.join(appRoot, "mobile.html");
const mobileDestinationPath = path.join(publicRoot, "mobile.html");
await mkdir(path.dirname(mobileDestinationPath), { recursive: true });
const mobileHtml = await readFile(mobileSourcePath, "utf8");
await writeFile(mobileDestinationPath, injectMobileScripts(mobileHtml), "utf8");

const envStatus = {
  GOOGLE_CLIENT_ID: Boolean(process.env.GOOGLE_CLIENT_ID),
  GOOGLE_CLIENT_SECRET: Boolean(process.env.GOOGLE_CLIENT_SECRET),
  GOOGLE_REDIRECT_URI: Boolean(process.env.GOOGLE_REDIRECT_URI),
  GOOGLE_DRIVE_BACKUP_FOLDER_ID: Boolean(process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID),
  ELYON_SELLER_ACCESS_TOKEN: Boolean(process.env.ELYON_SELLER_ACCESS_TOKEN),
  CRON_SECRET: Boolean(process.env.CRON_SECRET),
  OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
  DEEPSEEK_API_KEY: Boolean(process.env.DEEPSEEK_API_KEY),
  QWEN_API_KEY: Boolean(process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY),
};

console.log("Google/security/AI env status:", JSON.stringify(envStatus));
console.log("Prepared Vercel output with advanced per-agent workforce settings, protected agent tasks, manual approvals, provider routing, mobile and desktop workforce UI, and the existing Seller workflow modules.");