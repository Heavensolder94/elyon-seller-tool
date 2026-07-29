import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const write = (file, content) => fs.writeFileSync(file, content);

function replaceOnce(file, needle, replacement) {
  const source = read(file);
  if (!source.includes(needle)) throw new Error(`${file}: Patch-Anker fehlt`);
  write(file, source.replace(needle, replacement));
}

function replaceRegexOnce(file, pattern, replacement) {
  const source = read(file);
  if (!pattern.test(source)) throw new Error(`${file}: Patch-Muster fehlt`);
  pattern.lastIndex = 0;
  write(file, source.replace(pattern, replacement));
}

function appendOnce(file, marker, content) {
  const source = read(file);
  if (source.includes(marker)) return;
  write(file, `${source.trimEnd()}\n\n${content.trim()}\n`);
}

replaceOnce(
  "seller-category-engine-core.js",
  "  const metadata = object(\n    autoListerDraft.categoryMetadata ||",
  "  const categoryData = object(autoListerDraft.categoryData || listing.categoryData || server.categoryData || local.categoryData);\n  const ebayCategory = object(categoryData.ebay);\n  const sourceCategory = object(categoryData.source);\n  const metadata = object(\n    autoListerDraft.categoryMetadata ||"
);
replaceOnce(
  "seller-category-engine-core.js",
  "    autoListerDraft.categoryId ||\n    listing.categoryId ||",
  "    ebayCategory.categoryId ||\n    autoListerDraft.categoryId ||\n    listing.categoryId ||"
);
replaceOnce(
  "seller-category-engine-core.js",
  "    autoListerDraft.categoryName ||\n    listing.categoryName ||",
  "    ebayCategory.categoryName ||\n    autoListerDraft.categoryName ||\n    listing.categoryName ||"
);
replaceOnce(
  "seller-category-engine-core.js",
  "    valid: /^\\d+$/.test(categoryId),\n    metadata,",
  "    valid: /^\\d+$/.test(categoryId),\n    metadata,\n    categoryData,\n    ebayCategory,\n    sourceCategory,\n    categoryPath: Array.isArray(ebayCategory.categoryPath || metadata.path) ? (ebayCategory.categoryPath || metadata.path) : [],"
);
replaceOnce(
  "seller-category-engine-core.js",
  "export function mergeProductWithCategory(product = {}, resolution = {}) {\n  const normalized = normalizeCategoryResolution(resolution);",
  "export function mergeProductWithCategory(product = {}, resolution = {}) {\n  const previous = categoryState(product);\n  const normalized = normalizeCategoryResolution(resolution);"
);
replaceOnce(
  "seller-category-engine-core.js",
  "  const existingDraft = object(existingListing.autoListerDraft || local.autoListerDraft);\n  const now = new Date().toISOString();",
  "  const existingDraft = object(existingListing.autoListerDraft || local.autoListerDraft);\n  const now = new Date().toISOString();\n  const categoryChanged = Boolean(previous.valid && previous.categoryId !== normalized.categoryId);\n  const sourceName = text(previous.sourceCategory?.name || local.sourceCategoryName || local.sourceCategory || server.sourceCategoryName || server.sourceCategory || (!previous.valid ? local.category || server.category : \"\"));\n  const sourceData = { ...object(previous.categoryData?.source), name: sourceName, path: Array.isArray(previous.categoryData?.source?.path) ? previous.categoryData.source.path : sourceName ? [sourceName] : [], origin: text(previous.categoryData?.source?.origin || server.source || local.source || \"company_os\"), capturedAt: text(previous.categoryData?.source?.capturedAt || server.createdAt || local.createdAt || now) };\n  const fingerprint = [\"EBAY_DE\", normalized.categoryId, normalized.categoryName, ...normalized.path].join(\"|\");\n  const categoryData = { schemaVersion: \"elyon-category-v1\", source: sourceData, ebay: { marketplaceId: \"EBAY_DE\", categoryId: normalized.categoryId, categoryName: normalized.categoryName, categoryPath: normalized.path, status: \"resolved\", resolutionSource: normalized.source, query: normalized.query, requiredAspects: normalized.required, aspects: normalized.aspects, fingerprint, previousFingerprint: categoryChanged ? text(previous.ebayCategory?.fingerprint) : text(previous.ebayCategory?.previousFingerprint), resolvedAt: now, confirmedAt: normalized.automatic ? \"\" : now, requiredSpecificsConfirmed: categoryChanged ? false : previous.ebayCategory?.requiredSpecificsConfirmed === true, staleSpecifics: categoryChanged } };\n  const listingSpecifics = object(existingDraft.itemSpecifics || existingListing.itemSpecifics || server.itemSpecifics || local.itemSpecifics);\n  const missingRequiredAspects = normalized.required.filter((name) => !Array.isArray(listingSpecifics[name]) || !listingSpecifics[name].length);"
);
replaceOnce(
  "seller-category-engine-core.js",
  "    automatic: normalized.automatic,\n    resolvedAt: now,",
  "    automatic: normalized.automatic,\n    fingerprint,\n    staleSpecifics: categoryChanged,\n    requiredSpecificsConfirmed: categoryChanged ? false : metadata.requiredSpecificsConfirmed === true,\n    resolvedAt: now,"
);
replaceOnce(
  "seller-category-engine-core.js",
  "        categoryName: normalized.categoryName,\n        categoryMetadata,",
  "        categoryName: normalized.categoryName,\n        categoryData,\n        categoryMetadata,\n        missingRequiredAspects,\n        requiredSpecificsConfirmed: categoryChanged ? false : existingDraft.requiredSpecificsConfirmed === true,"
);
replaceOnce(
  "seller-category-engine-core.js",
  "    categoryName: normalized.categoryName,\n    categoryMetadata,",
  "    categoryName: normalized.categoryName,\n    categoryData,\n    categoryMetadata,\n    ebayCategoryId: normalized.categoryId,\n    ebayCategoryName: normalized.categoryName,\n    ebayCategoryPath: normalized.path,\n    requiredSpecificsConfirmed: categoryChanged ? false : existingListing.requiredSpecificsConfirmed === true,"
);
replaceOnce(
  "seller-category-engine-core.js",
  "    category: normalized.categoryName,\n    categoryMetadata,\n    listing: nextListing,",
  "    category: normalized.categoryName,\n    sourceCategory: sourceName,\n    sourceCategoryName: sourceName,\n    categoryData,\n    ebayCategoryId: normalized.categoryId,\n    ebayCategoryName: normalized.categoryName,\n    ebayCategoryPath: normalized.path,\n    categoryMetadata,\n    listing: nextListing,"
);
replaceOnce(
  "seller-category-engine-core.js",
  "    category: normalized.categoryName,\n    categoryMetadata,\n    listing: nextListing,",
  "    category: normalized.categoryName,\n    sourceCategory: sourceName,\n    sourceCategoryName: sourceName,\n    categoryData,\n    ebayCategoryPath: normalized.path,\n    categoryMetadata,\n    listing: nextListing,"
);

replaceOnce(
  "lib/product-master.js",
  "function toText(value) {",
  "import { categoryState } from \"../seller-category-engine-core.js\";\n\nfunction toText(value) {"
);
replaceOnce(
  "lib/product-master.js",
  "  const listingPackage = toObject(product.listingPackage || product.listingTask);",
  "  const listingPackage = toObject(product.listingPackage || product.listingTask);\n  const category = categoryState({ ...product, listing: { ...existingListing, ...listingPackage } });"
);
replaceOnce(
  "lib/product-master.js",
  "  if (!conditionId) blockers.push(\"eBay Condition ID fehlt.\");",
  "  if (!conditionId) blockers.push(\"eBay Condition ID fehlt.\");\n  if (!category.valid) blockers.push(\"Offizielle eBay-Kategorie fehlt.\");"
);
replaceOnce(
  "lib/product-master.js",
  "    images,\n    source,",
  "    images,\n    sourceCategory: category.sourceCategory?.name || firstText(product.sourceCategoryName, product.sourceCategory),\n    sourceCategoryName: category.sourceCategory?.name || firstText(product.sourceCategoryName, product.sourceCategory),\n    categoryData: category.categoryData,\n    ebayCategoryId: category.categoryId,\n    ebayCategoryName: category.categoryName,\n    ebayCategoryPath: category.categoryPath,\n    source,"
);
replaceOnce(
  "lib/product-master.js",
  "      itemSpecifics,\n      conditionId,",
  "      itemSpecifics,\n      conditionId,\n      categoryId: category.categoryId,\n      categoryName: category.categoryName,\n      categoryData: category.categoryData,\n      categoryMetadata: category.metadata,\n      ebayCategoryId: category.categoryId,\n      ebayCategoryName: category.categoryName,\n      ebayCategoryPath: category.categoryPath,"
);

replaceOnce(
  "seller-company-os-inbox.js",
  "    const listing = product.listing || {};\n    return {",
  "    const listing = product.listing || {};\n    const categoryData = listing.categoryData || product.categoryData || product.raw?.categoryData || null;\n    const ebayCategoryId = String(listing.categoryId || product.ebayCategoryId || categoryData?.ebay?.categoryId || \"\").trim();\n    const ebayCategoryName = String(listing.categoryName || product.ebayCategoryName || categoryData?.ebay?.categoryName || \"\").trim();\n    return {"
);
replaceOnce(
  "seller-company-os-inbox.js",
  "      description: text(product.description),\n      supplier:",
  "      description: text(product.description),\n      sourceCategory: text(product.sourceCategoryName || product.sourceCategory || categoryData?.source?.name),\n      sourceCategoryName: text(product.sourceCategoryName || product.sourceCategory || categoryData?.source?.name),\n      categoryData,\n      ebayCategoryId,\n      ebayCategoryName,\n      ebayCategoryPath: Array.isArray(product.ebayCategoryPath || categoryData?.ebay?.categoryPath) ? (product.ebayCategoryPath || categoryData?.ebay?.categoryPath) : [],\n      categoryId: ebayCategoryId,\n      categoryName: ebayCategoryName,\n      itemSpecifics: listing.itemSpecifics || product.itemSpecifics || {},\n      conditionId: text(listing.conditionId || product.conditionId),\n      supplier:"
);

replaceOnce(
  "seller-selling-flow-core.js",
  "function text(value) {",
  "import { categoryState } from \"./seller-category-engine-core.js\";\n\nfunction text(value) {"
);
replaceOnce(
  "seller-selling-flow-core.js",
  "  const companyOsApproved = Boolean(\n    approval.companyOsApproved === true ||",
  "  const category = categoryState(local);\n  const companyOsApproved = Boolean(\n    approval.companyOsApproved === true ||"
);
replaceOnce(
  "seller-selling-flow-core.js",
  "    categoryId: text(autoListerDraft.categoryId || listing.categoryId || server.categoryId || raw.categoryId),\n    categoryName: text(autoListerDraft.categoryName || listing.categoryName || server.category || local.category),",
  "    categoryId: category.categoryId,\n    categoryName: category.categoryName,\n    categoryData: category.categoryData,\n    categoryPath: category.categoryPath,"
);
replaceOnce(
  "seller-selling-flow-core.js",
  "    categoryName: text(merged.categoryName).slice(0, 300),\n    conditionId:",
  "    categoryName: text(merged.categoryName).slice(0, 300),\n    categoryData: object(merged.categoryData),\n    categoryPath: array(merged.categoryPath),\n    conditionId:"
);
replaceOnce(
  "seller-selling-flow-core.js",
  "  const existingListing = object(server.listing || local.listing);\n  const now = new Date().toISOString();",
  "  const existingListing = object(server.listing || local.listing);\n  const categoryData = object(draft.categoryData || existingListing.categoryData || server.categoryData || local.categoryData);\n  const now = new Date().toISOString();"
);
replaceOnce(
  "seller-selling-flow-core.js",
  "    categoryName: text(draft.categoryName || existingListing.categoryName),\n    conditionId:",
  "    categoryName: text(draft.categoryName || categoryData.ebay?.categoryName || existingListing.categoryName),\n    categoryData,\n    ebayCategoryId: text(draft.categoryId || categoryData.ebay?.categoryId || existingListing.categoryId),\n    ebayCategoryName: text(draft.categoryName || categoryData.ebay?.categoryName || existingListing.categoryName),\n    ebayCategoryPath: array(categoryData.ebay?.categoryPath),\n    conditionId:"
);
replaceOnce(
  "seller-selling-flow-core.js",
  "    listing: nextListing,\n    listingTitle: nextListing.title,",
  "    categoryData,\n    ebayCategoryId: nextListing.ebayCategoryId,\n    ebayCategoryName: nextListing.ebayCategoryName,\n    ebayCategoryPath: nextListing.ebayCategoryPath,\n    listing: nextListing,\n    listingTitle: nextListing.title,"
);

replaceOnce(
  "seller-auto-lister-parity-core.js",
  "  const categoryMetadata = object(overrides.categoryMetadata || draft.categoryMetadata || listing.categoryMetadata);",
  "  const categoryData = object(overrides.categoryData || draft.categoryData || listing.categoryData || view.categoryData);\n  const categoryMetadata = object(overrides.categoryMetadata || draft.categoryMetadata || listing.categoryMetadata || categoryData.ebay);"
);
replaceOnce(
  "seller-auto-lister-parity-core.js",
  "    categoryMetadata: {\n      categoryId:",
  "    categoryData,\n    categoryMetadata: {\n      categoryId:"
);
replaceOnce(
  "seller-auto-lister-parity-core.js",
  "    categoryMetadata: { ...state.categoryMetadata, loadedAt: state.categoryMetadata.loadedAt || new Date().toISOString() },",
  "    categoryData: state.categoryData,\n    categoryMetadata: { ...state.categoryMetadata, loadedAt: state.categoryMetadata.loadedAt || new Date().toISOString() },"
);
replaceOnce(
  "seller-auto-lister-parity-core.js",
  "    categoryMetadata: object(draft.categoryMetadata || listing.categoryMetadata),\n    updatedAt:",
  "    categoryData: object(draft.categoryData || listing.categoryData),\n    categoryMetadata: object(draft.categoryMetadata || listing.categoryMetadata),\n    updatedAt:"
);

appendOnce(
  "docs/SELLER_TOOL_MODULE_STATUS.md",
  "## Einheitlicher Kategorienstandard",
  "## Einheitlicher Kategorienstandard\n\nDer Product Master, Company-OS-Eingang, Listing Designer und Auto Lister verwenden additiv dasselbe `categoryData`-Schema (`elyon-category-v1`). Lieferanten-/Quellkategorie und offizielle eBay-DE-Kategorie bleiben getrennt. Eine Kategorieänderung lädt Pflichtmerkmale neu und setzt eine frühere Pflichtmerkmal-Bestätigung zurück."
);

console.log("Seller Tool wurde auf das systemweite Kategorie-Datenmodell umgestellt.");
