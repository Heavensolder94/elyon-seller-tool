import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function syntaxCheck(relativePath) {
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${relativePath}`, import.meta.url))], { stdio: "pipe" });
}

test("settings cleanup hides retired Shopify Lab navigation", async () => {
  const source = await readFile(new URL("../seller-ai-settings-label.js", import.meta.url), "utf8");
  assert.match(source, /hideRetiredShopifyLab/);
  assert.match(source, /\["shopifyMenu", "shopifyTab"\]/);
  assert.match(source, /node\.hidden = true/);
  assert.match(source, /shopifyLab: "hidden_retired_module"/);
});

test("settings cleanup hides CJ only from the top integration overview", async () => {
  const source = await readFile(new URL("../seller-ai-settings-label.js", import.meta.url), "utf8");
  assert.match(source, /hideCjOverviewMetric/);
  assert.match(source, /document\.getElementById\("intCjStatus"\)/);
  assert.match(source, /metric\.hidden = true/);
  assert.match(source, /repeat\(auto-fit,minmax\(220px,1fr\)\)/);
  assert.match(source, /Backend, eBay und weitere Verbindungen zentral einrichten und technisch prüfen/);
  assert.match(source, /cjOverview: "hidden_keep_integration_tools"/);
  assert.doesNotMatch(source, /document\.getElementById\("setIntCjStatus"\)/);
});

test("settings cleanup removes the old sync dashboard from the normal view", async () => {
  const source = await readFile(new URL("../seller-ai-settings-label.js", import.meta.url), "utf8");
  assert.match(source, /#googleSheetsSyncStatus/);
  assert.match(source, /#elyonGoogleSheetsLegacyTools \.elyon-legacy-body/);
  assert.match(source, /legacyBody\.appendChild\(legacyStatus\)/);
  assert.match(source, /legacySyncDashboard: "collapsed_migration_only"/);
});

test("settings cleanup presents Google Sheets as manual export", async () => {
  const source = await readFile(new URL("../seller-ai-settings-label.js", import.meta.url), "utf8");
  assert.match(source, /Google-Sheets-Verbindung speichern/);
  assert.match(source, /Nach Google Sheets exportieren/);
  assert.match(source, /Google-Sheets-Export/);
  assert.match(source, /Manueller Export ist eingerichtet/);
  assert.match(source, /kein automatischer Zwei-Wege-Sync/);
  assert.match(source, /googleSheetsPrimaryAction: "manual_export"/);
});

test("legacy sync result wording is normalized to export wording", async () => {
  const source = await readFile(new URL("../seller-ai-settings-label.js", import.meta.url), "utf8");
  assert.match(source, /Noch kein Google-Sheets-Export ausgeführt/);
  assert.match(source, /Export abgeschlossen/);
  assert.match(source, /MutationObserver\(\(\) => normalizeExportResult\(card\)\)/);
});

test("cleanup runs after the data-sync layout module in settings", async () => {
  const runtime = await readFile(new URL("../seller-runtime-loader.js", import.meta.url), "utf8");
  const layoutIndex = runtime.indexOf('seller-settings-layout-experiment.js');
  const cleanupIndex = runtime.indexOf('seller-ai-settings-label.js');
  assert.ok(layoutIndex > 0);
  assert.ok(cleanupIndex > layoutIndex);
});

test("settings cleanup remains valid JavaScript", () => {
  syntaxCheck("seller-ai-settings-label.js");
});
