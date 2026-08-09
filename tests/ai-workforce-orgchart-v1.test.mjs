import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../seller-ai-workforce-orgchart-v1.js", import.meta.url);
const injectorUrl = new URL("../scripts/inject-preview-design.mjs", import.meta.url);

test("workforce org chart is valid browser JavaScript", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /window\.ElyonAIWorkforceOrgchartV1/);
});

test("org chart exposes the four business departments and eight specialists", async () => {
  const source = await readFile(sourceUrl, "utf8");
  for (const name of ["Product Manager", "Listing Manager", "Operations Manager", "Customer Care"]) {
    assert.match(source, new RegExp(`name: ["']${name}["']`));
  }
  for (const specialist of [
    "Product Data Specialist",
    "Compliance Guard",
    "Profit Analyst",
    "Listing Specialist",
    "Draft Quality Guard",
    "Order Coordinator",
    "Customer Support Specialist",
    "Elyon Manager",
  ]) {
    assert.match(source, new RegExp(specialist));
  }
});

test("org chart reuses stable Team V6 actions instead of creating a second execution path", async () => {
  const source = await readFile(sourceUrl, "utf8");
  for (const hook of ["data-v6-assign", "data-v6-details", "data-v6-create-custom", "data-v6-custom-assign", "data-v6-custom-edit"]) {
    assert.match(source, new RegExp(hook));
  }
  assert.doesNotMatch(source, /\/api\/ai-agent-run/);
  assert.doesNotMatch(source, /publishListing\s*\(/);
});

test("org chart is event-driven and does not add polling or mutation observers", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.doesNotMatch(source, /MutationObserver/);
  assert.doesNotMatch(source, /setInterval\(/);
  assert.match(source, /elyon:ai-workforce-team-v6-rendered/);
  assert.match(source, /elyon:ai-workforce-v2-task-updated/);
  assert.match(source, /requestAnimationFrame/);
});

test("preview injector copies and loads the org chart without changing production preparation", async () => {
  const source = await readFile(injectorUrl, "utf8");
  assert.match(source, /seller-ai-workforce-orgchart-v1\.js/);
  assert.match(source, /data-elyon-preview-orgchart/);
  assert.match(source, /copyFile\(orgchartSourcePath, orgchartOutputPath\)/);
});
