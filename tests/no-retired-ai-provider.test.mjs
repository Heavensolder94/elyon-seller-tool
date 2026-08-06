import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const excludedDirectories = new Set([".git", "node_modules", ".vercel"]);
const includedExtensions = new Set([
  ".cjs",
  ".css",
  ".env",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const retiredProviderTerms = [
  ["qw", "en"],
  ["dash", "scope"],
].map((parts) => parts.join(""));

async function scanDirectory(directory, findings = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scanDirectory(absolutePath, findings);
      continue;
    }
    if (!entry.isFile() || !includedExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const content = (await readFile(absolutePath, "utf8")).toLowerCase();
    const matches = retiredProviderTerms.filter((term) => content.includes(term));
    if (matches.length) {
      findings.push({
        path: path.relative(root, absolutePath),
        matches,
      });
    }
  }
  return findings;
}

test("repository contains no retired AI provider references", async () => {
  const findings = await scanDirectory(root);
  assert.deepEqual(findings, []);
});