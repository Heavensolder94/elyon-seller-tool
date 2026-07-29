import fs from "node:fs";

function replaceOnce(file, needle, replacement) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes(needle)) throw new Error(`${file}: Korrektur-Anker fehlt`);
  fs.writeFileSync(file, source.replace(needle, replacement));
}

replaceOnce(
  "seller-category-engine-core.js",
  "requiredSpecificsConfirmed: categoryChanged ? false : metadata.requiredSpecificsConfirmed === true,",
  "requiredSpecificsConfirmed: categoryChanged ? false : previous.metadata?.requiredSpecificsConfirmed === true,",
);

replaceOnce(
  "seller-category-engine-core.js",
  "    path: dedupe([...ancestors.map((entry) => entry.categoryName), categoryName]),",
  "    path: dedupe([...(Array.isArray(input.path || value.path) ? input.path || value.path : []), ...ancestors.map((entry) => entry.categoryName), categoryName]),",
);

replaceOnce(
  "tests/product-master-rules.test.mjs",
  "      conditionId: \"1000\",\n      images:",
  "      conditionId: \"1000\",\n      categoryId: \"12345\",\n      categoryName: \"Aufbewahrungshalter\",\n      images:",
);

console.log("Seller-Kategorieintegration wurde nach dem Hauptpatch korrigiert.");
