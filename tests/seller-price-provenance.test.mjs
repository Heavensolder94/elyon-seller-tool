import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  extractPriceProvenance,
  enrichWorkingCopy,
  moneyOrNull,
} from "../seller-price-provenance-core.js";

const root = new URL("../", import.meta.url);

test("trennt Nova-Preisidee, Elyon-Empfehlung und finalen Verkaufspreis", () => {
  const result = extractPriceProvenance({
    approval: { companyOsApproved: true },
    pricing: {
      currency: "EUR",
      buyPrice: 17.31,
      salePrice: 27.99,
      companyOsRecommendedPrice: 25.84,
      suggestedSalePrice: 26.99,
    },
    raw: {
      novaPriceIdea: 33.29,
      companyOsRecommendedPrice: 25.84,
      finalSalePrice: 27.99,
      salePriceSource: "manual",
    },
  });

  assert.equal(result.schemaVersion, "elyon-price-provenance-v1");
  assert.equal(result.buyPrice, 17.31);
  assert.equal(result.novaPriceIdea, 33.29);
  assert.equal(result.companyOsRecommendedPrice, 25.84);
  assert.equal(result.sellerValidationSuggestion, 26.99);
  assert.equal(result.finalSalePrice, 27.99);
  assert.equal(result.finalSource, "manual");
  assert.equal(result.finalSourceLabel, "Manuell bestätigt");
  assert.equal(result.novaPriceIdeaBinding, false);
  assert.equal(result.finalSalePriceBinding, true);
});

test("behandelt alten Nova-Verkaufspreis als unverbindliche Preisidee", () => {
  const result = extractPriceProvenance({
    approval: { companyOsApproved: true },
    pricing: { buyPrice: 17.31, salePrice: 33.29 },
    raw: {
      salePrice: 33.29,
      sellPriceSource: "nova_price_idea",
      meta: { sellingPrice: { value: 33.29, source: "nova_price_idea" } },
    },
  });

  assert.equal(result.novaPriceIdea, 33.29);
  assert.equal(result.finalSalePrice, null);
  assert.equal(result.finalSalePriceBinding, false);
  assert.equal(result.finalSource, "missing");
});

test("bestehende bestätigte Company-OS-Produkte bleiben ohne Nova-Preisidee nutzbar", () => {
  const result = extractPriceProvenance({
    approval: { companyOsApproved: true },
    pricing: { buyPrice: 17.31, salePrice: 27.99, salePriceSource: "company_os_confirmed" },
    raw: { salePriceSource: "company_os_confirmed" },
  });

  assert.equal(result.novaPriceIdea, null);
  assert.equal(result.finalSalePrice, 27.99);
  assert.equal(result.finalSource, "company_os_confirmed");
  assert.equal(result.finalSalePriceBinding, true);
});

test("Seller-Sicherheitsvorschlag ersetzt niemals einen finalen Verkaufspreis", () => {
  const result = extractPriceProvenance({
    approval: { companyOsApproved: true },
    pricing: { buyPrice: 17.31, suggestedSalePrice: 25.84, salePrice: 0 },
  });

  assert.equal(result.sellerValidationSuggestion, 25.84);
  assert.equal(result.finalSalePrice, null);
  assert.equal(result.finalSource, "missing");
});

test("Arbeitskopie erhält den vollständigen Preisnachweis", () => {
  const source = {
    approval: { companyOsApproved: true },
    pricing: { buyPrice: 17.31, salePrice: 27.99, companyOsRecommendedPrice: 25.84 },
    raw: { novaPriceIdea: 33.29, finalSalePrice: 27.99, salePriceSource: "manual" },
  };
  const copy = enrichWorkingCopy({ id: "p-1", title: "Produkt" }, source);

  assert.equal(copy.novaPriceIdea, 33.29);
  assert.equal(copy.companyOsRecommendedPrice, 25.84);
  assert.equal(copy.finalSalePrice, 27.99);
  assert.equal(copy.salePriceSource, "manual");
  assert.equal(copy.pricing.finalSalePrice, 27.99);
  assert.equal(copy.priceProvenance.schemaVersion, "elyon-price-provenance-v1");
});

test("deutsche und internationale Geldwerte werden defensiv normalisiert", () => {
  assert.equal(moneyOrNull("1.234,56 €"), 1234.56);
  assert.equal(moneyOrNull("1,234.56 USD"), 1234.56);
  assert.equal(moneyOrNull("0,00 €"), null);
  assert.equal(moneyOrNull(""), null);
});

test("Runtime lädt den Preisnachweis vor Inbox und Listing-Logik", async () => {
  const source = await readFile(new URL("seller-runtime-loader.js", root), "utf8");
  const firstPrice = source.indexOf('/seller-price-provenance.js');
  const inbox = source.indexOf('/seller-company-os-inbox.js');
  const selling = source.indexOf('/seller-selling-flow.js');

  assert.ok(firstPrice >= 0);
  assert.ok(firstPrice < inbox);
  assert.ok(firstPrice < selling);
  assert.match(source, /ElyonSellerPriceProvenance\?\.enrichSelectedWorkingCopy/);
  assert.match(source, /ElyonSellerPriceProvenance\?\.render/);
});

test("Company-OS-Eingang zeigt und speichert den Preisweg", async () => {
  const source = await readFile(new URL("seller-company-os-inbox.js", root), "utf8");

  assert.match(source, /Preisweg anzeigen/);
  assert.match(source, /Nova-Preisidee/);
  assert.match(source, /Elyon-Empfehlung/);
  assert.match(source, /Finaler Verkaufspreis/);
  assert.match(source, /priceProvenance/);
  assert.match(source, /companyOsRecommendedPrice/);
  assert.match(source, /finalSalePrice/);
});

test("neue Preisnachweis-Module führen keine Netzwerk- oder Veröffentlichungsaktion aus", async () => {
  const core = await readFile(new URL("seller-price-provenance-core.js", root), "utf8");
  const ui = await readFile(new URL("seller-price-provenance.js", root), "utf8");
  const combined = `${core}\n${ui}`;

  assert.doesNotMatch(combined, /fetch\s*\(|XMLHttpRequest|publishOffer|createOffer|create_ebay|createOrder|refundCustomer/i);
  assert.match(combined, /novaPriceIdeaBinding:\s*false/);
  assert.match(combined, /companyOsRecommendationBinding:\s*false/);
});
