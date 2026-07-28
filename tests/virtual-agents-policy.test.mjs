import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function syntaxCheck(relativePath) {
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${relativePath}`, import.meta.url))], { stdio: "pipe" });
}

test("dedicated virtual employees tab and mount root exist in the desktop shell", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /<option value="virtualAgentsTab">[^<]*Virtuelle Mitarbeiter \/ KI-Agenten<\/option>/);
  assert.match(html, /<section id="virtualAgentsTab" class="tab">/);
  assert.match(html, /id="virtualAgentsSettingsRoot"/);
});

test("virtual agents policy reverses the obsolete inactive-role decision", async () => {
  const legacyPolicy = await readFile(new URL("../seller-role-policy.js", import.meta.url), "utf8");
  const activationPolicy = await readFile(new URL("../seller-virtual-agents-policy.js", import.meta.url), "utf8");

  assert.match(legacyPolicy, /id: "virtualAgentsTab"[^\n]+reason:/);
  assert.match(activationPolicy, /classList\.remove\("elyon-role-hidden"\)/);
  assert.match(activationPolicy, /tab\.hidden = false/);
  assert.match(activationPolicy, /removeAttribute\("aria-hidden"\)/);
  assert.match(activationPolicy, /entry\.value === TAB_ID/);
  assert.match(activationPolicy, /registry\.inactive = registry\.inactive\.filter/);
  assert.match(activationPolicy, /registry\.active\.push/);
});

test("desktop build activates the tab before installing the lazy workforce loader", async () => {
  const build = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../seller-runtime-loader.js", import.meta.url), "utf8");
  const rolePolicy = build.indexOf('<script defer src="/seller-role-policy.js"></script>');
  const activationPolicy = build.indexOf('<script defer src="/seller-virtual-agents-policy.js"></script>');
  const runtimeLoader = build.indexOf('<script defer src="/seller-runtime-loader.js"></script>');
  const virtualAgentsGroup = runtime.indexOf("virtualAgentsTab:");
  const workforce = runtime.indexOf('{ src: "/ai-workforce-client.js" }');

  assert.ok(rolePolicy > 0);
  assert.ok(activationPolicy > rolePolicy);
  assert.ok(runtimeLoader > activationPolicy);
  assert.ok(virtualAgentsGroup > 0);
  assert.ok(workforce > virtualAgentsGroup);
  assert.doesNotMatch(build, /<script[^>]+ai-workforce-client\.js/);
  assert.match(build, /\["seller-virtual-agents-policy\.js", "public\/seller-virtual-agents-policy\.js"\]/);
});

test("virtual agents activation files are valid JavaScript", () => {
  syntaxCheck("seller-virtual-agents-policy.js");
  syntaxCheck("seller-runtime-loader.js");
  syntaxCheck("scripts/prepare-vercel.mjs");
});
