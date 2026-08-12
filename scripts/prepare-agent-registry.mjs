import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const publicRoot = path.join(appRoot, "public");
const clientNames = [
  "seller-ai-agent-registry-client.js",
  "seller-jarvis-client.js",
];

function runtimeEntries() {
  return clientNames.map((name) => `      { src: "/${name}" },`);
}

function injectRuntimeLoader(source) {
  const marker = '      { src: "/seller-ai-workforce-agent-builder.js" },';
  if (!source.includes(marker)) throw new Error("Agent Registry/Jarvis konnte nicht vor dem bestehenden Agent Builder registriert werden.");
  let next = source;
  for (const name of clientNames) {
    next = next.replace(`      { src: "/${name}" },\n`, "");
  }
  return next.replace(marker, [
    ...runtimeEntries(),
    marker,
  ].join("\n"));
}

function injectMobileHtml(source) {
  const marker = '<script defer src="/seller-ai-workforce-agent-builder.js';
  const index = source.indexOf(marker);
  if (index < 0) throw new Error("Agent Registry/Jarvis konnte nicht in den mobilen Workforce-Build eingebunden werden.");
  const end = source.indexOf("</script>", index);
  if (end < 0) throw new Error("Bestehendes Agent-Builder-Script im Mobile-Build ist ungültig.");
  const versionMatch = source.slice(index, end).match(/\?v=([^"']+)/);
  const version = versionMatch?.[1] || Date.now();
  let next = source;
  for (const name of clientNames) {
    const pattern = new RegExp(`<script defer src="/${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?v=[^\"]+"></script>\\n?`, "g");
    next = next.replace(pattern, "");
  }
  const currentIndex = next.indexOf(marker);
  const injected = clientNames.map((name) => `<script defer src="/${name}?v=${version}"></script>`).join("\n");
  return `${next.slice(0, currentIndex)}${injected}\n${next.slice(currentIndex)}`;
}

await Promise.all(clientNames.map((name) => copyFile(path.join(appRoot, name), path.join(publicRoot, name))));

const runtimePath = path.join(publicRoot, "seller-runtime-loader.js");
const mobilePath = path.join(publicRoot, "mobile.html");
const [runtimeSource, mobileSource] = await Promise.all([
  readFile(runtimePath, "utf8"),
  readFile(mobilePath, "utf8"),
]);

await Promise.all([
  writeFile(runtimePath, injectRuntimeLoader(runtimeSource), "utf8"),
  writeFile(mobilePath, injectMobileHtml(mobileSource), "utf8"),
]);

console.log("Prepared persistent Elyon Agent Registry and Jarvis clients for desktop and mobile virtual workforce runtime.");

export { clientNames, injectMobileHtml, injectRuntimeLoader };
