import { containsSensitiveValue, supabaseJarvisRequest } from "./jarvis-memory-store.js";
import { getManagedJarvisFileDefinition } from "./jarvis-file-registry.js";
import { getJarvisFile, getJarvisFileVersion, validateContent } from "./jarvis-file-store.js";

const MAX_ACTOR = 160;
const MAX_REASON = 1000;

function text(value, max = MAX_REASON) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function encodeFilter(value) {
  return encodeURIComponent(String(value ?? ""));
}

function normalizeNullableVersion(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function normalizeChangeRequestRow(row = {}) {
  return {
    id: text(row.id, 100),
    fileId: text(row.file_id, 100),
    baseVersion: normalizeNullableVersion(row.base_version),
    proposedVersion: normalizeNullableVersion(row.proposed_version),
    reason: text(row.reason, MAX_REASON) || null,
    requestedBy: text(row.requested_by, MAX_ACTOR) || null,
    status: text(row.status, 40) || "unknown",
    createdAt: text(row.created_at, 100) || null,
    resolvedAt: text(row.resolved_at, 100) || null,
    approvedBy: text(row.approved_by, MAX_ACTOR) || null,
    approvedAt: text(row.approved_at, 100) || null,
    appliedVersion: normalizeNullableVersion(row.applied_version),
    appliedAt: text(row.applied_at, 100) || null,
  };
}

function normalizeActionRow(row = {}) {
  return {
    id: text(row.id, 100),
    fileId: text(row.file_id, 100),
    changeRequestId: text(row.change_request_id, 100) || null,
    action: text(row.action, 60),
    fromVersion: normalizeNullableVersion(row.from_version),
    toVersion: normalizeNullableVersion(row.to_version),
    actor: text(row.actor, MAX_ACTOR) || null,
    detail: text(row.detail, MAX_REASON) || null,
    createdAt: text(row.created_at, 100) || null,
  };
}

function assertManaged(identifier) {
  const definition = getManagedJarvisFileDefinition(identifier);
  if (!definition) throw new Error("jarvis_file_not_registered");
  return definition;
}

function assertProtectedAllowed(definition, allowProtected) {
  if (definition?.protected && allowProtected !== true) throw new Error("jarvis_file_protected");
}

function cleanReason(reason) {
  const value = text(reason, MAX_REASON);
  if (containsSensitiveValue(value)) throw new Error("jarvis_file_sensitive_content_blocked");
  return value;
}

async function listJarvisFileChangeRequests({
  fileId,
  limit = 30,
  env = process.env,
  request = supabaseJarvisRequest,
} = {}) {
  const cleanFileId = text(fileId, 100);
  if (!cleanFileId) return [];
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 30));
  const rows = await request(
    `/rest/v1/jarvis_file_change_requests?select=id,file_id,base_version,proposed_version,reason,requested_by,status,created_at,resolved_at,approved_by,approved_at,applied_version,applied_at&file_id=eq.${encodeFilter(cleanFileId)}&order=created_at.desc&limit=${safeLimit}`,
    { method: "GET" },
    env
  );
  return Array.isArray(rows) ? rows.map(normalizeChangeRequestRow) : [];
}

async function getJarvisFileChangeRequest({
  changeRequestId,
  env = process.env,
  request = supabaseJarvisRequest,
} = {}) {
  const cleanId = text(changeRequestId, 100);
  if (!cleanId) return null;
  const rows = await request(
    `/rest/v1/jarvis_file_change_requests?select=id,file_id,base_version,proposed_version,reason,requested_by,status,created_at,resolved_at,approved_by,approved_at,applied_version,applied_at&id=eq.${encodeFilter(cleanId)}&limit=1`,
    { method: "GET" },
    env
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? normalizeChangeRequestRow(row) : null;
}

async function listJarvisFileActions({
  fileId,
  limit = 40,
  env = process.env,
  request = supabaseJarvisRequest,
} = {}) {
  const cleanFileId = text(fileId, 100);
  if (!cleanFileId) return [];
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 40));
  const rows = await request(
    `/rest/v1/jarvis_file_actions?select=id,file_id,change_request_id,action,from_version,to_version,actor,detail,created_at&file_id=eq.${encodeFilter(cleanFileId)}&order=created_at.desc&limit=${safeLimit}`,
    { method: "GET" },
    env
  );
  return Array.isArray(rows) ? rows.map(normalizeActionRow) : [];
}

async function createJarvisFileDraftChange({
  identifier,
  content,
  reason = "",
  actor = "seller_ui",
  expectedActiveVersion = null,
  allowProtected = false,
  env = process.env,
  request = supabaseJarvisRequest,
} = {}) {
  const definition = assertManaged(identifier);
  assertProtectedAllowed(definition, allowProtected);
  const cleanContent = validateContent(content);
  const cleanReasonValue = cleanReason(reason);
  const file = await getJarvisFile({ identifier: definition.path, env, request });
  if (!file) throw new Error("jarvis_file_registry_row_missing");

  const expected = normalizeNullableVersion(expectedActiveVersion);
  if (expectedActiveVersion !== null && expectedActiveVersion !== undefined && expected === null && Number(expectedActiveVersion) !== 0) {
    throw new Error("jarvis_file_version_invalid");
  }

  return request("/rest/v1/rpc/create_jarvis_file_draft_change", {
    method: "POST",
    body: JSON.stringify({
      p_file_id: file.id,
      p_content: cleanContent,
      p_summary: cleanReasonValue || null,
      p_actor: text(actor, MAX_ACTOR) || "seller_ui",
      p_expected_active: expected,
      p_allow_protected: allowProtected === true,
    }),
  }, env);
}

async function assertChangeBelongsToFile({ identifier, changeRequestId, env, request }) {
  const definition = assertManaged(identifier);
  const file = await getJarvisFile({ identifier: definition.path, env, request });
  if (!file) throw new Error("jarvis_file_registry_row_missing");
  const change = await getJarvisFileChangeRequest({ changeRequestId, env, request });
  if (!change || change.fileId !== file.id) throw new Error("jarvis_file_change_request_not_found");
  return { definition, file, change };
}

async function approveJarvisFileChange({
  identifier,
  changeRequestId,
  actor = "seller_ui",
  allowProtected = false,
  env = process.env,
  request = supabaseJarvisRequest,
} = {}) {
  const { definition } = await assertChangeBelongsToFile({ identifier, changeRequestId, env, request });
  assertProtectedAllowed(definition, allowProtected);
  return request("/rest/v1/rpc/approve_jarvis_file_change_request", {
    method: "POST",
    body: JSON.stringify({
      p_change_request_id: text(changeRequestId, 100),
      p_actor: text(actor, MAX_ACTOR) || "seller_ui",
      p_allow_protected: allowProtected === true,
    }),
  }, env);
}

async function applyJarvisFileChange({
  identifier,
  changeRequestId,
  actor = "seller_ui",
  allowProtected = false,
  env = process.env,
  request = supabaseJarvisRequest,
} = {}) {
  const { definition } = await assertChangeBelongsToFile({ identifier, changeRequestId, env, request });
  assertProtectedAllowed(definition, allowProtected);
  return request("/rest/v1/rpc/apply_jarvis_file_change_request", {
    method: "POST",
    body: JSON.stringify({
      p_change_request_id: text(changeRequestId, 100),
      p_actor: text(actor, MAX_ACTOR) || "seller_ui",
      p_allow_protected: allowProtected === true,
    }),
  }, env);
}

async function rollbackJarvisFile({
  identifier,
  targetVersion = null,
  reason = "",
  actor = "seller_ui",
  allowProtected = false,
  env = process.env,
  request = supabaseJarvisRequest,
} = {}) {
  const definition = assertManaged(identifier);
  assertProtectedAllowed(definition, allowProtected);
  const file = await getJarvisFile({ identifier: definition.path, env, request });
  if (!file) throw new Error("jarvis_file_registry_row_missing");
  const target = normalizeNullableVersion(targetVersion);
  if (targetVersion !== null && targetVersion !== undefined && target === null) {
    throw new Error("jarvis_file_version_invalid");
  }
  if (target) {
    const version = await getJarvisFileVersion({ fileId: file.id, version: target, env, request });
    if (!version) throw new Error("jarvis_file_version_not_found");
  }
  const cleanReasonValue = cleanReason(reason);
  return request("/rest/v1/rpc/rollback_jarvis_file_version", {
    method: "POST",
    body: JSON.stringify({
      p_file_id: file.id,
      p_target_version: target,
      p_actor: text(actor, MAX_ACTOR) || "seller_ui",
      p_reason: cleanReasonValue || null,
      p_allow_protected: allowProtected === true,
    }),
  }, env);
}

export {
  applyJarvisFileChange,
  approveJarvisFileChange,
  createJarvisFileDraftChange,
  getJarvisFileChangeRequest,
  listJarvisFileActions,
  listJarvisFileChangeRequests,
  normalizeActionRow,
  normalizeChangeRequestRow,
  rollbackJarvisFile,
};
