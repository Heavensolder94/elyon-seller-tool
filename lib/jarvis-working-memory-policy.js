import { containsSensitiveText } from "./jarvis-memory-policy.js";

const MAX_ITEM = 1000;
const DEFAULT_WORKING_MEMORY = Object.freeze({
  currentGoal: null,
  activeProject: null,
  currentFocus: null,
  openTasks: [],
  blockers: [],
  pendingApprovals: [],
  lastAction: null,
  nextExpectedAction: null,
});

function text(value, max = MAX_ITEM) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function cleanScalar(value) {
  const output = text(value);
  return output && !containsSensitiveText(output) ? output : null;
}

function cleanList(value, limit) {
  const result = [];
  const seen = new Set();
  for (const entry of Array.isArray(value) ? value : []) {
    const item = cleanScalar(entry);
    const key = item?.toLowerCase().replace(/\s+/g, " ");
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function normalizeWorkingMemoryState(value = {}, base = DEFAULT_WORKING_MEMORY) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    currentGoal: cleanScalar(source.currentGoal ?? base.currentGoal),
    activeProject: cleanScalar(source.activeProject ?? base.activeProject),
    currentFocus: cleanScalar(source.currentFocus ?? base.currentFocus),
    openTasks: cleanList(source.openTasks ?? base.openTasks, 20),
    blockers: cleanList(source.blockers ?? base.blockers, 10),
    pendingApprovals: cleanList(source.pendingApprovals ?? base.pendingApprovals, 10),
    lastAction: cleanScalar(source.lastAction ?? base.lastAction),
    nextExpectedAction: cleanScalar(source.nextExpectedAction ?? base.nextExpectedAction),
  };
}

function mergeWorkingMemoryState(base = DEFAULT_WORKING_MEMORY, candidate = {}) {
  const current = normalizeWorkingMemoryState(base);
  const update = candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : {};
  const merged = { ...current };
  for (const key of ["currentGoal", "activeProject", "currentFocus", "lastAction", "nextExpectedAction"]) {
    if (Object.prototype.hasOwnProperty.call(update, key) && update[key] !== null && update[key] !== undefined) merged[key] = update[key];
  }
  for (const key of ["openTasks", "blockers", "pendingApprovals"]) {
    if (Array.isArray(update[key])) merged[key] = update[key];
  }
  return normalizeWorkingMemoryState(merged);
}

function parseWorkingMemoryCommand(command) {
  const source = text(command, 12000);
  const update = {};
  const goal = source.match(/(?:(?:unser|mein)(?:e|em)?\s+aktuelles?\s+ziel|(?:unser|mein)\s+ziel)\s+ist\s*[:,\-]?\s*(.+)/i);
  const focus = source.match(/(?:wir\s+konzentrieren\s+uns\s+jetzt\s+auf|(?:mein|unser)\s+aktueller?\s+fokus\s+ist|aktueller?\s+fokus\s+ist)\s+(.+)/i);
  const open = source.match(/(?:offen\s+ist\s+noch|offen\s*:)\s*(.+)/i);
  const blocked = source.match(/(?:(?:mein|unser)\s+aktueller?\s+blocker\s+ist|aktueller?\s+blocker\s+ist|aktuell\s+blockiert\s+durch|blockiert\s+durch)\s*[:,\-]?\s*(.+)/i);
  const approval = source.match(/(.+?)\s+wartet\s+(?:noch\s+)?auf\s+(meine\s+)?(.+?freigabe)\.?$/i);
  const next = source.match(/(?:als\s+n[äa]chstes|nächster\s+schritt\s+ist)\s*[:\-]?\s*(.+)/i);
  if (goal) update.currentGoal = text(goal[1].replace(/[.!?]+$/, ""));
  if (focus) update.currentFocus = text(focus[1].replace(/[.!?]+$/, ""));
  if (open) update.openTasks = [text(open[1].replace(/[.!?]+$/, ""))];
  if (blocked) update.blockers = [text(blocked[1].replace(/[.!?]+$/, ""))];
  if (approval) {
    update.blockers = [text(`${approval[1].trim()} wartet auf Freigabe`)];
    update.pendingApprovals = [text(approval[2])];
  }
  if (next) update.nextExpectedAction = text(next[1].replace(/[.!?]+$/, ""));
  return Object.keys(update).length ? { shouldUpdate: true, ...update } : null;
}

function buildWorkingMemorySummary(state = {}) {
  const normalized = normalizeWorkingMemoryState(state);
  const parts = [];
  if (normalized.currentGoal) parts.push(`Ziel: ${normalized.currentGoal}`);
  if (normalized.currentFocus) parts.push(`Fokus: ${normalized.currentFocus}`);
  if (normalized.openTasks.length) parts.push(`Offen: ${normalized.openTasks.join("; ")}`);
  if (normalized.blockers.length) parts.push(`Blocker: ${normalized.blockers.join("; ")}`);
  if (normalized.pendingApprovals.length) parts.push(`Freigaben: ${normalized.pendingApprovals.join("; ")}`);
  if (normalized.nextExpectedAction) parts.push(`Nächster Schritt: ${normalized.nextExpectedAction}`);
  return text(parts.join(". "), 4000);
}

export { DEFAULT_WORKING_MEMORY, buildWorkingMemorySummary, mergeWorkingMemoryState, normalizeWorkingMemoryState, parseWorkingMemoryCommand };