import { readFile } from "node:fs/promises";
import { requireSellerAccess } from "../lib/seller-access.js";
import { listManagedJarvisFiles, getManagedJarvisFileDefinition } from "../lib/jarvis-file-registry.js";
import { getJarvisFileVersion, listJarvisFiles } from "../lib/jarvis-file-store.js";
import { supabaseJarvisRequest } from "../lib/jarvis-memory-store.js";

const REPOSITORY_FILE_URLS = Object.freeze({
  "brain/IDENTITY.md": new URL("../brain/IDENTITY.md", import.meta.url),
  "brain/ELYON_CONTEXT.md": new URL("../brain/ELYON_CONTEXT.md", import.meta.url),
  "brain/OPERATING_RULES.md": new URL("../brain/OPERATING_RULES.md", import.meta.url),
  "brain/CAPABILITIES.md": new URL("../brain/CAPABILITIES.md", import.meta.url),
  "brain/GOALS.md": new URL("../brain/GOALS.md", import.meta.url),
  "brain/PLAYBOOKS.md": new URL("../brain/PLAYBOOKS.md", import.meta.url),
});

function text(value, max = 1000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function fileStoreEnabled(env = process.env) {
  return /^(1|true|yes|on)$/i.test(text(env.JARVIS_FILE_STORE_ENABLED, 20));
}

function normalizeVersionMeta(row = {}) {
  return {
    fileId: text(row.file_id ?? row.fileId, 100),
    version: Number(row.version) || 0,
    status: text(row.status, 40) || "unknown",
    changeSummary: text(row.change_summary ?? row.changeSummary, 1000) || null,
    createdBy: text(row.created_by ?? row.createdBy, 160) || null,
    createdAt: text(row.created_at ?? row.createdAt, 100) || null,
  };
}

function groupVersions(rows = []) {
  const grouped = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = normalizeVersionMeta(row);
    if (!item.fileId || !item.version) continue;
    const list = grouped.get(item.fileId) || [];
    list.push(item);
    grouped.set(item.fileId, list);
  }
  for (const list of grouped.values()) list.sort((a, b) => b.version - a.version);
  return grouped;
}

async function readRepositoryFile(definition, repositoryReader = readFile) {
  const fileUrl = REPOSITORY_FILE_URLS[definition?.path];
  if (!fileUrl) throw new Error("jarvis_file_path_invalid");
  return repositoryReader(fileUrl, "utf8");
}

async function readVersionMetadata({ env = process.env, request = supabaseJarvisRequest } = {}) {
  const rows = await request(
    "/rest/v1/jarvis_file_versions?select=file_id,version,status,change_summary,created_by,created_at&order=file_id.asc,version.desc",
    { method: "GET" },
    env
  );
  return Array.isArray(rows) ? rows.map(normalizeVersionMeta) : [];
}

function fileOperationalStatus(file = {}) {
  if (!file.registered) return file.required ? "missing" : "unregistered";
  if (file.activeVersion && !file.activeMeta) return "conflict";
  if (file.latestDraft) return "draft";
  if (file.activeSource === "supabase") return "active";
  return "fallback";
}

function buildBrainHealth(files = []) {
  const required = files.filter((file) => file.required);
  const missingRequired = required.filter((file) => !file.registered);
  const conflicts = files.filter((file) => file.operationalStatus === "conflict");
  const drafts = files.filter((file) => file.latestDraft);
  const protectedFiles = files.filter((file) => file.protected);
  let status = "healthy";
  if (missingRequired.length || conflicts.length) status = "critical";
  else if (drafts.length) status = "attention";

  return {
    status,
    requiredReady: required.length - missingRequired.length,
    requiredTotal: required.length,
    protectedReady: protectedFiles.filter((file) => file.registered).length,
    protectedTotal: protectedFiles.length,
    draftCount: drafts.length,
    conflictCount: conflicts.length,
    missingRequired: missingRequired.map((file) => file.key),
    conflicts: conflicts.map((file) => file.key),
  };
}

async function buildJarvisFileManagerSnapshot({
  env = process.env,
  request = supabaseJarvisRequest,
} = {}) {
  const definitions = listManagedJarvisFiles();
  const runtimeStoreEnabled = fileStoreEnabled(env);
  const [files, versionRows] = await Promise.all([
    listJarvisFiles({ env, request }),
    readVersionMetadata({ env, request }),
  ]);
  const fileByPath = new Map(files.map((file) => [file.path, file]));
  const versionsByFile = groupVersions(versionRows);
  const managed = definitions.map((definition) => {
    const file = fileByPath.get(definition.path) || null;
    const versions = file ? (versionsByFile.get(file.id) || []) : [];
    const latest = versions[0] || null;
    const latestDraft = versions.find((version) => version.status === "draft") || null;
    const activeMeta = file?.activeVersion
      ? versions.find((version) => version.version === file.activeVersion) || null
      : null;
    const runtimeUsesStore = runtimeStoreEnabled && Boolean(file?.activeVersion && activeMeta);
    const item = {
      ...definition,
      registered: Boolean(file),
      fileId: file?.id || null,
      activeVersion: file?.activeVersion ?? null,
      storeActiveVersion: file?.activeVersion ?? null,
      activeSource: runtimeUsesStore ? "supabase" : "repository",
      storeActiveSource: file?.activeVersion ? "supabase" : "repository",
      runtimeVersion: runtimeUsesStore ? file.activeVersion : null,
      latestVersion: latest?.version || null,
      latestDraft,
      activeMeta,
      versionCount: versions.length,
      versionHistory: versions.slice(0, 30),
      updatedAt: file?.updatedAt || null,
    };
    item.operationalStatus = fileOperationalStatus(item);
    return item;
  });

  const stats = managed.reduce((acc, file) => {
    acc.managed += 1;
    if (file.protected) acc.protected += 1;
    if (file.latestDraft) acc.drafts += 1;
    if (file.activeSource === "supabase") acc.supabaseActive += 1;
    else acc.repositoryActive += 1;
    if (file.storeActiveVersion) acc.storeActive += 1;
    if (file.operationalStatus === "conflict") acc.conflicts += 1;
    if (!file.registered) acc.unregistered += 1;
    return acc;
  }, { managed: 0, protected: 0, drafts: 0, supabaseActive: 0, repositoryActive: 0, storeActive: 0, conflicts: 0, unregistered: 0 });

  return {
    ok: true,
    readOnly: true,
    runtimeFileStoreEnabled: runtimeStoreEnabled,
    checkedAt: new Date().toISOString(),
    health: buildBrainHealth(managed),
    stats,
    files: managed,
  };
}

async function buildJarvisFileDetail({
  identifier,
  env = process.env,
  request = supabaseJarvisRequest,
  repositoryReader = readFile,
} = {}) {
  const definition = getManagedJarvisFileDefinition(identifier);
  if (!definition) throw new Error("jarvis_file_not_registered");
  const snapshot = await buildJarvisFileManagerSnapshot({ env, request });
  const summary = snapshot.files.find((file) => file.key === definition.key);
  if (!summary?.registered || !summary.fileId) throw new Error("jarvis_file_registry_row_missing");

  const [repositoryContent, storeActiveVersion, draftVersion] = await Promise.all([
    readRepositoryFile(definition, repositoryReader),
    summary.storeActiveVersion
      ? getJarvisFileVersion({ fileId: summary.fileId, version: summary.storeActiveVersion, env, request })
      : Promise.resolve(null),
    summary.latestDraft?.version
      ? getJarvisFileVersion({ fileId: summary.fileId, version: summary.latestDraft.version, env, request })
      : Promise.resolve(null),
  ]);

  const runtimeUsesStore = summary.activeSource === "supabase" && Boolean(storeActiveVersion);
  const activeContent = runtimeUsesStore ? storeActiveVersion.content : repositoryContent;
  const draftContent = draftVersion?.content ?? null;
  return {
    ok: true,
    readOnly: true,
    file: summary,
    history: summary.versionHistory || [],
    active: {
      source: summary.activeSource,
      version: runtimeUsesStore ? summary.runtimeVersion : null,
      content: activeContent,
    },
    store: {
      activeVersion: summary.storeActiveVersion,
      content: storeActiveVersion?.content ?? null,
    },
    draft: draftVersion ? {
      version: draftVersion.version,
      status: draftVersion.status,
      changeSummary: draftVersion.changeSummary,
      createdBy: draftVersion.createdBy,
      createdAt: draftVersion.createdAt,
      content: draftContent,
      identicalToActive: draftContent === activeContent,
    } : null,
  };
}

function errorCode(error) {
  return text(error?.message || error?.code, 120).replace(/[^a-z0-9_.-]+/gi, "_").toLowerCase() || "jarvis_file_manager_unavailable";
}

export default async function handler(req, res) {
  if (!requireSellerAccess(req, res)) return;
  if (String(req?.method || "GET").toUpperCase() !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const identifier = text(req?.query?.key || req?.query?.path, 300);
    const payload = identifier
      ? await buildJarvisFileDetail({ identifier })
      : await buildJarvisFileManagerSnapshot();
    return res.status(200).json(payload);
  } catch (error) {
    const code = errorCode(error);
    const status = code === "jarvis_file_not_registered" ? 404 : 503;
    return res.status(status).json({ ok: false, error: code });
  }
}

export {
  REPOSITORY_FILE_URLS,
  buildBrainHealth,
  buildJarvisFileDetail,
  buildJarvisFileManagerSnapshot,
  fileOperationalStatus,
  fileStoreEnabled,
  groupVersions,
  normalizeVersionMeta,
  readRepositoryFile,
  readVersionMetadata,
};
