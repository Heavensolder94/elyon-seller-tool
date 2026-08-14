import { getJarvisControlSnapshot } from "./elyon-jarvis-control-store.js";

const DEFAULT_AUTONOMY_PROVIDERS = Object.freeze(["local"]);
const SUPPORTED_AUTONOMY_PROVIDERS = new Set(["local", "openai", "deepseek"]);

function text(value, max = 1000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

export function parseJarvisAutonomyProviders(env = process.env) {
  const configured = text(env.ELYON_JARVIS_AUTONOMY_PROVIDERS, 500)
    .split(/[\s,;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => SUPPORTED_AUTONOMY_PROVIDERS.has(item));
  const providers = configured.length ? configured : [...DEFAULT_AUTONOMY_PROVIDERS];
  return [...new Set(providers)];
}

export function buildJarvisAutonomyEnv(env = process.env) {
  const providers = parseJarvisAutonomyProviders(env);
  const scoped = { ...env };

  // E4/E5 pricing must only consider providers that are explicitly allowed for
  // autonomous work. API keys used by unrelated Seller Tool features must not
  // block the Nova pipeline merely because no autonomy pricing was configured.
  if (!providers.includes("openai")) scoped.OPENAI_API_KEY = "";
  if (!providers.includes("deepseek")) scoped.DEEPSEEK_API_KEY = "";

  scoped.ELYON_JARVIS_AUTONOMY_PROVIDERS = providers.join(",");
  return scoped;
}

export async function getJarvisE5ControlSnapshot(options = {}) {
  const sourceEnv = options.env || process.env;
  const env = buildJarvisAutonomyEnv(sourceEnv);
  const snapshot = await getJarvisControlSnapshot({ ...options, env });
  const sourceMode = text(snapshot?.control?.mode, 30).toLowerCase() || "manual";
  const e5V2 = options.e5V2 === true;
  const safeForE5Autopilot = e5V2 &&
    sourceMode === "assisted" &&
    snapshot?.decision?.allowed === true &&
    snapshot?.control?.killSwitch !== true &&
    snapshot?.control?.pausedByGuard !== true;
  const effectiveMode = safeForE5Autopilot ? "autopilot" : sourceMode;
  const baseBatchLimit = Number(snapshot?.decision?.batchLimit || 0) || 0;

  return {
    ...snapshot,
    control: {
      ...snapshot.control,
      mode: effectiveMode,
      sourceMode,
    },
    decision: {
      ...snapshot.decision,
      batchLimit: snapshot?.decision?.allowed === true && effectiveMode === "autopilot"
        ? Math.max(2, baseBatchLimit)
        : baseBatchLimit,
    },
    autonomyPolicy: {
      version: 2,
      e5V2,
      providers: parseJarvisAutonomyProviders(sourceEnv),
      providerScope: "explicit_autonomy_only",
      assistedPromotedToE5Autopilot: safeForE5Autopilot,
      livePublishingAllowed: false,
    },
  };
}

export {
  DEFAULT_AUTONOMY_PROVIDERS,
  SUPPORTED_AUTONOMY_PROVIDERS,
};
