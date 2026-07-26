import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const publicRoot = path.join(appRoot, "public");

await import("./check-layout.mjs");

const mobileModuleScripts = [
  "seller-auth.js",
  "mobile-live.js",
  "mobile-flags.js",
  "mobile-scanner-v2.js",
  "mobile-brain-v2.js",
  "mobile-push-v1.js",
  "mobile-agents-v1.js",
  "mobile-bootstrap.js",
  "mobile-more-ui.js",
];

function injectMobileScripts(html) {
  const marker = "<!-- ELYON_MOBILE_MODULES -->";
  const scriptBlock = [
    marker,
    ...mobileModuleScripts.map((file) => `<script defer src="/${file}?v=${Date.now()}"></script>`),
  ].join("\n  ");

  const cleaned = html.replace(new RegExp(`\\s*${marker}[\\s\\S]*?(?=</body>)`, "m"), "");
  return cleaned.includes("</body>") ? cleaned.replace("</body>", `  ${scriptBlock}\n</body>`) : `${cleaned}\n${scriptBlock}\n`;
}

function injectDesktopSecurity(html) {
  const start = "<!-- ELYON_DESKTOP_SECURITY -->";
  const end = "<!-- /ELYON_DESKTOP_SECURITY -->";
  const block = `${start}\n  <script defer src="/seller-auth.js"></script>\n  ${end}`;
  const cleaned = html.replace(new RegExp(`\\s*${start}[\\s\\S]*?${end}`, "m"), "");
  return cleaned.includes("</body>") ? cleaned.replace("</body>", `  ${block}\n</body>`) : `${cleaned}\n${block}\n`;
}

const filesToMirror = [
  ["elyon-clean.css", "public/elyon-clean.css"],
  ["elyon-ui.js", "public/elyon-ui.js"],
  ["seller-auth.js", "public/seller-auth.js"],
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

const desktopSourcePath = path.join(appRoot, "index.html");
const desktopDestinationPath = path.join(publicRoot, "index.html");
await mkdir(path.dirname(desktopDestinationPath), { recursive: true });
const desktopHtml = await readFile(desktopSourcePath, "utf8");
await writeFile(desktopDestinationPath, injectDesktopSecurity(desktopHtml), "utf8");

const mobileSourcePath = path.join(appRoot, "mobile.html");
const mobileDestinationPath = path.join(publicRoot, "mobile.html");
await mkdir(path.dirname(mobileDestinationPath), { recursive: true });
const mobileHtml = await readFile(mobileSourcePath, "utf8");
await writeFile(mobileDestinationPath, injectMobileScripts(mobileHtml), "utf8");

const envStatus = {
  GOOGLE_CLIENT_ID: Boolean(process.env.GOOGLE_CLIENT_ID),
  GOOGLE_CLIENT_SECRET: Boolean(process.env.GOOGLE_CLIENT_SECRET),
  GOOGLE_REDIRECT_URI: Boolean(process.env.GOOGLE_REDIRECT_URI),
  GOOGLE_DRIVE_BACKUP_FOLDER_ID: Boolean(process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID),
  ELYON_SELLER_ACCESS_TOKEN: Boolean(process.env.ELYON_SELLER_ACCESS_TOKEN),
  CRON_SECRET: Boolean(process.env.CRON_SECRET),
};

console.log("Google/security env status:", JSON.stringify(envStatus));
console.log("Prepared Vercel static output, including seller auth, mobile PWA files and module scripts.");
