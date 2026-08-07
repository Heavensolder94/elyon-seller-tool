import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../seller-ai-workforce-team-v5.js", import.meta.url);
const publicUrl = new URL("../public/seller-ai-workforce-team-v5.js", import.meta.url);
const loaderUrl = new URL("../seller-runtime-loader.js", import.meta.url);

async function source() { return readFile(sourceUrl, "utf8"); }

test("team v5 remains valid compatibility JavaScript and ships identical public asset", async () => {
  const [src, pub] = await Promise.all([readFile(sourceUrl, "utf8"), readFile(publicUrl, "utf8")]);
  assert.doesNotThrow(() => new vm.Script(src));
  assert.equal(pub, src);
  assert.match(src, /window\.ElyonAIWorkforceTeamV5/);
});

test("legacy v5 still documents the five business roles", async () => {
  const src = await source();
  for (const name of ["Elyon Manager", "Product Manager", "Listing Manager", "Operations Manager", "Customer Care"]) {
    assert.match(src, new RegExp(`name: ["']${name}["']`));
  }
  const teamBlock = src.match(/const TEAM = \[(.*?)\n  \];/s)?.[1] || "";
  assert.equal((teamBlock.match(/\n      id: /g) || []).length, 5);
});

test("technical specialists remain internal skills in compatibility source", async () => {
  const src = await source();
  assert.match(src, /visibleAgents: \["elyon-product-data-specialist", "elyon-compliance-specialist", "elyon-profit-specialist"\]/);
  assert.match(src, /visibleAgents: \["elyon-listing-specialist", "elyon-draft-quality-guard"\]/);
  assert.match(src, /name: "Produktdaten"/);
  assert.match(src, /name: "Compliance"/);
  assert.match(src, /name: "Profit"/);
  assert.match(src, /name: "Draft QA"/);
});

test("product manager compatibility flow keeps product data, compliance and profit sequence", async () => {
  const src = await source();
  const product = src.match(/id: "product",[\s\S]*?colorClass: "product"/)?.[0] || "";
  assert.match(product, /elyon-product-data-specialist/);
  assert.match(product, /elyon-compliance-specialist/);
  assert.match(product, /elyon-profit-specialist/);
});

test("legacy v5 is no longer runtime-loaded after the button reliability hard fix", async () => {
  const loader = await readFile(loaderUrl, "utf8");
  const virtualGroup = loader.match(/virtualAgentsTab:\s*\[([\s\S]*?)\n\s*\],/)?.[1] || "";
  assert.doesNotMatch(virtualGroup, /seller-ai-workforce-team-v5\.js/);
  assert.match(virtualGroup, /seller-ai-workforce-team-v6\.js/);
  assert.match(loader, /ElyonAIWorkforceTeamV6\?\.render/);
});

test("legacy v5 observer was scoped, while stable runtime has moved to v6", async () => {
  const src = await source();
  assert.match(src, /document\.getElementById\("virtualAgentsTab"\) \|\| document\.getElementById\("elyonAiWorkforce"\)/);
  assert.doesNotMatch(src, /observe\(document\.documentElement/);
  assert.doesNotMatch(src, /setInterval\(/);
});
