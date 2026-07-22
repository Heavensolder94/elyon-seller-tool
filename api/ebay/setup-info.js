import { readToken } from "../../lib/ebay-token-store.js";

function normalizeEnvironment(value) {
  return String(value || process.env.EBAY_ENV || "production").toLowerCase() === "sandbox" ? "sandbox" : "production";
}

function getApiRoot(environment) {
  return environment === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
}

function getScopes() {
  const required = [
    "https://api.ebay.com/oauth/api_scope",
    "https://api.ebay.com/oauth/api_scope/sell.inventory",
    "https://api.ebay.com/oauth/api_scope/sell.account",
  ];
  const configured = String(process.env.EBAY_SCOPES || "")
    .split(/[\s,]+/)
    .map(scope => scope.trim())
    .filter(Boolean);
  return [...new Set([...required, ...configured])];
}

async function getAccessToken(environment, refreshToken) {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("EBAY_CLIENT_ID oder EBAY_CLIENT_SECRET fehlt.");
  if (!refreshToken) throw new Error("Bitte zuerst eBay verbinden.");

  const response = await fetch(`${getApiRoot(environment)}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: getScopes().join(" "),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.error_description || data.error || "eBay Access Token konnte nicht erneuert werden.";
    const error = new Error(detail);
    error.status = response.status;
    throw error;
  }
  return data.access_token;
}

async function ebayGet(url, accessToken) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Accept-Language": "de-DE",
      "Content-Language": "de-DE",
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.errors?.[0]?.message || data?.error_description || data?.message || data?.error || `eBay API Fehler HTTP ${response.status}`;
    const error = new Error(detail);
    error.status = response.status;
    error.ebayResponse = data;
    throw error;
  }
  return data;
}

function compactPolicies(items, idField) {
  return (Array.isArray(items) ? items : []).map(item => ({
    id: item?.[idField] || "",
    name: item?.name || "",
    marketplaceId: item?.marketplaceId || "",
    categoryTypes: Array.isArray(item?.categoryTypes) ? item.categoryTypes.map(entry => entry?.name).filter(Boolean) : [],
  })).filter(item => item.id);
}

function compactLocations(items) {
  return (Array.isArray(items) ? items : []).map(item => ({
    merchantLocationKey: item?.merchantLocationKey || "",
    name: item?.name || "",
    status: item?.merchantLocationStatus || "",
    locationTypes: item?.locationTypes || [],
    country: item?.location?.address?.country || "",
    postalCode: item?.location?.address?.postalCode || "",
    city: item?.location?.address?.city || "",
  })).filter(item => item.merchantLocationKey);
}

function chooseSingle(items, configuredValue, key) {
  if (configuredValue) {
    const configured = items.find(item => String(item[key]) === String(configuredValue));
    return configured || { [key]: configuredValue, configured: true, found: false };
  }
  const eligible = items.filter(item => !item.categoryTypes || item.categoryTypes.length === 0 || item.categoryTypes.includes("ALL_EXCLUDING_MOTORS_VEHICLES"));
  if (eligible.length === 1) return { ...eligible[0], autoSelected: true };
  if (items.length === 1) return { ...items[0], autoSelected: true };
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Nur GET erlaubt." });

  try {
    const environment = normalizeEnvironment(req.query.environment || req.query.env);
    const marketplaceId = process.env.EBAY_MARKETPLACE_ID || "EBAY_DE";
    const stored = await readToken(environment);
    const refreshToken = stored?.refresh_token || process.env.EBAY_REFRESH_TOKEN;
    if (!refreshToken) {
      return res.status(401).json({ ok: false, connected: false, error: "Bitte zuerst eBay verbinden." });
    }

    const accessToken = await getAccessToken(environment, refreshToken);
    const root = getApiRoot(environment);
    const query = `marketplace_id=${encodeURIComponent(marketplaceId)}`;

    const [fulfillmentRaw, paymentRaw, returnRaw, locationsRaw] = await Promise.all([
      ebayGet(`${root}/sell/account/v1/fulfillment_policy?${query}`, accessToken),
      ebayGet(`${root}/sell/account/v1/payment_policy?${query}`, accessToken),
      ebayGet(`${root}/sell/account/v1/return_policy?${query}`, accessToken),
      ebayGet(`${root}/sell/inventory/v1/location?limit=100`, accessToken),
    ]);

    const fulfillmentPolicies = compactPolicies(fulfillmentRaw.fulfillmentPolicies, "fulfillmentPolicyId");
    const paymentPolicies = compactPolicies(paymentRaw.paymentPolicies, "paymentPolicyId");
    const returnPolicies = compactPolicies(returnRaw.returnPolicies, "returnPolicyId");
    const locations = compactLocations(locationsRaw.locations);

    const selected = {
      fulfillmentPolicy: chooseSingle(fulfillmentPolicies, process.env.EBAY_FULFILLMENT_POLICY_ID, "id"),
      paymentPolicy: chooseSingle(paymentPolicies, process.env.EBAY_PAYMENT_POLICY_ID, "id"),
      returnPolicy: chooseSingle(returnPolicies, process.env.EBAY_RETURN_POLICY_ID, "id"),
      location: chooseSingle(locations, process.env.EBAY_MERCHANT_LOCATION_KEY || process.env.EBAY_LOCATION_KEY, "merchantLocationKey"),
    };

    const missing = [];
    if (!fulfillmentPolicies.length) missing.push("Versandrichtlinie");
    if (!paymentPolicies.length) missing.push("Zahlungsrichtlinie");
    if (!returnPolicies.length) missing.push("Rücknahmerichtlinie");
    if (!locations.length) missing.push("Inventory-Standort");

    const ambiguous = [];
    if (fulfillmentPolicies.length > 1 && !selected.fulfillmentPolicy) ambiguous.push("Versandrichtlinie");
    if (paymentPolicies.length > 1 && !selected.paymentPolicy) ambiguous.push("Zahlungsrichtlinie");
    if (returnPolicies.length > 1 && !selected.returnPolicy) ambiguous.push("Rücknahmerichtlinie");
    if (locations.length > 1 && !selected.location) ambiguous.push("Inventory-Standort");

    return res.status(200).json({
      ok: true,
      connected: true,
      published: false,
      marketplaceId,
      scopesRequired: ["sell.inventory", "sell.account"],
      selected,
      missing,
      ambiguous,
      readyForDraft: missing.length === 0 && ambiguous.length === 0,
      fulfillmentPolicies,
      paymentPolicies,
      returnPolicies,
      locations,
      message: missing.length
        ? "eBay-Grundeinrichtung ist noch unvollständig."
        : ambiguous.length
          ? "Mehrere passende eBay-Einstellungen gefunden. Bitte Auswahl festlegen."
          : "eBay-Grundeinrichtung ist für unveröffentlichte Entwürfe bereit.",
    });
  } catch (error) {
    const needsReconnect = /scope|permission|authorization|access denied|insufficient/i.test(String(error.message || ""));
    return res.status(error.status === 401 ? 401 : 500).json({
      ok: false,
      connected: !needsReconnect,
      published: false,
      needsReconnect,
      error: needsReconnect
        ? "eBay muss mit den Berechtigungen sell.inventory und sell.account neu verbunden werden."
        : error.message || "eBay-Einrichtung konnte nicht geprüft werden.",
    });
  }
}
