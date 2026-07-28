import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function syntaxCheck(relativePath) {
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${relativePath}`, import.meta.url))], { stdio: "pipe" });
}

test("system and data status is moved from dashboard into settings", async () => {
  const source = await readFile(new URL("../seller-system-status-settings.js", import.meta.url), "utf8");
  assert.match(source, /document\.getElementById\("settingsTab"\)/);
  assert.match(source, /#dashboardTab \.sd-panel/);
  assert.match(source, /system- und datenstatus/);
  assert.match(source, /target\.host\.appendChild\(panel\)/);
  assert.match(source, /MutationObserver/);
});

test("settings relocation keeps one live panel after dashboard refreshes", async () => {
  const source = await readFile(new URL("../seller-system-status-settings.js", import.meta.url), "utf8");
  assert.match(source, /previous && previous !== panel/);
  assert.match(source, /previous\.remove\(\)/);
  assert.match(source, /data-system-status-host/);
  assert.match(source, /seller-system-status-placeholder/);
  assert.match(source, /elyon:seller-authenticated/);
});

test("eBay status is verified directly instead of trusting the initial dashboard placeholder", async () => {
  const source = await readFile(new URL("../seller-system-status-settings.js", import.meta.url), "utf8");
  assert.match(source, /\/api\/ebay\/status\?environment=production/);
  assert.match(source, /credentials:\s*"same-origin"/);
  assert.match(source, /cache:\s*"no-store"/);
  assert.match(source, /typeof data\.connected !== "boolean"/);
  assert.match(source, /wird geprüft/);
  assert.match(source, /Status nicht abrufbar/);
  assert.match(source, /refreshEbayStatus/);
  assert.match(source, /STATUS_MAX_AGE_MS/);
});

test("verified eBay state updates both settings row and dashboard badge", async () => {
  const source = await readFile(new URL("../seller-system-status-settings.js", import.meta.url), "utf8");
  assert.match(source, /ebayStatusRows/);
  assert.match(source, /ebayHeroBadges/);
  assert.match(source, /value\.textContent = label/);
  assert.match(source, /badge\.textContent = `eBay \$\{label\}`/);
  assert.match(source, /sd-good/);
  assert.match(source, /sd-bad/);
  assert.match(source, /sd-warn/);
});

test("desktop build loads and mirrors the settings relocation after dashboard v2", async () => {
  const source = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  const dashboardIndex = source.indexOf('<script type="module" src="/seller-dashboard-v2.js"></script>');
  const settingsIndex = source.indexOf('<script defer src="/seller-system-status-settings.js"></script>');
  assert.ok(dashboardIndex > 0);
  assert.ok(settingsIndex > dashboardIndex);
  assert.match(source, /\["seller-system-status-settings\.js", "public\/seller-system-status-settings\.js"\]/);
});

test("system status settings files are valid JavaScript", () => {
  syntaxCheck("seller-system-status-settings.js");
  syntaxCheck("scripts/prepare-vercel.mjs");
});
