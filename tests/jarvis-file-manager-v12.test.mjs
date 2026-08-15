import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildJarvisFileManagerSnapshot } from "../api/jarvis-files.js";
import { assertProtectedConfirmation, normalizeVersion, statusForError } from "../api/jarvis-file-actions.js";
import {
  createJarvisFileDraftChange,
  normalizeActionRow,
  normalizeChangeRequestRow,
} from "../lib/jarvis-file-change-store.js";
import { getManagedJarvisFileDefinition } from "../lib/jarvis-file-registry.js";

const root = new URL("../", import.meta.url);

function registryRows(activeGoalsVersion = null) {
  return [
    ["identity", "brain.identity", "brain/IDENTITY.md", "brain", "Identity", true, true, null],
    ["context", "brain.elyon_context", "brain/ELYON_CONTEXT.md", "brain", "Elyon Context", false, false, null],
    ["rules", "brain.operating_rules", "brain/OPERATING_RULES.md", "policy", "Operating Rules", true, true, null],
    ["capabilities", "brain.capabilities", "brain/CAPABILITIES.md", "policy", "Capabilities", true, false, null],
    ["goals", "brain.goals", "brain/GOALS.md", "brain", "Goals", false, true, activeGoalsVersion],
    ["playbooks", "brain.playbooks", "brain/PLAYBOOKS.md", "playbook", "Playbooks", false, false, null],
  ].map(([id, key, path, category, title, protectedFlag, required, activeVersion]) => ({
    id,
    key,
    path,
    category,
    title,
    format: "markdown",
    protected: protectedFlag,
    required,
    active_version: activeVersion,
    created_at: "2026-08-15T00:00:00.000Z",
    updated_at: "2026-08-15T00:00:00.000Z",
  }));
}

test("runtime source stays repository while store flag is off even when Supabase has an active pointer", async () => {
  const request = async (url) => {
    if (url.startsWith("/rest/v1/jarvis_files?")) return registryRows(1);
    if (url.startsWith("/rest/v1/jarvis_file_versions?select=file_id")) {
      return [{ file_id: "goals", version: 1, status: "active", change_summary: "Pilot", created_by: "test", created_at: "2026-08-15T00:01:00.000Z" }];
    }
    throw new Error(`unexpected:${url}`);
  };
  const off = await buildJarvisFileManagerSnapshot({ env: { JARVIS_FILE_STORE_ENABLED: "false" }, request });
  const goalsOff = off.files.find((file) => file.key === "brain.goals");
  assert.equal(goalsOff.storeActiveVersion, 1);
  assert.equal(goalsOff.activeSource, "repository");
  assert.equal(goalsOff.runtimeVersion, null);
  assert.equal(off.stats.storeActive, 1);
  assert.equal(off.stats.supabaseActive, 0);

  const on = await buildJarvisFileManagerSnapshot({ env: { JARVIS_FILE_STORE_ENABLED: "true" }, request });
  const goalsOn = on.files.find((file) => file.key === "brain.goals");
  assert.equal(goalsOn.activeSource, "supabase");
  assert.equal(goalsOn.runtimeVersion, 1);
  assert.equal(on.stats.supabaseActive, 1);
});

test("protected confirmation requires exact registered key", () => {
  const identity = getManagedJarvisFileDefinition("brain.identity");
  assert.throws(() => assertProtectedConfirmation(identity, { protectedConfirmation: "Identity" }), /jarvis_file_protected_confirmation_required/);
  assert.equal(assertProtectedConfirmation(identity, { protectedConfirmation: "brain.identity" }), true);
  const goals = getManagedJarvisFileDefinition("brain.goals");
  assert.equal(assertProtectedConfirmation(goals, {}), false);
});

test("workflow helpers normalize versions and conflict status", () => {
  assert.equal(normalizeVersion(3), 3);
  assert.equal(normalizeVersion("4"), 4);
  assert.equal(normalizeVersion(0), null);
  assert.equal(normalizeVersion("x"), null);
  assert.equal(statusForError("jarvis_file_version_conflict"), 409);
  assert.equal(statusForError("jarvis_file_protected_confirmation_required"), 403);
  assert.equal(statusForError("jarvis_file_change_summary_required"), 400);
});

test("draft creation calls atomic RPC with expected active version and never directly activates", async () => {
  const calls = [];
  const request = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.startsWith("/rest/v1/jarvis_files?")) return registryRows(null).filter((row) => row.path === "brain/GOALS.md");
    if (url === "/rest/v1/rpc/create_jarvis_file_draft_change") return { change_request_id: "change-1", version: 2, status: "pending", base_version: null };
    throw new Error(`unexpected:${url}`);
  };
  const result = await createJarvisFileDraftChange({
    identifier: "brain.goals",
    content: "# Goals\n\nNeue sichere Ziele.",
    reason: "Ziele präzisiert",
    expectedActiveVersion: null,
    env: {},
    request,
  });
  assert.equal(result.version, 2);
  const rpc = calls.find((call) => call.url.includes("create_jarvis_file_draft_change"));
  assert.ok(rpc);
  const body = JSON.parse(rpc.init.body);
  assert.equal(body.p_expected_active, null);
  assert.equal(body.p_allow_protected, false);
  assert.equal(body.p_summary, "Ziele präzisiert");
  assert.equal(calls.some((call) => call.url.includes("activate_jarvis_file_version")), false);
});

test("protected draft is blocked before any write RPC without server-approved confirmation", async () => {
  let called = false;
  await assert.rejects(
    () => createJarvisFileDraftChange({ identifier: "brain.identity", content: "# Identity\n\nTest", allowProtected: false, request: async () => { called = true; return []; } }),
    /jarvis_file_protected/
  );
  assert.equal(called, false);
});

test("change request and action normalizers preserve audit metadata", () => {
  const change = normalizeChangeRequestRow({
    id: "c1", file_id: "f1", base_version: 1, proposed_version: 2, reason: "Test", requested_by: "seller_ui", status: "approved", approved_by: "seller_ui", approved_at: "2026-08-15T00:20:00Z",
  });
  assert.equal(change.baseVersion, 1);
  assert.equal(change.proposedVersion, 2);
  assert.equal(change.status, "approved");
  assert.equal(change.approvedBy, "seller_ui");

  const action = normalizeActionRow({ id: "a1", file_id: "f1", action: "activated", from_version: 1, to_version: 2, actor: "seller_ui" });
  assert.equal(action.action, "activated");
  assert.equal(action.fromVersion, 1);
  assert.equal(action.toVersion, 2);
});

test("V1.2 assets load in safe order and editor uses scoped DOM observation", async () => {
  const bootstrap = await readFile(new URL("seller-jarvis-bootstrap.js", root), "utf8");
  const prepare = await readFile(new URL("scripts/prepare-agent-registry.mjs", root), "utf8");
  const actions = await readFile(new URL("seller-jarvis-file-manager-actions.js", root), "utf8");
  const bridge = await readFile(new URL("seller-jarvis-file-manager-mount-bridge.js", root), "utf8");

  assert.match(bootstrap, /seller-jarvis-file-manager-actions\.js/);
  assert.match(prepare, /seller-jarvis-file-manager-actions\.js/);
  assert.ok(bootstrap.indexOf('"/seller-jarvis-file-manager.js"') < bootstrap.indexOf('"/seller-jarvis-file-manager-actions.js"'));
  assert.ok(bootstrap.indexOf('"/seller-jarvis-file-manager-actions.js"') < bootstrap.indexOf('"/seller-jarvis-file-manager-mount-bridge.js"'));
  assert.match(actions, /Draft speichern/);
  assert.match(actions, /Draft freigeben/);
  assert.match(actions, /Freigabe aktivieren/);
  assert.match(actions, /Rollback ausführen/);
  assert.match(actions, /rootObserver\.observe\(root/);
  assert.doesNotMatch(actions, /observe\(document\.body/);
  assert.match(bridge, /ElyonJarvisFileManagerActions\?\.bindRoot/);
});

test("V1.2 migration keeps workflow RPCs service-role only", async () => {
  const sql = await readFile(new URL("supabase/migrations/20260815030000_jarvis_file_manager_v1_2_workflow.sql", root), "utf8");
  assert.match(sql, /create_jarvis_file_draft_change/);
  assert.match(sql, /approve_jarvis_file_change_request/);
  assert.match(sql, /apply_jarvis_file_change_request/);
  assert.match(sql, /rollback_jarvis_file_version/);
  assert.match(sql, /jarvis_file_actions/);
  assert.match(sql, /revoke all on function public\.create_jarvis_file_draft_change[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.apply_jarvis_file_change_request[\s\S]*to service_role/);
});
