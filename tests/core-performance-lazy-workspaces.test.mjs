import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseLazyScriptPaths } from "../scripts/performance-budget.mjs";

function syntaxCheck(relativePath) {
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${relativePath}`, import.meta.url))], { stdio: "pipe" });
}

const heavyStartupModules = [
  "seller-selling-flow-capture.js",
  "seller-selling-flow.js",
  "seller-selling-flow-event-guard.js",
  "seller-listing-visual-designer.js",
  "seller-auto-lister-parity.js",
  "seller-category-engine.js",
  "seller-selling-flow-resilience.js",
  "seller-selling-flow-visibility-fix.js",
  "seller-selling-flow-focused-ui.js",
  "seller-system-status-settings.js",
  "seller-settings-layout-experiment.js",
  "seller-ai-settings-label.js",
  "seller-ai-provider-model-guard.js",
  "seller-ebay-api-status.js",
];

test("desktop startup contains only the seller shell and dashboard modules", async () => {
  const build = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  const desktopBlock = build.match(/function injectDesktopSecurity\(html\) \{[\s\S]*?\n\}\n\nconst filesToMirror/)?.[0] || "";
  assert.ok(desktopBlock, "Desktop injection block must be discoverable");

  for (const file of heavyStartupModules) {
    assert.doesNotMatch(desktopBlock, new RegExp(`<script[^>]+${file.replaceAll(".", "\\.")}`));
    assert.match(build, new RegExp(`\\["${file.replaceAll(".", "\\.")}", "public/${file.replaceAll(".", "\\.")}"\\]`));
  }
  assert.match(desktopBlock, /<script defer src="\/seller-auth\.js"><\/script>/);
  assert.match(desktopBlock, /<script defer src="\/seller-runtime-loader\.js"><\/script>/);
  assert.match(desktopBlock, /<script type="module" src="\/seller-dashboard-v2\.js"><\/script>/);
});

test("runtime loader separates selling, settings, products and agents", async () => {
  const runtime = await readFile(new URL("../seller-runtime-loader.js", import.meta.url), "utf8");
  assert.match(runtime, /ebayListingTab:[\s\S]*seller-selling-flow-capture\.js[\s\S]*seller-selling-flow\.js[\s\S]*seller-listing-visual-designer\.js/);
  assert.match(runtime, /settingsTab:[\s\S]*seller-system-status-settings\.js[\s\S]*seller-settings-layout-experiment\.js[\s\S]*seller-ebay-api-status\.js/);
  assert.match(runtime, /productListTab:[\s\S]*seller-company-os-inbox\.js[\s\S]*seller-button-integrity\.js/);
  assert.match(runtime, /virtualAgentsTab:[\s\S]*seller-virtual-agents-legacy\.js[\s\S]*seller-ai-workforce-advanced-settings\.js/);
  assert.match(runtime, /const groupLoads = new Map\(\)/);
  assert.match(runtime, /if \(groupLoads\.has\(groupId\)\) return groupLoads\.get\(groupId\)/);

  const lazyPaths = parseLazyScriptPaths(runtime);
  assert.equal(new Set(lazyPaths).size, lazyPaths.length);
});

test("quickstart loads the selling workspace before listing navigation", async () => {
  const core = await readFile(new URL("../seller-quickstart-core.js", import.meta.url), "utf8");
  assert.match(core, /id: "listingPackage"[\s\S]*runtimeGroup: "ebayListingTab"/);
  assert.match(core, /id: "ebay"[\s\S]*runtimeGroup: "ebayListingTab"/);
});

test("protected seller APIs wait for the authentication check", async () => {
  const auth = await readFile(new URL("../seller-auth.js", import.meta.url), "utf8");
  assert.match(auth, /const PROTECTED_API_PATHS = \[/);
  assert.match(auth, /const readyPromise = new Promise/);
  assert.match(auth, /if \(authState === "checking"\) await readyPromise/);
  assert.match(auth, /if \(authState !== "authenticated"\) return syntheticForbiddenResponse\(\)/);
  assert.match(auth, /const nativeFetch = window\.fetch\.bind\(window\)/);
  assert.match(auth, /elyon:seller-auth-ready/);
});

test("performance core files remain valid JavaScript", () => {
  syntaxCheck("seller-auth.js");
  syntaxCheck("seller-runtime-loader.js");
  syntaxCheck("seller-selling-flow-capture.js");
  syntaxCheck("seller-ai-settings-label.js");
  syntaxCheck("scripts/performance-budget.mjs");
  syntaxCheck("scripts/prepare-vercel.mjs");
});
