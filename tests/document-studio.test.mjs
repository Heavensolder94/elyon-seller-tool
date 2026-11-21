import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeEbayOrder, buildOrderDocumentContext } from "../seller-orders-v2-core.js";
import { applyStudioChange, normalizeStudioState, sanitizeStudioMarkup, documentSummary, STUDIO_DOCUMENT_TYPES } from "../lib/document-studio-core.js";

const draft = (overrides = {}) => ({
  id: "doc_1234567890", kind: "letter", title: "Geschäftsbrief", recipient: "Musterkunde",
  reference: "EBAY-1", contentHtml: "<h2>Willkommen</h2><p>Hallo <strong>{{Empfänger}}</strong></p>",
  ...overrides
});

test("document studio accepts basic semantic rich text and drops unsafe HTML", () => {
  assert.equal(sanitizeStudioMarkup('<h2 class="x">Test</h2><script>alert(1)</script><p onclick="x()">Hi</p><strong>Fett</strong>'),
    "<h2>Test</h2>alert(1)<p>Hi</p><strong>Fett</strong>");
  assert.equal(sanitizeStudioMarkup('<img src=x onerror=alert(1)><a href="javascript:alert(1)">Text</a>'), "Text");
});

test("document studio creates and revises one isolated editable draft", () => {
  const first = applyStudioChange(null, "save", draft());
  assert.equal(first.revision, 1);
  assert.equal(first.documents.length, 1);
  assert.equal(first.documents[0].version, 1);
  assert.equal(first.documents[0].contentHtml.includes("onclick"), false);
  const second = applyStudioChange(first, "save", draft({ title: "Neue Fassung" }));
  assert.equal(second.revision, 2);
  assert.equal(second.documents.length, 1);
  assert.equal(second.documents[0].version, 2);
  assert.equal(second.documents[0].createdAt, first.documents[0].createdAt);
  assert.equal(documentSummary(second.documents[0]).contentHtml, undefined);
});

test("document studio archives and restores without deleting content", () => {
  const created = applyStudioChange(null, "save", draft());
  const archived = applyStudioChange(created, "archive", null, "doc_1234567890");
  assert.ok(archived.documents[0].archivedAt);
  assert.throws(() => applyStudioChange(archived, "save", draft()), /Archiviertes/);
  const restored = applyStudioChange(archived, "restore", null, "doc_1234567890");
  assert.equal(restored.documents[0].archivedAt, null);
  assert.match(restored.documents[0].contentHtml, /Willkommen/);
});

test("document studio never implements a second issued-invoice document kind", () => {
  assert.equal(STUDIO_DOCUMENT_TYPES.includes("invoice"), false);
  assert.throws(() => applyStudioChange(null, "save", draft({ kind: "invoice" })), /Dokumentenart/);
  assert.throws(() => applyStudioChange(null, "save", draft({ id: "<bad>" })), /Dokument-ID/);
  assert.throws(() => applyStudioChange(null, "save", draft({ contentHtml: "x".repeat(25001) })), /zu lang/);
  assert.equal(normalizeStudioState({ revision: -2 }).revision, 0);
});

test("document studio persists design identity without modifying rich text", () => {
  const base = applyStudioChange(null, "save", draft({
    designId: "classic", templateId: "auftragsbestaetigung",
    contentHtml: "<table><tr><th>Artikel</th></tr><tr><td>Test</td></tr></table>"
  }));
  assert.equal(base.documents[0].designId, "classic");
  assert.equal(base.documents[0].templateId, "auftragsbestaetigung");
  const revised = applyStudioChange(base, "save", { ...base.documents[0], designId: "modern" });
  assert.equal(revised.documents[0].designId, "modern");
  assert.equal(revised.documents[0].contentHtml, base.documents[0].contentHtml);
  assert.equal(documentSummary(revised.documents[0]).designId, "modern");
});

test("personal templates can be saved and deleted without touching documents", () => {
  const first = applyStudioChange(null, "save", draft());
  const template = {
    id: "tpl_1234567890123", name: "Eigener Geschäftsbrief", kind: "letter",
    designId: "minimal", contentHtml: "<h2>Mein Text</h2><p>{{Firma}}</p>"
  };
  const second = applyStudioChange(first, "save-template", template);
  assert.equal(second.documents.length, 1);
  assert.equal(second.customTemplates.length, 1);
  assert.equal(second.customTemplates[0].designId, "minimal");
  assert.match(second.customTemplates[0].contentHtml, /Mein Text/);
  const revised = applyStudioChange(second, "save-template", { ...template, name: "Neue Vorlage" });
  assert.equal(revised.customTemplates.length, 1);
  const deleted = applyStudioChange(revised, "delete-template", null, template.id);
  assert.equal(deleted.customTemplates.length, 0);
  assert.equal(deleted.documents[0].contentHtml, first.documents[0].contentHtml);
});

test("custom templates reject unsupported types, invoice models and excessive documents", () => {
  assert.throws(() => applyStudioChange(null, "save-template", {
    id: "tpl_123456789", name: "Fake Rechnung", kind: "invoice", contentHtml: "Rechnung"
  }), /Dokumentenart/);
  assert.throws(() => applyStudioChange(null, "save-template", {
    id: "tpl_123456789", name: "Schlechtes Template", kind: "letter",
    contentHtml: "x".repeat(25001)
  }), /zu lang/);
  assert.throws(() => applyStudioChange(null, "delete-template", null, "tpl_unknown"), /nicht gefunden/);
  assert.equal(normalizeStudioState({ documents: [] }).customTemplates.length, 0);
});

test("branding is stored as validated text and image data, never as remote or active markup", () => {
  const logo = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
  const state = applyStudioChange(null, "save", draft({
    designId: "modern", accentColor: "#0D9488", headerText: "ELYON · Versandhandel",
    footerText: "Geschäftliche Korrespondenz", logoData: logo
  }));
  const doc = state.documents[0];
  assert.equal(doc.accentColor, "#0d9488");
  assert.equal(doc.headerText, "ELYON · Versandhandel");
  assert.equal(doc.footerText, "Geschäftliche Korrespondenz");
  assert.equal(doc.logoData, logo);
  const invalid = applyStudioChange(state, "save", draft({
    accentColor: "url(javascript:evil)", logoData: "data:image/svg+xml;base64,abc"
  }));
  assert.equal(invalid.documents[0].accentColor, "");
  assert.equal(invalid.documents[0].logoData, "");
});

test("brand settings survive custom template save", () => {
  const logo = "data:image/png;base64,aGVsbG8=";
  const state = applyStudioChange(null, "save-template", {
    id: "tpl_999999999999", name: "ELYON Angebot", kind: "offer", designId: "elyon",
    accentColor: "#123abc", headerText: "ELYON Handel", footerText: "Lemgo",
    logoData: logo, contentHtml: "<h2>Angebot</h2>"
  });
  assert.equal(state.customTemplates[0].accentColor, "#123abc");
  assert.equal(state.customTemplates[0].logoData, logo);
  assert.equal(state.documents.length, 0);
});

test("reusable text blocks preserve content independently of documents and templates", () => {
  const first = applyStudioChange(null, "save", draft({ title: "Kundenbrief" }));
  const block = {
    id: "block_1234567890", title: "Höflicher Abschluss", category: "Eigene",
    contentHtml: "<p>Mit freundlichen Grüßen</p><p>{{Firma}}</p>"
  };
  const second = applyStudioChange(first, "save-block", block);
  assert.equal(second.documents.length, 1);
  assert.equal(second.customBlocks.length, 1);
  assert.equal(second.customBlocks[0].title, "Höflicher Abschluss");
  assert.match(second.customBlocks[0].contentHtml, /{{Firma}}/);
  const updated = applyStudioChange(second, "save-block", { ...block, title: "Gruß" });
  assert.equal(updated.customBlocks.length, 1);
  assert.equal(updated.customBlocks[0].title, "Gruß");
  const removed = applyStudioChange(updated, "delete-block", null, block.id);
  assert.equal(removed.customBlocks.length, 0);
  assert.equal(removed.documents[0].contentHtml, first.documents[0].contentHtml);
  assert.equal(removed.revision, 4);
});

test("text blocks reject oversized and unsafe content", () => {
  const example = { id: "block_abcdefgh123", title: "Sicherer Block", category: "Eigene", contentHtml: '<p onclick="attack()">Hallo</p><img src=x onerror=alert(1)>' };
  const state = applyStudioChange(null, "save-block", example);
  assert.equal(state.customBlocks[0].contentHtml, "<p>Hallo</p>");
  assert.throws(() => applyStudioChange(null, "save-block", { ...example, category: "Rechnung" }), /Kategorie/);
  assert.throws(() => applyStudioChange(null, "save-block", { ...example, contentHtml: "x".repeat(5001) }), /5.000/);
  assert.throws(() => applyStudioChange(null, "save-block", { ...example, title: "" }), /Bausteintitel/);
  assert.throws(() => applyStudioChange(null, "delete-block", null, "block_missing"), /nicht gefunden/);
  assert.equal(normalizeStudioState(null).customBlocks.length, 0);
});

test("bestelleingang and auftragsbestaetigung are separate document templates", () => {
  const studioSource = readFileSync(new URL("../seller-document-studio.js", import.meta.url), "utf8");
  const rows = studioSource.split(String.fromCharCode(10));
  const orderReceipt = rows.find((line) => line.includes('["bestellbestaetigung", "Verkauf"'));
  const orderAcceptance = rows.find((line) => line.includes('["auftragsbestaetigung", "Verkauf"'));
  assert.ok(orderReceipt, "Bestelleingangsbestätigung must exist");
  assert.ok(orderAcceptance, "Existing Auftragsbestätigung must remain");
  assert.ok(orderReceipt.includes("Bestellbestätigung (Bestelleingang)"));
  assert.match(orderReceipt, /Eingang Ihrer Bestellung/);
  assert.match(orderReceipt, /Bestelldatum bitte prüfen/);
  assert.doesNotMatch(orderReceipt, /noch kein (Kaufvertrag|Vertrag)|erst mit.*Vertrag/);
  assert.ok(studioSource.includes('["order-received", "Verkauf", "Bestelleingang bestätigen"'));
});

test("recipient address keeps manually entered postal line breaks when saved and reloaded", () => {
  const address = ["Max Mustermann", "Musterstraße 12", "12345 Musterstadt"].join(String.fromCharCode(10));
  const first = applyStudioChange(null, "save", draft({ recipient: address }));
  assert.equal(first.documents[0].recipient, address);
  assert.equal(documentSummary(first.documents[0]).recipient, address);
  const second = applyStudioChange(first, "save", { ...first.documents[0], title: "Bestellbestätigung" });
  assert.equal(second.documents[0].recipient, address);
  const frontend = readFileSync(new URL("../seller-document-studio.js", import.meta.url), "utf8");
  assert.match(frontend, /<textarea id="edsRecipient"/);
  assert.match(frontend, /eds-recipient-address/);
  assert.match(frontend, /withBreaks/);
});


test("order handoff uses only safe eBay fields and preserves multiline postal address", () => {
  const order = normalizeEbayOrder({
    orderId: "03-12345-67890", creationDate: "2026-11-21T10:00:00.000Z",
    orderPaymentStatus: "PAID", orderFulfillmentStatus: "NOT_STARTED",
    buyer: { username: "user123", email: "secret@example.com" },
    fulfillmentStartInstructions: [{
      shippingStep: { shipTo: { fullName: "Max Mustermann",
        contactAddress: { addressLine1: "Musterstraße 12", addressLine2: "2. OG",
          postalCode: "12345", city: "Musterstadt", countryCode: "DE" } } }
    }],
    pricingSummary: { total: { value: "59.90", currency: "EUR" } },
    lineItems: [{ lineItemId: "a", title: "Schreibtischlampe", quantity: 2,
      lineItemCost: { value: "29.95" }, sku: "ELY-000001" }]
  });
  const context = buildOrderDocumentContext(order, { carrier: "DHL", trackingNumber: "AB123" });
  assert.equal(context.source, "ebay_order");
  assert.equal(context.orderId, "03-12345-67890");
  assert.equal(context.recipientAddress, "Max Mustermann\nMusterstraße 12\n2. OG\n12345 Musterstadt\nDE");
  assert.equal(context.addressComplete, true);
  assert.equal(context.total, 59.9);
  assert.deepEqual(context.lines, [{ title: "Schreibtischlampe", quantity: 2, lineTotal: 29.95 }]);
  assert.equal(context.carrier, "DHL");
  assert.equal(context.trackingNumber, "AB123");
  assert.equal(context.demo, false);
  assert.doesNotMatch(JSON.stringify(context), /secret@example.com|supplier|buyPrice|invoiceNumber/);
});

test("order handoff never guesses missing recipients, prices or dates", () => {
  const order = normalizeEbayOrder({ orderId: "DEMO-1002", orderPaymentStatus: "NOT_PAID",
    lineItems: [{ title: "Artikel", quantity: 1 }] });
  const context = buildOrderDocumentContext(order, { demo: true });
  assert.equal(context.recipientAddress, "");
  assert.equal(context.addressComplete, false);
  assert.equal(context.createdAt, "");
  assert.equal(context.paymentStatus, "NOT_PAID");
  assert.equal(context.lines[0].lineTotal, null);
  assert.equal(context.demo, true);
  assert.equal(buildOrderDocumentContext({ id: "<bad-id>" }), null);
});

test("order cockpit exposes only an explicit manual document handoff, with demo isolation", () => {
  const cockpit = readFileSync(new URL("../seller-orders-v2.js", import.meta.url), "utf8");
  const studio = readFileSync(new URL("../seller-document-studio.js", import.meta.url), "utf8");
  const runtime = readFileSync(new URL("../seller-runtime-loader.js", import.meta.url), "utf8");
  assert.match(cockpit, /data-order-document/);
  assert.match(cockpit, /buildOrderDocumentContext/);
  assert.match(cockpit, /bridge\.openFromOrder\(context, templateId\)/);
  assert.match(runtime, /ElyonSellerDocumentBridge/);
  assert.match(runtime, /requestGroup\("elyonDocumentStudioTab"\)/);
  assert.match(studio, /openFromOrder\(context, templateId\)/);
  assert.match(studio, /if \(state\.demoOrderDraft\) return status\("Demo-Bestellungen/);
  assert.match(studio, /sourceOrderId = orderId/);
});

test("eBay source order metadata persists through document archive without creating an invoice", () => {
  const first = applyStudioChange(null, "save", draft({
    kind: "offer", title: "Bestellbestätigung", templateId: "bestellbestaetigung",
    sourceOrderId: "03-12345-67890", reference: "03-12345-67890"
  }));
  assert.equal(first.documents[0].sourceOrderId, "03-12345-67890");
  assert.equal(documentSummary(first.documents[0]).sourceOrderId, "03-12345-67890");
  assert.equal(STUDIO_DOCUMENT_TYPES.includes("invoice"), false);
});
