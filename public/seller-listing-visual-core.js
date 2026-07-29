const THEMES = {
  signature: { label: "Elyon Signature", brand: "#07172d", accent: "#c6a15b", soft: "#fff6df", paper: "#ffffff", ink: "#101828", muted: "#667085", radius: "18px", category: "Universal" },
  nordic: { label: "Nordic Light", brand: "#34423d", accent: "#9c7454", soft: "#f2ece4", paper: "#fdfcf9", ink: "#2d3532", muted: "#69736f", radius: "6px", category: "Wohnen & Haushalt" },
  carbon: { label: "Carbon Pro", brand: "#0b1117", accent: "#2997e6", soft: "#17334a", paper: "#111d28", ink: "#f8fafc", muted: "#b8c6d4", radius: "8px", category: "Technik" },
  compact: { label: "Mobile Compact", brand: "#17324d", accent: "#3d769f", soft: "#e6eef5", paper: "#ffffff", ink: "#172033", muted: "#667085", radius: "9px", category: "Schnelldreher" },
  clean: { label: "Clean", brand: "#171717", accent: "#525252", soft: "#f5f5f5", paper: "#ffffff", ink: "#171717", muted: "#737373", radius: "12px", category: "Minimalistisch" },
  tech: { label: "Tech Blue", brand: "#071c33", accent: "#1479d1", soft: "#eaf5ff", paper: "#ffffff", ink: "#102a43", muted: "#627d98", radius: "12px", category: "Elektronik" },
  home: { label: "Home Natural", brand: "#263b35", accent: "#6f8d7e", soft: "#edf5f0", paper: "#ffffff", ink: "#273a35", muted: "#64756f", radius: "16px", category: "Haus & Garten" },
  fashion: { label: "Fashion", brand: "#30232c", accent: "#a15f7e", soft: "#faedf3", paper: "#ffffff", ink: "#382a34", muted: "#7f6b78", radius: "18px", category: "Mode" },
  outdoor: { label: "Outdoor", brand: "#26351f", accent: "#68884d", soft: "#eff6e8", paper: "#ffffff", ink: "#26351f", muted: "#687261", radius: "13px", category: "Outdoor & Freizeit" },
};

function text(value, max = 60000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function plain(value, max = 60000) {
  return text(value, max).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function number(value) {
  const parsed = Number(String(value ?? "").replace(/\s/g, "").replace(",", ".").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!text(value)) return [];
  return text(value).split(/\n|\||•|;/).map((entry) => entry.replace(/^[-–✓✔]\s*/, "").trim()).filter(Boolean);
}

function cleanUrl(value) {
  try {
    const url = new URL(text(value));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function images(...values) {
  const output = [];
  for (const entry of values.flat(Infinity)) {
    const url = cleanUrl(typeof entry === "string" ? entry : entry?.url || entry?.src || entry?.imageUrl || entry?.original || entry?.large);
    if (url && !output.includes(url)) output.push(url);
  }
  return output.slice(0, 12);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function safeTheme(value) {
  return THEMES[value] ? value : "signature";
}

function normalizePair(entry, index, type) {
  if (entry && typeof entry === "object") {
    return type === "feature"
      ? { title: text(entry.title || entry.name || `Vorteil ${index + 1}`, 80), text: text(entry.text || entry.value || entry.description, 500) }
      : { name: text(entry.name || entry.title || `Merkmal ${index + 1}`, 80), value: text(entry.value || entry.text || entry.description, 500) };
  }
  return type === "feature"
    ? { title: `Vorteil ${index + 1}`, text: text(entry, 500) }
    : { name: `Merkmal ${index + 1}`, value: text(entry, 500) };
}

export function defaultVisualDraft() {
  return {
    schemaVersion: "elyon-seller-listing-designer-v1",
    theme: "signature",
    category: "",
    title: "",
    subtitle: "",
    imageUrl: "",
    images: [],
    shortDescription: "",
    longDescription: "",
    features: [],
    specs: [],
    packageContents: "",
    importantNotes: "",
    shippingText: "",
    returnsText: "",
    serviceText: "",
    updatedAt: "",
  };
}

export function normalizeVisualDraft(value = {}) {
  const source = object(value);
  const output = {
    ...defaultVisualDraft(),
    ...source,
    theme: safeTheme(source.theme),
    category: text(source.category, 300),
    title: text(source.title, 80),
    subtitle: text(source.subtitle, 180),
    imageUrl: cleanUrl(source.imageUrl),
    images: images(source.images, source.imageUrl),
    shortDescription: text(source.shortDescription, 600),
    longDescription: text(source.longDescription, 20000),
    features: (Array.isArray(source.features) ? source.features : []).map((entry, index) => normalizePair(entry, index, "feature")).filter((entry) => entry.title || entry.text).slice(0, 8),
    specs: (Array.isArray(source.specs) ? source.specs : []).map((entry, index) => normalizePair(entry, index, "spec")).filter((entry) => entry.name || entry.value).slice(0, 20),
    packageContents: text(source.packageContents, 3000),
    importantNotes: text(source.importantNotes, 3000),
    shippingText: text(source.shippingText, 2000),
    returnsText: text(source.returnsText, 2000),
    serviceText: text(source.serviceText, 2000),
  };
  if (!output.imageUrl && output.images[0]) output.imageUrl = output.images[0];
  return output;
}

function pairsFromObject(value) {
  const output = [];
  if (Array.isArray(value)) {
    value.forEach((entry, index) => output.push(normalizePair(entry, index, "spec")));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([name, raw]) => {
      const values = Array.isArray(raw) ? raw : [raw];
      values.forEach((entry) => output.push({ name: text(name, 80), value: text(entry, 500) }));
    });
  }
  return output.filter((entry) => entry.name && entry.value).slice(0, 20);
}

function guessTheme(category, title) {
  const haystack = `${category} ${title}`.toLowerCase();
  if (/technik|elektr|kabel|handy|smart|usb|computer|audio|led/.test(haystack)) return "carbon";
  if (/haushalt|wohnen|küche|bad|deko|aufbewahrung/.test(haystack)) return "nordic";
  if (/mode|kleidung|schmuck|ring|tasche|accessoire|uhr/.test(haystack)) return "fashion";
  if (/garten|outdoor|camping|freizeit|pflanz|grill/.test(haystack)) return "outdoor";
  if (/büro|organizer|halter|haken|adapter|set/.test(haystack)) return "compact";
  return "signature";
}

export function visualDraftFromListingView(view = {}) {
  const listing = object(view.autoListerDraft || view.server?.listing || view.local?.listing);
  const raw = object(view.server?.raw || view.local?.raw);
  const specs = pairsFromObject(view.itemSpecifics || listing.itemSpecifics || raw.itemSpecifics);
  const featureSources = [listing.features, view.server?.features, view.local?.features, raw.features, raw.highlights];
  const featureValues = featureSources.flatMap(list).slice(0, 8);
  const features = featureValues.map((entry, index) => ({ title: `Produktvorteil ${index + 1}`, text: text(entry, 500) }));
  const title = text(view.listingTitle || view.title, 80);
  const category = text(view.categoryName || view.categoryId, 300);
  const longDescription = plain(view.descriptionHtml || view.server?.description || view.local?.description, 20000);
  return normalizeVisualDraft({
    theme: guessTheme(category, title),
    category,
    title,
    subtitle: text(view.server?.subtitle || view.local?.subtitle || longDescription.split(/[.!?]\s/)[0], 180),
    imageUrl: view.images?.[0] || "",
    images: view.images || [],
    shortDescription: text(view.server?.shortDescription || view.local?.shortDescription || longDescription.split(/[.!?]\s/)[0], 600),
    longDescription: longDescription || `Dieses Angebot betrifft ${title}. Bitte prüfe Produktdetails, Maße, Variante und Lieferumfang vor dem Kauf.`,
    features: features.length ? features : specs.slice(0, 4).map((entry) => ({ title: entry.name, text: entry.value })),
    specs,
    packageContents: text(listing.packageContents || view.server?.packageContents || view.local?.packageContents || "Lieferumfang gemäß Angebotsbeschreibung und Produktbildern.", 3000),
    importantNotes: text(listing.importantNotes || view.server?.importantNotes || "Bitte Maße, Variante, Kompatibilität und Lieferumfang vor dem Kauf prüfen.", 3000),
    shippingText: text(listing.shippingText || (view.deliveryTime ? `Voraussichtliche Lieferzeit: ${view.deliveryTime}. Maßgeblich sind die Angaben im eBay-Angebot.` : "Es gelten die im eBay-Angebot angegebenen Versandbedingungen."), 2000),
    returnsText: text(listing.returnsText || (view.returnAddress ? `Rücksendung an die dokumentierte Rücksendeadresse: ${view.returnAddress}. Es gelten die im Angebot hinterlegten Rückgabebedingungen.` : "Es gelten die im Angebot hinterlegten Rückgabebedingungen."), 2000),
    serviceText: text(listing.serviceText || "Bei Fragen sende bitte eine Nachricht über eBay.", 2000),
  });
}

export function mergeVisualDraft(current = {}, proposed = {}, mode = "missing") {
  const existing = normalizeVisualDraft(current);
  const incoming = normalizeVisualDraft(proposed);
  if (mode === "all") return { ...incoming, updatedAt: new Date().toISOString() };
  const next = { ...existing };
  const fields = ["category", "title", "subtitle", "imageUrl", "shortDescription", "longDescription", "packageContents", "importantNotes", "shippingText", "returnsText", "serviceText"];
  fields.forEach((field) => { if (!text(next[field]) && text(incoming[field])) next[field] = incoming[field]; });
  if (!next.images.length && incoming.images.length) next.images = incoming.images;
  if (!next.features.length && incoming.features.length) next.features = incoming.features;
  if (!next.specs.length && incoming.specs.length) next.specs = incoming.specs;
  if (!next.theme) next.theme = incoming.theme;
  next.updatedAt = new Date().toISOString();
  return normalizeVisualDraft(next);
}

export function evaluateVisualDraft(value = {}) {
  const draft = normalizeVisualDraft(value);
  const warnings = [];
  let points = 0;
  const check = (ok, score, message) => { if (ok) points += score; else warnings.push(message); };
  check(draft.title.length >= 10 && draft.title.length <= 80, 12, "eBay-Titel auf 10–80 Zeichen bringen.");
  check(draft.subtitle.length >= 20, 8, "Kurzen Kundennutzen ergänzen.");
  check(draft.shortDescription.length >= 30, 10, "Kurze Einleitung ergänzen.");
  check(draft.longDescription.length >= 100, 14, "Beschreibung ausführlicher und sachlich formulieren.");
  check(draft.features.filter((entry) => entry.title && entry.text).length >= 2, 12, "Mindestens zwei belegbare Produktvorteile ergänzen.");
  check(draft.specs.filter((entry) => entry.name && entry.value).length >= 2, 12, "Mindestens zwei konkrete Produktmerkmale ergänzen.");
  check(Boolean(cleanUrl(draft.imageUrl)), 8, "Ein dauerhaftes HTTPS-Produktbild auswählen.");
  check(draft.packageContents.length >= 15, 8, "Lieferumfang konkret angeben.");
  check(draft.importantNotes.length >= 15, 6, "Wichtige Kaufhinweise ergänzen.");
  check(draft.shippingText.length >= 15 && draft.returnsText.length >= 15, 10, "Versand und Rückgabe abgleichen.");
  return { score: Math.min(100, points), warnings, ready: warnings.length === 0 };
}

export function buildVisualListingHtml(value = {}) {
  const draft = normalizeVisualDraft(value);
  const theme = THEMES[draft.theme];
  const featureHtml = draft.features.filter((entry) => entry.title || entry.text).map((entry, index) => `<article class="feature"><span>${String(index + 1).padStart(2, "0")}</span><strong>${esc(entry.title || "Produktvorteil")}</strong><p>${esc(entry.text)}</p></article>`).join("");
  const specHtml = draft.specs.filter((entry) => entry.name || entry.value).map((entry) => `<tr><th>${esc(entry.name)}</th><td>${esc(entry.value)}</td></tr>`).join("");
  const imageHtml = draft.imageUrl ? `<div class="image"><img src="${esc(draft.imageUrl)}" alt="${esc(draft.title)}"></div>` : "";
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(draft.title || "Produkt")} | Elyon Store</title></head><body style="margin:0;background:#eef2f6"><style>
  .elyon{--brand:${theme.brand};--accent:${theme.accent};--soft:${theme.soft};--paper:${theme.paper};--ink:${theme.ink};--muted:${theme.muted};max-width:980px;margin:0 auto;background:var(--paper);color:var(--ink);font-family:Arial,Helvetica,sans-serif;line-height:1.6;box-shadow:0 18px 55px rgba(16,24,40,.12);border-radius:${theme.radius};overflow:hidden}.elyon *{box-sizing:border-box}.top{background:var(--brand);color:#fff;padding:16px 34px;display:flex;justify-content:space-between;gap:18px}.logo{font-weight:900;letter-spacing:3px}.promise{font-size:12px;opacity:.82;text-align:right}.hero{padding:46px 44px 34px;background:linear-gradient(135deg,var(--soft),var(--paper))}.eyebrow{color:var(--accent);font-size:12px;font-weight:900;letter-spacing:1.8px;text-transform:uppercase}.hero h1{font-size:36px;line-height:1.15;margin:10px 0;color:var(--brand)}.subtitle{font-size:18px;color:var(--muted);margin:0}.content{padding:36px 44px 46px}.intro{display:grid;grid-template-columns:${imageHtml ? "minmax(240px,.85fr) 1.15fr" : "1fr"};gap:34px;align-items:center}.image{border:1px solid rgba(100,116,139,.2);border-radius:${theme.radius};padding:18px;background:#fff;text-align:center}.image img{display:block;width:100%;max-height:440px;object-fit:contain}.lead{font-size:17px;margin:0 0 14px}.copy{color:var(--muted);white-space:pre-line}.features{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:36px}.feature{padding:20px;border:1px solid rgba(100,116,139,.2);border-radius:${theme.radius};background:var(--paper)}.feature span{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:999px;background:var(--soft);color:var(--accent);font-weight:900}.feature strong{display:block;margin-top:10px;color:var(--brand)}.feature p{margin:4px 0 0;color:var(--muted)}.section{margin-top:38px}.section h2{color:var(--brand);font-size:24px}.specs{width:100%;border-collapse:separate;border-spacing:0;border:1px solid rgba(100,116,139,.2);border-radius:${theme.radius};overflow:hidden}.specs th,.specs td{padding:13px 16px;border-bottom:1px solid rgba(100,116,139,.16);text-align:left;vertical-align:top}.specs tr:last-child th,.specs tr:last-child td{border-bottom:0}.specs th{width:36%;background:var(--soft);color:var(--brand)}.notes{display:grid;grid-template-columns:1fr 1fr;gap:16px}.note{padding:20px;border-radius:${theme.radius};background:var(--soft);border-left:4px solid var(--accent)}.note h3{margin:0 0 8px;color:var(--brand)}.note p{margin:0;color:var(--muted);white-space:pre-line}.service{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:rgba(100,116,139,.2);margin-top:36px;border-radius:${theme.radius};overflow:hidden}.service div{padding:20px;background:var(--paper);text-align:center}.service strong{display:block;color:var(--brand)}.service span{display:block;color:var(--muted);font-size:13px}.footer{padding:25px 34px;background:var(--brand);color:#fff;text-align:center}.footer strong{display:block;letter-spacing:2px;color:var(--accent)}@media(max-width:680px){.top{padding:12px 20px}.promise{display:none}.hero,.content{padding:26px 22px}.hero h1{font-size:29px}.intro,.features,.notes{grid-template-columns:1fr}.service{grid-template-columns:1fr}.specs th,.specs td{display:block;width:100%}.specs th{border-bottom:0}}
  </style><div class="elyon"><div class="top"><div class="logo">ELYON STORE</div><div class="promise">Sicher ausgewählt · Klar beschrieben</div></div><header class="hero"><span class="eyebrow">${esc(draft.category || "Ausgewählte Produkte")}</span><h1>${esc(draft.title || "Produktname")}</h1><p class="subtitle">${esc(draft.subtitle)}</p></header><main class="content"><section class="intro">${imageHtml}<div><p class="lead">${esc(draft.shortDescription)}</p><div class="copy">${esc(draft.longDescription)}</div></div></section>${featureHtml ? `<section class="features">${featureHtml}</section>` : ""}${specHtml ? `<section class="section"><h2>Produktdetails</h2><table class="specs">${specHtml}</table></section>` : ""}<section class="section notes"><div class="note"><h3>Lieferumfang</h3><p>${esc(draft.packageContents)}</p></div><div class="note"><h3>Wichtige Hinweise</h3><p>${esc(draft.importantNotes)}</p></div></section><section class="service"><div><strong>Versand</strong><span>${esc(draft.shippingText)}</span></div><div><strong>Rückgabe</strong><span>${esc(draft.returnsText)}</span></div><div><strong>Service</strong><span>${esc(draft.serviceText)}</span></div></section></main><footer class="footer"><strong>ELYON STORE</strong><span>Danke für dein Interesse.</span></footer></div></body></html>`;
}

export function mergeProductWithVisualDraft(product = {}, draftValue = {}) {
  const draft = normalizeVisualDraft({ ...draftValue, updatedAt: new Date().toISOString() });
  const local = object(product);
  const server = object(local.rawServerProduct || local.raw || local);
  const listing = object(server.listing || local.listing);
  const html = buildVisualListingHtml(draft);
  const nextListing = {
    ...listing,
    title: draft.title || listing.title,
    descriptionHtml: html,
    descriptionDesign: draft,
    descriptionDesignDraft: draft,
    descriptionTheme: draft.theme,
    visualDesignerVersion: draft.schemaVersion,
    visualDesignerUpdatedAt: draft.updatedAt,
    manualApprovalRequired: true,
    autonomousPostingAllowed: false,
    updatedAt: draft.updatedAt,
  };
  return {
    ...local,
    listing: nextListing,
    listingTitle: nextListing.title,
    listingDescription: html,
    rawServerProduct: {
      ...server,
      listing: nextListing,
      listingTitle: nextListing.title,
      listingDescription: html,
      updatedAt: draft.updatedAt,
    },
    updatedAt: draft.updatedAt,
  };
}

export { THEMES, images, esc, text, number };