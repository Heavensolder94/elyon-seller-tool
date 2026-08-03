import { access, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const testsDir = path.join(root, "tests");
const entries = (await readdir(testsDir))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort();

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

const googleSheetsCompatibilityFile = path.join(root, "api", "google-sheets-sync-settings.js");
const filtered = [];
const skipped = [];

for (const name of entries) {
  if (name === "seller-access.test.mjs" && !(await exists(googleSheetsCompatibilityFile))) {
    skipped.push({
      name,
      reason: "api/google-sheets-sync-settings.js is intentionally removed by .vercelignore before the Hobby deployment build",
    });
    continue;
  }
  filtered.push(path.join("tests", name));
}

if (!filtered.length) throw new Error("Keine ausführbaren Vercel-Tests gefunden.");
if (skipped.length) console.log("Vercel test exclusions:", JSON.stringify(skipped));

const child = spawn(process.execPath, ["--test", ...filtered], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Vercel tests terminated by ${signal}.`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = Number(code || 0);
});
