import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../api/extension/import-product.js", import.meta.url), "utf8");

test("disabled direct Nova import returns its feature gate before importer auth", () => {
  const featureGate = source.indexOf("if (!directNovaImportEnabled())");
  const accessGuard = source.indexOf("requireImporterAccess(req, res");

  assert.ok(featureGate >= 0, "direct import feature gate missing");
  assert.ok(accessGuard >= 0, "importer access guard missing");
  assert.ok(featureGate < accessGuard, "disabled route must not report missing importer credentials before its feature gate");
});

test("enabled direct Nova import still requires importer auth and persistent storage", () => {
  assert.match(source, /requireImporterAccess\(req, res, \{ requirePersistentStorage: true, maxBodyBytes: 512 \* 1024 \}\)/);
  assert.match(source, /return internalHandler\(req, res\)/);
});
