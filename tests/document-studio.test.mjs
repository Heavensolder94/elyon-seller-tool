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
    "<h2>Test</h2>alert(1)Hi<strong>Fett</strong>");
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
