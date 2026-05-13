import { copyFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const filesToMirror = [
  ["index.html", "public/index.html"],
  ["elyon-clean.css", "public/elyon-clean.css"],
  ["elyon-ui.js", "public/elyon-ui.js"],
  ["elyon-soul.css", "public/elyon-soul.css"],
  ["elyon-soul.js", "public/elyon-soul.js"],
];

for (const [source, destination] of filesToMirror) {
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

console.log("Prepared Vercel static output.");
