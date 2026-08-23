import { readFile, writeFile } from "node:fs/promises";

const file = new URL("./public/seller-runtime-loader.js", import.meta.url);
const source = await readFile(file, "utf8");

// Jarvis V7 is an orchestration/overview layer and must not replace the
// dedicated "Virtuelle Mitarbeiter" company structure. Production Seller OS
// already wires Orgchart + Company Entry into virtualAgentsTab. Keep those
// views authoritative and strip any stale V7 overlay entries from the lazy
// workforce group.
const cleaned = source.replace(
  /\n\s*\{ src: "\/seller-ai-workforce-v7-(?:core|style|view)\.js" \},/g,
  "",
);

await writeFile(file, cleaned, "utf8");
console.log("Kept Jarvis V7 overlay out of the dedicated virtual employees tab.");
