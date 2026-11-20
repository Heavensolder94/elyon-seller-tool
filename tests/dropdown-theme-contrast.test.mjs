import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const stylePaths = [
  new URL("../elyon-clean.css", import.meta.url),
  new URL("../public/elyon-clean.css", import.meta.url),
];

for (const path of stylePaths) {
  test(`native dropdown options remain readable in dark and light modes: ${path.pathname.split("/").slice(-2).join("/")}`, async () => {
    const css = await readFile(path, "utf8");

    assert.match(css, /body:not\(\.light\) select\s*\{\s*color-scheme:\s*dark\s*!important;/);
    assert.match(css, /body:not\(\.light\) select option,[\s\S]*?background-color:\s*#111821\s*!important;[\s\S]*?color:\s*#f4f6f8\s*!important;/);
    assert.match(css, /body:not\(\.light\) select option:disabled\s*\{\s*color:\s*#9ca3af\s*!important;/);
    assert.match(css, /body\.light select\s*\{\s*color-scheme:\s*light\s*!important;/);
    assert.match(css, /body\.light select option,[\s\S]*?background-color:\s*#ffffff\s*!important;[\s\S]*?color:\s*#0f172a\s*!important;/);
  });
}
