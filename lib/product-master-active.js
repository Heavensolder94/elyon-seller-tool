import {
  mergeProductLists as mergeBaseProductLists,
  normalizeProduct as normalizeBaseProduct,
  normalizeProductList as normalizeBaseProductList,
} from "./product-master.js";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

export function adaptSellerProductInput(input = {}) {
  const product = object(input);
  const supplier = object(product.supplier);
  const supplierUrl = text(
    product.supplierLink ||
    product.supplierUrl ||
    supplier.url ||
    product.url ||
    product.sourceUrl ||
    product.productUrl
  );

  if (!supplierUrl || text(product.supplierLink)) return product;
  return {
    ...product,
    supplierLink: supplierUrl,
    supplier: {
      ...supplier,
      ...(text(supplier.url) ? {} : { url: supplierUrl }),
    },
  };
}

export function normalizeProduct(input = {}) {
  return normalizeBaseProduct(adaptSellerProductInput(input));
}

export function normalizeProductList(items = []) {
  return Array.isArray(items) ? items.map(normalizeProduct) : [];
}

export function mergeProductLists(...lists) {
  return mergeBaseProductLists(...lists.map((list) => normalizeProductList(list)));
}

export const legacyNormalizeProductList = normalizeBaseProductList;
