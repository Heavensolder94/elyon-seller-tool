import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const outputPath = path.join(appRoot, "public", "index.html");
const previewStylesheet = '<link rel="stylesheet" href="/elyon-clean.css?v=seller-os-preview-20260810" data-elyon-preview-design="true" />';

const html = await readFile(outputPath, "utf8");

if (!html.includes("</head>")) {
  throw new Error("Preview design injection failed: </head> not found in public/index.html");
}

const cleaned = html.replace(/\s*<link[^>]+data-elyon-preview-design=["']true["'][^>]*>\s*/gi, "\n");
const output = cleaned.replace("</head>", `  ${previewStylesheet}\n</head>`);

await writeFile(outputPath, output, "utf8");
console.log("Preview design stylesheet injected into public/index.html");
