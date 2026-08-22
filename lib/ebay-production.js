import crypto from "node:crypto";
import { readToken, getTokenStoreDescription } from "./ebay-token-store.js";

export const EBAY_REQUIRED_SCOPES = Object.freeze([
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
]);

const CONDITION_ID_TO_ENUM = Object.freeze({
  "1000": "NEW",
  "1500": "NEW_OTHER",
  "1750": "NEW_WITH_DEFECTS",
  "2000": "CERTIFIED_REFURBISHED",
  "2500": "SELLER_REFURBISHED",
  "2750": "LIKE_NEW",
  "3000": "USED_EXCELLENT",
  "4000": "USED_VERY_GOOD",
  "5000": "USED_GOOD",
  "6000": "USED_ACCEPTABLE",
  "7000": "FOR_PARTS_OR_NOT_WORKING",
});
const EBAY_RESPONSIBLE_PERSON_TYPE = "EU_RESPONSIBLE_PERSON";

function text(value, max = 5000) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  if (Array.isArray(value)) return value.filter((entry) => entry !== null && entry !== undefined);
  if (!text(value)) return [];
  try {
    const parsed = JSON.parse(text(value));
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return text(value).split(/\n|,|\|/).map((entry) => entry.trim()).filter(Boolean);
}

function money(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = text(value).replace(/[^0-9,.-]/g, "");
  if (!raw) return 0;
  const decimal = raw.includes(",") && raw.lastIndexOf(",") > raw.lastIndexOf(".")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/,/g, "");
  const parsed = Number(decimal);
  return Number.isFinite(parsed) ? parsed : 0;
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((entry) => text(entry)).filter(Boolean))];
}

function cleanAspects(value) {
  const source = object(value);
  const output = {};
  for (const [rawName, rawValues] of Object.entries(source)) {
    const name = text(rawName, 65);
    const values = unique(Array.isArray(rawValues) ? rawValues : [rawValues]).map((entry) => text(entry, 65)).slice(0, 30);
    if (name && values.length) output[name] = values;
  }
  return output;
}

function cleanImages(value) {
  return unique(list(value).map((entry) => typeof entry === "string" ? entry : entry?.url))
    .filter((url) => {
      try { return new URL(url).protocol === "https:"; }
      catch { return false; }
    })
    .slice(0, 12);
}

export function normalizeEbayEnvironment(value) {
  return text(value).toLowerCase() === "sandbox" ? "sandbox" : "production";
}

export function ebayApiRoot(environment) {
  return normalizeEbayEnvironment(environment) === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
}

export function ebayAuthRoot(environment) {
  return normalizeEbayEnvironment(environment) === "sandbox" ? "https://auth.sandbox.ebay.com" : "https://auth.ebay.com";
}

export function configuredEbayScopes() {
  const configured = String(process.env.EBAY_SCOPES || "")
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  return [...new Set([...EBAY_REQUIRED_SCOPES, ...configured])];
}

function tokenEndpoint(environment) {
  return `${ebayApiRoot(environment)}/identity/v1/oauth2/token`;
}

export async function refreshEbayAccessToken(environment, refreshToken) {
  const clientId = text(process.env.EBAY_CLIENT_ID);
  const clientSecret = text(process.env.EBAY_CLIENT_SECRET);
  if (!clientId || !clientSecret) throw serviceError(503, "ebay_credentials_missing", "EBAY_CLIENT_ID oder EBAY_CLIENT_SECRET fehlt.");
  if (!text(refreshToken)) throw serviceError(401, "ebay_not_connected", "Bitte zuerst eBay verbinden.");

  const refreshBody = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: text(refreshToken),
  });
  // eBay refresh tokens retain the scopes granted during OAuth. Sending the
  // complete current scope list here can invalidate older tokens when a new
  // scope was added later. An explicit override remains available for a
  // deliberate reauthorization flow.
  const requestedRefreshScopes = text(process.env.EBAY_REFRESH_SCOPES);
  if (requestedRefreshScopes) refreshBody.set("scope", requestedRefreshScopes);
  const response = await fetch(tokenEndpoint(environment), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: refreshBody,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw serviceError(response.status || 500, "ebay_token_refresh_failed", data.error_description || data.error || "eBay Access Token konnte nicht erneuert werden.", data);
  }
  return data;
}

export async function ebayUserSession(environment) {
  const env = normalizeEbayEnvironment(environment || process.env.EBAY_ENV);
  const stored = await readToken(env);
  const refreshToken = stored?.refresh_token || process.env.EBAY_REFRESH_TOKEN;
  const tokenStore = getTokenStoreDescription(env);
  if (!refreshToken) throw serviceError(401, "ebay_not_connected", "Kein persistenter eBay Refresh-Token gefunden.", { tokenStore });
  const refreshed = await refreshEbayAccessToken(env, refreshToken);
  return {
    environment: env,
    accessToken: refreshed.access_token,
    refreshToken,
    scopes: text(refreshed.scope).split(/\s+/).filter(Boolean),
    expiresIn: Number(refreshed.expires_in || 0),
    tokenStore,
  };
}

export function serviceError(status, code, message, details = undefined) {
  const error = new Error(message);
  error.status = Number(status || 500);
  error.code = code;
  error.details = details;
  return error;
}

export async function callEbayJson(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; }
  catch { data = raw ? { raw } : null; }

  if (!response.ok) {
    const first = data?.errors?.[0] || data?.warnings?.[0] || {};
    const message = first.longMessage || first.message || data?.error_description || data?.message || data?.error || `eBay API Fehler HTTP ${response.status}`;
    throw serviceError(response.status, "ebay_api_error", message, data);
  }
  return data || {};
}

function authHeaders(accessToken, extra = {}) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Content-Language": "de-DE",
    "Accept-Language": "de-DE",
    ...extra,
  };
}

function policyChoice(items, idField, preferredId, preferredName) {
  const values = Array.isArray(items) ? items : [];
  const byId = values.find((item) => text(item?.[idField]) === text(preferredId));
  if (byId) return byId;
  const byName = values.find((item) => text(item?.name).toLowerCase() === text(preferredName).toLowerCase());
  return byName || values[0] || null;
}

export async function loadEbaySellerSetup(environment, overrides = {}) {
  const session = await ebayUserSession(environment);
  const root = ebayApiRoot(session.environment);
  const marketplaceId = text(overrides.marketplaceId || process.env.EBAY_MARKETPLACE_ID || "EBAY_DE", 30);
  const marketplaceQuery = `marketplace_id=${encodeURIComponent(marketplaceId)}`;
  const headers = authHeaders(session.accessToken);

  const [fulfillmentData, paymentData, returnData, locationData] = await Promise.all([
    callEbayJson(`${root}/sell/account/v1/fulfillment_policy?${marketplaceQuery}`, { headers }),
    callEbayJson(`${root}/sell/account/v1/payment_policy?${marketplaceQuery}`, { headers }),
    callEbayJson(`${root}/sell/account/v1/return_policy?${marketplaceQuery}`, { headers }),
    callEbayJson(`${root}/sell/inventory/v1/location?limit=200`, { headers }),
  ]);

  const fulfillmentPolicies = fulfillmentData.fulfillmentPolicies || [];
  const paymentPolicies = paymentData.paymentPolicies || [];
  const returnPolicies = returnData.returnPolicies || [];
  const locations = (locationData.locations || []).filter((location) => text(location?.merchantLocationStatus || "ENABLED") !== "DISABLED");

  const selected = {
    fulfillmentPolicy: policyChoice(fulfillmentPolicies, "fulfillmentPolicyId", overrides.fulfillmentPolicyId || process.env.EBAY_FULFILLMENT_POLICY_ID, overrides.fulfillmentPolicyName || process.env.EBAY_FULFILLMENT_POLICY_NAME),
    paymentPolicy: policyChoice(paymentPolicies, "paymentPolicyId", overrides.paymentPolicyId || process.env.EBAY_PAYMENT_POLICY_ID, overrides.paymentPolicyName || process.env.EBAY_PAYMENT_POLICY_NAME),
    returnPolicy: policyChoice(returnPolicies, "returnPolicyId", overrides.returnPolicyId || process.env.EBAY_RETURN_POLICY_ID, overrides.returnPolicyName || process.env.EBAY_RETURN_POLICY_NAME),
    location: locations.find((location) => text(location?.merchantLocationKey) === text(overrides.merchantLocationKey || process.env.EBAY_MERCHANT_LOCATION_KEY || process.env.EBAY_LOCATION_KEY)) || locations[0] || null,
  };

  const blockers = [];
  if (!selected.fulfillmentPolicy) blockers.push("Keine eBay-Versandrichtlinie für EBAY_DE gefunden.");
  if (!selected.paymentPolicy) blockers.push("Keine eBay-Zahlungsrichtlinie für EBAY_DE gefunden.");
  if (!selected.returnPolicy) blockers.push("Keine eBay-Rücknahmerichtlinie für EBAY_DE gefunden.");
  if (!selected.location) blockers.push("Kein aktivierter eBay-Inventory-Lagerstandort gefunden.");

  return {
    environment: session.environment,
    marketplaceId,
    connected: true,
    tokenStore: session.tokenStore,
    scopes: session.scopes,
    scopesComplete: EBAY_REQUIRED_SCOPES.every((scope) => session.scopes.includes(scope)),
    fulfillmentPolicies,
    paymentPolicies,
    returnPolicies,
    locations,
    selected,
    blockers,
    ready: blockers.length === 0,
  };
}

function normalizedContact(value, responsible = false) {
  const source = object(value);
  const contact = {
    companyName: text(source.companyName || source.name, 100),
    addressLine1: text(source.addressLine1 || source.street1 || source.address, 180),
    addressLine2: text(source.addressLine2 || source.street2, 180),
    city: text(source.city || source.cityName, 64),
    stateOrProvince: text(source.stateOrProvince || source.state, 64),
    postalCode: text(source.postalCode || source.zip, 9),
    country: text(source.country, 2).toUpperCase(),
    email: text(source.email, 180),
    phone: text(source.phone, 64),
    contactUrl: text(source.contactUrl || source.url, 250),
  };
  const populated = Object.fromEntries(
    Object.entries(contact).filter(([, entry]) => Array.isArray(entry) ? entry.length : Boolean(entry)),
  );
  if (responsible && Object.keys(populated).length) {
    populated.types = [EBAY_RESPONSIBLE_PERSON_TYPE];
  }
  return populated;
}

function contactComplete(value) {
  const contact = normalizedContact(value);
  return Boolean(
    contact.companyName && contact.addressLine1 && contact.city && contact.postalCode && /^[A-Z]{2}$/.test(contact.country) &&
    (contact.email || contact.phone || contact.contactUrl)
  );
}

function productSafetyFrom(source) {
  const statements = unique(source.productSafetyStatements || source.safetyStatementIds || source.statements)
    .filter((entry) => /^EBPSS\d+$/i.test(entry)).slice(0, 8);
  const pictograms = unique(source.productSafetyPictograms || source.safetyPictogramIds || source.pictograms)
    .filter((entry) => /^EBPSP\d+$/i.test(entry)).slice(0, 2);
  const component = text(source.productSafetyComponent || source.safetyComponent, 500);
  if (!statements.length && !pictograms.length) return null;
  return { statements, pictograms, ...(component ? { component } : {}) };
}

function extractListing(body) {
  const source = object(body);
  const product = object(source.product || source.item || source.data || source);
  const listing = object(product.listing || source.listing);
  const draft = object(listing.autoListerDraft || product.autoListerDraft || source.autoListerDraft || source.draft);
  const pricing = object(product.pricing || source.pricing);
  const compliance = object(draft.compliance || listing.compliance || product.compliance || source.compliance);
  const gpsr = object(listing.gpsr || product.gpsr || source.gpsr);
  const itemSpecifics = cleanAspects(draft.itemSpecifics || listing.itemSpecifics || product.itemSpecifics || source.itemSpecifics);
  const manufacturer = normalizedContact(compliance.manufacturer || product.manufacturer || source.manufacturer || {
    companyName: gpsr.manufacturerName || product.manufacturerName,
    addressLine1: gpsr.manufacturerAddress || product.manufacturerAddress,
    city: gpsr.manufacturerCity || product.manufacturerCity,
    postalCode: gpsr.manufacturerPostalCode || product.manufacturerPostalCode,
    country: gpsr.manufacturerCountry || product.manufacturerCountry,
    email: gpsr.manufacturerEmail || product.manufacturerEmail,
    phone: gpsr.manufacturerPhone || product.manufacturerPhone,
    contactUrl: gpsr.manufacturerContactUrl || product.manufacturerContactUrl,
  });
  const responsiblePerson = normalizedContact(compliance.responsiblePerson || product.responsiblePerson || source.responsiblePerson || {
    companyName: gpsr.responsiblePersonName || product.responsiblePersonName,
    addressLine1: gpsr.responsiblePersonAddress || product.responsiblePersonAddress,
    city: gpsr.responsiblePersonCity || product.responsiblePersonCity,
    postalCode: gpsr.responsiblePersonPostalCode || product.responsiblePersonPostalCode,
    country: gpsr.responsiblePersonCountry || product.responsiblePersonCountry,
    email: gpsr.responsiblePersonEmail || product.responsiblePersonEmail,
    phone: gpsr.responsiblePersonPhone || product.responsiblePersonPhone,
    contactUrl: gpsr.responsiblePersonContactUrl || product.responsiblePersonContactUrl,
  }, true);

  return {
    sourceProductId: text(source.sourceProductId || product.id || product.companyOsProductId || product.sellerToolMasterProductId || draft.sourceProductId || product.supplier?.url, 160),
    title: text(draft.title || listing.title || product.listingTitle || product.title || source.title, 80),
    description: text(draft.descriptionHtml || listing.descriptionHtml || listing.description || product.listingDescription || product.description || source.description, 60000),
    categoryId: text(draft.categoryId || listing.categoryId || product.categoryId || source.categoryId, 32),
    conditionId: text(draft.conditionId || listing.conditionId || product.conditionId || source.conditionId, 20),
    conditionEnum: text(draft.conditionEnum || listing.conditionEnum || product.conditionEnum || source.conditionEnum, 50).toUpperCase(),
    conditionDescription: text(draft.conditionDescription || listing.conditionDescription || product.conditionDescription || source.conditionDescription, 1000),
    itemSpecifics,
    images: cleanImages(draft.images || listing.images || product.images || source.images),
    price: money(draft.price ?? pricing.salePrice ?? product.salePrice ?? product.sellPrice ?? source.price ?? source.sellPrice),
    currency: text(draft.currency || pricing.currency || product.currency || source.currency || process.env.EBAY_CURRENCY || "EUR", 3).toUpperCase(),
    quantity: Math.max(1, Math.min(999, Math.floor(Number(draft.quantity || listing.quantity || product.quantity || source.quantity || 1) || 1))),
    merchantLocationKey: text(source.merchantLocationKey || draft.merchantLocationKey || listing.merchantLocationKey, 64),
    fulfillmentPolicyId: text(source.fulfillmentPolicyId || draft.fulfillmentPolicyId || draft.shippingProfile || listing.fulfillmentPolicyId || listing.shippingProfile, 64),
    paymentPolicyId: text(source.paymentPolicyId || draft.paymentPolicyId || draft.paymentProfile || listing.paymentPolicyId || listing.paymentProfile, 64),
    returnPolicyId: text(source.returnPolicyId || draft.returnPolicyId || draft.returnProfile || listing.returnPolicyId || listing.returnProfile, 64),
    listingDuration: text(source.listingDuration || draft.listingDuration || listing.listingDuration || "GTC", 20).toUpperCase(),
    sku: text(source.sku || draft.sku || listing.sku || product.sku, 50),
    offerId: text(source.offerId || draft.offerId || listing.offerId || product.offerId, 64),
    gpsrStatus: text(compliance.gpsrStatus || gpsr.status, 30).toLowerCase(),
    responsiblePersonRequired: text(compliance.responsiblePersonRequired || gpsr.responsiblePersonRequired, 10).toLowerCase(),
    manufacturer,
    responsiblePerson,
    productSafety: productSafetyFrom({ ...gpsr, ...compliance, ...draft, ...source }),
  };
}

export function deterministicEbaySku(listing) {
  if (text(listing?.sku)) return text(listing.sku, 50);
  const identity = text(listing?.sourceProductId || listing?.title || "elyon-product", 500);
  const hash = crypto.createHash("sha256").update(identity).digest("hex").slice(0, 16).toUpperCase();
  const slug = text(listing?.title || "ITEM", 24).normalize("NFKD").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toUpperCase().slice(0, 22) || "ITEM";
  return `ELYON-${hash}-${slug}`.slice(0, 50);
}

function conditionEnum(listing) {
  if (listing.conditionEnum) return listing.conditionEnum;
  return CONDITION_ID_TO_ENUM[listing.conditionId] || "";
}

function regulatoryPayload(listing) {
  const regulatory = {};
  if (Object.keys(listing.manufacturer).length) regulatory.manufacturer = listing.manufacturer;
  if (Object.keys(listing.responsiblePerson).length) regulatory.responsiblePersons = [listing.responsiblePerson];
  if (listing.productSafety) regulatory.productSafety = listing.productSafety;
  return Object.keys(regulatory).length ? regulatory : null;
}

export function buildEbayPayloads(input, setup = {}) {
  const listing = extractListing(input);
  const selected = object(setup.selected);
  listing.sku = deterministicEbaySku(listing);
  listing.merchantLocationKey ||= text(selected.location?.merchantLocationKey || process.env.EBAY_MERCHANT_LOCATION_KEY || process.env.EBAY_LOCATION_KEY, 64);
  listing.fulfillmentPolicyId ||= text(selected.fulfillmentPolicy?.fulfillmentPolicyId || process.env.EBAY_FULFILLMENT_POLICY_ID, 64);
  listing.paymentPolicyId ||= text(selected.paymentPolicy?.paymentPolicyId || process.env.EBAY_PAYMENT_POLICY_ID, 64);
  listing.returnPolicyId ||= text(selected.returnPolicy?.returnPolicyId || process.env.EBAY_RETURN_POLICY_ID, 64);

  const blockers = [];
  if (listing.title.length < 5) blockers.push("eBay-Titel fehlt oder ist zu kurz.");
  if (!listing.description) blockers.push("eBay-Beschreibung fehlt.");
  if (!/^\d{2,12}$/.test(listing.categoryId)) blockers.push("Gültige numerische eBay-Kategorie-ID fehlt.");
  if (!conditionEnum(listing)) blockers.push("Gültiger Artikelzustand fehlt.");
  if (listing.price <= 0) blockers.push("Verkaufspreis fehlt.");
  if (!listing.images.length) blockers.push("Mindestens ein HTTPS-Produktbild fehlt.");
  if (!Object.keys(listing.itemSpecifics).length) blockers.push("eBay-Artikelmerkmale fehlen.");
  if (!listing.merchantLocationKey) blockers.push("eBay-Inventory-Lagerstandort fehlt.");
  if (!listing.fulfillmentPolicyId) blockers.push("eBay-Versandrichtlinie fehlt.");
  if (!listing.paymentPolicyId) blockers.push("eBay-Zahlungsrichtlinie fehlt.");
  if (!listing.returnPolicyId) blockers.push("eBay-Rücknahmerichtlinie fehlt.");
  if (!listing.listingDuration) blockers.push("eBay-Angebotsdauer fehlt.");

  const inventoryPayload = {
    availability: { shipToLocationAvailability: { quantity: listing.quantity } },
    condition: conditionEnum(listing),
    product: {
      title: listing.title,
      description: listing.description,
      aspects: listing.itemSpecifics,
      imageUrls: listing.images,
    },
  };
  if (listing.conditionDescription) inventoryPayload.conditionDescription = listing.conditionDescription;

  const offerPayload = {
    sku: listing.sku,
    marketplaceId: text(setup.marketplaceId || process.env.EBAY_MARKETPLACE_ID || "EBAY_DE", 30),
    format: "FIXED_PRICE",
    availableQuantity: listing.quantity,
    categoryId: listing.categoryId,
    listingDescription: listing.description,
    listingDuration: listing.listingDuration,
    merchantLocationKey: listing.merchantLocationKey,
    pricingSummary: { price: { value: listing.price.toFixed(2), currency: listing.currency } },
    listingPolicies: {
      fulfillmentPolicyId: listing.fulfillmentPolicyId,
      paymentPolicyId: listing.paymentPolicyId,
      returnPolicyId: listing.returnPolicyId,
    },
  };
  const regulatory = regulatoryPayload(listing);
  if (regulatory) offerPayload.regulatory = regulatory;

  return { listing, blockers, inventoryPayload, offerPayload };
}

export async function loadRegulatoryRequirements(environment, accessToken, marketplaceId, categoryId) {
  if (!/^\d{2,12}$/.test(text(categoryId))) return { loaded: false, required: [], recommended: [], supported: [], raw: null };
  const root = ebayApiRoot(environment);
  const filter = encodeURIComponent(`categoryIds:{${categoryId}}`);
  try {
    const data = await callEbayJson(`${root}/sell/metadata/v1/marketplace/${encodeURIComponent(marketplaceId)}/get_regulatory_policies?filter=${filter}`, {
      headers: authHeaders(accessToken),
    });
    const policies = data.regulatoryPolicies || data.categoryPolicies || [];
    const attributes = policies.flatMap((policy) => policy.supportedAttributes || policy.regulatoryAttributes || []);
    const required = unique(attributes.filter((attribute) => text(attribute.usage).toUpperCase() === "REQUIRED").map((attribute) => attribute.name));
    const recommended = unique(attributes.filter((attribute) => text(attribute.usage).toUpperCase() === "RECOMMENDED").map((attribute) => attribute.name));
    const supported = unique(attributes.map((attribute) => attribute.name));
    return { loaded: true, required, recommended, supported, raw: data };
  } catch (error) {
    return { loaded: false, required: [], recommended: [], supported: [], error: error.message, raw: error.details || null };
  }
}

function regulatoryBlockers(listing, requirements) {
  const required = new Set((requirements.required || []).map((name) => text(name).toLowerCase()));
  const blockers = [];
  const requiresManufacturer = [...required].some((name) => name.includes("manufacturer") || name.includes("economicoperator"));
  const requiresResponsible = [...required].some((name) => name.includes("responsible"));
  const requiresProductSafety = [...required].some((name) => name.includes("productsafety") || name.includes("product_safety"));
  if (requiresManufacturer && !contactComplete(listing.manufacturer)) blockers.push("Für diese Kategorie sind vollständige Herstellerangaben erforderlich.");
  if (requiresResponsible && !contactComplete(listing.responsiblePerson)) blockers.push("Für diese Kategorie ist eine vollständige EU-verantwortliche Person erforderlich.");
  if (requiresProductSafety && !listing.productSafety) blockers.push("Für diese Kategorie müssen gültige eBay-Produktsicherheitscodes ausgewählt werden.");
  return blockers;
}

export async function createOrUpdateEbayDraft(input, environment) {
  const setup = await loadEbaySellerSetup(environment, input);
  const session = await ebayUserSession(setup.environment);
  const built = buildEbayPayloads(input, setup);
  const requirements = await loadRegulatoryRequirements(session.environment, session.accessToken, setup.marketplaceId, built.listing.categoryId);
  const blockers = [...setup.blockers, ...built.blockers, ...regulatoryBlockers(built.listing, requirements)];
  if (blockers.length) throw serviceError(400, "ebay_listing_not_ready", "Das Produkt ist noch nicht bereit für einen eBay-Entwurf.", { blockers, requirements });

  const root = ebayApiRoot(session.environment);
  await callEbayJson(`${root}/sell/inventory/v1/inventory_item/${encodeURIComponent(built.listing.sku)}`, {
    method: "PUT",
    headers: authHeaders(session.accessToken),
    body: JSON.stringify(built.inventoryPayload),
  });

  let offer;
  let offerId = built.listing.offerId;
  if (offerId) {
    offer = await callEbayJson(`${root}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`, {
      method: "PUT",
      headers: authHeaders(session.accessToken),
      body: JSON.stringify(built.offerPayload),
    });
  } else {
    offer = await callEbayJson(`${root}/sell/inventory/v1/offer`, {
      method: "POST",
      headers: authHeaders(session.accessToken),
      body: JSON.stringify(built.offerPayload),
    });
    offerId = text(offer.offerId || offer.offer?.offerId, 64);
  }
  if (!offerId) throw serviceError(502, "ebay_offer_id_missing", "eBay hat keinen Offer-Identifier zurückgegeben.", offer);

  const verifiedOffer = await callEbayJson(`${root}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`, {
    headers: authHeaders(session.accessToken),
  });

  return {
    ok: true,
    draftCreated: true,
    published: false,
    environment: session.environment,
    marketplaceId: setup.marketplaceId,
    sku: built.listing.sku,
    offerId,
    setup,
    requirements,
    offer: verifiedOffer,
    publishReady: true,
    message: "eBay-Inventory-Entwurf wurde erstellt und zurückgelesen. Noch nicht veröffentlicht.",
  };
}

export async function publishEbayOffer(input, environment) {
  const confirmation = text(input?.confirmation);
  if (confirmation !== "PUBLISH_EBAY_OFFER") {
    throw serviceError(400, "publish_confirmation_required", "Die ausdrückliche Veröffentlichungsbestätigung fehlt.");
  }
  const setup = await loadEbaySellerSetup(environment, input);
  const session = await ebayUserSession(setup.environment);
  const built = buildEbayPayloads(input, setup);
  const requirements = await loadRegulatoryRequirements(session.environment, session.accessToken, setup.marketplaceId, built.listing.categoryId);
  const blockers = [...setup.blockers, ...built.blockers, ...regulatoryBlockers(built.listing, requirements)];
  const offerId = text(input?.offerId || built.listing.offerId, 64);
  if (!offerId) blockers.push("eBay-Offer-ID fehlt. Erstelle zuerst einen Entwurf.");
  if (!requirements.loaded) blockers.push("eBay-Regulierungsanforderungen konnten nicht verlässlich geladen werden.");
  if (blockers.length) throw serviceError(400, "ebay_publish_blocked", "Das eBay-Angebot darf noch nicht veröffentlicht werden.", { blockers, requirements });

  const root = ebayApiRoot(session.environment);
  await callEbayJson(`${root}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`, {
    method: "PUT",
    headers: authHeaders(session.accessToken),
    body: JSON.stringify(built.offerPayload),
  });
  const result = await callEbayJson(`${root}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`, {
    method: "POST",
    headers: authHeaders(session.accessToken),
  });
  const listingId = text(result.listingId || result.listing?.listingId, 64);
  if (!listingId) throw serviceError(502, "ebay_listing_id_missing", "eBay hat nach der Veröffentlichung keine Listing-ID zurückgegeben.", result);
  return {
    ok: true,
    published: true,
    environment: session.environment,
    marketplaceId: setup.marketplaceId,
    offerId,
    sku: built.listing.sku,
    listingId,
    result,
    message: "Das eBay-Angebot wurde erfolgreich veröffentlicht.",
  };
}

export async function withdrawEbayOffer(input, environment) {
  const offerId = text(input?.offerId, 64);
  const confirmation = text(input?.confirmation);
  if (!offerId) throw serviceError(400, "offer_id_missing", "eBay-Offer-ID fehlt.");
  if (confirmation !== "WITHDRAW_EBAY_OFFER") throw serviceError(400, "withdraw_confirmation_required", "Die ausdrückliche Rücknahmebestätigung fehlt.");
  const session = await ebayUserSession(environment);
  const root = ebayApiRoot(session.environment);
  const result = await callEbayJson(`${root}/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/withdraw`, {
    method: "POST",
    headers: authHeaders(session.accessToken),
  });
  return { ok: true, withdrawn: true, offerId, result, message: "Das eBay-Angebot wurde zurückgenommen." };
}

export function publicEbayError(error) {
  return {
    ok: false,
    error: error?.code || "ebay_error",
    message: error?.message || "Unbekannter eBay-Fehler.",
    details: error?.details,
  };
}
