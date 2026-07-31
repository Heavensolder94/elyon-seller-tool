import test from "node:test";
import assert from "node:assert/strict";

import {
  EBAY_REQUIRED_SCOPES,
  configuredEbayScopes,
  deterministicEbaySku,
  buildEbayPayloads,
  normalizeEbayEnvironment,
} from "../lib/ebay-production.js";

test("production scopes include inventory, account and fulfillment", () => {
  assert.ok(EBAY_REQUIRED_SCOPES.includes("https://api.ebay.com/oauth/api_scope/sell.inventory"));
  assert.ok(EBAY_REQUIRED_SCOPES.includes("https://api.ebay.com/oauth/api_scope/sell.account"));
  assert.ok(EBAY_REQUIRED_SCOPES.includes("https://api.ebay.com/oauth/api_scope/sell.fulfillment"));
  assert.deepEqual(new Set(configuredEbayScopes()), new Set([...configuredEbayScopes()]));
});

test("environment normalization fails closed to production", () => {
  assert.equal(normalizeEbayEnvironment("sandbox"), "sandbox");
  assert.equal(normalizeEbayEnvironment("SANDBOX"), "sandbox");
  assert.equal(normalizeEbayEnvironment("anything-else"), "production");
  assert.equal(normalizeEbayEnvironment(""), "production");
});

test("SKU is deterministic for the same Seller Product Master identity", () => {
  const listing = { sourceProductId: "company-product-42", title: "LED Schreibtischlampe" };
  const first = deterministicEbaySku(listing);
  const second = deterministicEbaySku(listing);
  assert.equal(first, second);
  assert.match(first, /^ELYON-[A-F0-9]{16}-/);
  assert.ok(first.length <= 50);
});

test("eBay payload uses verified item specifics and complete seller setup", () => {
  const input = {
    product: {
      id: "product-1",
      title: "Kabellose LED Schreibtischlampe mit USB Anschluss",
      images: ["https://example.test/image.jpg"],
      pricing: { salePrice: 29.99, currency: "EUR" },
      listing: {
        title: "Kabellose LED Schreibtischlampe USB dimmbar modern",
        descriptionHtml: "Eine ausführliche und sachliche Produktbeschreibung mit allen belegten Eigenschaften für das eBay-Angebot.",
        categoryId: "112581",
        conditionId: "1000",
        itemSpecifics: {
          Produktart: ["Schreibtischlampe"],
          Farbe: ["Schwarz"],
          Marke: ["Elyon Testmarke"],
        },
        autoListerDraft: { quantity: 3 },
      },
    },
  };
  const setup = {
    marketplaceId: "EBAY_DE",
    selected: {
      fulfillmentPolicy: { fulfillmentPolicyId: "fulfill-1" },
      paymentPolicy: { paymentPolicyId: "payment-1" },
      returnPolicy: { returnPolicyId: "return-1" },
      location: { merchantLocationKey: "bocholt-main" },
    },
  };

  const built = buildEbayPayloads(input, setup);
  assert.deepEqual(built.blockers, []);
  assert.equal(built.inventoryPayload.condition, "NEW");
  assert.deepEqual(built.inventoryPayload.product.aspects.Marke, ["Elyon Testmarke"]);
  assert.equal(built.inventoryPayload.product.aspects.Markenlos, undefined);
  assert.equal(built.offerPayload.listingDuration, "GTC");
  assert.equal(built.offerPayload.merchantLocationKey, "bocholt-main");
  assert.deepEqual(built.offerPayload.listingPolicies, {
    fulfillmentPolicyId: "fulfill-1",
    paymentPolicyId: "payment-1",
    returnPolicyId: "return-1",
  });
});

test("missing eBay policies and location remain blocking", () => {
  const built = buildEbayPayloads({
    title: "Testprodukt mit ausreichend langem Titel",
    description: "Ausreichend lange und sachliche Beschreibung für einen technischen Test des eBay-Angebots.",
    categoryId: "12345",
    conditionId: "1000",
    price: 19.99,
    images: ["https://example.test/image.jpg"],
    itemSpecifics: { Produktart: ["Testprodukt"] },
  }, { marketplaceId: "EBAY_DE", selected: {} });

  assert.ok(built.blockers.some((entry) => entry.includes("Lagerstandort")));
  assert.ok(built.blockers.some((entry) => entry.includes("Versandrichtlinie")));
  assert.ok(built.blockers.some((entry) => entry.includes("Zahlungsrichtlinie")));
  assert.ok(built.blockers.some((entry) => entry.includes("Rücknahmerichtlinie")));
});

test("GPSR manufacturer and responsible person map to Inventory offer regulatory fields", () => {
  const built = buildEbayPayloads({
    title: "GPSR Testprodukt mit vollständigen Kontaktdaten",
    description: "Sachliche Beschreibung für den GPSR Mapping Test mit ausreichender Länge.",
    categoryId: "12345",
    conditionId: "1000",
    price: 24.99,
    images: ["https://example.test/image.jpg"],
    itemSpecifics: { Produktart: ["Testprodukt"] },
    merchantLocationKey: "location-1",
    fulfillmentPolicyId: "fulfillment-1",
    paymentPolicyId: "payment-1",
    returnPolicyId: "return-1",
    compliance: {
      manufacturer: {
        companyName: "Hersteller GmbH",
        addressLine1: "Musterstraße 1",
        city: "Berlin",
        postalCode: "10115",
        country: "DE",
        email: "kontakt@example.test",
      },
      responsiblePerson: {
        companyName: "EU Verantwortlich GmbH",
        addressLine1: "Europastraße 2",
        city: "Köln",
        postalCode: "50667",
        country: "DE",
        email: "gpsr@example.test",
      },
      productSafetyStatements: ["EBPSS101"],
    },
  }, { marketplaceId: "EBAY_DE", selected: {} });

  assert.equal(built.offerPayload.regulatory.manufacturer.companyName, "Hersteller GmbH");
  assert.deepEqual(built.offerPayload.regulatory.responsiblePersons[0].types, ["EUResponsiblePerson"]);
  assert.deepEqual(built.offerPayload.regulatory.productSafety.statements, ["EBPSS101"]);
});
