import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../seller-ai-workforce-orgchart-v1.js", import.meta.url);
const finalizerUrl = new URL("../scripts/finalize-seller-os.mjs", import.meta.url);

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

test("department cards stay compact and expose only team and assignment actions", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /Team ansehen/);
  assert.match(source, /Auftrag geben/);
  assert.match(source, /data-org-toggle/);
  assert.match(source, /data-v6-assign/);
  assert.doesNotMatch(source, /<button class=\"aiw-secondary\" data-v6-details=\"\$\{item\.id\}\">Details<\/button>/);
  assert.match(source, /Produktdaten, Compliance & Wirtschaftlichkeit/);
  assert.match(source, /Listings, SEO & Entwurfsprüfung/);
});

test("laptop layout uses a two-column company grid and only very wide screens use four columns", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /grid-template-columns:repeat\(2,minmax\(280px,1fr\)\)/);
  assert.match(source, /@media\(min-width:1500px\)/);
  assert.match(source, /grid-template-columns:repeat\(4,minmax\(260px,1fr\)\)/);
  assert.match(source, /@media\(max-width:900px\)/);
  assert.match(source, /grid-template-columns:1fr/);
});

test("decisions activity and custom employees live below the company tree", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /Braucht deine Entscheidung/);
  assert.match(source, /Letzte Teamaktivität/);
  assert.match(source, /Eigene Mitarbeiter/);
  assert.match(source, /Mitarbeiter einstellen/);
  assert.match(source, /data-org-anchor=\"decisions\"/);
  assert.match(source, /data-org-anchor=\"activity\"/);
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

test("production finalizer ships the org chart lazily through the workforce runtime", async () => {
  const source = await readFile(finalizerUrl, "utf8");
  assert.match(source, /outputOrgchartPath/);
  assert.match(source, /seller-ai-workforce-orgchart-v1\.js/);
  assert.match(source, /teamMarker/);
  assert.match(source, /seller-ai-workforce-company-entry\.js/);
  assert.match(source, /data-elyon-seller-os-design/);
  assert.match(source, /data-elyon-seller-os-polish/);
});
