import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  optimizeProviderModelGuard,
  optimizeWorkforceV2Operations,
  optimizeWorkforceV2Structure,
  optimizeWorkforceWorkspaceV3,
} from "./virtual-agents-runtime-optimization.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const publicRoot = path.join(appRoot, "public");

const redesignSource = path.join(appRoot, "seller-virtual-agents-redesign.js");
const redesignTarget = path.join(publicRoot, "seller-virtual-agents-redesign.js");
await copyFile(redesignSource, redesignTarget);

const transforms = [
  ["seller-ai-workforce-structure-v2.js", optimizeWorkforceV2Structure],
  ["seller-ai-workforce-v2-operations.js", optimizeWorkforceV2Operations],
  ["seller-ai-workforce-workspace-v3.js", optimizeWorkforceWorkspaceV3],
  ["seller-ai-provider-model-guard.js", optimizeProviderModelGuard],
];

for (const [file, optimize] of transforms) {
  const filePath = path.join(publicRoot, file);
  const source = await readFile(filePath, "utf8");
  const optimized = optimize(source);
  if (optimized.includes("observer.observe(document.documentElement")) {
    throw new Error(`Virtual-Agent-Finalisierung fehlgeschlagen: globaler Observer blieb in ${file}.`);
  }
  await writeFile(filePath, optimized, "utf8");
}

const runtimeLoader = await readFile(path.join(publicRoot, "seller-runtime-loader.js"), "utf8");
if (!runtimeLoader.includes('/seller-virtual-agents-redesign.js')) {
  throw new Error("Virtual-Agent-Finalisierung fehlgeschlagen: Redesign fehlt im Runtime-Loader.");
}

const redesign = await readFile(redesignTarget, "utf8");
if (!redesign.includes('data-aiw-view-button="team"') || !redesign.includes('data-aiw-view-button="tasks"')) {
  throw new Error("Virtual-Agent-Finalisierung fehlgeschlagen: Team-/Arbeitsmappenansicht unvollständig.");
}

console.log("Virtual agents finalized: V3 workspace canonical, redesign asset mirrored, global VM observers removed from production runtime.");