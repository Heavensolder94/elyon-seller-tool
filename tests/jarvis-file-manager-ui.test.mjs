import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  buildBrainHealth,
  buildJarvisFileDetail,
  buildJarvisFileManagerSnapshot,
  fileOperationalStatus,
  fileStoreEnabled,
} from "../api/jarvis-files.js";

const root = new URL("../", import.meta.url);

function fileRows() {
  return [
    ["identity", "brain.identity", "brain/IDENTITY.md", "brain", "Identity", true, true],
    ["context", "brain.elyon_context", "brain/ELYON_CONTEXT.md", "brain", "Elyon Context", false, false],
    ["rules", "brain.operating_rules", "brain/OPERATING_RULES.md", "policy", "Operating Rules", true, true],
    ["capabilities", "brain.capabilities", "brain/CAPABILITIES.md", "policy", "Capabilities", true, false],
    ["goals", "brain.goals", "brain/GOALS.md", "brain", "Goals", false, true],
    ["playbooks", "brain.playbooks", "brain/PLAYBOOKS.md", "playbook", "Playbooks", false, false],
  ].map(([id, key, path, category, title, protectedFlag, required]) => ({
    id,
    key,
    path,
    category,
    title,
    format: "markdown",
    protected: protectedFlag,
    required,
    active_version: null,
    created_at: "2026-08-15T00:00:00.000Z",
    updated_at: "2026-08-15T00:00:00.000Z",
  }));
}

function requestStub(url) {
  if (url.startsWith("/rest/v1/jarvis_files?")) return Promise.resolve(fileRows());
  if (url.startsWith("/rest/v1/jarvis_file_versions?select=file_id")) {
    return Promise.resolve([{
      file_id: "goals",
      version: 1,
      status: "draft",
      change_summary: "Initial import",
      created_by: "test",
      created_at: "2026-08-15T00:10:00.000Z",
    }]);
  }
  if (url.includes("file_id=eq.goals") && url.includes("version=eq.1")) {
    return Promise.resolve([{
      id: "goals-v1",
      file_id: "goals",
      version: 1,
      content: "# Elyon Jarvis — Goals\n\nStable goals.",
      change_summary: "Initial import",
      created_by: "test",
      status: "draft",
      created_at: "2026-08-15T00:10:00.000Z",
    }]);
  }
  throw new Error(`unexpected_request:${url}`);
}

test("File Manager snapshot separates active repository source from Supabase draft and exposes health", async () => {
  const snapshot = await buildJarvisFileManagerSnapshot({
    env: { JARVIS_FILE_STORE_ENABLED: "false" },
    request: requestStub,
  });
  const goals = snapshot.files.find((file) => file.key === "brain.goals");

  assert.equal(snapshot.readOnly, true);
  assert.equal(snapshot.runtimeFileStoreEnabled, false);
  assert.equal(snapshot.stats.managed, 6);
  assert.equal(snapshot.stats.drafts, 1);
  assert.equal(snapshot.stats.repositoryActive, 6);
  assert.equal(snapshot.stats.conflicts, 0);
  assert.equal(snapshot.health.status, "attention");
  assert.equal(snapshot.health.requiredReady, 3);
  assert.equal(snapshot.health.requiredTotal, 3);
  assert.equal(snapshot.health.draftCount, 1);
  assert.equal(snapshot.health.conflictCount, 0);
  assert.equal(goals.activeSource, "repository");
  assert.equal(goals.activeVersion, null);
  assert.equal(goals.operationalStatus, "draft");
  assert.equal(goals.latestDraft.version, 1);
  assert.equal(goals.versionHistory.length, 1);
});

test("File Manager detail compares repository active content and exposes immutable history metadata", async () => {
  const content = "# Elyon Jarvis — Goals\n\nStable goals.";
  const detail = await buildJarvisFileDetail({
    identifier: "brain.goals",
    env: { JARVIS_FILE_STORE_ENABLED: "false" },
    request: requestStub,
    repositoryReader: async () => content,
  });

  assert.equal(detail.file.activeSource, "repository");
  assert.equal(detail.active.version, null);
  assert.equal(detail.active.content, content);
  assert.equal(detail.draft.version, 1);
  assert.equal(detail.draft.identicalToActive, true);
  assert.equal(detail.history.length, 1);
  assert.equal(detail.history[0].version, 1);
  assert.equal(detail.history[0].status, "draft");
  assert.equal(detail.history[0].changeSummary, "Initial import");
});

test("Brain health becomes critical for missing required files or active-version conflicts", () => {
  const missing = { key: "brain.identity", required: true, protected: true, registered: false, operationalStatus: "missing" };
  const conflict = { key: "brain.goals", required: true, protected: false, registered: true, operationalStatus: "conflict" };
  const healthyRequired = { key: "brain.operating_rules", required: true, protected: true, registered: true, operationalStatus: "fallback" };
  const health = buildBrainHealth([missing, conflict, healthyRequired]);

  assert.equal(health.status, "critical");
  assert.equal(health.requiredReady, 2);
  assert.equal(health.requiredTotal, 3);
  assert.equal(health.conflictCount, 1);
  assert.deepEqual(health.missingRequired, ["brain.identity"]);
  assert.deepEqual(health.conflicts, ["brain.goals"]);
});

test("Operational status distinguishes draft, fallback, active and conflict", () => {
  assert.equal(fileOperationalStatus({ registered: true, latestDraft: { version: 2 }, activeSource: "repository" }), "draft");
  assert.equal(fileOperationalStatus({ registered: true, latestDraft: null, activeSource: "repository" }), "fallback");
  assert.equal(fileOperationalStatus({ registered: true, latestDraft: null, activeSource: "supabase", activeVersion: 2, activeMeta: { version: 2 } }), "active");
  assert.equal(fileOperationalStatus({ registered: true, latestDraft: null, activeSource: "supabase", activeVersion: 2, activeMeta: null }), "conflict");
});

test("File Store runtime flag remains explicit opt-in", () => {
  assert.equal(fileStoreEnabled({ JARVIS_FILE_STORE_ENABLED: "false" }), false);
  assert.equal(fileStoreEnabled({}), false);
  assert.equal(fileStoreEnabled({ JARVIS_FILE_STORE_ENABLED: "true" }), true);
});

test("Brain File Manager asset is copied and loads health, grouping, diff, history and V1.2 recovery wiring", async () => {
  const bootstrap = await readFile(new URL("seller-jarvis-bootstrap.js", root), "utf8");
  const prepare = await readFile(new URL("scripts/prepare-agent-registry.mjs", root), "utf8");
  const ui = await readFile(new URL("seller-jarvis-file-manager.js", root), "utf8");

  assert.match(bootstrap, /\/seller-jarvis-file-manager\.js/);
  assert.match(prepare, /"seller-jarvis-file-manager\.js"/);
  const filesStart = bootstrap.indexOf("const FILES = [");
  const filesEnd = bootstrap.indexOf("];", filesStart);
  assert.ok(filesStart >= 0 && filesEnd > filesStart, "normal Jarvis module list must exist");
  const filesBlock = bootstrap.slice(filesStart, filesEnd);
  assert.ok(
    filesBlock.indexOf('"/seller-jarvis-command-center.js"') < filesBlock.indexOf('"/seller-jarvis-file-manager.js"'),
    "normal File Manager load must follow the Command Center"
  );
  assert.match(bootstrap, /BRAIN_CONTROL_MODULES/);
  assert.match(bootstrap, /ensureBrainControl/);
  assert.match(ui, /Brain Center · File Manager/);
  assert.match(ui, /Jarvis Brain Health/);
  assert.match(ui, /Core Brain/);
  assert.match(ui, /Rules & Safety/);
  assert.match(ui, /Execution/);
  assert.match(ui, /Versionshistorie/);
  assert.match(ui, /function lineDiff/);
  assert.match(ui, /\.jarvis-fm-diff-line\.add/);
  assert.match(ui, /row\.type === "add"/);
  assert.match(ui, /AKTIVIERUNG GESPERRT/);
  assert.match(ui, /GitHub · Repository/);
});