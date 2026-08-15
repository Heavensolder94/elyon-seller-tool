import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "seller-jarvis-client.js"), "utf8");

test("Jarvis client tracks queued Market Scout tasks and surfaces completed results", () => {
  assert.match(source, /trackAsyncMarketScout\(result\)/);
  assert.match(source, /pollMarketScoutTask/);
  assert.match(source, /elyon:jarvis-async-result/);
  assert.match(source, /credentials:\s*"same-origin"/);
  assert.match(source, /Market Scout ist fertig/);
});

test("Jarvis client keeps async Market Scout messages visible across HUD rerenders", () => {
  assert.match(source, /ASYNC_MESSAGE_STORAGE_KEY/);
  assert.match(source, /sessionStorage\.setItem\(ASYNC_MESSAGE_STORAGE_KEY/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /restoreAsyncJarvisMessages/);
  assert.match(source, /data-jarvis-async-id/);
});

test("Jarvis client surfaces failed Market Scout tasks as a visible error message", () => {
  assert.match(source, /Jarvis · Market Scout Fehler/);
  assert.match(source, /kind:\s*"error"/);
  assert.match(source, /marketScoutFailureMessage/);
  assert.match(source, /openrouter_invalid_market_scout_json/);
});

test("Jarvis HUD shows working state with backend progress percentage", () => {
  assert.match(source, /IN ARBEIT · \$\{/);
  assert.match(source, /taskProgress\(task/);
  assert.match(source, /setAsyncHudStatus\("working"/);
  assert.match(source, /\[data-jarvis-state\]/);
});
