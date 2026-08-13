import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractDesktopRuntime } from "./desktop-core-extraction.mjs";
import { injectMarkedBlock } from "./html-injection.mjs";
import { auditDesktopPerformance } from "./performance-budget.mjs";
import {
  optimizeAdvancedAgentSettings,
  optimizeAiWorkforceClient,
  optimizeWorkforceWorkspaceV3,
  optimizeVirtualAgentsRuntimeLoader,
} from "./virtual-agents-runtime-optimization.mjs";
import {
  optimizeTaskPromptHelper,
  optimizeWorkforceAgentBuilder,
  optimizeWorkforceInterfaceV4,
  optimizeWorkforceStructureV2,
  optimizeWorkforceV2Operations,
} from "./virtual-agents-render-storm-optimization.mjs";

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
  "seller-ai-workforce-v2-settings.js",
  "seller-ai-workforce-structure-v2.js",
  "seller-ai-workforce-v2-operations.js",
  "seller-ai-workforce-workspace-v3.js",
  "seller-ai-workforce-workspace-v3-policy.js",
  "seller-ai-workforce-agent-builder.js",
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
    '<script defer src="/seller-role-policy.js"></script>',
    '<script defer src="/seller-ebay-listing-sync.js"></script>',
    '<script defer src="/seller-virtual-agents-policy.js"></script>',
    '<script defer src="/seller-runtime-loader.js"></script>',
    '<style>#elyonSellerSellingFlow.focused-selling-active > .card:first-of-type{display:none!important}</style>',
    '<script type="module" src="/seller-dashboard-v2.js"></script>',
  ].join("\n");

  return injectMarkedBlock(html, { startMarker, endMarker, content });
}

function injectWorkforceV2IntoRuntimeLoader(source) {
  const entryMarker = '      { src: "/seller-ai-workforce-advanced-settings.js" },';
  const activationMarker = "      window.ElyonAIWorkforceAdvancedSettings?.refresh?.();";
  if (!source.includes(entryMarker) || !source.includes(activationMarker)) {
    throw new Error("Virtual-Agent-Runtime konnte nicht um Workforce V4 erweitert werden.");
  }
  return source
    .replace(entryMarker, [
      entryMarker,
      '      { src: "/seller-ai-workforce-v2-settings.js" },',
      '      { src: "/seller-ai-workforce-structure-v2.js" },',
      '      { src: "/seller-ai-workforce-v2-operations.js" },',
      '      { src: "/seller-ai-workforce-workspace-v3.js" },',
      '      { src: "/seller-ai-workforce-workspace-v3-policy.js" },',
      '      { src: "/seller-ai-workforce-agent-builder.js" },',
      '      { src: "/seller-ai-workforce-interface-v4.js" },',
    ].join("\n"))
    .replace(activationMarker, [
      activationMarker,
      "      const refreshWorkforceSupport = () => {",
      "        window.ElyonAIWorkforceWorkspaceV3?.render?.();",
      "        window.ElyonAIAgentBuilder?.refresh?.();",
      "        window.ElyonAIWorkforceInterfaceV4?.refresh?.();",
      "      };",
      '      if ("requestIdleCallback" in window) window.requestIdleCallback(refreshWorkforceSupport, { timeout: 1200 });',
      "      else window.setTimeout(refreshWorkforceSupport, 120);",
    ].join("\n"));
}

const filesToMirror = [
  ["elyon-clean.css", "public/elyon-clean.css"],
  ["elyon-ui.js", "public/elyon-ui.js"],
  ["seller-auth.js", "public/seller-auth.js"],
  ["seller-dashboard-compat.js", "public/seller-dashboard-compat.js"],
  ["seller-selling-flow-capture.js", "public/seller-selling-flow-capture.js"],
  ["seller-role-policy.js", "public/seller-role-policy.js"],
  ["seller-virtual-agents-policy.js", "public/seller-virtual-agents-policy.js"],
  ["seller-runtime-loader.js", "public/seller-runtime-loader.js"],
  ["seller-finance-core.js", "public/seller-finance-core.js"],
  ["seller-finance.js", "public/seller-finance.js"],
  ["seller-order-invoices.js", "public/seller-order-invoices.js"],
  ["seller-quickstart-core.js", "public/seller-quickstart-core.js"],
  ["seller-quickstart-snapshot.js", "public/seller-quickstart-snapshot.js"],
  ["seller-quickstart-view.js", "public/seller-quickstart-view.js"],
  ["seller-quickstart-menu.js", "public/seller-quickstart-menu.js"],
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
  ["seller-ai-workforce-v2-settings.js", "public/seller-ai-workforce-v2-settings.js"],
  ["seller-ai-workforce-structure-v2.js", "public/seller-ai-workforce-structure-v2.js"],
  ["seller-ai-workforce-v2-operations.js", "public/seller-ai-workforce-v2-operations.js"],
  ["seller-ai-workforce-workspace-v3.js", "public/seller-ai-workforce-workspace-v3.js"],
  ["seller-ai-workforce-workspace-v3-policy.js", "public/seller-ai-workforce-workspace-v3-policy.js"],
  ["seller-ai-workforce-agent-builder.js", "public/seller-ai-workforce-agent-builder.js"],
  ["seller-ai-workforce-interface-v4.js", "public/seller-ai-workforce-interface-v4.js"],
  ["seller-ai-workforce-team-v6.js", "public/seller-ai-workforce-team-v6.js"],
  ["seller-ai-task-prompt-helper.js", "public/seller-ai-task-prompt-helper.js"],
  ["ai-workforce-client.js", "public/ai-workforce-client.js"],
  ["ai-workforce-mount-fix.js", "public/ai-workforce-mount-fix.js"],
  ["seller-ebay-api-status.js", "public/seller-ebay-api-status.js"],
  ["seller-ebay-listing-sync.js", "public/seller-ebay-listing-sync.js"],
  ["seller-ebay-production-readiness.js", "public/seller-ebay-production-readiness.js"],
  ["seller-company-os-inbox.js", "public/seller-company-os-inbox.js"],
  ["seller-product-health-core.js", "public/seller-product-health-core.js"],
  ["seller-product-health-state.js", "public/seller-product-health-state.js"],
  ["seller-product-board-accordion.js", "public/seller-product-board-accordion.js"],
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

const [
  runtimeLoaderRaw,
  aiWorkforceClientRaw,
  advancedAgentSettingsRaw,
  workforceWorkspaceV3Raw,
  workforceStructureV2Raw,
  workforceV2OperationsRaw,
  workforceInterfaceV4Raw,
  workforceAgentBuilderRaw,
  taskPromptHelperRaw,
] = await Promise.all([
  readFile(path.join(appRoot, "seller-runtime-loader.js"), "utf8"),
  readFile(path.join(appRoot, "ai-workforce-client.js"), "utf8"),
  readFile(path.join(appRoot, "seller-ai-workforce-advanced-settings.js"), "utf8"),
  readFile(path.join(appRoot, "seller-ai-workforce-workspace-v3.js"), "utf8"),
  readFile(path.join(appRoot, "seller-ai-workforce-structure-v2.js"), "utf8"),
  readFile(path.join(appRoot, "seller-ai-workforce-v2-operations.js"), "utf8"),
  readFile(path.join(appRoot, "seller-ai-workforce-interface-v4.js"), "utf8"),
  readFile(path.join(appRoot, "seller-ai-workforce-agent-builder.js"), "utf8"),
  readFile(path.join(appRoot, "seller-ai-task-prompt-helper.js"), "utf8"),
]);
const runtimeLoaderSource = injectWorkforceV2IntoRuntimeLoader(optimizeVirtualAgentsRuntimeLoader(runtimeLoaderRaw));
const aiWorkforceClientSource = optimizeAiWorkforceClient(aiWorkforceClientRaw);
const advancedAgentSettingsSource = optimizeAdvancedAgentSettings(advancedAgentSettingsRaw);
const workforceWorkspaceV3Source = optimizeWorkforceWorkspaceV3(workforceWorkspaceV3Raw);
const workforceStructureV2Source = optimizeWorkforceStructureV2(workforceStructureV2Raw);
const workforceV2OperationsSource = optimizeWorkforceV2Operations(workforceV2OperationsRaw);
const workforceInterfaceV4Source = optimizeWorkforceInterfaceV4(workforceInterfaceV4Raw);
const workforceAgentBuilderSource = optimizeWorkforceAgentBuilder(workforceAgentBuilderRaw);
const taskPromptHelperSource = optimizeTaskPromptHelper(taskPromptHelperRaw);
await Promise.all([
  writeFile(path.join(publicRoot, "seller-runtime-loader.js"), runtimeLoaderSource, "utf8"),
  writeFile(path.join(publicRoot, "ai-workforce-client.js"), aiWorkforceClientSource, "utf8"),
  writeFile(path.join(publicRoot, "seller-ai-workforce-advanced-settings.js"), advancedAgentSettingsSource, "utf8"),
  writeFile(path.join(publicRoot, "seller-ai-workforce-workspace-v3.js"), workforceWorkspaceV3Source, "utf8"),
  writeFile(path.join(publicRoot, "seller-ai-workforce-structure-v2.js"), workforceStructureV2Source, "utf8"),
  writeFile(path.join(publicRoot, "seller-ai-workforce-v2-operations.js"), workforceV2OperationsSource, "utf8"),
  writeFile(path.join(publicRoot, "seller-ai-workforce-interface-v4.js"), workforceInterfaceV4Source, "utf8"),
  writeFile(path.join(publicRoot, "seller-ai-workforce-agent-builder.js"), workforceAgentBuilderSource, "utf8"),
  writeFile(path.join(publicRoot, "seller-ai-task-prompt-helper.js"), taskPromptHelperSource, "utf8"),
]);

const desktopSourcePath = path.join(appRoot, "index.html");
const desktopDestinationPath = path.join(publicRoot, "index.html");
const desktopCorePath = path.join(publicRoot, "seller-app-core.js");
const desktopAgentsPath = path.join(publicRoot, "seller-virtual-agents-legacy.js");
const desktopPerformanceReportPath = path.join(publicRoot, "performance-report.json");
await mkdir(path.dirname(desktopDestinationPath), { recursive: true });
const desktopHtml = await readFile(desktopSourcePath, "utf8");
const desktopRuntime = extractDesktopRuntime(desktopHtml, { version: Date.now() });
const desktopOutputHtml = injectDesktopSecurity(desktopRuntime.html);
await Promise.all([
  writeFile(desktopDestinationPath, desktopOutputHtml, "utf8"),
  writeFile(desktopCorePath, desktopRuntime.coreCode, "utf8"),
  writeFile(desktopAgentsPath, desktopRuntime.agentsCode, "utf8"),
]);

const performanceAudit = await auditDesktopPerformance({
  sourceHtml: desktopHtml,
  outputHtml: desktopOutputHtml,
  coreCode: desktopRuntime.coreCode,
  agentsCode: desktopRuntime.agentsCode,
  runtimeLoaderSource,
  publicRoot,
});
await writeFile(desktopPerformanceReportPath, `${JSON.stringify(performanceAudit, null, 2)}\n`, "utf8");

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
};

console.log("Google/security/AI env status:", JSON.stringify(envStatus));
console.log("Desktop runtime extraction:", JSON.stringify(desktopRuntime.metrics));
console.log("Desktop performance budget:", JSON.stringify(performanceAudit.metrics));
console.log("Prepared Vercel output with stable delegated virtual-team V6, DeepSeek task prompt helper, event-driven workforce support modules, manager-default task routing, custom agent builder, manual task prompts, protected custom-agent execution, full internal automation, permission-gated external automation, and enforced performance budgets.");