import { constants, createPrivateKey, sign } from "node:crypto";

const EBAY_FINANCES_HOSTS = new Set(["apiz.ebay.com", "apiz.sandbox.ebay.com"]);

/**
 * Private signing keys must remain on the server, never in browser bundles,
 * network responses, audit events, or error messages.
 */
export function financeSigningStatus(environment = process.env) {
  const jwe = String(environment.EBAY_SIGNATURE_JWE || environment.EBAY_SIGNING_KEY_JWE || "").trim();
  const privateKey = String(environment.EBAY_SIGNATURE_PRIVATE_KEY || environment.EBAY_SIGNING_PRIVATE_KEY || "").trim();
  return {
    required: true,
    configured: Boolean(jwe && privateKey),
    missing: [
      ...(!jwe ? ["EBAY_SIGNATURE_JWE"] : []),
      ...(!privateKey ? ["EBAY_SIGNATURE_PRIVATE_KEY"] : []),
    ],
  };
}

function signatureFailure(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export function signFinancesGetRequest(target, options = {}) {
  const url = new URL(target);
  if (url.protocol !== "https:" || !EBAY_FINANCES_HOSTS.has(url.hostname) ||
      url.port || !url.pathname.startsWith("/sell/finances/v1/")) {
    throw signatureFailure(400, "ebay_signature_target_invalid", "Ungültiger eBay-Finances-Endpunkt.");
  }
  const jwe = String(options.jwe ?? process.env.EBAY_SIGNATURE_JWE ?? process.env.EBAY_SIGNING_KEY_JWE ?? "").trim();
  const privateKey = String(options.privateKey ?? process.env.EBAY_SIGNATURE_PRIVATE_KEY ?? process.env.EBAY_SIGNING_PRIVATE_KEY ?? "")
    .replace(/\\n/g, "\n").trim();
  if (!jwe || !privateKey) {
    throw signatureFailure(
      503,
      "ebay_signature_not_configured",
      `eBay Finances: In diesem Vercel-Deployment fehlt ${[
        ...(!jwe ? ["EBAY_SIGNATURE_JWE"] : []),
        ...(!privateKey ? ["EBAY_SIGNATURE_PRIVATE_KEY"] : []),
      ].join(" und ")}. Bitte Preview-Branch-Zuordnung prüfen und ein neues Preview-Deployment erstellen.`,
    );
  }
  if (jwe.split(".").length !== 5 || !jwe.split(".").every((part) => /^[a-zA-Z0-9_-]+$/.test(part))) {
    throw signatureFailure(503, "ebay_signature_invalid_config", "Der konfigurierte eBay-Signatur-JWE ist ungültig.");
  }
  const created = options.created ?? Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(created) || created <= 0) {
    throw signatureFailure(400, "ebay_signature_invalid_timestamp", "Ungültiger Zeitstempel für die eBay-Signatur.");
  }
  // RFC 9421 + eBay digital signature specification: no Content-Digest for GETs.
  const parameters = '("x-ebay-signature-key" "@method" "@path" "@authority");created=' + created;
  const signatureInput = "sig1=" + parameters;
  const signatureBase = [
    '"x-ebay-signature-key": ' + jwe,
    '"@method": GET',
    '"@path": ' + url.pathname,
    '"@authority": ' + url.host,
    '"@signature-params": ' + parameters,
  ].join("\n");
  let signature;
  try {
    // eBay createSigningKey returns base64-encoded PKCS#8 DER (not PEM).
    // Accept PEM as an optional admin format for backwards compatibility.
    const key = privateKey.startsWith("-----BEGIN ")
      ? createPrivateKey(privateKey)
      : createPrivateKey({
          key: Buffer.from(privateKey.replace(/\s/g, ""), "base64"),
          format: "der",
          type: "pkcs8",
        });
    const bytes = Buffer.from(signatureBase, "utf8");
    if (key.asymmetricKeyType === "ed25519") {
      signature = sign(null, bytes, key);
    } else if (key.asymmetricKeyType === "rsa") {
      signature = sign("sha256", bytes, { key, padding: constants.RSA_PKCS1_PADDING });
    } else {
      throw new Error("Unsupported signing key type");
    }
  } catch {
    throw signatureFailure(
      503, "ebay_signature_invalid_private_key",
      "Der eBay-Signaturschlüssel ist ungültig oder unterstützt keinen zulässigen Signaturalgorithmus.",
    );
  }
  return {
    "x-ebay-signature-key": jwe,
    "Signature-Input": signatureInput,
    "Signature": "sig1=:" + signature.toString("base64") + ":",
  };
}
