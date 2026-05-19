import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");

const files = [
  path.join(appRoot, "index.html"),
  path.join(appRoot, "public", "index.html"),
];

function fail(message) {
  console.error(`Layout check failed: ${message}`);
  process.exitCode = 1;
}

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function stripIgnoredBlocks(html) {
  return html
    .replace(/^\uFEFF/, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
}

async function main() {
  const [rootHtml, publicHtml] = await Promise.all(
    files.map((file) => readFile(file, "utf8")),
  );

  const normalizedRootHtml = rootHtml.replace(/^\uFEFF/, "");
  const normalizedPublicHtml = publicHtml.replace(/^\uFEFF/, "");

  if (normalizedRootHtml !== normalizedPublicHtml) {
    fail("index.html and public/index.html are out of sync");
  }

  for (const [file, html] of [
    [files[0], normalizedRootHtml],
    [files[1], normalizedPublicHtml],
  ]) {
    const structureHtml = stripIgnoredBlocks(html);
    const bodyOpen = countMatches(structureHtml, /<body\b/gi);
    const bodyClose = countMatches(structureHtml, /<\/body>/gi);
    if (bodyOpen !== 1 || bodyClose !== 1) {
      fail(`${path.relative(appRoot, file)} must contain exactly one <body> and </body>`);
    }

    const mainOpen = countMatches(structureHtml, /<main\b/gi);
    const mainClose = countMatches(structureHtml, /<\/main>/gi);
    if (mainOpen !== 1 || mainClose !== 1) {
      fail(`${path.relative(appRoot, file)} must contain exactly one <main> and </main>`);
    }

    const containerOpen = countMatches(structureHtml, /class="container"/gi);
    if (containerOpen < 1) {
      fail(`${path.relative(appRoot, file)} is missing the container wrapper`);
    }

    const tabOpen = countMatches(structureHtml, /class="tab( active)?"/gi);
    const tabClose = countMatches(structureHtml, /<\/section>/gi);
    if (tabOpen < 3 || tabClose < 3) {
      fail(`${path.relative(appRoot, file)} looks too sparse for the dashboard sections`);
    }

    const modalOpen = countMatches(structureHtml, /class="[^"]*modal-backdrop[^"]*"/gi);
    if (modalOpen < 1) {
      fail(`${path.relative(appRoot, file)} is missing modal-backdrop wrappers`);
    }

    const cssFileCount = countMatches(html, /<style>/gi);
    if (cssFileCount < 1) {
      fail(`${path.relative(appRoot, file)} is missing expected embedded style blocks`);
    }
  }

  if (process.exitCode) {
    process.exit(process.exitCode);
  } else {
    console.log("Layout check passed.");
  }
}

await main();
