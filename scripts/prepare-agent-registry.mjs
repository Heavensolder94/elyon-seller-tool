import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const publicRoot = path.join(appRoot, "public");
const sourceName = "seller-ai-agent-registry-client.js";

function injectRuntimeLoader(source) {
  if (source.includes(`{ src: "/${sourceName}" }`)) return source;
  const marker = '      { src: "/seller-ai-workforce-agent-builder.js" },';
  if (!source.includes(marker)) throw new Error("Agent Registry konnte nicht vor dem bestehenden Agent Builder registriert werden.");
  return source.replace(marker, [
    `      { src: "/${sourceName}" },`,
    marker,
  ].join("\n"));
}

function injectMobileHtml(source) {
  if (source.includes(`src="/${sourceName}`)) return source;
  const marker = '<script defer src="/seller-ai-workforce-agent-builder.js';
  const index = source.indexOf(marker);
  if (index < 0) throw new Error("Agent Registry konnte nicht in den mobilen Workforce-Build eingebunden werden.");
  const end = source.indexOf("</script>", index);
  if (end < 0) throw new Error("Bestehendes Agent-Builder-Script im Mobile-Build ist ungültig.");
  const versionMatch = source.slice(index, end).match(/\?v=([^"']+)/);
  const version = versionMatch?.[1] || Date.now();
  return `${source.slice(0, index)}<script defer src="/${sourceName}?v=${version}"></script>\n${source.slice(index)}`;
}

await copyFile(path.join(appRoot, sourceName), path.join(publicRoot, sourceName));

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

console.log("Prepared persistent Elyon Agent Registry client for desktop and mobile virtual workforce runtime.");

export { injectMobileHtml, injectRuntimeLoader };
