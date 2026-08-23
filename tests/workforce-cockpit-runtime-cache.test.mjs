import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stabilizeWorkforceCockpitMount } from "../scripts/workforce-cockpit-mount-transform.mjs";

const finalizerUrl = new URL("../scripts/finalize-seller-os.mjs", import.meta.url);
const orgchartUrl = new URL("../seller-ai-workforce-orgchart-v1.js", import.meta.url);

test("production versions the outer runtime loader and the lazy workforce assets", async () => {
  const finalizer = await readFile(finalizerUrl, "utf8");

  assert.match(finalizer, /SELLER_OS_VERSION = "20260823-workforce-cockpit-8"/);
  assert.match(finalizer, /WORKFORCE_ASSET_VERSION = "workforce-cockpit-20260823-6"/);
  assert.match(finalizer, /seller-runtime-loader\\\.js/);
  assert.match(finalizer, /seller-runtime-loader\.js\?v=\$\{SELLER_OS_VERSION\}/);
  assert.match(finalizer, /const VERSION = "\$\{WORKFORCE_ASSET_VERSION\}"/);
});

test("production cockpit mounts directly under the dedicated workforce root", async () => {
  const [finalizer, orgchart] = await Promise.all([
    readFile(finalizerUrl, "utf8"),
    readFile(orgchartUrl, "utf8"),
  ]);
  const output = stabilizeWorkforceCockpitMount(orgchart);

  assert.match(finalizer, /stabilizeWorkforceCockpitMount\(orgchartSource\)/);
  assert.match(finalizer, /writeFile\(outputOrgchartPath, productionOrgchart/);
  assert.match(output, /COMPANY_HOST_ID = "elyonWorkforceCompanyHost"/);
  assert.match(output, /document\.getElementById\("virtualAgentsSettingsRoot"\)/);
  assert.match(output, /root\.prepend\(host\)/);
  assert.match(output, /host\.replaceChildren\(replacement\)/);
  assert.match(output, /#elyonWorkforceCompanyHost \.aiw-org/);
  assert.doesNotMatch(output, /const shell = document\.getElementById\("elyonAiWorkforce"\);\s*if \(!shell\) return null/);
  assert.doesNotMatch(output, /data-v3-view="team"\]\.active/);
});

test("overview prioritizes decisions and live activity before employee cards", async () => {
  const orgchart = await readFile(orgchartUrl, "utf8");
  const output = stabilizeWorkforceCockpitMount(orgchart);
  const decisionIndex = output.indexOf('data-org-anchor="decisions"');
  const activityIndex = output.indexOf("⚡ Gerade in Arbeit");
  const employeeIndex = output.indexOf('<div class="aiw-cockpit-grid">${TEAM.map(employeeCard).join("")}</div>');

  assert.ok(decisionIndex >= 0, "decision panel missing");
  assert.ok(activityIndex > decisionIndex, "activity should follow decisions");
  assert.ok(employeeIndex > activityIndex, "employee cards should follow operational status");
});
