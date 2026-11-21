const TYPES = Object.freeze(["blank", "letter", "offer", "contract", "form", "delivery", "purchase_note", "complaint"]);
const ALLOWED_TAGS = new Set(["p", "div", "br", "strong", "b", "em", "i", "u", "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "table", "thead", "tbody", "tr", "th", "td", "hr"]);
const MAX_DOCS = 80;
const MAX_TEMPLATES = 40;
const MAX_BLOCKS = 60;
const MAX_BLOCK_CHARS = 5000;
const BLOCK_CATEGORIES = Object.freeze(["Begrüßung", "Abschluss", "Verkauf", "Kundenservice", "Lieferanten", "Organisation", "Eigene"]);
const DESIGNS = Object.freeze(["elyon", "classic", "modern", "minimal"]);
const MAX_CONTENT_CHARS = 25000;

export function sanitizeStudioMarkup(value) {
  const html = String(value ?? "").slice(0, MAX_CONTENT_CHARS + 1024);
  return html.replace(/<!--[\s\S]*?-->|<[^>]*>/g, (tag) => {
    if (tag.startsWith("<!--")) return "";
    const match = /^<\s*(\/?)\s*([a-z][a-z0-9]*)\b[^>]*>$/i.exec(tag);
    if (!match || !ALLOWED_TAGS.has(match[2].toLowerCase())) return "";
    const name = match[2].toLowerCase();
    if (name === "br" || name === "hr") return "<" + name + ">";
    return "<" + (match[1] ? "/" : "") + name + ">";
  });
}

const text = (value, max = 200) => String(value ?? "").trim().slice(0, max);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const accentColor = (value) => /^#[a-fA-F0-9]{6}$/.test(String(value || "")) ? String(value).toLowerCase() : "";
const logoData = (value) => /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]{1,48000}$/.test(String(value || "")) ? String(value) : "";

export function normalizeStudioState(input) {
  const state = object(input);
  return {
    version: 1,
    revision: Number.isSafeInteger(state.revision) && state.revision >= 0 ? state.revision : 0,
    documents: Array.isArray(state.documents) ? state.documents.filter((doc) => object(doc).id).slice(0, MAX_DOCS) : [],
    customTemplates: Array.isArray(state.customTemplates) ? state.customTemplates.filter((entry) => object(entry).id).slice(0, MAX_TEMPLATES) : [],
    customBlocks: Array.isArray(state.customBlocks) ? state.customBlocks.filter((entry) => object(entry).id).slice(0, MAX_BLOCKS) : [],
  };
}

export function documentSummary(doc) {
  return {
    id: doc.id, kind: doc.kind, title: doc.title, recipient: doc.recipient,
    reference: doc.reference, createdAt: doc.createdAt, updatedAt: doc.updatedAt,
    archivedAt: doc.archivedAt || null, version: doc.version,
    templateId: doc.templateId || "", designId: doc.designId || "elyon",
  };
}

export function applyStudioChange(rawState, action, rawDocument, id) {
  const state = normalizeStudioState(rawState);
  const now = new Date().toISOString();
  const docs = state.documents.slice();
  if (action === "save") {
    const input = object(rawDocument);
    const documentId = text(input.id, 100);
    const kind = text(input.kind, 30);
    const title = text(input.title, 121);
    const contentHtml = String(input.contentHtml ?? "");
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(documentId)) throw Object.assign(new Error("Ungültige Dokument-ID."), { status: 422 });
    if (!TYPES.includes(kind)) throw Object.assign(new Error("Unbekannte Dokumentenart."), { status: 422 });
    if (!title || title.length > 120) throw Object.assign(new Error("Titel muss 1–120 Zeichen enthalten."), { status: 422 });
    if (contentHtml.length > MAX_CONTENT_CHARS) throw Object.assign(new Error("Dokument ist zu lang (maximal 25.000 Zeichen)."), { status: 422 });
    const idx = docs.findIndex((doc) => doc.id === documentId);
    const previous = idx < 0 ? null : docs[idx];
    if (previous?.archivedAt) throw Object.assign(new Error("Archiviertes Dokument zuerst wiederherstellen."), { status: 409 });
    if (idx < 0 && docs.length >= MAX_DOCS) throw Object.assign(new Error("Maximal 80 Dokumente. Bitte archivieren und extern sichern."), { status: 422 });
    const next = {
      id: documentId, kind, title, templateId: text(input.templateId, 100),
      designId: DESIGNS.includes(input.designId) ? input.designId : "elyon",
      accentColor: accentColor(input.accentColor), headerText: text(input.headerText, 120),
      footerText: text(input.footerText, 180), logoData: logoData(input.logoData), recipient: text(input.recipient, 300),
      reference: text(input.reference, 120), contentHtml: sanitizeStudioMarkup(contentHtml),
      createdAt: previous?.createdAt || now, updatedAt: now,
      version: (Number(previous?.version || 0) + 1), archivedAt: null,
    };
    if (idx < 0) docs.unshift(next);
    else docs[idx] = next;
  } else if (action === "save-template") {
    const input = object(rawDocument);
    const templateId = text(input.id, 100);
    const kind = text(input.kind, 30);
    const name = text(input.name, 121);
    const contentHtml = String(input.contentHtml ?? "");
    if (!/^tpl_[a-zA-Z0-9_-]{8,96}$/.test(templateId)) throw Object.assign(new Error("Ungültige Vorlagen-ID."), { status: 422 });
    if (!TYPES.includes(kind)) throw Object.assign(new Error("Unbekannte Dokumentenart."), { status: 422 });
    if (!name || name.length > 120) throw Object.assign(new Error("Vorlagenname muss 1–120 Zeichen enthalten."), { status: 422 });
    if (contentHtml.length > MAX_CONTENT_CHARS) throw Object.assign(new Error("Vorlage ist zu lang."), { status: 422 });
    const prior = state.customTemplates.findIndex((entry) => entry.id === templateId);
    if (prior < 0 && state.customTemplates.length >= MAX_TEMPLATES) throw Object.assign(new Error("Maximal 40 eigene Vorlagen."), { status: 422 });
    const record = {
      id: templateId, kind, name, contentHtml: sanitizeStudioMarkup(contentHtml),
      designId: DESIGNS.includes(input.designId) ? input.designId : "elyon",
      accentColor: accentColor(input.accentColor), headerText: text(input.headerText, 120),
      footerText: text(input.footerText, 180), logoData: logoData(input.logoData),
      createdAt: prior >= 0 ? state.customTemplates[prior].createdAt : now, updatedAt: now
    };
    if (prior >= 0) state.customTemplates[prior] = record;
    else state.customTemplates.unshift(record);
  } else if (action === "save-block") {
    const input = object(rawDocument);
    const blockId = text(input.id, 100);
    const title = text(input.title, 121);
    const category = text(input.category, 50);
    const contentHtml = String(input.contentHtml ?? "");
    if (!/^block_[a-zA-Z0-9_-]{8,94}$/.test(blockId)) throw Object.assign(new Error("Ungültige Baustein-ID."), { status: 422 });
    if (!title || title.length > 120) throw Object.assign(new Error("Bausteintitel muss 1–120 Zeichen enthalten."), { status: 422 });
    if (!BLOCK_CATEGORIES.includes(category)) throw Object.assign(new Error("Unbekannte Baustein-Kategorie."), { status: 422 });
    if (!contentHtml.trim() || contentHtml.length > MAX_BLOCK_CHARS) throw Object.assign(new Error("Bausteininhalt muss 1–5.000 Zeichen enthalten."), { status: 422 });
    const idx = state.customBlocks.findIndex((entry) => entry.id === blockId);
    if (idx < 0 && state.customBlocks.length >= MAX_BLOCKS) throw Object.assign(new Error("Maximal 60 eigene Textbausteine."), { status: 422 });
    const record = {
      id: blockId, title, category, contentHtml: sanitizeStudioMarkup(contentHtml),
      createdAt: idx >= 0 ? state.customBlocks[idx].createdAt : now, updatedAt: now
    };
    if (idx >= 0) state.customBlocks[idx] = record;
    else state.customBlocks.unshift(record);
  } else if (action === "delete-block") {
    const blockId = text(id, 100);
    const idx = state.customBlocks.findIndex((entry) => entry.id === blockId);
    if (idx < 0) throw Object.assign(new Error("Textbaustein nicht gefunden."), { status: 404 });
    state.customBlocks.splice(idx, 1);
  } else if (action === "delete-template") {
    const templateId = text(id, 100);
    const previous = state.customTemplates.findIndex((entry) => entry.id === templateId);
    if (previous < 0) throw Object.assign(new Error("Vorlage nicht gefunden."), { status: 404 });
    state.customTemplates.splice(previous, 1);
  } else if (action === "archive" || action === "restore") {
    const documentId = text(id, 100);
    const idx = docs.findIndex((doc) => doc.id === documentId);
    if (idx < 0) throw Object.assign(new Error("Dokument nicht gefunden."), { status: 404 });
    docs[idx] = { ...docs[idx], archivedAt: action === "archive" ? now : null, updatedAt: now, version: Number(docs[idx].version || 0) + 1 };
  } else {
    throw Object.assign(new Error("Unbekannte Dokumentenaktion."), { status: 400 });
  }
  return { version: 1, revision: state.revision + 1, documents: docs, customTemplates: state.customTemplates, customBlocks: state.customBlocks };
}

export { TYPES as STUDIO_DOCUMENT_TYPES };
