import { readFile, writeFile } from "node:fs/promises";
const file = new URL("../public/seller-runtime-loader.js", import.meta.url);
const marker = '      { src: "/seller-ai-workforce-routing-center.js" },';
const entries = [
  '      { src: "/seller-ai-workforce-v7-core.js" },',
  '      { src: "/seller-ai-workforce-v7-style.js" },',
  '      { src: "/seller-ai-workforce-v7-view.js" },',
].join("\n");
const source = await readFile(file, "utf8");
if (!source.includes(marker)) throw new Error("Workforce V7 routing marker missing.");
const clean = source.replace(/\n\s*\{ src: "\/seller-ai-workforce-v7-(?:core|style|view)\.js" \},/g, "");
await writeFile(file, clean.replace(marker, `${marker}\n${entries}`), "utf8");
