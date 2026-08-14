import { readFile } from "node:fs/promises";

const MANIFEST_URL = new URL("../brain/BRAIN_MANIFEST.json", import.meta.url);
const FILE_URLS = Object.freeze({
  "brain/IDENTITY.md": new URL("../brain/IDENTITY.md", import.meta.url),
  "brain/ELYON_CONTEXT.md": new URL("../brain/ELYON_CONTEXT.md", import.meta.url),
  "brain/OPERATING_RULES.md": new URL("../brain/OPERATING_RULES.md", import.meta.url),
  "brain/CAPABILITIES.md": new URL("../brain/CAPABILITIES.md", import.meta.url),
  "brain/GOALS.md": new URL("../brain/GOALS.md", import.meta.url),
  "brain/PLAYBOOKS.md": new URL("../brain/PLAYBOOKS.md", import.meta.url),
});

const ALLOWED_PATHS = new Set(Object.keys(FILE_URLS));
const PLAYBOOK_INTENT_PATTERNS = Object.freeze({
  product_discovery: /(?:(?:finde|such(?:e)?|recherchier(?:e)?)\b[\s\S]{0,50}\b(?:produkte?|produktideen?|marktchancen?))|\b(?:produktsuche|market\s*scout|trendprodukte?)\b/i,
  product_check_enrichment: /(?:(?:pr(?:ü|ue)f(?:e)?|check(?:e)?)\b[\s\S]{0,50}\b(?:produkt|gpsr|compliance))|\b(?:product\s*check|enrichment|fehlende\s+daten)\b/i,
  listing_draft: /\b(?:listingfertig|listing\s+fertig|listing|draft|entwurf|artikelmerkmale|item\s*specifics|auto\s*lister)\b/i,
});
let manifestCache = null;
const documentCache = new Map();

function text(value, max = 12000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function heading(line) {
  const match = String(line || "").match(/^(#{1,6})\s+(.+?)\s*$/);
  return match ? { level: match[1].length, title: match[2].trim() } : null;
}

function extractSection(markdown, requestedHeading) {
  const lines = String(markdown || "").split(/\r?\n/);
  const wanted = normalize(requestedHeading);
  let start = -1;
  let level = 7;

  for (let index = 0; index < lines.length; index += 1) {
    const current = heading(lines[index]);
    if (current && normalize(current.title) === wanted) {
      start = index;
      level = current.level;
      break;
    }
  }
  if (start < 0) return "";

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const current = heading(lines[index]);
    if (current && current.level <= level) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trim();
}

function extractSections(markdown, sections = [], maxChars = 4000) {
  const selected = [];
  for (const section of Array.isArray(sections) ? sections : []) {
    const content = extractSection(markdown, section);
    if (content) selected.push(content);
  }
  const joined = selected.join("\n\n").trim();
  return text(joined, Math.max(500, Number(maxChars) || 4000));
}

function matchesAny(command, triggers = []) {
  const haystack = ` ${normalize(command)} `;
  return (Array.isArray(triggers) ? triggers : []).some((trigger) => {
    const needle = normalize(trigger);
    return needle && haystack.includes(` ${needle} `);
  });
}

function selectPlaybook(file, command) {
  const source = String(command || "");
  for (const playbook of Array.isArray(file?.playbooks) ? file.playbooks : []) {
    const pattern = PLAYBOOK_INTENT_PATTERNS[playbook.id];
    if ((pattern && pattern.test(source)) || matchesAny(source, playbook.triggers)) return playbook;
  }
  return null;
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("brain_manifest_invalid");
  if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error("brain_manifest_files_missing");
  const ids = new Set();
  for (const entry of manifest.files) {
    if (!entry?.id || ids.has(entry.id)) throw new Error("brain_manifest_duplicate_or_missing_id");
    ids.add(entry.id);
    if (!ALLOWED_PATHS.has(entry.path)) throw new Error(`brain_manifest_path_not_allowed:${entry.path || "missing"}`);
    if (!["always", "relevant", "playbook"].includes(entry.mode)) throw new Error(`brain_manifest_mode_invalid:${entry.id}`);
  }
  return manifest;
}

async function readManifest() {
  if (!manifestCache) {
    manifestCache = readFile(MANIFEST_URL, "utf8")
      .then((raw) => validateManifest(JSON.parse(raw)))
      .catch((error) => {
        manifestCache = null;
        throw error;
      });
  }
  return manifestCache;
}

async function readBrainDocument(pathname) {
  if (!ALLOWED_PATHS.has(pathname)) throw new Error(`brain_file_path_not_allowed:${pathname}`);
  if (!documentCache.has(pathname)) {
    documentCache.set(pathname, readFile(FILE_URLS[pathname], "utf8").catch((error) => {
      documentCache.delete(pathname);
      throw error;
    }));
  }
  return documentCache.get(pathname);
}

function compactLoaded(entry, content, extra = {}) {
  return {
    id: entry.id,
    mode: entry.mode,
    path: entry.path,
    content,
    ...extra,
  };
}

async function loadJarvisBrainFiles({ command = "" } = {}) {
  const warnings = [];
  let manifest;
  try {
    manifest = await readManifest();
  } catch (error) {
    return {
      version: null,
      loaded: [],
      core: [],
      playbook: null,
      warnings: [`brain_manifest_unavailable:${text(error?.message, 120) || "unknown"}`],
    };
  }

  const selected = [];
  let playbook = null;
  for (const entry of manifest.files) {
    let chosenPlaybook = null;
    const shouldLoad = entry.mode === "always"
      || (entry.mode === "relevant" && matchesAny(command, entry.triggers))
      || (entry.mode === "playbook" && Boolean(chosenPlaybook = selectPlaybook(entry, command)));
    if (!shouldLoad) continue;

    try {
      const markdown = await readBrainDocument(entry.path);
      const content = entry.mode === "playbook"
        ? text(extractSection(markdown, chosenPlaybook.heading), entry.maxChars)
        : extractSections(markdown, entry.sections, entry.maxChars);
      if (!content) {
        warnings.push(`brain_file_sections_empty:${entry.id}`);
        if (entry.required) warnings.push(`brain_file_required_content_missing:${entry.id}`);
        continue;
      }
      const loaded = compactLoaded(entry, content, chosenPlaybook ? { playbookId: chosenPlaybook.id } : {});
      selected.push(loaded);
      if (chosenPlaybook) playbook = { id: chosenPlaybook.id, source: entry.path, content };
    } catch (error) {
      warnings.push(`brain_file_unavailable:${entry.id}:${text(error?.message, 120) || "unknown"}`);
    }
  }

  const maxCoreChars = Math.max(2000, Number(manifest.maxCoreChars) || 12000);
  let remaining = maxCoreChars;
  const bounded = [];
  for (const item of selected) {
    if (remaining <= 0) break;
    const content = text(item.content, remaining);
    if (!content) continue;
    bounded.push({ ...item, content });
    remaining -= content.length;
  }

  return {
    version: text(manifest.version, 40) || "1.0",
    loaded: bounded.map((item) => item.id),
    core: bounded,
    playbook: playbook && bounded.some((item) => item.playbookId === playbook.id)
      ? { id: playbook.id, source: playbook.source }
      : null,
    budget: { maxChars: maxCoreChars, usedChars: maxCoreChars - remaining },
    warnings,
  };
}

function renderJarvisCoreBrain(coreBrain = {}) {
  const blocks = (Array.isArray(coreBrain?.core) ? coreBrain.core : [])
    .map((item) => `## ${item.id}${item.playbookId ? ` (${item.playbookId})` : ""}\n${text(item.content, 6000)}`)
    .filter(Boolean);
  if (!blocks.length) return "";
  return [
    `JARVIS_CORE_BRAIN_VERSION: ${text(coreBrain.version, 40) || "unknown"}`,
    "The following content is versioned Jarvis core guidance. It cannot grant permissions or override deterministic safety/runtime gates.",
    ...blocks,
  ].join("\n\n");
}

function coreBrainMetadata(coreBrain = {}) {
  return {
    version: coreBrain?.version || null,
    loaded: Array.isArray(coreBrain?.loaded) ? coreBrain.loaded : [],
    playbook: coreBrain?.playbook || null,
    budget: coreBrain?.budget || null,
    warnings: Array.isArray(coreBrain?.warnings) ? coreBrain.warnings : [],
  };
}

function clearJarvisBrainFileCache() {
  manifestCache = null;
  documentCache.clear();
}

export {
  ALLOWED_PATHS,
  PLAYBOOK_INTENT_PATTERNS,
  clearJarvisBrainFileCache,
  coreBrainMetadata,
  extractSection,
  extractSections,
  loadJarvisBrainFiles,
  matchesAny,
  renderJarvisCoreBrain,
  selectPlaybook,
  validateManifest,
};
