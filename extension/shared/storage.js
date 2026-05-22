const STORAGE_KEYS = {
  settings: "elyon.settings",
  products: "elyon.products",
  state: "elyon.state",
  researchMemory: "elyon_research_memory",
  currentProduct: "elyon_current_product",
  extensionHistory: "elyon_extension_history",
  extractionDebug: "elyon_extraction_debug",
  extensionSettings: "elyon_extension_settings",
  manualCaptures: "elyon_manual_captures"
};

export async function loadSettings(defaults) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return { ...defaults, ...(result[STORAGE_KEYS.settings] || {}) };
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: settings });
}

export async function loadProducts() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.products);
  return Array.isArray(result[STORAGE_KEYS.products]) ? result[STORAGE_KEYS.products] : [];
}

export async function saveProducts(products) {
  await chrome.storage.local.set({ [STORAGE_KEYS.products]: products });
}

export async function loadState() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.state);
  return result[STORAGE_KEYS.state] || {};
}

export async function saveState(state) {
  await chrome.storage.local.set({ [STORAGE_KEYS.state]: state });
}

function normalizeResearchItem(item = {}) {
  const now = new Date().toISOString();
  return {
    id: item.id || item.url || `${now}-${Math.random().toString(36).slice(2, 10)}`,
    title: item.title ?? "",
    price: item.price ?? "",
    currency: item.currency ?? "",
    image: item.image ?? "",
    images: Array.isArray(item.images) ? item.images : [],
    description: item.description ?? "",
    descriptionCandidates: Array.isArray(item.descriptionCandidates) ? item.descriptionCandidates : [],
    descriptionSource: item.descriptionSource ?? "",
    variants: Array.isArray(item.variants) ? item.variants : [],
    shipping: item.shipping && typeof item.shipping === "object" ? item.shipping : {},
    rating: item.rating ?? "",
    reviewsCount: item.reviewsCount ?? "",
    soldCount: item.soldCount ?? "",
    productDetails: item.productDetails && typeof item.productDetails === "object" ? item.productDetails : {},
    availability: item.availability ?? "",
    category: item.category ?? "",
    supplierInfo: item.supplierInfo && typeof item.supplierInfo === "object" ? item.supplierInfo : {},
    complianceRisks: Array.isArray(item.complianceRisks) ? item.complianceRisks : [],
    elyonProduct: item.elyonProduct && typeof item.elyonProduct === "object" ? item.elyonProduct : null,
    extractionDebug: item.extractionDebug && typeof item.extractionDebug === "object" ? item.extractionDebug : null,
    aliexpressVariants: item.aliexpressVariants && typeof item.aliexpressVariants === "object" ? item.aliexpressVariants : null,
    aliexpressVariantDebug: item.aliexpressVariantDebug && typeof item.aliexpressVariantDebug === "object" ? item.aliexpressVariantDebug : null,
    platformVariants: item.platformVariants && typeof item.platformVariants === "object" ? item.platformVariants : null,
    platformVariantDebug: item.platformVariantDebug && typeof item.platformVariantDebug === "object" ? item.platformVariantDebug : null,
    manualCaptures: Array.isArray(item.manualCaptures) ? item.manualCaptures : [],
    parentSearchUrl: item.parentSearchUrl ?? "",
    url: item.url ?? "",
    supplier: item.supplier ?? "",
    domain: item.domain ?? "",
    status: item.status ?? "new",
    notes: item.notes ?? "",
    score: item.score ?? "",
    detectedAt: item.detectedAt ?? now,
    updatedAt: item.updatedAt ?? now
  };
}

export async function loadManualCaptures() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.manualCaptures).catch(() => ({}));
  return Array.isArray(result[STORAGE_KEYS.manualCaptures]) ? result[STORAGE_KEYS.manualCaptures] : [];
}

export async function saveManualCapture(capture = {}) {
  const current = await loadManualCaptures();
  const now = new Date().toISOString();
  const nextCapture = {
    id: capture.id || `${now}-${Math.random().toString(36).slice(2, 8)}`,
    type: capture.type || "note",
    text: capture.text || "",
    sourceUrl: capture.sourceUrl || "",
    capturedAt: capture.capturedAt || now
  };
  const next = [nextCapture, ...current].slice(0, 100);
  await chrome.storage.local.set({ [STORAGE_KEYS.manualCaptures]: next });
  return next;
}

export async function saveCurrentProductSnapshot(product = {}) {
  const now = new Date().toISOString();
  const snapshot = normalizeResearchItem({ ...product, updatedAt: now });
  const current = await chrome.storage.local.get([STORAGE_KEYS.extensionHistory]).catch(() => ({}));
  const history = Array.isArray(current[STORAGE_KEYS.extensionHistory]) ? current[STORAGE_KEYS.extensionHistory] : [];
  const nextHistory = [snapshot, ...history.filter((item) => item.url !== snapshot.url)].slice(0, 50);
  await chrome.storage.local.set({
    [STORAGE_KEYS.currentProduct]: snapshot,
    [STORAGE_KEYS.extensionHistory]: nextHistory,
    [STORAGE_KEYS.extractionDebug]: snapshot.extractionDebug || snapshot.elyonProduct?.raw || {}
  });
  return snapshot;
}

export async function loadResearchMemory() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.researchMemory);
  const items = Array.isArray(result[STORAGE_KEYS.researchMemory]) ? result[STORAGE_KEYS.researchMemory] : [];
  return items.map(normalizeResearchItem);
}

export async function saveResearchMemory(items) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.researchMemory]: Array.isArray(items) ? items.map(normalizeResearchItem) : []
  });
}

export async function upsertResearchProduct(product = {}) {
  const current = await loadResearchMemory();
  const url = product.url || "";
  const now = new Date().toISOString();
  const existingIndex = current.findIndex((item) => item.url && item.url === url);
  const nextItem = normalizeResearchItem({
    ...current[existingIndex],
    ...product,
    updatedAt: now,
    detectedAt: current[existingIndex]?.detectedAt || product.detectedAt || now
  });
  if (existingIndex >= 0) {
    const next = [...current];
    next[existingIndex] = nextItem;
    await saveResearchMemory(next);
    return next;
  }
  const next = [nextItem, ...current];
  await saveResearchMemory(next);
  return next;
}

export async function updateResearchProductById(id, patch = {}) {
  const current = await loadResearchMemory();
  const now = new Date().toISOString();
  const next = current.map((item) => (item.id === id ? normalizeResearchItem({ ...item, ...patch, updatedAt: now }) : item));
  await saveResearchMemory(next);
  return next;
}

export async function deleteResearchProductById(id) {
  const current = await loadResearchMemory();
  const next = current.filter((item) => item.id !== id);
  await saveResearchMemory(next);
  return next;
}
