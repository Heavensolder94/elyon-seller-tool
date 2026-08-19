import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function syntaxCheck(relativePath) {
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${relativePath}`, import.meta.url))], { stdio: "pipe" });
}

test("settings experiment separates configuration into three clear areas", async () => {
  const source = await readFile(new URL("../seller-settings-layout-experiment.js", import.meta.url), "utf8");
  assert.match(source, /1\. 🔌 Integrationen & API-Verbindungen/);
  assert.match(source, /2\. ☁️ Daten, Backup & Export/);
  assert.match(source, /3\. 🩺 Systemstatus & Diagnose/);
});

test("data sync settings document the new source-of-truth roles", async () => {
  const source = await readFile(new URL("../seller-settings-layout-experiment.js", import.meta.url), "utf8");
  assert.match(source, /Product Master/);
  assert.match(source, /Server Operations/);
  assert.match(source, /Lokale Browserdaten/);
  assert.match(source, /Google Sheets/);
  assert.match(source, /googleSheetsRole: "optional_export_legacy"/);
  assert.match(source, /localStorageRole: "working_copy_fallback"/);
});

test("legacy bidirectional sync is moved behind migration tooling and blocked", async () => {
  const source = await readFile(new URL("../seller-settings-layout-experiment.js", import.meta.url), "utf8");
  assert.match(source, /Erweiterte Legacy- & Migrationswerkzeuge/);
  assert.match(source, /"loadAllGoogleSheetsBtn"/);
  assert.match(source, /"reconcileAllGoogleSheetsBtn"/);
  assert.match(source, /BLOCKED_LEGACY_ACTION_IDS/);
  assert.match(source, /control\.disabled = true/);
  assert.match(source, /bidirectionalImport: "blocked_pending_preview_diff"/);
});

test("legacy Google Sheets auto reconcile is disabled during migration", async () => {
  const source = await readFile(new URL("../seller-settings-layout-experiment.js", import.meta.url), "utf8");
  assert.match(source, /elyon_google_sheets_auto_sync_enabled/);
  assert.match(source, /localStorage\.setItem\(AUTO_SYNC_KEY, "no"\)/);
  assert.match(source, /window\.scheduleGoogleSheetsAutoSync/);
  assert.match(source, /autoReconcile: "disabled"/);
});

test("Google Sheets push action is presented as optional export", async () => {
  const source = await readFile(new URL("../seller-settings-layout-experiment.js", import.meta.url), "utf8");
  assert.match(source, /Nach Google Sheets exportieren/);
  assert.match(source, /Google Sheets ist nur noch Export\/Backup/);
  assert.match(source, /Product Master bleibt unverändert/);
});

test("duplicate settings order import is hidden without deleting its controls", async () => {
  const source = await readFile(new URL("../seller-settings-layout-experiment.js", import.meta.url), "utf8");
  assert.match(source, /directCardContaining\(settings, "#ebayOrdersRange"\)/);
  assert.match(source, /duplicateImport\.hidden = true/);
  assert.doesNotMatch(source, /duplicateImport\.remove\(\)/);
});

test("operational eBay import remains in the orders workspace", async () => {
  const source = await readFile(new URL("../seller-settings-layout-experiment.js", import.meta.url), "utf8");
  assert.match(source, /#ebayOrdersRangeOrders/);
  assert.match(source, /1\. 📦 eBay-Bestellungen importieren/);
  assert.match(source, /direkt bei den Bestellungen statt in den Einstellungen/);
});

test("settings layout experiment is shipped after system status setup", async () => {
  const build = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  const systemIndex = build.indexOf('seller-system-status-settings.js');
  const experimentIndex = build.indexOf('seller-settings-layout-experiment.js');
  assert.ok(systemIndex > 0);
  assert.ok(experimentIndex > systemIndex);
  assert.match(build, /\["seller-settings-layout-experiment\.js", "public\/seller-settings-layout-experiment\.js"\]/);
});

test("settings layout experiment remains valid JavaScript", () => {
  syntaxCheck("seller-settings-layout-experiment.js");
  syntaxCheck("scripts/prepare-vercel.mjs");
});
