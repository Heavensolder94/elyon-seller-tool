function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function dedupe(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

function firstSpecific(itemSpecifics, names) {
  const specifics = object(itemSpecifics);
  for (const name of names) {
    const value = specifics[name];
    if (Array.isArray(value) && text(value[0])) return text(value[0]);
    if (text(value)) return text(value);
  }
  return "";
}

export function categoryState(product = {}) {
  const local = object(product);
  const server = object(local.rawServerProduct || local.raw || local);
  const listing = object(server.listing || local.listing);
  const autoListerDraft = object(listing.autoListerDraft || local.autoListerDraft);
  const raw = object(server.raw || local.raw);
  const metadata = object(
    autoListerDraft.categoryMetadata ||
    listing.categoryMetadata ||
    server.categoryMetadata ||
    local.categoryMetadata
  );
  const categoryId = text(
    autoListerDraft.categoryId ||
    listing.categoryId ||
    server.ebayCategoryId ||
    server.categoryId ||
    local.ebayCategoryId ||
    local.categoryId ||
    raw.categoryId
  );
  const categoryName = text(
    autoListerDraft.categoryName ||
    listing.categoryName ||
    metadata.categoryName ||
    server.categoryName ||
    local.categoryName ||
    server.category ||
    local.category
  );

  return {
    categoryId,
    categoryName,
    valid: /^\d+$/.test(categoryId),
    metadata,
  };
}

export function categoryQueryFromProduct(product = {}) {
  const local = object(product);
  const server = object(local.rawServerProduct || local.raw || local);
  const listing = object(server.listing || local.listing);
  const autoListerDraft = object(listing.autoListerDraft || local.autoListerDraft);
  const raw = object(server.raw || local.raw);
  const itemSpecifics = object(
    autoListerDraft.itemSpecifics ||
    listing.itemSpecifics ||
    server.itemSpecifics ||
    local.itemSpecifics ||
    raw.itemSpecifics
  );
  const title = text(
    autoListerDraft.title ||
    listing.title ||
    server.listingTitle ||
    local.listingTitle ||
    server.title ||
    local.title ||
    local.name ||
    raw.title
  );
  const brand = firstSpecific(itemSpecifics, ["Marke", "Brand", "Hersteller"]);
  const type = firstSpecific(itemSpecifics, ["Produktart", "Type", "Modell", "Model"]);
  const hint = text(server.productType || local.productType || raw.productType);

  return dedupe([title, brand, type, hint])
    .join(" ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 350);
}

export function categoryNeedsResolution(product = {}) {
  const state = categoryState(product);
  return !state.valid && categoryQueryFromProduct(product).length >= 2;
}

export function normalizeCategoryResolution(value = {}) {
  const input = object(value.category || value.resolution || value);
  const categoryId = text(input.categoryId || value.categoryId);
  const categoryName = text(input.categoryName || value.categoryName);
  const ancestors = (Array.isArray(input.ancestors || value.ancestors) ? input.ancestors || value.ancestors : [])
    .map((entry) => ({
      categoryId: text(entry?.categoryId),
      categoryName: text(entry?.categoryName),
    }))
    .filter((entry) => entry.categoryName);
  const aspects = Array.isArray(value.aspects || input.aspects) ? value.aspects || input.aspects : [];
  const required = dedupe(value.required || input.required);

  return {
    categoryId,
    categoryName,
    ancestors,
    path: dedupe([...ancestors.map((entry) => entry.categoryName), categoryName]),
    aspects,
    required,
    query: text(value.query || input.query),
    source: text(value.source || input.source) || "ebay_taxonomy",
    automatic: value.automatic !== false,
    valid: /^\d+$/.test(categoryId) && Boolean(categoryName),
  };
}

export function mergeProductWithCategory(product = {}, resolution = {}) {
  const normalized = normalizeCategoryResolution(resolution);
  if (!normalized.valid) return product;

  const local = object(product);
  const server = object(local.rawServerProduct || local.raw || local);
  const existingListing = object(server.listing || local.listing);
  const existingDraft = object(existingListing.autoListerDraft || local.autoListerDraft);
  const now = new Date().toISOString();
  const categoryMetadata = {
    ...object(existingListing.categoryMetadata || local.categoryMetadata),
    categoryId: normalized.categoryId,
    categoryName: normalized.categoryName,
    ancestors: normalized.ancestors,
    path: normalized.path,
    aspects: normalized.aspects,
    required: normalized.required,
    query: normalized.query,
    source: normalized.source,
    automatic: normalized.automatic,
    resolvedAt: now,
  };
  const nextDraft = Object.keys(existingDraft).length
    ? {
        ...existingDraft,
        categoryId: normalized.categoryId,
        categoryName: normalized.categoryName,
        categoryMetadata,
        updatedAt: now,
      }
    : existingDraft;
  const nextListing = {
    ...existingListing,
    categoryId: normalized.categoryId,
    categoryName: normalized.categoryName,
    categoryMetadata,
    ...(Object.keys(nextDraft).length ? { autoListerDraft: nextDraft } : {}),
    updatedAt: now,
  };
  const nextServer = {
    ...server,
    categoryId: normalized.categoryId,
    categoryName: normalized.categoryName,
    category: normalized.categoryName,
    categoryMetadata,
    listing: nextListing,
    updatedAt: now,
  };

  return {
    ...local,
    categoryId: normalized.categoryId,
    ebayCategoryId: normalized.categoryId,
    categoryName: normalized.categoryName,
    category: normalized.categoryName,
    categoryMetadata,
    listing: nextListing,
    ...(Object.keys(nextDraft).length ? { autoListerDraft: nextDraft } : {}),
    rawServerProduct: nextServer,
    updatedAt: now,
  };
}

export const SellerCategoryEngineCore = {
  categoryState,
  categoryQueryFromProduct,
  categoryNeedsResolution,
  normalizeCategoryResolution,
  mergeProductWithCategory,
};
