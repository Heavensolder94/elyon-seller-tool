import test from "node:test";
import assert from "node:assert/strict";
import {
  THEMES,
  normalizeVisualDraft,
  visualDraftFromListingView,
  mergeVisualDraft,
  evaluateVisualDraft,
  buildVisualListingHtml,
  mergeProductWithVisualDraft,
} from "../seller-listing-visual-core.js";

const view = {
  title: "Verstellbarer Laptopständer aus Aluminium",
  listingTitle: "Laptopständer Aluminium verstellbar ergonomische Notebook Halterung",
  descriptionHtml: "<p>Stabiler Laptopständer für ergonomisches Arbeiten.</p><p>Faltbar und rutschfest.</p>",
  categoryName: "Laptop-Ständer",
  itemSpecifics: { Material: ["Aluminium"], Farbe: ["Silber"], Besonderheiten: ["Faltbar"] },
  images: ["https://example.com/image.jpg"],
  deliveryTime: "3–5 Werktage",
  returnAddress: "Musterstraße 1, 12345 Berlin, Deutschland",
  server: {},
  local: {},
};

test("provides the full nine-theme Elyon visual set", () => {
  assert.equal(Object.keys(THEMES).length, 9);
  assert.ok(THEMES.signature);
  assert.ok(THEMES.nordic);
  assert.ok(THEMES.carbon);
  assert.ok(THEMES.compact);
  assert.ok(THEMES.clean);
  assert.ok(THEMES.tech);
  assert.ok(THEMES.home);
  assert.ok(THEMES.fashion);
  assert.ok(THEMES.outdoor);
});

test("creates a visual listing draft from the Seller Product Master view", () => {
  const draft = visualDraftFromListingView(view);
  assert.equal(draft.title.length <= 80, true);
  assert.equal(draft.imageUrl, "https://example.com/image.jpg");
  assert.ok(draft.specs.length >= 3);
  assert.match(draft.shippingText, /3–5 Werktage/);
  assert.match(draft.returnsText, /Musterstraße/);
});

test("normalizes unsafe image protocols and excess content", () => {
  const draft = normalizeVisualDraft({
    theme: "unknown",
    title: "x".repeat(120),
    imageUrl: "javascript:alert(1)",
    images: ["http://example.com/a.jpg", "https://example.com/b.jpg"],
  });
  assert.equal(draft.theme, "signature");
  assert.equal(draft.title.length, 80);
  assert.equal(draft.imageUrl, "https://example.com/b.jpg");
  assert.deepEqual(draft.images, ["https://example.com/b.jpg"]);
});

test("merges only missing fields unless full replacement is explicit", () => {
  const current = normalizeVisualDraft({ title: "Bestehender Titel", longDescription: "Bestehender Text" });
  const proposed = normalizeVisualDraft({ title: "Neuer Titel", subtitle: "Neuer Untertitel", longDescription: "Neuer Text" });
  const missing = mergeVisualDraft(current, proposed, "missing");
  const all = mergeVisualDraft(current, proposed, "all");
  assert.equal(missing.title, "Bestehender Titel");
  assert.equal(missing.subtitle, "Neuer Untertitel");
  assert.equal(missing.longDescription, "Bestehender Text");
  assert.equal(all.title, "Neuer Titel");
});

test("builds script-free escaped HTML with responsive product sections", () => {
  const draft = visualDraftFromListingView({ ...view, listingTitle: '<img src=x onerror="alert(1)"> Laptopständer' });
  const html = buildVisualListingHtml(draft);
  assert.match(html, /ELYON STORE/);
  assert.match(html, /Produktdetails/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /onerror=/i);
  assert.match(html, /&lt;img/);
  assert.match(html, /@media\(max-width:680px\)/);
});

test("evaluates incomplete and complete visual listing packages", () => {
  const incomplete = evaluateVisualDraft({ title: "Kurz" });
  const completeDraft = normalizeVisualDraft({
    theme: "signature",
    title: "Laptopständer Aluminium verstellbar ergonomisch für Notebook",
    subtitle: "Stabiler und platzsparender Stand für ergonomisches Arbeiten",
    imageUrl: "https://example.com/image.jpg",
    shortDescription: "Ein stabiler Laptopständer für Büro und Homeoffice.",
    longDescription: "Dieser verstellbare Laptopständer unterstützt eine ergonomische Position am Arbeitsplatz. Die konkrete Größe, Kompatibilität, Variante und der Lieferumfang werden vor dem Kauf geprüft.",
    features: [{ title: "Verstellbar", text: "Die Position lässt sich passend zum Arbeitsplatz einstellen." }, { title: "Faltbar", text: "Der Ständer kann kompakt verstaut werden." }],
    specs: [{ name: "Material", value: "Aluminium" }, { name: "Farbe", value: "Silber" }],
    packageContents: "Ein Laptopständer gemäß Produktbildern und Angebotsbeschreibung.",
    importantNotes: "Bitte Maße und Kompatibilität vor dem Kauf prüfen.",
    shippingText: "Voraussichtliche Lieferzeit 3–5 Werktage laut geprüftem Angebot.",
    returnsText: "Es gelten die im eBay-Angebot hinterlegten Rückgabebedingungen.",
    serviceText: "Bei Fragen bitte über eBay kontaktieren.",
  });
  const complete = evaluateVisualDraft(completeDraft);
  assert.equal(incomplete.ready, false);
  assert.ok(incomplete.score < 50);
  assert.equal(complete.ready, true);
  assert.equal(complete.score, 100);
});

test("stores the design additively and preserves unknown product fields", () => {
  const product = {
    id: "p1",
    customLocalField: "preserve",
    rawServerProduct: {
      id: "p1",
      unknownServerField: { keep: true },
      listing: { categoryId: "31519", customListingField: "preserve" },
    },
  };
  const updated = mergeProductWithVisualDraft(product, visualDraftFromListingView(view));
  assert.equal(updated.customLocalField, "preserve");
  assert.deepEqual(updated.rawServerProduct.unknownServerField, { keep: true });
  assert.equal(updated.rawServerProduct.listing.customListingField, "preserve");
  assert.equal(updated.rawServerProduct.listing.autonomousPostingAllowed, false);
  assert.match(updated.rawServerProduct.listing.descriptionHtml, /ELYON STORE/);
});