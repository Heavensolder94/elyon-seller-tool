import canonicalExtensionImportHandler from "../extension/import-product.js";

export default async function handler(req, res) {
  res.setHeader("X-Elyon-Deprecated-Route", "/api/import/extension-product");
  res.setHeader("X-Elyon-Canonical-Route", "/api/extension/import-product");
  return canonicalExtensionImportHandler(req, res);
}
