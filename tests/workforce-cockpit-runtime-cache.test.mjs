import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const finalizerUrl = new URL("../scripts/finalize-seller-os.mjs", import.meta.url);
const optimizerUrl = new URL("../scripts/virtual-agents-runtime-optimization.mjs", import.meta.url);
const mountTransformUrl = new URL("../scripts/workforce-cockpit-mount-transform.mjs", import.meta.url);

test("production versions the outer workforce runtime loader as well as lazy workforce assets", async () => {
  const [finalizer, optimizer] = await Promise.all([
    readFile(finalizerUrl, "utf8"),
    readFile(optimizerUrl, "utf8"),
  ]);

  assert.match(finalizer, /SELLER_OS_VERSION = "20260823-workforce-cockpit-3"/);
  assert.match(finalizer, /seller-runtime-loader\\\.js/);
  assert.match(finalizer, /seller-runtime-loader\.js\?v=\$\{SELLER_OS_VERSION\}/);
  assert.match(optimizer, /workforce-cockpit-20260823-1/);
});

test("production cockpit can mount directly into the active team section when Team V6 has not rendered yet", async () => {
  const [finalizer, transform] = await Promise.all([
    readFile(finalizerUrl, "utf8"),
    readFile(mountTransformUrl, "utf8"),
  ]);

  assert.match(finalizer, /stabilizeWorkforceCockpitMount\(orgchartSource\)/);
  assert.match(finalizer, /writeFile\(outputOrgchartPath, productionOrgchart/);
  assert.match(transform, /function cockpitMountTarget\(\)/);
  assert.match(transform, /data-v3-view=\\"team\\"\]\.active/);
  assert.match(transform, /replaceChildren\(replacement\)/);
  assert.doesNotMatch(transform, /if \(!root\) return false/);
});
