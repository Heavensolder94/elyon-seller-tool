import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const finalizerUrl = new URL("../scripts/finalize-seller-os.mjs", import.meta.url);
const optimizerUrl = new URL("../scripts/virtual-agents-runtime-optimization.mjs", import.meta.url);

test("production versions the outer workforce runtime loader as well as lazy workforce assets", async () => {
  const [finalizer, optimizer] = await Promise.all([
    readFile(finalizerUrl, "utf8"),
    readFile(optimizerUrl, "utf8"),
  ]);

  assert.match(finalizer, /SELLER_OS_VERSION = "20260823-workforce-cockpit-2"/);
  assert.match(finalizer, /seller-runtime-loader\\\.js/);
  assert.match(finalizer, /seller-runtime-loader\.js\?v=\$\{SELLER_OS_VERSION\}/);
  assert.match(optimizer, /workforce-cockpit-20260823-1/);
});
