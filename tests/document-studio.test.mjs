import test from "node:test";
import assert from "node:assert/strict";
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
