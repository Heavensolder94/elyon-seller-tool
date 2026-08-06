import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function syntaxCheck(relativePath) {
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${relativePath}`, import.meta.url))], { stdio: "pipe" });
}

test("AI Workforce is moved into the dedicated virtual agents root without a global observer", async () => {
  const source = await readFile(new URL("../ai-workforce-mount-fix.js", import.meta.url), "utf8");
  assert.match(source, /virtualAgentsSettingsRoot/);
  assert.match(source, /virtualAgentsTab/);
  assert.match(source, /elyonAiWorkforce/);
  assert.match(source, /root\.replaceChildren\(shell\)/);
  assert.doesNotMatch(source, /MutationObserver/);
  assert.doesNotMatch(source, /window\.addEventListener\("focus"/);
});

test("mount fix reacts only when the virtual agents area is opened or loaded", async () => {
  const source = await readFile(new URL("../ai-workforce-mount-fix.js", import.meta.url), "utf8");
  assert.match(source, /event\.target\?\.id === "mainMenu"/);
  assert.match(source, /event\.target\.value === TAB_ID/);
  assert.match(source, /elyon:tab-changed/);
  assert.match(source, /elyon:runtime-group-loaded/);
});

test("Vercel build loads the mount fix after the workforce client inside the lazy group", async () => {
  const build = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  const runtime = await readFile(new URL("../seller-runtime-loader.js", import.meta.url), "utf8");
  const desktopClient = runtime.indexOf('{ src: "/ai-workforce-client.js" }');
  const desktopFix = runtime.indexOf('{ src: "/ai-workforce-mount-fix.js" }');
  const mobileClient = build.indexOf('"ai-workforce-client.js"');
  const mobileFix = build.indexOf('"ai-workforce-mount-fix.js"');

  assert.ok(desktopClient > 0);
  assert.ok(desktopFix > desktopClient);
  assert.ok(mobileClient > 0);
  assert.ok(mobileFix > mobileClient);
  assert.doesNotMatch(build, /<script[^>]+ai-workforce-client\.js/);
  assert.doesNotMatch(build, /<script[^>]+ai-workforce-mount-fix\.js/);
  assert.match(build, /\["ai-workforce-mount-fix\.js", "public\/ai-workforce-mount-fix\.js"\]/);
});

test("mount fix, runtime optimizer and build script are valid JavaScript", () => {
  syntaxCheck("ai-workforce-mount-fix.js");
  syntaxCheck("seller-runtime-loader.js");
  syntaxCheck("scripts/virtual-agents-runtime-optimization.mjs");
  syntaxCheck("scripts/prepare-vercel.mjs");
});
