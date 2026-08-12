import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const vercelUrl = new URL("../vercel.json", import.meta.url);
const prepareUrl = new URL("../scripts/prepare-agent-registry.mjs", import.meta.url);

test("production Vercel build packages and injects Jarvis assets", async () => {
  const [vercelSource, prepareSource] = await Promise.all([
    readFile(vercelUrl, "utf8"),
    readFile(prepareUrl, "utf8"),
  ]);

  const vercel = JSON.parse(vercelSource);
  const command = String(vercel.buildCommand || "");
  const prepareVercelIndex = command.indexOf("scripts/prepare-vercel.mjs");
  const prepareJarvisIndex = command.indexOf("scripts/prepare-agent-registry.mjs");
  const finalizeIndex = command.indexOf("scripts/finalize-seller-os.mjs");

  assert.ok(prepareVercelIndex >= 0, "Vercel production build must prepare public output first");
  assert.ok(prepareJarvisIndex > prepareVercelIndex, "Jarvis assets must be copied/injected after public output is prepared");
  assert.ok(finalizeIndex > prepareJarvisIndex, "Seller OS finalization must preserve already injected Jarvis assets");

  assert.match(prepareSource, /seller-jarvis-bootstrap\.js/);
  assert.match(prepareSource, /seller-jarvis-e5-pipeline\.js/);
  assert.match(prepareSource, /copyFile\(path\.join\(appRoot, name\), path\.join\(publicRoot, name\)\)/);
  assert.match(prepareSource, /ELYON_JARVIS_D1/);
});
