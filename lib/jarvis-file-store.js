import { containsSensitiveValue, supabaseJarvisRequest } from "./jarvis-memory-store.js";
import { getManagedJarvisFileDefinition } from "./jarvis-file-registry.js";

const MAX_FILE_CONTENT = 60000;
const MAX_SUMMARY = 1000;
const MAX_ACTOR = 160;

function text(value, max = MAX_FILE_CONTENT) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function encodeFilter(value) {
  return encodeURIComponent(String(value ?? ""));
}

function normalizeActiveVersion(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function normalizeFileRow(row = {}) {
  return {
    id: text(row.id, 100),
    key: text(row.key, 160),
    path: text(row.path, 300),
    category: text(row.category, 80),
    title: text(row.title, 200),
    format: text(row.format, 40) || "markdown",
    protected: row.protected === true,
    required: row.required === true,
    activeVersion: normalizeActiveVersion(row.active_version),
    createdAt: text(row.created_at, 100),
    updatedAt: text(row.updated_at, 100),
  };
}

function normalizeVersionRow(row = {}) {
  return {
    id: text(row.id, 100),
    fileId: text(row.file_id, 100),
    version: Number(row.version),
    content: String(row.content ?? ""),
    changeSummary: text(row.change_summary, MAX_SUMMARY) || null,
    createdBy: text(row.created_by, MAX_ACTOR) || null,
    status: text(row.status, 40),
    createdAt: text(row.created_at, 100),
  };
}

function assertManagedDefinition(identifier) {
  const definition = getManagedJarvisFileDefinition(identifier);
  if (!definition) throw new Error("jarvis_file_not_registered");
  return definition;
}

function assertWritable(definition, allowProtected = false) {
  if (definition?.protected && allowProtected !== true) {
    throw new Error("jarvis_file_protected");
  }
}

function validateContent(content) {
  const clean = String(content ?? "").trim();
  if (!clean) throw new Error("jarvis_file_content_required");
  if (clean.length > MAX_FILE_CONTENT) throw new Error("jarvis_file_content_too_large");
  if (containsSensitiveValue(clean)) throw new Error("jarvis_file_sensitive_content_blocked");
  return clean;
}

async function getJarvisFile({ identifier, env = process.env, request = supabaseJarvisRequest } = {}) {
  const definition = assertManagedDefinition(identifier);
  const rows = await request(
    `/rest/v1/jarvis_files?select=id,key,path,category,title,format,protected,required,active_version,created_at,updated_at&path=eq.${encodeFilter(definition.path)}&limit=1`,
    { method: "GET" },
    env
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? normalizeFileRow(row) : null;
}

async function listJarvisFiles({ env = process.env, request = supabaseJarvisRequest } = {}) {
  const rows = await request(
    "/rest/v1/jarvis_files?select=id,key,path,category,title,format,protected,required,active_version,created_at,updated_at&order=category.asc,title.asc",
    { method: "GET" },
    env
  );
  return Array.isArray(rows) ? rows.map(normalizeFileRow) : [];
}

async function getJarvisFileVersion({ fileId, version, env = process.env, request = supabaseJarvisRequest } = {}) {
  const cleanFileId = text(fileId, 100);
  const cleanVersion = Number(version);
  if (!cleanFileId || !Number.isInteger(cleanVersion) || cleanVersion < 1) return null;
  const rows = await request(
    `/rest/v1/jarvis_file_versions?select=id,file_id,version,content,change_summary,created_by,status,created_at&file_id=eq.${encodeFilter(cleanFileId)}&version=eq.${cleanVersion}&limit=1`,
    { method: "GET" },
    env
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? normalizeVersionRow(row) : null;
}

async function getActiveJarvisFile({ identifier, env = process.env, request = supabaseJarvisRequest } = {}) {
  const file = await getJarvisFile({ identifier, env, request });
  if (!file || !file.activeVersion) return null;
  const version = await getJarvisFileVersion({ fileId: file.id, version: file.activeVersion, env, request });
  if (!version) return null;
  return { file, version };
}

async function getLatestVersionNumber({ fileId, env = process.env, request = supabaseJarvisRequest } = {}) {
  const cleanFileId = text(fileId, 100);
  if (!cleanFileId) return 0;
  const rows = await request(
    `/rest/v1/jarvis_file_versions?select=version&file_id=eq.${encodeFilter(cleanFileId)}&order=version.desc&limit=1`,
    { method: "GET" },
    env
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  const latest = Number(row?.version || 0);
  return Number.isInteger(latest) && latest > 0 ? latest : 0;
}

async function createJarvisFileVersion({
  identifier,
  content,
  changeSummary = "",
  createdBy = "user",
  expectedActiveVersion,
  allowProtected = false,
  env = process.env,
  request = supabaseJarvisRequest,
} = {}) {
  const definition = assertManagedDefinition(identifier);
  assertWritable(definition, allowProtected);
  const cleanContent = validateContent(content);
  const file = await getJarvisFile({ identifier: definition.path, env, request });
  if (!file) throw new Error("jarvis_file_registry_row_missing");

  if (expectedActiveVersion !== undefined && expectedActiveVersion !== null) {
    const numericExpected = Number(expectedActiveVersion);
    const expected = numericExpected === 0 ? null : numericExpected;
    const actual = file.activeVersion ?? null;
    if (!Number.isInteger(numericExpected) || numericExpected < 0 || expected !== actual) {
      throw new Error("jarvis_file_version_conflict");
    }
  }

  const latestVersion = await getLatestVersionNumber({ fileId: file.id, env, request });
  const nextVersion = latestVersion + 1;
  const rows = await request("/rest/v1/jarvis_file_versions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      file_id: file.id,
      version: nextVersion,
      content: cleanContent,
      change_summary: text(changeSummary, MAX_SUMMARY) || null,
      created_by: text(createdBy, MAX_ACTOR) || "user",
      status: "draft",
    }),
  }, env);
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) throw new Error("jarvis_file_version_create_failed");
  return normalizeVersionRow(row);
}

async function activateJarvisFileVersion({
  identifier,
  version,
  allowProtected = false,
  env = process.env,
  request = supabaseJarvisRequest,
} = {}) {
  const definition = assertManagedDefinition(identifier);
  assertWritable(definition, allowProtected);
  const file = await getJarvisFile({ identifier: definition.path, env, request });
  if (!file) throw new Error("jarvis_file_registry_row_missing");
  const cleanVersion = Number(version);
  if (!Number.isInteger(cleanVersion) || cleanVersion < 1) throw new Error("jarvis_file_version_invalid");

  const result = await request("/rest/v1/rpc/activate_jarvis_file_version", {
    method: "POST",
    body: JSON.stringify({ p_file_id: file.id, p_version: cleanVersion }),
  }, env);
  return result === null || result === undefined ? true : result;
}

export {
  MAX_FILE_CONTENT,
  activateJarvisFileVersion,
  createJarvisFileVersion,
  getActiveJarvisFile,
  getJarvisFile,
  getJarvisFileVersion,
  listJarvisFiles,
  normalizeFileRow,
  normalizeVersionRow,
  validateContent,
};
