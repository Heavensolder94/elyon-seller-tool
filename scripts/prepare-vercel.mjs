import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const publicRoot = path.join(appRoot, "public");

await import("./check-layout.mjs");

const filesToMirror = [
  ["elyon-clean.css", "public/elyon-clean.css"],
  ["elyon-ui.js", "public/elyon-ui.js"],
  ["ai-agent-engine.js", "public/ai-agent-engine.js"],
  ["elyon-soul.css", "public/elyon-soul.css"],
  ["elyon-soul.js", "public/elyon-soul.js"],
  ["mobile.html", "public/mobile.html"],
  ["mobile-live.js", "public/mobile-live.js"],
  ["mobile-flags.js", "public/mobile-flags.js"],
  ["mobile-scanner-v2.js", "public/mobile-scanner-v2.js"],
  ["mobile-brain-v2.js", "public/mobile-brain-v2.js"],
  ["mobile-push-v1.js", "public/mobile-push-v1.js"],
  ["mobile-agents-v1.js", "public/mobile-agents-v1.js"],
  ["manifest.json", "public/manifest.json"],
];

for (const [source, destination] of filesToMirror) {
  const sourcePath = path.join(appRoot, source);
  const destinationPath = path.join(publicRoot, path.relative("public", destination));
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
}

const envStatus = {
  GOOGLE_CLIENT_ID: Boolean(process.env.GOOGLE_CLIENT_ID),
  GOOGLE_CLIENT_SECRET: Boolean(process.env.GOOGLE_CLIENT_SECRET),
  GOOGLE_REDIRECT_URI: Boolean(process.env.GOOGLE_REDIRECT_URI),
  GOOGLE_DRIVE_BACKUP_FOLDER_ID: Boolean(process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID),
};

console.log("Google env status:", JSON.stringify(envStatus));
console.log("Prepared Vercel static output, including mobile PWA files.");
