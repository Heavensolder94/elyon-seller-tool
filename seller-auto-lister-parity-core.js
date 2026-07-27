import {
  buildAutoListerChecks,
  autoListerReadiness,
  buildInternalAutoListerDraft,
  mergeSellerProductWithDraft,
  sellerServerProduct,
} from "/seller-selling-flow-core.js";

function text(value, max = 5000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!text(value)) return [];
  try {
    const parsed = JSON.parse(text(value));
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {}
  return text(value).split(/\n|\||;/).map((entry) => entry.trim()).filter(Boolean);
}

function cleanAspects(value = {}) {
  const source = object(value);
  const output = {};
  for (const [rawName, rawValues] of Object.entries(source)) {
    const name = text(rawName, 100);
    const values = (Array.isArray(rawValues) ? rawValues : [rawValues]).map((entry) => text(entry, 120)).filter(Boolean).slice(0, 20);
    if (name && values.length) output[name] = [...new Set(values)];
  }
  return output;
}

function complianceFrom(product = {}, view = {}) {
  const server = sellerServerProduct(product);
  const listing = object(server.listing || product.listing);
  const draft = object(listing.autoListerDraft || view.autoListerDraft);
  const source = object(draft.compliance || listing.compliance || server.compliance || product.compliance);
  const gpsr = object(listing.gpsr || server.gpsr || product.gpsr);
  const manufacturer = object(source.manufacturer);
  const responsible = object(source.responsiblePerson);
  return {
    gpsrStatus: text(source.gpsrStatus || gpsr.status),
    manufacturer: {
      companyName: text(manufacturer.companyName || gpsr.manufacturerName || server.manufacturerName, 120),
      addressLine1: text(manufacturer.addressLine1 || gpsr.manufacturerAddress, 200),
      city: text(manufacturer.city, 80),
      postalCode: text(manufacturer.postalCode, 20),
      country: text(manufacturer.country, 2).toUpperCase(),
      email: text(manufacturer.email || gpsr.manufacturerEmail, 180),
      phone: text(manufacturer.phone, 80),
      contactUrl: text(manufacturer.contactUrl, 500),
    },
    responsiblePersonRequired: text(source.responsiblePersonRequired || gpsr.responsiblePersonRequired),
    responsiblePerson: {
      companyName: text(responsible.companyName || gpsr.responsiblePersonName, 120),
      addressLine1: text(responsible.addressLine1 || gpsr.responsiblePersonAddress, 200),
      city: text(responsible.city, 80),
      postalCode: text(responsible.postalCode, 20),
      country: text(responsible.country, 2).toUpperCase(),
      email: text(responsible.email || gpsr.responsiblePersonEmail, 180),
      phone: text(responsible.phone, 80),
      contactUrl: text(responsible.contactUrl, 500),
    },
    safetyNotes: list(source.safetyNotes || gpsr.safetyWarnings).map((entry) => text(entry, 500)).slice(0, 20),
    exemptionReason: text(source.exemptionReason || gpsr.exemptionReason, 1000),
    exemptionConfirmed: source.exemptionConfirmed === true || gpsr.exemptionConfirmed === true,
  };
}

function variantsFrom(product = {}, view = {}) {
  const server = sellerServerProduct(product);
  const listing = object(server.listing || product.listing);
  const draft = object(listing.autoListerDraft || view.autoListerDraft);
  const variants = list(draft.variants || listing.variants || server.variants || product.variants);
  return {
    variants,
    variantSummary: text(draft.variantSummary || listing.variantSummary || server.variantSummary || product.variantSummary, 3000),
    confirmed: draft.variantsConfirmed === true || listing.variantsConfirmed === true,
  };
}

function contactComplete(contact = {}) {
  const hasRoute = Boolean(text(contact.email) || text(contact.phone) || text(contact.contactUrl));
  return Boolean(
    text(contact.companyName) &&
    text(contact.addressLine1) &&
    text(contact.city) &&
    text(contact.postalCode) &&
    /^[A-Z]{2}$/.test(text(contact.country)) &&
    hasRoute
  );
}

export function buildAdvancedAutoListerState(product = {}, view = {}, overrides = {}) {
  const server = sellerServerProduct(product);
  const listing = object(server.listing || product.listing);
  const draft = object(listing.autoListerDraft || view.autoListerDraft);
  const compliance = {
    ...complianceFrom(product, view),
    ...object(overrides.compliance),
    manufacturer: { ...complianceFrom(product, view).manufacturer, ...object(overrides.compliance?.manufacturer) },
    responsiblePerson: { ...complianceFrom(product, view).responsiblePerson, ...object(overrides.compliance?.responsiblePerson) },
  };
  const variants = { ...variantsFrom(product, view), ...object(overrides.variantsState) };
  const categoryMetadata = object(overrides.categoryMetadata || draft.categoryMetadata || listing.categoryMetadata);
  const itemSpecifics = cleanAspects(overrides.itemSpecifics || view.itemSpecifics || draft.itemSpecifics);
  return {
    compliance,
    variantsState: variants,
    categoryMetadata: {
      categoryId: text(categoryMetadata.categoryId || view.categoryId, 50),
      categoryName: text(categoryMetadata.categoryName || view.categoryName, 300),
      required: list(categoryMetadata.required).map((entry) => text(entry, 100)).slice(0, 100),
      aspects: Array.isArray(categoryMetadata.aspects) ? categoryMetadata.aspects.slice(0, 200) : [],
      loadedAt: text(categoryMetadata.loadedAt),
    },
    itemSpecifics,
    aiPrepared: draft.aiPrepared === true,
    aiModel: text(draft.aiModel, 100),
  };
}

export function buildAdvancedChecks(product = {}, view = {}, state = {}) {
  const compliance = object(state.compliance);
  const variants = object(state.variantsState);
  const metadata = object(state.categoryMetadata);
  const specifics = cleanAspects(state.itemSpecifics || view.itemSpecifics);
  const required = list(metadata.required);
  const missingRequired = required.filter((name) => !Array.isArray(specifics[name]) || !specifics[name].length);
  const gpsrRequired = compliance.gpsrStatus === "required";
  const gpsrExempt = compliance.gpsrStatus === "exempt";
  const responsibleRequired = gpsrRequired && compliance.responsiblePersonRequired === "yes";
  const variantCount = Array.isArray(variants.variants) ? variants.variants.length : 0;
  return [
    {
      key: "taxonomy",
      label: "eBay-Kategoriemetadaten",
      ok: /^\d+$/.test(text(metadata.categoryId)) && Array.isArray(metadata.aspects) && metadata.aspects.length > 0,
      detail: metadata.aspects?.length ? `${metadata.aspects.length} Merkmale aus eBay Taxonomy geladen` : "Kategorie-Metadaten noch nicht geladen",
      blocking: true,
    },
    {
      key: "required_aspects",
      label: "eBay-Pflichtmerkmale",
      ok: missingRequired.length === 0,
      detail: missingRequired.length ? `Fehlen: ${missingRequired.join(", ")}` : `${required.length} Pflichtmerkmal(e) erfüllt`,
      blocking: true,
    },
    {
      key: "gpsr_status",
      label: "GPSR-Status",
      ok: gpsrRequired || (gpsrExempt && compliance.exemptionConfirmed === true && text(compliance.exemptionReason).length >= 10),
      detail: gpsrRequired ? "GPSR-Angaben erforderlich" : gpsrExempt ? (compliance.exemptionConfirmed ? "Ausnahme dokumentiert" : "Ausnahme noch nicht bestätigt") : "GPSR-Status offen",
      blocking: true,
    },
    {
      key: "manufacturer",
      label: "Herstellerangaben",
      ok: !gpsrRequired || contactComplete(compliance.manufacturer),
      detail: !gpsrRequired ? "Nicht erforderlich laut dokumentiertem Status" : contactComplete(compliance.manufacturer) ? "Hersteller vollständig" : "Name, Anschrift, Land und Kontaktweg fehlen oder sind unvollständig",
      blocking: true,
    },
    {
      key: "responsible_person",
      label: "EU-verantwortliche Person",
      ok: !responsibleRequired || contactComplete(compliance.responsiblePerson),
      detail: responsibleRequired ? (contactComplete(compliance.responsiblePerson) ? "EU-Verantwortliche vollständig" : "EU-Verantwortliche unvollständig") : "Nicht als erforderlich markiert",
      blocking: true,
    },
    {
      key: "safety_notes",
      label: "Sicherheits- und Warnhinweise",
      ok: !gpsrRequired || (Array.isArray(compliance.safetyNotes) && compliance.safetyNotes.length > 0),
      detail: compliance.safetyNotes?.length ? `${compliance.safetyNotes.length} Hinweis(e)` : "Sicherheitshinweise fehlen",
      blocking: true,
    },
    {
      key: "variants",
      label: "Varianten-Zuordnung",
      ok: variantCount === 0 || (variants.confirmed === true && text(variants.variantSummary).length >= 5),
      detail: variantCount === 0 ? "Keine Varianten erkannt" : variants.confirmed ? `${variantCount} Variante(n) bestätigt` : `${variantCount} Variante(n) müssen eindeutig zugeordnet werden`,
      blocking: true,
    },
    {
      key: "ai_review",
      label: "KI-Entwurf",
      ok: state.aiPrepared === true,
      detail: state.aiPrepared ? `KI-Vorbereitung ${text(state.aiModel) || "dokumentiert"}` : "Optional: DeepSeek-Vorschlag noch nicht erzeugt",
      blocking: false,
    },
  ];
}

export function buildParityDraft(product = {}, view = {}, overrides = {}) {
  const baseDraft = buildInternalAutoListerDraft(view, overrides);
  const state = buildAdvancedAutoListerState(product, { ...view, itemSpecifics: baseDraft.itemSpecifics }, overrides);
  const advancedChecks = buildAdvancedChecks(product, { ...view, itemSpecifics: state.itemSpecifics }, state);
  const checks = [...buildAutoListerChecks({ ...view, ...overrides, itemSpecifics: state.itemSpecifics }), ...advancedChecks];
  const readiness = autoListerReadiness(checks);
  return {
    ...baseDraft,
    schemaVersion: "elyon-seller-auto-lister-v2",
    itemSpecifics: state.itemSpecifics,
    compliance: state.compliance,
    variants: state.variantsState.variants,
    variantSummary: state.variantsState.variantSummary,
    variantsConfirmed: state.variantsState.confirmed === true,
    categoryMetadata: { ...state.categoryMetadata, loadedAt: state.categoryMetadata.loadedAt || new Date().toISOString() },
    missingRequiredAspects: advancedChecks.find((check) => check.key === "required_aspects")?.ok ? [] : state.categoryMetadata.required.filter((name) => !state.itemSpecifics[name]?.length),
    aiPrepared: state.aiPrepared,
    aiModel: state.aiModel,
    checks,
    readiness,
    manualApprovalRequired: true,
    automaticPublishingAllowed: false,
    ebayInventoryDraftCreated: false,
    publishEndpointAvailable: false,
    status: readiness.ready ? "ready_for_manual_ebay_draft" : "seller_draft",
  };
}

export function mergeProductWithParityDraft(product = {}, draft = {}) {
  const updated = mergeSellerProductWithDraft(product, draft);
  const server = sellerServerProduct(updated);
  const listing = object(server.listing || updated.listing);
  const nextListing = {
    ...listing,
    compliance: object(draft.compliance || listing.compliance),
    gpsr: {
      ...object(listing.gpsr),
      status: text(draft.compliance?.gpsrStatus),
      manufacturerName: text(draft.compliance?.manufacturer?.companyName),
      manufacturerAddress: [draft.compliance?.manufacturer?.addressLine1, draft.compliance?.manufacturer?.postalCode, draft.compliance?.manufacturer?.city, draft.compliance?.manufacturer?.country].map(text).filter(Boolean).join(", "),
      manufacturerEmail: text(draft.compliance?.manufacturer?.email),
      safetyWarnings: list(draft.compliance?.safetyNotes).join("\n"),
      responsiblePersonRequired: text(draft.compliance?.responsiblePersonRequired),
      responsiblePersonName: text(draft.compliance?.responsiblePerson?.companyName),
      responsiblePersonAddress: [draft.compliance?.responsiblePerson?.addressLine1, draft.compliance?.responsiblePerson?.postalCode, draft.compliance?.responsiblePerson?.city, draft.compliance?.responsiblePerson?.country].map(text).filter(Boolean).join(", "),
      responsiblePersonEmail: text(draft.compliance?.responsiblePerson?.email),
      exemptionReason: text(draft.compliance?.exemptionReason),
      exemptionConfirmed: draft.compliance?.exemptionConfirmed === true,
    },
    variants: Array.isArray(draft.variants) ? draft.variants : listing.variants,
    variantSummary: text(draft.variantSummary || listing.variantSummary),
    variantsConfirmed: draft.variantsConfirmed === true,
    categoryMetadata: object(draft.categoryMetadata || listing.categoryMetadata),
    updatedAt: new Date().toISOString(),
  };
  return {
    ...updated,
    listing: nextListing,
    rawServerProduct: {
      ...server,
      listing: nextListing,
      updatedAt: nextListing.updatedAt,
    },
    updatedAt: nextListing.updatedAt,
  };
}

export { cleanAspects, complianceFrom, variantsFrom, contactComplete };