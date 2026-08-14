import { getActiveJarvisFile } from "./jarvis-file-store.js";
import { getManagedJarvisFileDefinition } from "./jarvis-file-registry.js";

function text(value, max = 300) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function isJarvisFileStoreEnabled(env = process.env) {
  return /^(?:1|true|yes|on)$/i.test(text(env?.JARVIS_FILE_STORE_ENABLED, 20));
}

async function resolveJarvisManagedFile({
  identifier,
  fallback,
  env = process.env,
  getActiveFile = getActiveJarvisFile,
} = {}) {
  const definition = getManagedJarvisFileDefinition(identifier);
  if (!definition) {
    return {
      content: typeof fallback === "function" ? await fallback() : "",
      source: "repository",
      version: null,
      managed: false,
      warning: null,
    };
  }

  if (!isJarvisFileStoreEnabled(env)) {
    return {
      content: typeof fallback === "function" ? await fallback() : "",
      source: "repository",
      version: null,
      managed: true,
      warning: null,
    };
  }

  try {
    const active = await getActiveFile({ identifier: definition.path, env });
    const content = String(active?.version?.content ?? "").trim();
    if (content) {
      return {
        content,
        source: "supabase",
        version: Number(active.version.version) || null,
        managed: true,
        warning: null,
      };
    }

    return {
      content: typeof fallback === "function" ? await fallback() : "",
      source: "repository",
      version: null,
      managed: true,
      warning: "jarvis_file_store_active_version_missing",
    };
  } catch (error) {
    return {
      content: typeof fallback === "function" ? await fallback() : "",
      source: "repository",
      version: null,
      managed: true,
      warning: `jarvis_file_store_fallback:${text(error?.message, 120) || "unknown"}`,
    };
  }
}

export {
  isJarvisFileStoreEnabled,
  resolveJarvisManagedFile,
};
