import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function syntaxCheck(relativePath) {
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${relativePath}`, import.meta.url))], { stdio: "pipe" });
}

async function source() {
  return readFile(new URL("../seller-system-status-settings.js", import.meta.url), "utf8");
}

test("system and data status is moved from dashboard into settings without a global DOM observer", async () => {
  const code = await source();
  assert.match(code, /document\.getElementById\("settingsTab"\)/);
  assert.match(code, /#dashboardTab \.sd-panel/);
  assert.match(code, /system- und datenstatus/);
  assert.match(code, /keepOnlyPanel\(panel, target\.host\)/);
  assert.match(code, /scheduleBoundedRepairs/);
  assert.match(code, /elyon:tab-changed/);
  assert.doesNotMatch(code, /new MutationObserver/);
  assert.doesNotMatch(code, /observer\.observe\(document\.documentElement/);
});

test("status marker uses the real kebab-case data attribute", async () => {
  const code = await source();
  assert.match(code, /PANEL_ATTRIBUTE = "data-elyon-system-status-panel"/);
  assert.match(code, /panel\.setAttribute\(PANEL_ATTRIBUTE, "1"\)/);
  assert.match(code, /\[\$\{PANEL_ATTRIBUTE\}="1"\]/);
  assert.doesNotMatch(code, /data-\$\{PANEL_MARKER\}/);
  assert.doesNotMatch(code, /dataset\[PANEL_MARKER\]/);
});

test("settings relocation removes duplicate wrappers and panels", async () => {
  const code = await source();
  assert.match(code, /statusWrappers/);
  assert.match(code, /existing\.filter\(\(node\) => node !== wrapper\)\.forEach\(\(node\) => node\.remove\(\)\)/);
  assert.match(code, /statusPanels\(\)\.forEach/);
  assert.match(code, /if \(panel !== keep\) panel\.remove\(\)/);
  assert.match(code, /wrapperCount: statusWrappers\(\)\.length/);
  assert.match(code, /panelCount: statusPanels\(\)\.length/);
});

test("inner dashboard heading is hidden after moving into the settings wrapper", async () => {
  const code = await source();
  assert.match(code, /seller-system-status-panel>\.sd-head\{display:none!important\}/);
  assert.match(code, /<summary><span>System- und Datenstatus/);
});

test("eBay status is verified directly instead of trusting the initial dashboard placeholder", async () => {
  const code = await source();
  assert.match(code, /\/api\/ebay\/status\?environment=production/);
  assert.match(code, /credentials:\s*"same-origin"/);
  assert.match(code, /cache:\s*"no-store"/);
  assert.match(code, /typeof data\.connected !== "boolean"/);
  assert.match(code, /wird geprüft/);
  assert.match(code, /Status nicht abrufbar/);
  assert.match(code, /refreshEbayStatus/);
  assert.match(code, /STATUS_MAX_AGE_MS/);
  assert.match(code, /api\/finance\?action=status/);
  assert.match(code, /Server-Synchronisierung/);
});

test("server synchronization contains only storage status, not business safety toggles", async () => {
  const code = await source();
  const start = code.indexOf("async function installFinanceSyncPanel");
  const end = code.indexOf("async function installTrackingAutomationPanel");
  const financePanel = code.slice(start, end);
  assert.match(financePanel, /Server-Synchronisierung/);
  assert.match(financePanel, /Zentral verbunden/);
  assert.doesNotMatch(financePanel, /data-finance-safety/);
  assert.doesNotMatch(financePanel, /Live-Veröffentlichung erlaubt/);
});

test("tracking permission is placed in its own Seller Tool shipping section", async () => {
  const code = await source();
  assert.match(code, /TRACKING_WRAPPER_ID = "elyonShippingAutomationSettings"/);
  assert.match(code, /Versand &amp; Tracking/);
  assert.match(code, /Tracking-Übertragung an eBay freigeben/);
  assert.match(code, /data-finance-safety="trackingSyncEnabled"/);
  assert.match(code, /seller_tracking_settings_update/);
  assert.match(code, /elyon-toggle-track/);
  assert.match(code, /elyon-toggle-thumb/);
  assert.match(code, /elyon-toggle-row/);
  assert.doesNotMatch(code, /Live-Veröffentlichung erlaubt/);
});

test("verified eBay state updates both settings row and dashboard badge", async () => {
  const code = await source();
  assert.match(code, /ebayStatusRows/);
  assert.match(code, /ebayHeroBadges/);
  assert.match(code, /value\.textContent = label/);
  assert.match(code, /badge\.textContent = `eBay \$\{label\}`/);
  assert.match(code, /sd-good/);
  assert.match(code, /sd-bad/);
  assert.match(code, /sd-warn/);
});

test("desktop runtime loads system status only with the settings workspace", async () => {
  const build = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../seller-runtime-loader.js", import.meta.url), "utf8");
  const settingsGroup = runtime.indexOf("settingsTab:");
  const systemIndex = runtime.indexOf('{ src: "/seller-system-status-settings.js" }');
  const layoutIndex = runtime.indexOf('{ src: "/seller-settings-layout-experiment.js" }');

  assert.ok(settingsGroup > 0);
  assert.ok(systemIndex > settingsGroup);
  assert.ok(layoutIndex > systemIndex);
  assert.doesNotMatch(build, /<script[^>]+seller-system-status-settings\.js/);
  assert.match(build, /\["seller-system-status-settings\.js", "public\/seller-system-status-settings\.js"\]/);
});

test("system status settings files are valid JavaScript", () => {
  syntaxCheck("seller-system-status-settings.js");
  syntaxCheck("seller-runtime-loader.js");
  syntaxCheck("scripts/prepare-vercel.mjs");
});
