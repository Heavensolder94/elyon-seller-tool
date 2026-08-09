import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const publicRoot = path.join(appRoot, "public");
const outputPath = path.join(publicRoot, "index.html");
const polishSourcePath = path.join(appRoot, "elyon-preview-polish.css");
const polishOutputPath = path.join(publicRoot, "elyon-preview-polish.css");

const previewStylesheets = [
  '<link rel="stylesheet" href="/elyon-clean.css?v=seller-os-preview-20260810" data-elyon-preview-design="true" />',
  '<link rel="stylesheet" href="/elyon-preview-polish.css?v=seller-os-polish-20260810" data-elyon-preview-polish="true" />',
].join("\n");

await copyFile(polishSourcePath, polishOutputPath);

const html = await readFile(outputPath, "utf8");

if (!html.includes("</head>")) {
  throw new Error("Preview design injection failed: </head> not found in public/index.html");
}

const cleaned = html
  .replace(/\s*<link[^>]+data-elyon-preview-design=["']true["'][^>]*>\s*/gi, "\n")
  .replace(/\s*<link[^>]+data-elyon-preview-polish=["']true["'][^>]*>\s*/gi, "\n");
const output = cleaned.replace("</head>", `  ${previewStylesheets}\n</head>`);

await writeFile(outputPath, output, "utf8");
console.log("Preview design and polish stylesheets injected into public/index.html");
