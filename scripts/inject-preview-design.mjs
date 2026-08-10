import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const publicRoot = path.join(appRoot, "public");
const outputPath = path.join(publicRoot, "index.html");
const polishSourcePath = path.join(appRoot, "elyon-preview-polish.css");
const polishOutputPath = path.join(publicRoot, "elyon-preview-polish.css");
const orgchartSourcePath = path.join(appRoot, "seller-ai-workforce-orgchart-v1.js");
const orgchartOutputPath = path.join(publicRoot, "seller-ai-workforce-orgchart-v1.js");
const companyEntrySourcePath = path.join(appRoot, "seller-ai-workforce-company-entry-preview.js");
const companyEntryOutputPath = path.join(publicRoot, "seller-ai-workforce-company-entry-preview.js");

const previewAssets = [
  '<link rel="stylesheet" href="/elyon-clean.css?v=seller-os-preview-20260810" data-elyon-preview-design="true" />',
  '<link rel="stylesheet" href="/elyon-preview-polish.css?v=seller-os-polish-20260810-3" data-elyon-preview-polish="true" />',
  '<script defer src="/seller-ai-workforce-orgchart-v1.js?v=orgchart-focus-20260810-3" data-elyon-preview-orgchart="true"></script>',
  '<script defer src="/seller-ai-workforce-company-entry-preview.js?v=company-focus-20260810-3" data-elyon-preview-company-entry="true"></script>',
].join("\n");

await Promise.all([
  copyFile(polishSourcePath, polishOutputPath),
  copyFile(orgchartSourcePath, orgchartOutputPath),
  copyFile(companyEntrySourcePath, companyEntryOutputPath),
]);

const html = await readFile(outputPath, "utf8");

if (!html.includes("</head>")) {
  throw new Error("Preview design injection failed: </head> not found in public/index.html");
}

const cleaned = html
  .replace(/\s*<link[^>]+data-elyon-preview-design=["']true["'][^>]*>\s*/gi, "\n")
  .replace(/\s*<link[^>]+data-elyon-preview-polish=["']true["'][^>]*>\s*/gi, "\n")
  .replace(/\s*<script[^>]+data-elyon-preview-orgchart=["']true["'][^>]*><\/script>\s*/gi, "\n")
  .replace(/\s*<script[^>]+data-elyon-preview-company-entry=["']true["'][^>]*><\/script>\s*/gi, "\n");
const output = cleaned.replace("</head>", `  ${previewAssets}\n</head>`);

await writeFile(outputPath, output, "utf8");
console.log("Preview design, compact polish and workforce company focus view injected into public/index.html");
