import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const coreUrl = pathToFileURL(path.resolve("seller-selling-flow-core.js")).href;
const source = (await readFile("seller-auto-lister-parity-core.js", "utf8"))
  .replace('from "/seller-selling-flow-core.js"', `from "${coreUrl}"`);
const parity = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const sellerCore = await import("../seller-selling-flow-core.js");

const product = {
  id: "seller-product-2",
  customLocalField: "preserve",
  rawServerProduct: {
    id: "seller-product-2",
    title: "Verstellbarer Laptopständer Aluminium für Notebook",
    description: "Stabiler und faltbarer Laptopständer für Büro und Homeoffice.",
    images: ["https://example.com/product.jpg"],
    pricing: { salePrice: 29.99, profit: 7.5, marginPercent: 25, minimumRulePassed: true },
    logistics: { deliveryTime: "3–5 Werktage", returnAddress: "Musterstraße 1, 12345 Berlin, Deutschland" },
    approval: { companyOsApproved: true },
    readiness: { state: "ready_for_manual_listing", score: 100, blockers: [] },
    listing: {
      title: "Laptopständer Aluminium verstellbar ergonomische Notebook Halterung",
      descriptionHtml: "<p>Stabiler und faltbarer Laptopständer aus Aluminium für ergonomisches Arbeiten.</p><p>Bitte Maße und Kompatibilität prüfen.</p>",
      categoryId: "31519",
      categoryName: "Laptop-Ständer",
      conditionId: "1000",
      itemSpecifics: { Material: ["Aluminium"], Farbe: ["Silber"] },
      shippingProfile: "ship-1",
      returnProfile: "return-1",
      paymentProfile: "payment-1",
      variants: [],
      customListingField: "preserve",
    },
    unknownServerField: { keep: true },
  },
};

const metadata = {
  categoryId: "31519",
  categoryName: "Laptop-Ständer",
  required: ["Material", "Farbe"],
  aspects: [
    { name: "Material", required: true, values: ["Aluminium", "Kunststoff"] },
    { name: "Farbe", required: true, values: ["Silber", "Schwarz"] },
    { name: "Besonderheiten", required: false, values: ["Faltbar"] },
  ],
  loadedAt: "2026-07-27T12:00:00.000Z",
};

const compliance = {
  gpsrStatus: "required",
  manufacturer: {
    companyName: "Example Manufacturer GmbH",
    addressLine1: "Herstellerstraße 1",
    city: "Berlin",
    postalCode: "12345",
    country: "DE",
    email: "safety@example.com",
    phone: "",
    contactUrl: "",
  },
  responsiblePersonRequired: "no",
  responsiblePerson: {},
  safetyNotes: ["Nur bestimmungsgemäß verwenden."],
  exemptionReason: "",
  exemptionConfirmed: false,
};

test("builds complete advanced Auto Lister state from explicit evidence", () => {
  const view = sellerCore.buildSellerListingView(product);
  const state = parity.buildAdvancedAutoListerState(product, view, {
    categoryMetadata: metadata,
    compliance,
    variantsState: { variants: [], variantSummary: "", confirmed: false },
    itemSpecifics: view.itemSpecifics,
    aiPrepared: true,
    aiModel: "deepseek-chat",
  });
  assert.equal(state.categoryMetadata.required.length, 2);
  assert.equal(state.compliance.manufacturer.companyName, "Example Manufacturer GmbH");
  assert.equal(state.aiPrepared, true);
});

test("requires taxonomy, GPSR contacts, safety notes and variants evidence", () => {
  const view = sellerCore.buildSellerListingView(product);
  const incomplete = parity.buildAdvancedAutoListerState(product, view, {
    categoryMetadata: { categoryId: "31519", required: ["Material"], aspects: [] },
    compliance: { gpsrStatus: "required", manufacturer: {}, safetyNotes: [] },
    variantsState: { variants: [{ color: "Schwarz" }], variantSummary: "", confirmed: false },
    itemSpecifics: {},
  });
  const checks = parity.buildAdvancedChecks(product, view, incomplete);
  assert.equal(checks.find((entry) => entry.key === "taxonomy")?.ok, false);
  assert.equal(checks.find((entry) => entry.key === "required_aspects")?.ok, false);
  assert.equal(checks.find((entry) => entry.key === "manufacturer")?.ok, false);
  assert.equal(checks.find((entry) => entry.key === "safety_notes")?.ok, false);
  assert.equal(checks.find((entry) => entry.key === "variants")?.ok, false);
});

test("creates a ready v2 draft only when all base and advanced checks pass", () => {
  const view = sellerCore.buildSellerListingView(product);
  const draft = parity.buildParityDraft(product, view, {
    categoryMetadata: metadata,
    compliance,
    variantsState: { variants: [], variantSummary: "", confirmed: false },
    itemSpecifics: view.itemSpecifics,
    aiPrepared: true,
    aiModel: "deepseek-chat",
  });
  assert.equal(draft.schemaVersion, "elyon-seller-auto-lister-v2");
  assert.equal(draft.readiness.ready, true);
  assert.equal(draft.status, "ready_for_manual_ebay_draft");
  assert.equal(draft.automaticPublishingAllowed, false);
  assert.equal(draft.publishEndpointAvailable, false);
  assert.equal(draft.ebayInventoryDraftCreated, false);
});

test("blocks v2 readiness when a required eBay aspect is empty", () => {
  const view = sellerCore.buildSellerListingView(product);
  const draft = parity.buildParityDraft(product, view, {
    categoryMetadata: metadata,
    compliance,
    variantsState: { variants: [], variantSummary: "", confirmed: false },
    itemSpecifics: { Material: ["Aluminium"] },
  });
  assert.equal(draft.readiness.ready, false);
  assert.ok(draft.missingRequiredAspects.includes("Farbe"));
});

test("requires documented exemption when GPSR is marked exempt", () => {
  const view = sellerCore.buildSellerListingView(product);
  const incomplete = parity.buildAdvancedAutoListerState(product, view, {
    categoryMetadata: metadata,
    compliance: { gpsrStatus: "exempt", exemptionReason: "", exemptionConfirmed: false },
    variantsState: { variants: [], variantSummary: "", confirmed: false },
    itemSpecifics: view.itemSpecifics,
  });
  const checks = parity.buildAdvancedChecks(product, view, incomplete);
  assert.equal(checks.find((entry) => entry.key === "gpsr_status")?.ok, false);

  const documented = parity.buildAdvancedAutoListerState(product, view, {
    categoryMetadata: metadata,
    compliance: { gpsrStatus: "exempt", exemptionReason: "Dokumentierte Ausnahme nach geprüfter Produktkategorie.", exemptionConfirmed: true },
    variantsState: { variants: [], variantSummary: "", confirmed: false },
    itemSpecifics: view.itemSpecifics,
  });
  const documentedChecks = parity.buildAdvancedChecks(product, view, documented);
  assert.equal(documentedChecks.find((entry) => entry.key === "gpsr_status")?.ok, true);
});

test("requires explicit variant confirmation when variants exist", () => {
  const productWithVariants = structuredClone(product);
  productWithVariants.rawServerProduct.listing.variants = [{ color: "Schwarz" }, { color: "Silber" }];
  const view = sellerCore.buildSellerListingView(productWithVariants);
  const open = parity.buildAdvancedAutoListerState(productWithVariants, view, {
    categoryMetadata: metadata,
    compliance,
    variantsState: { variants: productWithVariants.rawServerProduct.listing.variants, variantSummary: "", confirmed: false },
    itemSpecifics: view.itemSpecifics,
  });
  assert.equal(parity.buildAdvancedChecks(productWithVariants, view, open).find((entry) => entry.key === "variants")?.ok, false);

  const confirmed = parity.buildAdvancedAutoListerState(productWithVariants, view, {
    categoryMetadata: metadata,
    compliance,
    variantsState: { variants: productWithVariants.rawServerProduct.listing.variants, variantSummary: "Farbe Schwarz und Silber jeweils eindeutig zugeordnet.", confirmed: true },
    itemSpecifics: view.itemSpecifics,
  });
  assert.equal(parity.buildAdvancedChecks(productWithVariants, view, confirmed).find((entry) => entry.key === "variants")?.ok, true);
});

test("merges advanced draft additively and preserves unknown fields", () => {
  const view = sellerCore.buildSellerListingView(product);
  const draft = parity.buildParityDraft(product, view, {
    categoryMetadata: metadata,
    compliance,
    variantsState: { variants: [], variantSummary: "", confirmed: false },
    itemSpecifics: view.itemSpecifics,
  });
  const updated = parity.mergeProductWithParityDraft(product, draft);
  assert.equal(updated.customLocalField, "preserve");
  assert.deepEqual(updated.rawServerProduct.unknownServerField, { keep: true });
  assert.equal(updated.rawServerProduct.listing.customListingField, "preserve");
  assert.equal(updated.rawServerProduct.listing.compliance.manufacturer.companyName, "Example Manufacturer GmbH");
  assert.equal(updated.rawServerProduct.listing.autonomousPostingAllowed, false);
});