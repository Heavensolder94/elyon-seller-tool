import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const workspaceRoot = path.resolve(appRoot, "..");

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseEnvFile(filePath) {
  const parsed = {};
  const raw = readFileSync(filePath, "utf8");

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const normalized = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eqIndex = normalized.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = normalized.slice(0, eqIndex).trim();
    const value = stripQuotes(normalized.slice(eqIndex + 1).trim());
    if (key) parsed[key] = value;
  }

  return parsed;
}

export function loadLocalEnv() {
  const candidates = [
    path.join(workspaceRoot, ".env.local"),
    path.join(workspaceRoot, ".env"),
    path.join(appRoot, ".env.local"),
    path.join(appRoot, ".env"),
  ];

  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    const parsed = parseEnvFile(filePath);
    for (const [key, value] of Object.entries(parsed)) {
      if (!(key in process.env) || process.env[key] === "") {
        process.env[key] = value;
      }
    }
    return filePath;
  }

  return null;
}
