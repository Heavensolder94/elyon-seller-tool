import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

test("Elyon Soul runtime and API files are removed", async () => {
  const removed = [
    "elyon-soul.js",
    "elyon-soul.css",
    "public/elyon-soul.js",
    "public/elyon-soul.css",
    "api/elyon-soul.js",
    "api/secure-elyon-soul.js",
    "docs/ai/SOUL_SYSTEM.md",
  ];

  for (const file of removed) {
    assert.equal(await exists(file), false, `${file} must remain removed`);
  }
});

test("Vercel no longer exposes the Elyon Soul API rewrite", async () => {
  const vercel = await readFile(path.join(root, "vercel.json"), "utf8");
  assert.doesNotMatch(vercel, /\/api\/elyon-soul|secure-elyon-soul/);
});

test("web preparation strips legacy Soul asset tags from generated output", async () => {
  const packageJson = await readFile(path.join(root, "package.json"), "utf8");
  const cleanup = await readFile(path.join(root, "scripts/prepare-without-soul.mjs"), "utf8");
  assert.match(packageJson, /prepare-without-soul\.mjs/);
  assert.match(cleanup, /elyon-soul\.css/);
  assert.match(cleanup, /elyon-soul\.js/);
  assert.match(cleanup, /stripSoulAssets/);
  assert.match(cleanup, /rm\(publicSoulJsPath/);
  assert.match(cleanup, /rm\(publicSoulCssPath/);
});
