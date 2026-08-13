import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const publicRoot = path.join(appRoot, "public");
const indexPath = path.join(appRoot, "index.html");
const soulJsPath = path.join(appRoot, "elyon-soul.js");
const soulCssPath = path.join(appRoot, "elyon-soul.css");
const publicSoulJsPath = path.join(publicRoot, "elyon-soul.js");
const publicSoulCssPath = path.join(publicRoot, "elyon-soul.css");

function stripSoulAssets(html) {
  return html
    .replace(/^\s*<link\b[^>]*href=["']\/?elyon-soul\.css(?:\?[^"']*)?["'][^>]*>\s*$/gim, "")
    .replace(/^\s*<script\b[^>]*src=["']\/?elyon-soul\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script>\s*$/gim, "");
}

const originalIndex = await readFile(indexPath, "utf8");
const strippedIndex = stripSoulAssets(originalIndex);

if (strippedIndex === originalIndex) {
  console.log("Elyon Soul: keine Legacy-Asset-Tags im Desktop-HTML gefunden.");
}

try {
  // prepare-vercel.mjs hat historisch zwei Soul-Mirror-Eintraege. Die temporaeren
  // Leerdateien halten diesen alten Build-Vertrag kompatibel, ohne Soul auszuliefern.
  await writeFile(indexPath, strippedIndex, "utf8");
  await writeFile(soulJsPath, "", "utf8");
  await writeFile(soulCssPath, "", "utf8");

  await import(`./prepare-vercel.mjs?without-soul=${Date.now()}`);
} finally {
  await writeFile(indexPath, originalIndex, "utf8");
  await rm(soulJsPath, { force: true });
  await rm(soulCssPath, { force: true });
  await rm(publicSoulJsPath, { force: true });
  await rm(publicSoulCssPath, { force: true });
}

console.log("Elyon Soul wurde aus dem ausgelieferten Seller-Tool entfernt.");
