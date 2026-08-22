const SELLER_COOKIE_NAME = "elyon_seller_session";
export const SELLER_EXTENSION_SESSION_HEADER = "x-elyon-seller-session";

function text(value) {
  return String(value ?? "").trim();
}

export function extensionSellerSession(headers = {}) {
  const value = text(
    headers[SELLER_EXTENSION_SESSION_HEADER] ||
    headers["X-Elyon-Seller-Session"] ||
    headers["x-Elyon-Seller-Session"]
  );
  if (!value || value.length > 4096) return "";
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value) ? value : "";
}

function mergeCookieHeader(existing, name, value) {
  const current = text(existing);
  const parts = current
    ? current.split(";").map((entry) => entry.trim()).filter(Boolean)
    : [];
  const filtered = parts.filter((entry) => !entry.startsWith(`${name}=`));
  filtered.push(`${name}=${encodeURIComponent(value)}`);
  return filtered.join("; ");
}

export function applyExtensionSellerSession(req) {
  const session = extensionSellerSession(req?.headers || {});
  if (!session) {
    return {
      ok: false,
      error: "seller_extension_session_missing",
      message: "Seller-Tool-Sitzung fehlt oder ist ungültig.",
    };
  }

  req.headers = {
    ...(req.headers || {}),
    cookie: mergeCookieHeader(req?.headers?.cookie, SELLER_COOKIE_NAME, session),
  };
  return { ok: true };
}
