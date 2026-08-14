import { getJarvisPipelineControlSnapshot } from "./elyon-jarvis-pipeline-control-store.js";

const DEFAULT_COMPANY_OS_URL = "https://elyon-company-os.vercel.app";
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

function text(value, max = 3000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isPipelineStartEvent(event = {}) {
  return text(event.type, 120).toLowerCase() === "nova.product.created" &&
    text(event.source, 100).toLowerCase() === "company-os" &&
    Boolean(text(event.subjectId || event.sourceId, 300));
}

export async function dispatchCompanyOsPipelineStart(event = {}, options = {}) {
  const env = options.env || process.env;
  if (!isPipelineStartEvent(event)) return { attempted: false, delivered: false, skipped: true, reason: "event_not_e5_startable" };

  const controlSnapshotImpl = options.controlSnapshotImpl || getJarvisPipelineControlSnapshot;
  const control = await controlSnapshotImpl({ env, fetchImpl: options.fetchImpl, e5V2: true });
  if (control?.permissions?.internalPipelineAllowed !== true) {
    return {
      attempted: false,
      delivered: false,
      skipped: true,
      reason: control?.reasons?.[0] || "pipeline_not_allowed",
      control: { mode: text(control?.control?.mode, 30), pipelineEnabled: control?.pipeline?.enabled === true },
    };
  }

  const secret = text(env.ELYON_BRIDGE_SECRET, 4000);
  if (!secret) {
    return { attempted: false, delivered: false, skipped: true, reason: "bridge_secret_unconfigured" };
  }
  const baseUrl = text(env.ELYON_COMPANY_OS_URL, 1000) || DEFAULT_COMPANY_OS_URL;
  let url;
  try {
    url = new URL("/api/jarvis-pipeline-start", baseUrl).toString();
  } catch {
    return { attempted: false, delivered: false, skipped: true, reason: "company_os_url_invalid" };
  }

  const productId = text(event.subjectId || event.sourceId, 300);
  const payload = {
    productId,
    source: "jarvis",
    sourceEventId: text(event.eventId, 160),
    correlationId: text(event.correlationId, 160),
  };
  const fetchImpl = options.fetchImpl || fetch;
  let lastStatus = 0;
  let lastError = "";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Elyon-Bridge-Secret": secret,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      lastStatus = response.status;
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.ok !== false) {
        return {
          attempted: true,
          delivered: true,
          skipped: false,
          status: response.status,
          pipelineJobId: text(data?.job?.id || data?.jobId, 200),
          reused: data?.reused === true,
        };
      }
      lastError = text(data?.error || data?.message, 500) || `company_os_http_${response.status}`;
      if (!RETRYABLE.has(response.status)) break;
    } catch (error) {
      lastError = text(error?.code || error?.message, 500) || "company_os_pipeline_bridge_failed";
    }
    if (attempt < 2) await sleep(120);
  }

  return {
    attempted: true,
    delivered: false,
    skipped: false,
    status: lastStatus,
    reason: lastError || "company_os_pipeline_start_failed",
  };
}

export { DEFAULT_COMPANY_OS_URL };
