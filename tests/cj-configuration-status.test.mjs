import test from "node:test";
import assert from "node:assert/strict";
import { cjConfigurationStatus } from "../lib/cj-configuration-status.js";
import { existsSync } from "node:fs";
import search from "../api/cj/search.js";
import integrations from "../api/integrations/status.js";
import mobileHealth from "../api/mobile-health.js";

function response() { return { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }

test("CJ configuration state is never treated as a verified connection", () => {
  assert.equal(cjConfigurationStatus({}).status, "missing_config");
  assert.equal(cjConfigurationStatus({ CJ_ACCESS_TOKEN: "test", CJ_API_KEY: "local-placeholder-key" }).status, "invalid_config");
  const state = cjConfigurationStatus({ CJ_API_KEY: "local-placeholder-key" });
  assert.equal(state.status, "configured_not_tested");
  assert.equal(state.connected, false);
  assert.equal(state.verified, false);
  assert.doesNotMatch(JSON.stringify(state), /local-placeholder-key/);
});

test("CJ status routes and integration summary do not claim a live connection", async t => {
  const oldToken = process.env.CJ_ACCESS_TOKEN, oldKey = process.env.CJ_API_KEY;
  delete process.env.CJ_ACCESS_TOKEN; process.env.CJ_API_KEY = "local-placeholder-key";
  t.after(() => { if (oldToken === undefined) delete process.env.CJ_ACCESS_TOKEN; else process.env.CJ_ACCESS_TOKEN = oldToken; if (oldKey === undefined) delete process.env.CJ_API_KEY; else process.env.CJ_API_KEY = oldKey; });
  t.mock.method(globalThis, "fetch", () => { throw new Error("status must not make a network request"); });
  const rewritten = response(), summary = response();
  const directFile = new URL("../api/cj/status.js", import.meta.url);
  if (existsSync(directFile)) {
    const direct = response();
    const directStatus = (await import(directFile)).default;
    await directStatus({ method: "GET" }, direct);
    assert.equal(direct.body.cjConnected, false);
    assert.equal(direct.body.status, "configured_not_tested");
  }
  await search({ method: "GET", query: { action: "status" } }, rewritten);
  await integrations({ method: "GET" }, summary);
  for (const body of [rewritten.body, summary.body.providers.cj]) {
    assert.equal(body.status, "configured_not_tested");
    assert.equal(body.connected, false);
    assert.doesNotMatch(JSON.stringify(body), /local-placeholder-key/);
  }
  assert.equal(rewritten.body.cjConnected, false);
});

test("mobile health does not count an HTTP 200 configuration response as CJ live", async t => {
  t.mock.method(globalThis, "fetch", async url => new Response(JSON.stringify(
    String(url).includes("/api/cj/status")
      ? { ok: true, configured: true, connected: false, verified: false, message: "Nicht geprüft" }
      : { ok: true }
  ), { status: 200 }));
  const res = response();
  await mobileHealth({ method: "GET", headers: { host: "local.test" } }, res);
  const cj = res.body.services.find(service => service.key === "cj");
  assert.equal(cj.routeOk, true);
  assert.equal(cj.liveOk, false);
  assert.notEqual(cj.state, "ok");
  assert.equal(cj.detail, "Nicht geprüft");
});
