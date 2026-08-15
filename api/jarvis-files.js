import path from "node:path";
import { readFile } from "node:fs/promises";
import { requireSellerAccess } from "../lib/seller-access.js";
import { listManagedJarvisFiles, getManagedJarvisFileDefinition } from "../lib/jarvis-file-registry.js";
import { getJarvisFileVersion, listJarvisFiles } from "../lib/jarvis-file-store.js";
import { supabaseJarvisRequest } from "../lib/jarvis-memory-store.js";

function text(value, max = 1000) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function fileStoreEnabled(env = process.env) {
  return /^(1|true|yes|on)$/i.test(text(env.JARVIS_FILE_STORE_ENABLED, 20));
}

function normalizeVersionMeta(row = {}) {
  return {
    fileId: text(row.file_id, 100),
    version: Number(row.version) || 0,
    status: text(row.status, 40) || "unknown",
    changeSummary: text(row.change_summary, 1000) || null,
    createdBy: text(row.created_by, 160) || null,
    createdAt: text(row.created_at, 100) || null,
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
  const fullPath = path.resolve(process.cwd(), definition.path);
  const root = path.resolve(process.cwd());
  if (!fullPath.startsWith(`${root}${path.sep}`)) throw new Error("jarvis_file_path_invalid");
  return repositoryReader(fullPath, "utf8");
}

async function readVersionMetadata({ env = process.env, request = supabaseJarvisRequest } = {}) {
  const rows = await request(
    "/rest/v1/jarvis_file_versions?select=file_id,version,status,change_summary,created_by,created_at&order=file_id.asc,version.desc",
    { method: "GET" },
    env
  );
  return Array.isArray(rows) ? rows.map(normalizeVersionMeta) : [];
}

async function buildJarvisFileManagerSnapshot({
  env = process.env,
  request = supabaseJarvisRequest,
  repositoryReader = readFile,
} = {}) {
  const definitions = listManagedJarvisFiles();
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
    return {
      ...definition,
      registered: Boolean(file),
      fileId: file?.id || null,
      activeVersion: file?.activeVersion ?? null,
      activeSource: file?.activeVersion ? "supabase" : "repository",
      latestVersion: latest?.version || null,
      latestDraft,
      activeMeta,
      versionCount: versions.length,
      updatedAt: file?.updatedAt || null,
    };
  });

  const stats = managed.reduce((acc, file) => {
    acc.managed += 1;
    if (file.protected) acc.protected += 1;
    if (file.latestDraft) acc.drafts += 1;
    if (file.activeSource === "supabase") acc.supabaseActive += 1;
    else acc.repositoryActive += 1;
    return acc;
  }, { managed: 0, protected: 0, drafts: 0, supabaseActive: 0, repositoryActive: 0 });

  return {
    ok: true,
    readOnly: true,
    runtimeFileStoreEnabled: fileStoreEnabled(env),
    checkedAt: new Date().toISOString(),
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
  const snapshot = await buildJarvisFileManagerSnapshot({ env, request, repositoryReader });
  const summary = snapshot.files.find((file) => file.key === definition.key);
  if (!summary?.registered || !summary.fileId) throw new Error("jarvis_file_registry_row_missing");

  const [repositoryContent, activeVersion, draftVersion] = await Promise.all([
    readRepositoryFile(definition, repositoryReader),
    summary.activeVersion
      ? getJarvisFileVersion({ fileId: summary.fileId, version: summary.activeVersion, env, request })
      : Promise.resolve(null),
    summary.latestDraft?.version
      ? getJarvisFileVersion({ fileId: summary.fileId, version: summary.latestDraft.version, env, request })
      : Promise.resolve(null),
  ]);

  const activeContent = activeVersion?.content ?? repositoryContent;
  const draftContent = draftVersion?.content ?? null;
  return {
    ok: true,
    readOnly: true,
    file: summary,
    active: {
      source: summary.activeSource,
      version: summary.activeVersion,
      content: activeContent,
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
  buildJarvisFileDetail,
  buildJarvisFileManagerSnapshot,
  fileStoreEnabled,
  groupVersions,
  normalizeVersionMeta,
  readRepositoryFile,
  readVersionMetadata,
};
