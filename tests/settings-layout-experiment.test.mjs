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
  assert.match(source, /2\. 🔄 Daten & Synchronisierung/);
  assert.match(source, /3\. 🩺 Systemstatus & Diagnose/);
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
