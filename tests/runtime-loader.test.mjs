import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function syntaxCheck(relativePath) {
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${relativePath}`, import.meta.url))], {
    stdio: "pipe",
  });
}

test("desktop build keeps optional feature modules out of the critical startup block", async () => {
  const source = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  const block = source.match(/function injectDesktopSecurity\(html\) \{([\s\S]*?)return injectMarkedBlock/)?.[1] || "";

  assert.match(block, /seller-runtime-loader\.js/);
  assert.doesNotMatch(block, /ai-workforce-client\.js/);
  assert.doesNotMatch(block, /ai-workforce-mount-fix\.js/);
  assert.doesNotMatch(block, /seller-ai-workforce-advanced-settings\.js/);
  assert.doesNotMatch(block, /seller-ebay-api-status\.js/);
  assert.doesNotMatch(block, /seller-company-os-inbox\.js/);
  assert.doesNotMatch(block, /seller-product-board-accordion(?:-compat)?\.js/);
});

test("runtime loader groups modules by the tab that needs them", async () => {
  const source = await readFile(new URL("../seller-runtime-loader.js", import.meta.url), "utf8");

  assert.match(source, /productListTab/);
  assert.match(source, /settingsTab/);
  assert.match(source, /virtualAgentsTab/);
  assert.match(source, /seller-company-os-inbox\.js/);
  assert.match(source, /seller-product-board-accordion-compat\.js/);
  assert.match(source, /seller-ebay-api-status\.js/);
  assert.match(source, /ai-workforce-client\.js/);
  assert.match(source, /elyon:runtime-group-loaded/);
  assert.doesNotMatch(source, /MutationObserver/);
  assert.doesNotMatch(source, /setInterval/);
});

test("runtime loader and Vercel preparation remain valid JavaScript", () => {
  syntaxCheck("seller-runtime-loader.js");
  syntaxCheck("scripts/prepare-vercel.mjs");
});
