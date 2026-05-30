function boolEnv(name) {
  return Boolean(process.env[name]);
}

function splitScopes(raw) {
  return String(raw || "")
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function hasFulfillmentScope(scopes) {
  return scopes.some((scope) => /sell\.fulfillment/i.test(scope));
}

function requiredFlags(names) {
  return names.reduce((acc, name) => {
    acc[name] = boolEnv(name);
    return acc;
  }, {});
}

function missingFrom(flags) {
  return Object.entries(flags)
    .filter(([, value]) => !value)
    .map(([name]) => name);
}

function buildEbayLoginUrl() {
  const clientId = process.env.EBAY_CLIENT_ID || "";
  const redirectUri = process.env.EBAY_REDIRECT_URI || process.env.EBAY_RUNAME || "";
  if (!clientId || !redirectUri) return null;

  const environment = String(process.env.EBAY_ENV || "production").toLowerCase() === "sandbox" ? "sandbox" : "production";
  const base = environment === "sandbox" ? "https://auth.sandbox.ebay.com/oauth2/authorize" : "https://auth.ebay.com/oauth2/authorize";
  const scopes = splitScopes(process.env.EBAY_SCOPES || "https://api.ebay.com/oauth/api_scope");
  const url = new URL(base);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("locale", "de-DE");
  url.searchParams.set("prompt", "login");
  return url.toString();
}

function providerStatus({ provider, configured, connected, status, message, requiredEnvVars = [], supportedActions = [], lockedActions = [], nextStep = null, reconnectUrl = null }) {
  return {
    provider,
    configured,
    connected,
    lastCheckAt: new Date().toISOString(),
    status,
    message,
    requiredEnvVars,
    supportedActions,
    lockedActions,
    nextStep,
    reconnect_url: reconnectUrl,
  };
}

function ebayStatus() {
  const required = requiredFlags(["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"]);
  required.EBAY_REDIRECT_URI_OR_RUNAME = Boolean(process.env.EBAY_REDIRECT_URI || process.env.EBAY_RUNAME);
  const scopes = splitScopes(process.env.EBAY_SCOPES || "https://api.ebay.com/oauth/api_scope");
  const refreshConfigured = Boolean(process.env.EBAY_REFRESH_TOKEN);
  const missing = missingFrom(required);

  if (missing.length) {
    return providerStatus({
      provider: "ebay",
      configured: false,
      connected: false,
      status: "missing_config",
      message: `eBay Konfiguration unvollständig: ${missing.join(", ")}`,
      requiredEnvVars: Object.keys(required).concat(["EBAY_SCOPES", "EBAY_REFRESH_TOKEN"]),
      supportedActions: ["login_url", "token_exchange", "search", "manual_listing_prepare"],
      lockedActions: ["autonomous_posting", "automatic_order_fulfillment"],
      nextStep: "eBay Client-ID, Secret und Redirect-URI/RuName in Vercel setzen.",
    });
  }

  if (!hasFulfillmentScope(scopes)) {
    return providerStatus({
      provider: "ebay",
      configured: true,
      connected: refreshConfigured,
      status: "needs_reauth",
      message: "orders_scope_reauth_required: eBay muss neu mit Fulfillment-/Orders-Scope verbunden werden.",
      requiredEnvVars: Object.keys(required).concat(["EBAY_SCOPES", "EBAY_REFRESH_TOKEN"]),
      supportedActions: ["login_url", "token_exchange", "search", "orders_after_reauth"],
      lockedActions: ["autonomous_posting", "automatic_order_fulfillment"],
      nextStep: "EBAY_SCOPES um https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly erweitern, redeployen und eBay neu verbinden.",
      reconnectUrl: buildEbayLoginUrl(),
    });
  }

  return providerStatus({
    provider: "ebay",
    configured: true,
    connected: refreshConfigured,
    status: refreshConfigured ? "connected" : "configured_not_connected",
    message: refreshConfigured ? "eBay ist konfiguriert. Orders sind nach gültigem Refresh Token abrufbar." : "eBay ist vorbereitet, aber es fehlt noch ein Refresh Token.",
    requiredEnvVars: Object.keys(required).concat(["EBAY_SCOPES", "EBAY_REFRESH_TOKEN"]),
    supportedActions: ["login_url", "token_exchange", "search", "orders", "manual_listing_prepare"],
    lockedActions: ["autonomous_posting", "automatic_order_fulfillment"],
    nextStep: refreshConfigured ? "Orders-Endpunkt testen und danach erstes Produkt manuell vorbereiten." : "eBay Login-URL öffnen und neuen Token-Exchange durchführen.",
    reconnectUrl: buildEbayLoginUrl(),
  });
}

function cjStatus() {
  const configured = Boolean(process.env.CJ_ACCESS_TOKEN || process.env.CJ_API_KEY);
  return providerStatus({
    provider: "cj",
    configured,
    connected: configured,
    status: configured ? "configured_not_tested" : "missing_config",
    message: configured ? "CJ ist konfiguriert. Produktsuche kann über /api/cj/search getestet werden." : "CJ_ACCESS_TOKEN oder CJ_API_KEY fehlt.",
    requiredEnvVars: ["CJ_ACCESS_TOKEN", "CJ_API_KEY"],
    supportedActions: ["product_search", "manual_product_import", "supplier_reference"],
    lockedActions: ["automatic_order_fulfillment"],
    nextStep: configured ? "CJ Produktsuche mit einem Keyword testen." : "CJ API-Key in Vercel setzen und neu deployen.",
  });
}

function aliexpressStatus() {
  return providerStatus({
    provider: "aliexpress",
    configured: true,
    connected: false,
    status: "manual_only",
    message: "AliExpress läuft vorerst über Browser Extension, markierten Text und manuellen Produktimport.",
    requiredEnvVars: [],
    supportedActions: ["extension_import", "selected_text_import", "manual_supplier_link"],
    lockedActions: ["unofficial_api_automation", "automatic_order_fulfillment"],
    nextStep: "Produktseite öffnen, Daten mit der Extension übernehmen und in Elyon prüfen.",
  });
}

function amazonStatus() {
  return providerStatus({
    provider: "amazon",
    configured: false,
    connected: false,
    status: "optional_prepared",
    message: "Amazon ist nur als manuelle Notfall-/Vergleichsquelle vorbereitet. Keine automatische Bestellung aktiv.",
    requiredEnvVars: [],
    supportedActions: ["manual_price_reference", "manual_supplier_note"],
    lockedActions: ["amazon_auto_order", "amazon_sp_api_required"],
    nextStep: "Amazon vorerst nicht automatisieren; nur als Risiko-/Preisvergleich nutzen.",
  });
}

function checklistItem(id, label, state, message) {
  return { id, label, state, passed: state === "passed", message };
}

function buildReadiness(providers) {
  const ebay = providers.ebay;
  const cj = providers.cj;
  const items = [
    checklistItem("ebay_config", "eBay OAuth Grunddaten", ebay.configured ? "passed" : "error", ebay.configured ? "Client-ID, Secret und Redirect sind vorhanden." : ebay.nextStep),
    checklistItem("ebay_orders_scope", "eBay Orders/Fulfillment Scope", ebay.status !== "needs_reauth" && ebay.configured ? "passed" : "error", ebay.status === "needs_reauth" ? ebay.message : "Orders-Scope wirkt vorbereitet."),
    checklistItem("ebay_manual_publish", "Manuelle eBay-Freigabe", "passed", "Autonomes Posting bleibt gesperrt; manuelle Bestätigung bleibt Pflicht."),
    checklistItem("cj_config", "CJ API Konfiguration", cj.configured ? "passed" : "error", cj.configured ? "CJ kann getestet werden." : cj.nextStep),
    checklistItem("aliexpress_manual", "AliExpress Extension/Manuell", "warning", "Import vorbereitet, aber bewusst nicht vollautomatisch."),
    checklistItem("amazon_manual", "Amazon nur optional", "warning", "Amazon bleibt manuelle Vergleichs-/Notfallquelle."),
    checklistItem("safety_manual_orders", "Keine automatische Bestellung", "passed", "Bestellungen werden nicht automatisch bei Lieferanten ausgelöst."),
  ];

  const score = Math.max(0, Math.round((items.filter((item) => item.state === "passed").length / items.length) * 100));
  const errors = items.filter((item) => item.state === "error");
  return {
    score,
    status: errors.length ? (score >= 65 ? "almost_ready" : "not_ready") : "ready_manual_sales",
    checklist: items,
    nextSteps: errors.length
      ? errors.slice(0, 3).map((item) => item.message)
      : ["Erstes CJ Produkt importieren.", "Produktdaten und Marge prüfen.", "eBay Listing manuell vorbereiten und bestätigen."],
  };
}

export default async function handler(req, res) {
  const providers = {
    ebay: ebayStatus(),
    cj: cjStatus(),
    aliexpress: aliexpressStatus(),
    amazon: amazonStatus(),
  };

  return res.status(200).json({
    ok: true,
    service: "Elyon Integrations",
    lastCheckAt: new Date().toISOString(),
    providers,
    readiness: buildReadiness(providers),
  });
}
