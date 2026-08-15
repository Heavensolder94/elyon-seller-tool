import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extractDesktopRuntime } from "../scripts/desktop-core-extraction.mjs";

const sourceUrl = new URL("../index.html", import.meta.url);

test("desktop build extracts both large inline application scripts", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const result = extractDesktopRuntime(source, { version: 123 });

  assert.match(result.html, /<script src="\/seller-app-core\.js\?v=123"><\/script>/);
  assert.doesNotMatch(result.html, /xlsx\.full\.min\.js/);
  assert.doesNotMatch(result.html, /<script>\s*'use strict';/);
  assert.match(result.coreCode, /function loadStoredArray\(key\)/);
  assert.match(result.agentsCode, /const STORAGE_KEY = 'elyon_ai_agents_settings'/);
});

test("retired seller navigation modules are removed from the desktop build", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const result = extractDesktopRuntime(source, { version: 123 });

  const retiredTabs = ["marketCheckTab", "financeTab", "listingCheckTab", "productStatusTab"];
  for (const tabId of retiredTabs) {
    assert.match(source, new RegExp(`<option\\s+value=["']${tabId}["']`));
    assert.doesNotMatch(result.html, new RegExp(`<option\\s+value=["']${tabId}["']`));
  }
});

test("Excel support remains available but loads only when an Excel file is selected", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const result = extractDesktopRuntime(source, { version: 123 });

  assert.match(result.coreCode, /function ensureXlsxLibrary\(\)/);
  assert.match(result.coreCode, /script\.async = true/);
  assert.match(result.coreCode, /async function importCSV\(e\)/);
  assert.match(result.coreCode, /await ensureXlsxLibrary\(\)/);
  assert.match(result.coreCode, /function xlsxToImportDraft\(arrayBuffer,sourceLabel\)/);
});

test("initial HTML payload is reduced substantially without deleting application code", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const result = extractDesktopRuntime(source, { version: 123 });

  assert.ok(result.metrics.htmlBytes < result.metrics.sourceBytes * 0.45);
  assert.ok(result.metrics.coreBytes > 100000);
  assert.ok(result.metrics.agentsBytes > 100000);
  assert.doesNotThrow(() => new Function(result.coreCode));
  assert.doesNotThrow(() => new Function(result.agentsCode));
});

test("virtual-agent legacy runtime is loaded only with its dedicated tab", async () => {
  const loader = await readFile(new URL("../seller-runtime-loader.js", import.meta.url), "utf8");
  const build = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");

  assert.match(loader, /virtualAgentsTab:[\s\S]*seller-virtual-agents-legacy\.js/);
  assert.match(build, /seller-virtual-agents-legacy\.js/);
  assert.doesNotMatch(build, /<script[^>]+seller-virtual-agents-legacy\.js/);
});