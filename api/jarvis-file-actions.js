import { requireSellerAccess } from "../lib/seller-access.js";
import { getManagedJarvisFileDefinition } from "../lib/jarvis-file-registry.js";
import { getJarvisFile, getJarvisFileVersion } from "../lib/jarvis-file-store.js";
import {
  applyJarvisFileChange,
  approveJarvisFileChange,
  createJarvisFileDraftChange,
  listJarvisFileActions,
  listJarvisFileChangeRequests,
  rollbackJarvisFile,
} from "../lib/jarvis-file-change-store.js";
import { buildJarvisFileManagerSnapshot, fileStoreEnabled, readRepositoryFile } from "./jarvis-files.js";

const MAX_BODY_BYTES = 96 * 1024;
const ACTOR = "seller_ui";

function text(value, max = 1000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function bodyObject(req) {
  if (req?.body && typeof req.body === "object" && !Array.isArray(req.body)) return req.body;
  if (typeof req?.body !== "string") return {};
  try {
    const parsed = JSON.parse(req.body);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeVersion(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function assertProtectedConfirmation(definition, body) {
  if (!definition?.protected) return false;
  const expected = definition.key;
  if (text(body?.protectedConfirmation, 200) !== expected) {
    throw new Error("jarvis_file_protected_confirmation_required");
  }
  return true;
}

function assertConfirmed(body) {
  if (body?.confirmed !== true) throw new Error("jarvis_file_action_confirmation_required");
}

function assertReason(value, code = "jarvis_file_change_summary_required") {
  const clean = text(value, 1000);
  if (clean.length < 3) throw new Error(code);
  return clean;
}

async function buildWorkflow(identifier, env = process.env) {
  const definition = getManagedJarvisFileDefinition(identifier);
  if (!definition) throw new Error("jarvis_file_not_registered");
  const [file, snapshot] = await Promise.all([
    getJarvisFile({ identifier: definition.path, env }),
    buildJarvisFileManagerSnapshot({ env }),
  ]);
  if (!file) throw new Error("jarvis_file_registry_row_missing");
  const summary = snapshot.files.find((entry) => entry.key === definition.key);
  const [repositoryContent, storeActiveVersion, changes, actions] = await Promise.all([
    readRepositoryFile(definition),
    file.activeVersion
      ? getJarvisFileVersion({ fileId: file.id, version: file.activeVersion, env })
      : Promise.resolve(null),
    listJarvisFileChangeRequests({ fileId: file.id, env }),
    listJarvisFileActions({ fileId: file.id, env }),
  ]);
  const openChange = changes.find((change) => change.status === "pending" || change.status === "approved") || null;
  const proposedVersion = openChange?.proposedVersion
    ? await getJarvisFileVersion({ fileId: file.id, version: openChange.proposedVersion, env })
    : null;
  const managedBase = storeActiveVersion?.content ?? repositoryContent;
  const runtimeUsesStore = fileStoreEnabled(env) && Boolean(storeActiveVersion);

  return {
    ok: true,
    workflowVersion: "1.2",
    file: {
      key: definition.key,
      path: definition.path,
      title: definition.title,
      category: definition.category,
      protected: definition.protected === true,
      required: definition.required === true,
      fileId: file.id,
    },
    runtime: {
      fileStoreEnabled: fileStoreEnabled(env),
      source: runtimeUsesStore ? "supabase" : "repository",
      version: runtimeUsesStore ? file.activeVersion : null,
    },
    store: {
      activeVersion: file.activeVersion,
      activeContent: managedBase,
      activeContentSource: storeActiveVersion ? "supabase" : "repository",
    },
    change: openChange ? {
      ...openChange,
      content: proposedVersion?.content ?? null,
      changeSummary: proposedVersion?.changeSummary ?? openChange.reason ?? null,
    } : null,
    versions: Array.isArray(summary?.versionHistory) ? summary.versionHistory : [],
    actions,
  };
}

function statusForError(code) {
  if (code === "jarvis_file_not_registered" || code.includes("not_found") || code === "jarvis_file_registry_row_missing") return 404;
  if (code.includes("protected")) return 403;
  if (
    code.includes("conflict") ||
    code.includes("not_pending") ||
    code.includes("not_approved") ||
    code.includes("rollback_noop")
  ) return 409;
  if (
    code.includes("required") ||
    code.includes("invalid") ||
    code.includes("too_large") ||
    code.includes("sensitive") ||
    code.includes("confirmation")
  ) return 400;
  return 503;
}

function errorCode(error) {
  const direct = text(error?.message || error?.code, 180);
  const detail = text(error?.detail, 1000);
  const known = detail.match(/jarvis_file_[a-z0-9_]+/i)?.[0];
  return text(known || direct, 180).replace(/[^a-z0-9_.-]+/gi, "_").toLowerCase() || "jarvis_file_action_failed";
}

async function handleAction(body, env = process.env) {
  const action = text(body.action, 60).toLowerCase();
  const identifier = text(body.key || body.path, 300);
  const definition = getManagedJarvisFileDefinition(identifier);
  if (!definition) throw new Error("jarvis_file_not_registered");
  const allowProtected = definition.protected ? assertProtectedConfirmation(definition, body) : false;

  if (action === "create_draft") {
    const reason = assertReason(body.changeSummary);
    await createJarvisFileDraftChange({
      identifier: definition.key,
      content: body.content,
      reason,
      actor: ACTOR,
      expectedActiveVersion: body.expectedActiveVersion ?? null,
      allowProtected,
      env,
    });
    return buildWorkflow(definition.key, env);
  }

  if (action === "approve_draft") {
    assertConfirmed(body);
    await approveJarvisFileChange({
      identifier: definition.key,
      changeRequestId: text(body.changeRequestId, 100),
      actor: ACTOR,
      allowProtected,
      env,
    });
    return buildWorkflow(definition.key, env);
  }

  if (action === "activate_draft") {
    assertConfirmed(body);
    await applyJarvisFileChange({
      identifier: definition.key,
      changeRequestId: text(body.changeRequestId, 100),
      actor: ACTOR,
      allowProtected,
      env,
    });
    return buildWorkflow(definition.key, env);
  }

  if (action === "rollback") {
    assertConfirmed(body);
    const reason = assertReason(body.reason, "jarvis_file_rollback_reason_required");
    const rawTarget = body.targetVersion;
    const targetVersion = rawTarget === null || rawTarget === "repository" || rawTarget === "" ? null : normalizeVersion(rawTarget);
    if (rawTarget !== null && rawTarget !== "repository" && rawTarget !== "" && targetVersion === null) {
      throw new Error("jarvis_file_version_invalid");
    }
    await rollbackJarvisFile({
      identifier: definition.key,
      targetVersion,
      reason,
      actor: ACTOR,
      allowProtected,
      env,
    });
    return buildWorkflow(definition.key, env);
  }

  throw new Error("jarvis_file_action_invalid");
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res, { maxBodyBytes: MAX_BODY_BYTES })) return;
  const method = String(req?.method || "GET").toUpperCase();

  try {
    if (method === "GET") {
      const identifier = text(req?.query?.key || req?.query?.path, 300);
      if (!identifier) return res.status(400).json({ ok: false, error: "jarvis_file_identifier_required" });
      return res.status(200).json(await buildWorkflow(identifier));
    }

    if (method === "POST") {
      const payload = await handleAction(bodyObject(req));
      return res.status(200).json(payload);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  } catch (error) {
    const code = errorCode(error);
    return res.status(statusForError(code)).json({ ok: false, error: code });
  }
}

export {
  assertProtectedConfirmation,
  bodyObject,
  buildWorkflow,
  handleAction,
  normalizeVersion,
  statusForError,
};
