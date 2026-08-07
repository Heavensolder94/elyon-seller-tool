import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../seller-ai-workforce-team-v5.js", import.meta.url);
const publicUrl = new URL("../public/seller-ai-workforce-team-v5.js", import.meta.url);
const loaderUrl = new URL("../seller-runtime-loader.js", import.meta.url);

async function source() { return readFile(sourceUrl, "utf8"); }

test("team v5 is valid browser JavaScript and ships identical public asset", async () => {
  const [src, pub] = await Promise.all([readFile(sourceUrl, "utf8"), readFile(publicUrl, "utf8")]);
  assert.doesNotThrow(() => new vm.Script(src));
  assert.equal(pub, src);
  assert.match(src, /window\.ElyonAIWorkforceTeamV5/);
});

test("main team exposes exactly five business roles", async () => {
  const src = await source();
  for (const name of ["Elyon Manager", "Product Manager", "Listing Manager", "Operations Manager", "Customer Care"]) {
    assert.match(src, new RegExp(`name: ["']${name}["']`));
  }
  const teamBlock = src.match(/const TEAM = \[(.*?)\n  \];/s)?.[1] || "";
  assert.equal((teamBlock.match(/\n      id: /g) || []).length, 5);
  assert.match(src, /Mein KI-Team/);
});

test("technical specialists remain internal skills rather than visible employees", async () => {
  const src = await source();
  assert.match(src, /visibleAgents: \["elyon-product-data-specialist", "elyon-compliance-specialist", "elyon-profit-specialist"\]/);
  assert.match(src, /visibleAgents: \["elyon-listing-specialist", "elyon-draft-quality-guard"\]/);
  assert.match(src, /Technischer Skill im Hintergrund/);
  assert.match(src, /name: "Produktdaten"/);
  assert.match(src, /name: "Compliance"/);
  assert.match(src, /name: "Profit"/);
  assert.match(src, /name: "Draft QA"/);
});

test("product manager runs product data, compliance and profit in sequence", async () => {
  const src = await source();
  const product = src.match(/id: "product",[\s\S]*?colorClass: "product"/)?.[0] || "";
  assert.match(product, /elyon-product-data-specialist/);
  assert.match(product, /elyon-compliance-specialist/);
  assert.match(product, /elyon-profit-specialist/);
  assert.match(src, /for \(let index = 0; index < member\.visibleAgents\.length; index \+= 1\)/);
  assert.match(src, /\/api\/ai-agent-run-advanced/);
});

test("listing manager keeps deterministic draft quality check after listing skill", async () => {
  const src = await source();
  const listing = src.match(/id: "listing",[\s\S]*?colorClass: "listing"/)?.[0] || "";
  assert.match(listing, /elyon-listing-specialist/);
  assert.match(listing, /elyon-draft-quality-guard/);
  assert.match(src, /deterministic: true/);
  assert.match(src, /ElyonAIWorkforceV2\?\.runAgent\?\.\(visibleId\)/);
});

test("department tasks stop on hard blockers and do not unlock external actions", async () => {
  const src = await source();
  assert.match(src, /function isHardStop/);
  assert.match(src, /\["blocked", "failed"\]\.includes\(status\)/);
  assert.match(src, /Externe Aktionen werden dadurch nicht automatisch freigeschaltet/);
  assert.doesNotMatch(src, /publishListing\s*\(/);
  assert.doesNotMatch(src, /placeSupplierOrder\s*\(/);
  assert.doesNotMatch(src, /issueRefund\s*\(/);
});

test("generic task composer keeps manager and custom employees, not technical core agents", async () => {
  const src = await source();
  assert.match(src, /option\.value\.startsWith\("builtin:"\)/);
  assert.match(src, /option\.value !== "builtin:elyon-operations-manager"/);
  assert.match(src, /Direkte Aufträge an Product Manager, Listing Manager, Operations Manager oder Customer Care/);
});

test("team v5 stays lazy in the virtual agents runtime group", async () => {
  const loader = await readFile(loaderUrl, "utf8");
  assert.match(loader, /virtualAgentsTab:[\s\S]*seller-ai-workforce-team-v5\.js/);
  assert.match(loader, /ElyonAIWorkforceTeamV5\?\.render/);
  const beforeGroups = loader.split("const GROUPS =", 1)[0];
  assert.doesNotMatch(beforeGroups, /seller-ai-workforce-team-v5/);
});

test("team observer is scoped to virtual employee workspace", async () => {
  const src = await source();
  assert.match(src, /document\.getElementById\("virtualAgentsTab"\) \|\| document\.getElementById\("elyonAiWorkforce"\)/);
  assert.doesNotMatch(src, /observe\(document\.documentElement/);
  assert.doesNotMatch(src, /setInterval\(/);
});
