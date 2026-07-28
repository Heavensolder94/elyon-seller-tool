import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

function syntaxCheck(relativePath) {
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${relativePath}`, import.meta.url))], { stdio: "pipe" });
}

test("AI Workforce is moved into the dedicated virtual agents root", async () => {
  const source = await readFile(new URL("../ai-workforce-mount-fix.js", import.meta.url), "utf8");
  assert.match(source, /virtualAgentsSettingsRoot/);
  assert.match(source, /virtualAgentsTab/);
  assert.match(source, /elyonAiWorkforce/);
  assert.match(source, /root\.replaceChildren\(shell\)/);
  assert.match(source, /MutationObserver/);
});

test("mount fix reacts when the virtual agents menu entry is opened", async () => {
  const source = await readFile(new URL("../ai-workforce-mount-fix.js", import.meta.url), "utf8");
  assert.match(source, /event\.target\?\.id === "mainMenu"/);
  assert.match(source, /event\.target\.value === TAB_ID/);
  assert.match(source, /elyon:tab-changed/);
});

test("Vercel build loads the mount fix after the workforce client", async () => {
  const source = await readFile(new URL("../scripts/prepare-vercel.mjs", import.meta.url), "utf8");
  const desktopClient = source.indexOf('<script defer src="/ai-workforce-client.js"></script>');
  const desktopFix = source.indexOf('<script defer src="/ai-workforce-mount-fix.js"></script>');
  const mobileClient = source.indexOf('"ai-workforce-client.js"');
  const mobileFix = source.indexOf('"ai-workforce-mount-fix.js"');
  assert.ok(desktopClient > 0);
  assert.ok(desktopFix > desktopClient);
  assert.ok(mobileClient > 0);
  assert.ok(mobileFix > mobileClient);
  assert.match(source, /\["ai-workforce-mount-fix\.js", "public\/ai-workforce-mount-fix\.js"\]/);
});

test("mount fix and build script are valid JavaScript", () => {
  syntaxCheck("ai-workforce-mount-fix.js");
  syntaxCheck("scripts/prepare-vercel.mjs");
});
