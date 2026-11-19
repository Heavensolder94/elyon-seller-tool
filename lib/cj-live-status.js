import { cjConfigurationStatus } from './cj-configuration-status.js';

const ROOT = 'https://developers.cjdropshipping.com/api2.0/v1';
const AUTH_CODES = new Set([1600001, 1600002, 1600004, 1600005, 1600006, 1600008, 1601000]);
const RATE_CODES = new Set([1600200, 1600201]);

function outcome(status, message, checkedAt, extra = {}) {
  return { status, message, checkedAt, configured: true, connected: status === 'connected', verified: status === 'connected', ...extra };
}

function failure(response, body, checkedAt) {
  const code = Number(body?.code);
  if (response.status === 429 || RATE_CODES.has(code)) return outcome('rate_limited', 'CJ begrenzt die Anfragen oder das Kontingent ist erschöpft. Später erneut prüfen.', checkedAt);
  if (code === 1600014) return outcome('access_disabled', 'Der CJ-API-Zugang ist beim Anbieter deaktiviert.', checkedAt);
  if ([401, 403].includes(response.status) || AUTH_CODES.has(code)) return outcome('auth_failed', 'CJ hat die Zugangsdaten oder Berechtigung abgelehnt.', checkedAt);
  if (response.status >= 500 || code === 1600000 || code === 1600100) return outcome('unreachable', 'CJ ist momentan nicht zuverlässig erreichbar.', checkedAt);
  return outcome('check_failed', 'CJ hat die Verbindung nicht eindeutig bestätigt.', checkedAt);
}

async function readResponse(response) {
  try { return await response.json(); } catch { return null; }
}

// Only called explicitly by an authenticated seller; no responses or credentials are logged.
export async function verifyCjConnection({ env = process.env, fetchImpl = fetch, now = () => new Date().toISOString() } = {}) {
  const config = cjConfigurationStatus(env);
  if (!config.configured) return { ...config, checkedAt: null };
  const checkedAt = now();
  try {
    let token = String(env.CJ_ACCESS_TOKEN || '').trim();
    if (!token) {
      const auth = await fetchImpl(`${ROOT}/authentication/getAccessToken`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ apiKey: String(env.CJ_API_KEY || '').trim() }), signal: AbortSignal.timeout(4000), redirect: 'error',
      });
      const body = await readResponse(auth);
      if (!auth.ok || body?.success === false || body?.result !== true || Number(body?.code) !== 200) return failure(auth, body, checkedAt);
      token = typeof body?.data?.accessToken === 'string' ? body.data.accessToken.trim() : '';
      if (!token) return outcome('check_failed', 'CJ hat keinen verwendbaren Zugang bestätigt.', checkedAt);
    }
    const response = await fetchImpl(`${ROOT}/setting/get`, {
      method: 'GET', headers: { 'CJ-Access-Token': token, Accept: 'application/json' }, signal: AbortSignal.timeout(4000), redirect: 'error',
    });
    const body = await readResponse(response);
    if (!response.ok || body?.success === false || body?.result !== true || Number(body?.code) !== 200 || !body?.data || typeof body.data !== 'object' || Array.isArray(body.data) || !String(body.data.openId ?? '').trim()) return failure(response, body, checkedAt);
    return outcome('connected', 'CJ-Verbindung und Zugang wurden erfolgreich geprüft.', checkedAt);
  } catch {
    return outcome('unreachable', 'CJ ist momentan nicht zuverlässig erreichbar.', checkedAt);
  }
}
