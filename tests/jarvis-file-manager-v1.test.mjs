import test from "node:test";
import assert from "node:assert/strict";
import { loadJarvisBrainFiles } from "../lib/jarvis-brain-files.js";
import {
  getManagedJarvisFileDefinition,
  isManagedJarvisFile,
  listManagedJarvisFiles,
} from "../lib/jarvis-file-registry.js";
import {
  createJarvisFileVersion,
  validateContent,
} from "../lib/jarvis-file-store.js";
import {
  isJarvisFileStoreEnabled,
  resolveJarvisManagedFile,
} from "../lib/jarvis-file-resolver.js";

const fallback = async () => "repository-content";

test("managed Jarvis registry contains only the current allowlisted Brain documents", () => {
  const files = listManagedJarvisFiles();
  assert.equal(files.length, 6);
  assert.equal(isManagedJarvisFile("brain/IDENTITY.md"), true);
  assert.equal(isManagedJarvisFile("brain.identity"), true);
  assert.equal(isManagedJarvisFile(".env"), false);
  assert.equal(getManagedJarvisFileDefinition("brain.operating_rules")?.protected, true);
  assert.equal(getManagedJarvisFileDefinition("brain.goals")?.protected, false);
});

test("file store is opt-in and disabled by default", () => {
  assert.equal(isJarvisFileStoreEnabled({}), false);
  assert.equal(isJarvisFileStoreEnabled({ JARVIS_FILE_STORE_ENABLED: "false" }), false);
  assert.equal(isJarvisFileStoreEnabled({ JARVIS_FILE_STORE_ENABLED: "true" }), true);
  assert.equal(isJarvisFileStoreEnabled({ JARVIS_FILE_STORE_ENABLED: "1" }), true);
});

test("disabled file store returns repository fallback without touching Supabase", async () => {
  let calls = 0;
  const result = await resolveJarvisManagedFile({
    identifier: "brain/GOALS.md",
    env: {},
    fallback,
    getActiveFile: async () => {
      calls += 1;
      return null;
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.content, "repository-content");
  assert.equal(result.source, "repository");
  assert.equal(result.managed, true);
  assert.equal(result.warning, null);
});

test("enabled file store uses an active Supabase version", async () => {
  const result = await resolveJarvisManagedFile({
    identifier: "brain/GOALS.md",
    env: { JARVIS_FILE_STORE_ENABLED: "true" },
    fallback,
    getActiveFile: async () => ({
      file: { path: "brain/GOALS.md" },
      version: { version: 4, content: "managed-goals" },
    }),
  });
  assert.equal(result.content, "managed-goals");
  assert.equal(result.source, "supabase");
  assert.equal(result.version, 4);
  assert.equal(result.warning, null);
});

test("enabled file store falls back safely when no active version exists", async () => {
  const result = await resolveJarvisManagedFile({
    identifier: "brain/GOALS.md",
    env: { JARVIS_FILE_STORE_ENABLED: "true" },
    fallback,
    getActiveFile: async () => null,
  });
  assert.equal(result.content, "repository-content");
  assert.equal(result.source, "repository");
  assert.equal(result.warning, "jarvis_file_store_active_version_missing");
});

test("enabled file store falls back safely when Supabase read fails", async () => {
  const result = await resolveJarvisManagedFile({
    identifier: "brain/GOALS.md",
    env: { JARVIS_FILE_STORE_ENABLED: "true" },
    fallback,
    getActiveFile: async () => {
      throw new Error("database_unavailable");
    },
  });
  assert.equal(result.content, "repository-content");
  assert.equal(result.source, "repository");
  assert.match(result.warning, /jarvis_file_store_fallback:database_unavailable/);
});

test("unregistered paths never become managed runtime files", async () => {
  let calls = 0;
  const result = await resolveJarvisManagedFile({
    identifier: ".env",
    env: { JARVIS_FILE_STORE_ENABLED: "true" },
    fallback,
    getActiveFile: async () => {
      calls += 1;
      return { version: { version: 1, content: "should-not-load" } };
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.managed, false);
  assert.equal(result.content, "repository-content");
});

test("Brain loader can consume one managed active file while all other files remain repository-backed", async () => {
  const brain = await loadJarvisBrainFiles({
    command: "Wer bist du und was sind deine Ziele?",
    env: { JARVIS_FILE_STORE_ENABLED: "true" },
    resolveManagedFile: async ({ identifier, fallback: fileFallback }) => {
      if (identifier === "brain/GOALS.md") {
        return {
          content: "# 1. Oberstes Ziel\n\nManaged Goal aus dem File Store.",
          source: "supabase",
          version: 7,
          managed: true,
          warning: null,
        };
      }
      return {
        content: await fileFallback(),
        source: "repository",
        version: null,
        managed: true,
        warning: null,
      };
    },
  });

  assert.equal(brain.ready, true);
  const goals = brain.core.find((entry) => entry.id === "goals");
  const identity = brain.core.find((entry) => entry.id === "identity");
  assert.match(goals.content, /Managed Goal aus dem File Store/);
  assert.equal(goals.runtimeSource, "supabase");
  assert.equal(goals.runtimeVersion, 7);
  assert.equal(identity.runtimeSource, "repository");
});

test("managed file writes reject empty, oversized and secret-like content", () => {
  assert.throws(() => validateContent(""), /jarvis_file_content_required/);
  assert.throws(() => validateContent("x".repeat(60001)), /jarvis_file_content_too_large/);
  assert.throws(() => validateContent("token: sk_abcdefgh12345678"), /jarvis_file_sensitive_content_blocked/);
  assert.equal(validateContent("# Safe Brain File\n\nNo secrets here."), "# Safe Brain File\n\nNo secrets here.");
});

test("protected files cannot create versions without an explicit protected-write override", async () => {
  await assert.rejects(
    () => createJarvisFileVersion({
      identifier: "brain/IDENTITY.md",
      content: "# Identity\nSafe content",
      request: async () => { throw new Error("request_should_not_run"); },
    }),
    /jarvis_file_protected/
  );
});

test("normal file version creation uses optimistic active-version checks and creates a draft", async () => {
  const calls = [];
  const request = async (path, init = {}) => {
    calls.push({ path, init });
    if (path.startsWith("/rest/v1/jarvis_files?")) {
      return [{
        id: "file-1",
        key: "brain.goals",
        path: "brain/GOALS.md",
        category: "brain",
        title: "Goals",
        format: "markdown",
        protected: false,
        required: true,
        active_version: 2,
      }];
    }
    if (path.startsWith("/rest/v1/jarvis_file_versions?select=version")) return [{ version: 2 }];
    if (path === "/rest/v1/jarvis_file_versions" && init.method === "POST") {
      return [{
        id: "version-3",
        file_id: "file-1",
        version: 3,
        content: "# Goals\nUpdated",
        change_summary: "Update goals",
        created_by: "test",
        status: "draft",
      }];
    }
    throw new Error(`unexpected_request:${path}`);
  };

  const created = await createJarvisFileVersion({
    identifier: "brain.goals",
    content: "# Goals\nUpdated",
    changeSummary: "Update goals",
    createdBy: "test",
    expectedActiveVersion: 2,
    request,
    env: {},
  });
  assert.equal(created.version, 3);
  assert.equal(created.status, "draft");
  assert.equal(calls.at(-1).init.method, "POST");
  assert.match(calls.at(-1).init.body, /\"status\":\"draft\"/);
});

test("stale optimistic write is rejected before a new version is inserted", async () => {
  const request = async (path) => {
    if (path.startsWith("/rest/v1/jarvis_files?")) {
      return [{
        id: "file-1",
        key: "brain.goals",
        path: "brain/GOALS.md",
        category: "brain",
        title: "Goals",
        format: "markdown",
        protected: false,
        required: true,
        active_version: 5,
      }];
    }
    throw new Error("unexpected_write");
  };

  await assert.rejects(
    () => createJarvisFileVersion({
      identifier: "brain.goals",
      content: "# Goals\nStale edit",
      expectedActiveVersion: 4,
      request,
      env: {},
    }),
    /jarvis_file_version_conflict/
  );
});
