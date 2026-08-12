import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const publicRoot = path.join(appRoot, "public");
const registryClientName = "seller-ai-agent-registry-client.js";
const jarvisBootstrapName = "seller-jarvis-bootstrap.js";
const jarvisClientNames = [
  "seller-jarvis-client.js",
  "seller-jarvis-ui.js",
  "seller-jarvis-command-center.js",
  "seller-jarvis-companion-handoff.js",
];
const clientNames = [registryClientName, jarvisBootstrapName, ...jarvisClientNames];

function injectRuntimeLoader(source) {
  const marker = '      { src: "/seller-ai-workforce-agent-builder.js" },';
  if (!source.includes(marker)) throw new Error("Agent Registry konnte nicht vor dem bestehenden Agent Builder registriert werden.");
  let next = source;
  for (const name of clientNames) next = next.replace(`      { src: "/${name}" },\n`, "");
  return next.replace(marker, [`      { src: "/${registryClientName}" },`, marker].join("\n"));
}

function replaceMarkedBlock(source, startMarker, endMarker, content) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start >= 0 && end > start) return `${source.slice(0, start)}${startMarker}\n${content}\n${endMarker}${source.slice(end + endMarker.length)}`;
  const bodyEnd = source.lastIndexOf("</body>");
  if (bodyEnd < 0) throw new Error("Jarvis konnte nicht in das HTML eingebunden werden.");
  return `${source.slice(0, bodyEnd)}${startMarker}\n${content}\n${endMarker}\n${source.slice(bodyEnd)}`;
}

function injectDesktopHtml(source) {
  const content = `<script defer src="/${jarvisBootstrapName}?v=${Date.now()}"></script>`;
  return replaceMarkedBlock(source, "<!-- ELYON_JARVIS_D1 -->", "<!-- /ELYON_JARVIS_D1 -->", content);
}

function injectMobileHtml(source) {
  const marker = '<script defer src="/seller-ai-workforce-agent-builder.js';
  const index = source.indexOf(marker);
  if (index < 0) throw new Error("Agent Registry/Jarvis konnte nicht in den mobilen Workforce-Build eingebunden werden.");
  const end = source.indexOf("</script>", index);
  if (end < 0) throw new Error("Bestehendes Agent-Builder-Script im Mobile-Build ist ungültig.");
  const versionMatch = source.slice(index, end).match(/\?v=([^"']+)/);
  const version = versionMatch?.[1] || Date.now();
  const injectedNames = [registryClientName, jarvisBootstrapName];
  let next = source;
  for (const name of clientNames) {
    const pattern = new RegExp(`<script defer src="/${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?v=[^\"]+"></script>\\n?`, "g");
    next = next.replace(pattern, "");
  }
  const currentIndex = next.indexOf(marker);
  const injected = injectedNames.map((name) => `<script defer src="/${name}?v=${version}"></script>`).join("\n");
  return `${next.slice(0, currentIndex)}${injected}\n${next.slice(currentIndex)}`;
}

await Promise.all(clientNames.map((name) => copyFile(path.join(appRoot, name), path.join(publicRoot, name))));

const runtimePath = path.join(publicRoot, "seller-runtime-loader.js");
const desktopPath = path.join(publicRoot, "index.html");
const mobilePath = path.join(publicRoot, "mobile.html");
const [runtimeSource, desktopSource, mobileSource] = await Promise.all([
  readFile(runtimePath, "utf8"),
  readFile(desktopPath, "utf8"),
  readFile(mobilePath, "utf8"),
]);

await Promise.all([
  writeFile(runtimePath, injectRuntimeLoader(runtimeSource), "utf8"),
  writeFile(desktopPath, injectDesktopHtml(desktopSource), "utf8"),
  writeFile(mobilePath, injectMobileHtml(mobileSource), "utf8"),
]);

console.log("Prepared persistent Elyon Agent Registry plus one-script Jarvis D1/D2/D3 bootstrap for desktop and mobile.");

export { clientNames, injectDesktopHtml, injectMobileHtml, injectRuntimeLoader, jarvisBootstrapName, jarvisClientNames, registryClientName };
