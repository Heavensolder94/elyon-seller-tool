import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnv } from "./load-env.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const publicRoot = path.join(appRoot, "public");
const loadedEnvFile = loadLocalEnv();

await import("./check-layout.mjs");

const mobileModuleScripts = [
  "mobile-live.js",
  "mobile-flags.js",
  "mobile-scanner-v2.js",
  "mobile-brain-v2.js",
  "mobile-push-v1.js",
  "mobile-agents-v1.js",
  "mobile-bootstrap.js",
  "mobile-more-ui.js",
];

function injectMobileScripts(html, basePath = "/") {
  const marker = "<!-- ELYON_MOBILE_MODULES -->";
  const mobileScriptPattern = /\s*<script\b[^>]*src="\/mobile-(live|flags|scanner-v2|brain-v2|push-v1|agents-v1|bootstrap|more-ui)\.js(?:\?[^"]*)?"[^>]*><\/script>/g;
  const scriptBlock = [
    marker,
    ...mobileModuleScripts.map((file) => `<script defer src="${basePath}${file}?v=${Date.now()}"></script>`),
  ].join("\n  ");

  const cleaned = html
    .replace(mobileScriptPattern, "")
    .replace(new RegExp(`\\s*${marker}[\\s\\S]*?(?=</body>)`, "m"), "");
  return cleaned.includes("</body>") ? cleaned.replace("</body>", `  ${scriptBlock}\n</body>`) : `${cleaned}\n${scriptBlock}\n`;
}

function rewriteMobileModulePaths(source) {
  return source.replaceAll("file: '/mobile-", "file: '/mobile/mobile-");
}

const filesToMirror = [
  ["elyon-clean.css", "public/elyon-clean.css"],
  ["elyon-ui.js", "public/elyon-ui.js"],
  ["ai-agent-engine.js", "public/ai-agent-engine.js"],
  ["elyon-soul.css", "public/elyon-soul.css"],
  ["elyon-soul.js", "public/elyon-soul.js"],
  ["mobile-live.js", "public/mobile-live.js"],
  ["mobile-flags.js", "public/mobile-flags.js"],
  ["mobile-scanner-v2.js", "public/mobile-scanner-v2.js"],
  ["mobile-brain-v2.js", "public/mobile-brain-v2.js"],
  ["mobile-push-v1.js", "public/mobile-push-v1.js"],
  ["mobile-agents-v1.js", "public/mobile-agents-v1.js"],
  ["mobile-bootstrap.js", "public/mobile-bootstrap.js"],
  ["mobile-more-ui.js", "public/mobile-more-ui.js"],
  ["manifest.json", "public/manifest.json"],
];

for (const [source, destination] of filesToMirror) {
  const sourcePath = path.join(appRoot, source);
  const destinationPath = path.join(publicRoot, path.relative("public", destination));
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
}

const mobileSourcePath = path.join(appRoot, "mobile.html");
const mobileAppSourcePath = path.join(appRoot, "mobile-app.html");
const mobileDestinationPath = path.join(publicRoot, "mobile.html");
await mkdir(path.dirname(mobileDestinationPath), { recursive: true });
const mobileHtml = await readFile(mobileSourcePath, "utf8");
const mobileAppHtml = await readFile(mobileAppSourcePath, "utf8");
await writeFile(mobileDestinationPath, mobileHtml, "utf8");

const mobilePublicRoot = path.join(publicRoot, "mobile");
await mkdir(mobilePublicRoot, { recursive: true });

for (const file of mobileModuleScripts) {
  const sourcePath = path.join(appRoot, file);
  const destinationPath = path.join(mobilePublicRoot, file);
  const source = await readFile(sourcePath, "utf8");
  const output = file === "mobile-bootstrap.js" ? rewriteMobileModulePaths(source) : source;
  await writeFile(destinationPath, output, "utf8");
}

const mobileFolderIndexPath = path.join(mobilePublicRoot, "index.html");
await writeFile(mobileFolderIndexPath, injectMobileScripts(mobileAppHtml, "/mobile/"), "utf8");

const envStatus = {
  GOOGLE_CLIENT_ID: Boolean(process.env.GOOGLE_CLIENT_ID),
  GOOGLE_CLIENT_SECRET: Boolean(process.env.GOOGLE_CLIENT_SECRET),
  GOOGLE_REDIRECT_URI: Boolean(process.env.GOOGLE_REDIRECT_URI),
  GOOGLE_DRIVE_BACKUP_FOLDER_ID: Boolean(process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID),
};

console.log("Google env status:", JSON.stringify(envStatus));
if (loadedEnvFile) {
  console.log(`Loaded local env from: ${loadedEnvFile}`);
}
console.log("Prepared Vercel static output.");
