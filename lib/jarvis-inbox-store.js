import { safeJson, supabaseJarvisRequest } from "./jarvis-memory-store.js";

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;
const VALID_STATES = new Set(["unread", "opened", "approved", "rejected", "archived"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value, max = 100) {
  return Array.isArray(value) ? value.filter(Boolean).slice(0, max) : [];
}

function itemKeyForCandidate(candidate = {}, index = 0) {
  const rank = Number(candidate.rank);
  return `candidate:${Number.isFinite(rank) && rank > 0 ? Math.round(rank) : index + 1}`;
}

function stateKey(taskId, itemKey) {
  return `${taskId}:${itemKey}`;
}

function normalizeState(row = {}) {
  const state = VALID_STATES.has(text(row.state, 40)) ? text(row.state, 40) : "unread";
  return {
    state,
    readAt: text(row.read_at, 100) || null,
    approvedAt: text(row.approved_at, 100) || null,
    rejectedAt: text(row.rejected_at, 100) || null,
    archivedAt: text(row.archived_at, 100) || null,
    novaTransferStatus: text(row.nova_transfer_status, 40) || null,
    novaImportId: text(row.nova_import_id, 200) || null,
    novaTransferredAt: text(row.nova_transferred_at, 100) || null,
    novaTransferError: text(row.nova_transfer_error, 1000) || null,
  };
}

function normalizeTask(row = {}) {
  return {
    id: text(row.id, 120),
    type: text(row.type, 80),
    status: text(row.status, 40),
    progress: Number(row.progress || 0),
    payload: safeJson(row.payload) ?? {},
    output: safeJson(row.output) ?? null,
    error: text(row.error || row.last_error, 1500) || null,
    createdAt: text(row.created_at, 100) || null,
    updatedAt: text(row.updated_at, 100) || null,
    finishedAt: text(row.finished_at, 100) || null,
  };
}

function candidateItem(task, candidate, index, state = {}) {
  const itemKey = itemKeyForCandidate(candidate, index);
  const output = object(task.output);
  return {
    id: stateKey(task.id, itemKey),
    taskId: task.id,
    itemKey,
    sourceType: "market_scout",
    kind: "product",
    taskStatus: task.status,
    state: state.state || "unread",
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    finishedAt: task.finishedAt,
    query: text(object(task.payload).command, 12000),
    researchStrategy: text(output.researchStrategy, 120),
    fallback: safeJson(output.fallback) ?? null,
    warnings: array(output.warnings, 12).map((value) => text(value, 1000)),
    candidate: safeJson(candidate) ?? {},
    workflow: normalizeState(state),
  };
}

function failureItem(task, state = {}) {
  const itemKey = "task:error";
  return {
    id: stateKey(task.id, itemKey),
    taskId: task.id,
    itemKey,
    sourceType: "market_scout",
    kind: "error",
    taskStatus: task.status,
    state: state.state || "unread",
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    finishedAt: task.finishedAt,
    query: text(object(task.payload).command, 12000),
    error: task.error || "Market-Scout-Auftrag fehlgeschlagen.",
    workflow: normalizeState(state),
  };
}

async function listStateRows(taskIds, env = process.env) {
  const ids = [...new Set(taskIds.filter((id) => UUID_PATTERN.test(id)))];
  if (!ids.length) return [];
  const filter = encodeURIComponent(`(${ids.join(",")})`);
  const rows = await supabaseJarvisRequest(
    `/rest/v1/jarvis_inbox_state?select=task_id,item_key,source_type,state,read_at,approved_at,rejected_at,archived_at,nova_transfer_status,nova_import_id,nova_transferred_at,nova_transfer_error,updated_at&task_id=in.${filter}`,
    { method: "GET" },
    env
  );
  return Array.isArray(rows) ? rows : [];
}

async function listJarvisInbox({ limit = DEFAULT_LIMIT, env = process.env } = {}) {
  const safeLimit = Math.max(1, Math.min(MAX_LIMIT, Number(limit) || DEFAULT_LIMIT));
  const rows = await supabaseJarvisRequest(
    `/rest/v1/jarvis_tasks?select=id,type,status,payload,output,progress,error,last_error,created_at,updated_at,finished_at&type=eq.market-scout&status=in.(completed,failed,cancelled)&order=created_at.desc&limit=${safeLimit}`,
    { method: "GET" },
    env
  );
  const tasks = Array.isArray(rows) ? rows.map(normalizeTask) : [];
  const stateRows = await listStateRows(tasks.map((task) => task.id), env);
  const states = new Map(stateRows.map((row) => [stateKey(text(row.task_id, 120), text(row.item_key, 120)), row]));
  const items = [];

  for (const task of tasks) {
    const candidates = array(object(task.output).candidates, 30);
    if (task.status === "completed" && candidates.length) {
      candidates.forEach((candidate, index) => {
        const itemKey = itemKeyForCandidate(candidate, index);
        items.push(candidateItem(task, candidate, index, states.get(stateKey(task.id, itemKey)) || {}));
      });
      continue;
    }
    if (["failed", "cancelled"].includes(task.status)) {
      items.push(failureItem(task, states.get(stateKey(task.id, "task:error")) || {}));
    }
  }

  const counts = items.reduce((acc, item) => {
    if (item.kind === "error") acc.errors += 1;
    if (item.state === "unread") acc.unread += 1;
    if (item.state === "opened") acc.opened += 1;
    if (["approved", "rejected", "archived"].includes(item.state)) acc.done += 1;
    return acc;
  }, { unread: 0, opened: 0, done: 0, errors: 0, total: items.length });

  return { items, counts };
}

async function getJarvisInboxItem({ taskId, itemKey, env = process.env } = {}) {
  if (!UUID_PATTERN.test(text(taskId, 120))) return null;
  const result = await listJarvisInbox({ limit: MAX_LIMIT, env });
  return result.items.find((item) => item.taskId === taskId && item.itemKey === itemKey) || null;
}

function statePatch(action, now = new Date().toISOString()) {
  if (action === "open") return { state: "opened", read_at: now };
  if (action === "approve") return { state: "approved", read_at: now, approved_at: now };
  if (action === "reject") return { state: "rejected", read_at: now, rejected_at: now };
  if (action === "archive") return { state: "archived", read_at: now, archived_at: now };
  throw new Error("jarvis_inbox_invalid_action");
}

async function updateJarvisInboxState({ taskId, itemKey, action, patch = {}, env = process.env } = {}) {
  const cleanTaskId = text(taskId, 120);
  const cleanItemKey = text(itemKey, 120);
  if (!UUID_PATTERN.test(cleanTaskId) || !cleanItemKey) throw new Error("jarvis_inbox_invalid_item");
  const now = new Date().toISOString();
  const base = action ? statePatch(action, now) : {};
  const allowedPatch = object(patch);
  const body = {
    task_id: cleanTaskId,
    item_key: cleanItemKey,
    source_type: "market_scout",
    ...base,
    ...(VALID_STATES.has(text(allowedPatch.state, 40)) ? { state: text(allowedPatch.state, 40) } : {}),
    ...(allowedPatch.novaTransferStatus !== undefined ? { nova_transfer_status: text(allowedPatch.novaTransferStatus, 40) || null } : {}),
    ...(allowedPatch.novaImportId !== undefined ? { nova_import_id: text(allowedPatch.novaImportId, 200) || null } : {}),
    ...(allowedPatch.novaTransferredAt !== undefined ? { nova_transferred_at: text(allowedPatch.novaTransferredAt, 100) || null } : {}),
    ...(allowedPatch.novaTransferError !== undefined ? { nova_transfer_error: text(allowedPatch.novaTransferError, 1000) || null } : {}),
    updated_at: now,
  };
  const rows = await supabaseJarvisRequest(
    "/rest/v1/jarvis_inbox_state?on_conflict=task_id,item_key",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(body),
    },
    env
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? normalizeState(row) : normalizeState(body);
}

export {
  UUID_PATTERN,
  getJarvisInboxItem,
  itemKeyForCandidate,
  listJarvisInbox,
  updateJarvisInboxState,
};
