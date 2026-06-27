import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const publicRoot = path.join(appRoot, "public");

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

function injectMobileScripts(html) {
  const marker = "<!-- ELYON_MOBILE_MODULES -->";
  const scriptBlock = [
    marker,
    ...mobileModuleScripts.map((file) => `<script defer src="/${file}?v=${Date.now()}"></script>`),
  ].join("\n  ");

  const cleaned = html.replace(new RegExp(`\\s*${marker}[\\s\\S]*?(?=</body>)`, "m"), "");
  return cleaned.includes("</body>") ? cleaned.replace("</body>", `  ${scriptBlock}\n</body>`) : `${cleaned}\n${scriptBlock}\n`;
}

function injectCompanyOsPurpose(html) {
  const purposeStyles = `
    .purpose-card{background:linear-gradient(180deg,rgba(96,165,250,.16),rgba(139,92,246,.08));border:1px solid rgba(96,165,250,.26)}
    .purpose-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
    .purpose-box{padding:13px 14px;border-radius:17px;background:rgba(2,6,23,.42);border:1px solid rgba(255,255,255,.1)}
    .purpose-box strong{display:block;margin-bottom:6px;color:#bfdbfe}
    .purpose-list{display:grid;gap:7px;margin-top:12px;color:#e2e8f0;font-size:13px;line-height:1.45}
    .purpose-question{margin-top:14px;padding:14px;border-radius:18px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.24);color:#bbf7d0;font-weight:900}
    @media(max-width:980px){.purpose-grid{grid-template-columns:1fr}}
  `;

  const purposeCard = `
          <div class="card span-12 purpose-card">
            <h2>Warum gibt es Elyon Company OS?</h2>
            <p class="muted">Elyon Company OS ist nicht einfach noch ein weiteres Tool. Es ist die virtuelle Firmenzentrale ueber deinem Seller Tool, damit dein Business nicht in ChatGPT-Chats, GitHub, eBay, Browser-Tabs und Kopfchaos zerfaellt.</p>
            <div class="purpose-grid">
              <div class="purpose-box">
                <strong>Elyon Seller Tool</strong>
                <p class="muted">Produkte, Listings, Import, KI, eBay, Lieferanten und technische Workflows.</p>
              </div>
              <div class="purpose-box">
                <strong>Elyon Company OS</strong>
                <p class="muted">Fokus, Aufgaben, Projekte, Entscheidungen, Prioritaeten, Warnungen und Cashflow.</p>
              </div>
            </div>
            <div class="purpose-list">
              <div>✅ Weniger Kopfchaos.</div>
              <div>✅ Mehr Fokus.</div>
              <div>✅ Schneller Produkte listen.</div>
              <div>✅ Bessere Entscheidungen.</div>
              <div>✅ Klarer Weg zum ersten Cashflow.</div>
            </div>
            <div class="purpose-question">Zentrale CEO-Frage: Was bringt mich heute naeher zum ersten Verkauf?</div>
          </div>
`;

  const withStyles = html.replace("    @media(max-width:980px){", `${purposeStyles}\n\n    @media(max-width:980px){`);
  return withStyles.replace('        <div class="grid">', `        <div class="grid">\n${purposeCard}`);
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

const companyOsSourcePath = path.join(appRoot, "standalone/company-os-v1.html");
const companyOsDestinationPath = path.join(publicRoot, "standalone/company-os-v1.html");
await mkdir(path.dirname(companyOsDestinationPath), { recursive: true });
const companyOsHtml = await readFile(companyOsSourcePath, "utf8");
await writeFile(companyOsDestinationPath, injectCompanyOsPurpose(companyOsHtml), "utf8");

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
};

console.log("Google env status:", JSON.stringify(envStatus));
console.log("Prepared Vercel static output, including mobile PWA files, module scripts, and standalone Company OS with purpose card.");
