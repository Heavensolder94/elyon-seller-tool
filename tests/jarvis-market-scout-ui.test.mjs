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
