import { copyFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const filesToMirror = [
  ["index.html", "public/index.html"],
];

for (const [source, destination] of filesToMirror) {
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

console.log("Prepared Vercel static output.");
