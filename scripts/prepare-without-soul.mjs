import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const publicRoot = path.join(appRoot, "public");
const indexPath = path.join(appRoot, "index.html");
const backupPath = path.join(appRoot, ".elyon-index-before-soul-removal.tmp");
const soulJsPath = path.join(appRoot, "elyon-soul.js");
const soulCssPath = path.join(appRoot, "elyon-soul.css");
const publicSoulJsPath = path.join(publicRoot, "elyon-soul.js");
const publicSoulCssPath = path.join(publicRoot, "elyon-soul.css");

function stripSoulAssets(html) {
  return html
    .replace(/^\s*<link\b[^>]*href=["']\/?elyon-soul\.css(?:\?[^"']*)?["'][^>]*>\s*$/gim, "")
    .replace(/^\s*<script\b[^>]*src=["']\/?elyon-soul\.js(?:\?[^"']*)?["'][^>]*>\s*<\/script>\s*$/gim, "");
}

async function prepareBeforeBuild() {
  const originalIndex = await readFile(indexPath, "utf8");
  const strippedIndex = stripSoulAssets(originalIndex);

  await writeFile(backupPath, originalIndex, "utf8");
  await writeFile(indexPath, strippedIndex, "utf8");

  // prepare-vercel.mjs still contains two historical mirror entries. Temporary
  // empty files satisfy that old build contract; they are removed after output.
  await writeFile(soulJsPath, "", "utf8");
  await writeFile(soulCssPath, "", "utf8");
}

async function cleanupAfterBuild() {
  try {
    const originalIndex = await readFile(backupPath, "utf8");
    await writeFile(indexPath, originalIndex, "utf8");
  } catch {
    // No backup means there is nothing to restore.
  }

  await rm(backupPath, { force: true });
  await rm(soulJsPath, { force: true });
  await rm(soulCssPath, { force: true });
  await rm(publicSoulJsPath, { force: true });
  await rm(publicSoulCssPath, { force: true });
}

const mode = String(process.argv[2] || "run").toLowerCase();

if (mode === "pre") {
  await prepareBeforeBuild();
} else if (mode === "post") {
  await cleanupAfterBuild();
} else if (mode === "run") {
  await prepareBeforeBuild();
  try {
    await import(`./prepare-vercel.mjs?without-soul=${Date.now()}`);
  } finally {
    await cleanupAfterBuild();
  }
} else {
  throw new Error(`Unbekannter prepare-without-soul Modus: ${mode}`);
}

console.log(`Elyon Soul Build-Cleanup abgeschlossen (${mode}).`);
