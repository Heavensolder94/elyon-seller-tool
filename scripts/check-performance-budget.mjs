import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditDesktopPerformance } from "./performance-budget.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const publicRoot = path.join(appRoot, "public");

const [sourceHtml, outputHtml, coreCode, agentsCode, runtimeLoaderSource] = await Promise.all([
  readFile(path.join(appRoot, "index.html"), "utf8"),
  readFile(path.join(publicRoot, "index.html"), "utf8"),
  readFile(path.join(publicRoot, "seller-app-core.js"), "utf8"),
  readFile(path.join(publicRoot, "seller-virtual-agents-legacy.js"), "utf8"),
  readFile(path.join(appRoot, "seller-runtime-loader.js"), "utf8"),
]);

const result = await auditDesktopPerformance({
  sourceHtml,
  outputHtml,
  coreCode,
  agentsCode,
  runtimeLoaderSource,
  publicRoot,
});

console.log("Performance budget OK:", JSON.stringify(result.metrics));
