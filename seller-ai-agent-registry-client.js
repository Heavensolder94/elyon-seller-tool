(() => {
  "use strict";

  const API_URL = "/api/ai-agent-registry";
  const CUSTOM_KEY = "elyon_ai_custom_agents_v1";
  const nativeSetItem = Storage.prototype.setItem;
  const nativeGetItem = Storage.prototype.getItem;
  const state = {
    installed: false,
    hydrating: false,
    pushTimer: null,
    lastSignature: "",
    storageConfigured: false,
    ready: false,
  };

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function readLocal() {
    try {
      const value = JSON.parse(nativeGetItem.call(localStorage, CUSTOM_KEY) || "[]");
      return Array.isArray(value) ? value.filter((agent) => agent?.id && agent?.name) : [];
    } catch {
      return [];
    }
  }

  function signature(list) {
    return JSON.stringify((Array.isArray(list) ? list : []).map((agent) => [
      agent?.id,
      agent?.updatedAt,
      agent?.name,
      agent?.enabled !== false,
    ]));
  }

  function writeLocal(list) {
    const agents = Array.isArray(list) ? list : [];
    state.hydrating = true;
    try {
      nativeSetItem.call(localStorage, CUSTOM_KEY, JSON.stringify(agents));
      state.lastSignature = signature(agents);
    } finally {
      state.hydrating = false;
    }
    window.dispatchEvent(new CustomEvent("elyon:ai-agent-registry-updated", {
      detail: { customAgents: agents, source: "server" },
    }));
    window.ElyonAIAgentBuilder?.refresh?.();
  }

  function timestamp(value) {
    const parsed = Date.parse(text(value));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function mergeAgents(serverAgents, localAgents) {
    const map = new Map();
    for (const agent of Array.isArray(serverAgents) ? serverAgents : []) {
      if (agent?.id) map.set(agent.id, agent);
    }
    for (const agent of Array.isArray(localAgents) ? localAgents : []) {
      if (!agent?.id) continue;
      const current = map.get(agent.id);
      if (!current || timestamp(agent.updatedAt) > timestamp(current.updatedAt)) map.set(agent.id, agent);
    }
    return [...map.values()].slice(0, 50);
  }

  async function request(url, options = {}) {
    try {
      const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      return { ok: false, status: 0, data: { message: error?.message || "Netzwerkfehler" } };
    }
  }

  async function pushLocal(list = readLocal()) {
    if (!state.storageConfigured) return false;
    const currentSignature = signature(list);
    if (currentSignature === state.lastSignature) return true;
    const result = await request(API_URL, {
      method: "PUT",
      body: JSON.stringify({ customAgents: list }),
    });
    if (!result.ok) {
      console.warn("[Elyon Agent Registry] Server-Sync fehlgeschlagen", result.status, result.data?.message || result.data?.error || "");
      return false;
    }
    const serverAgents = Array.isArray(result.data?.customAgents) ? result.data.customAgents : list;
    writeLocal(serverAgents);
    return true;
  }

  function queuePush() {
    if (state.hydrating || !state.storageConfigured) return;
    clearTimeout(state.pushTimer);
    state.pushTimer = setTimeout(() => {
      pushLocal().catch((error) => console.warn("[Elyon Agent Registry] Sync-Fehler", error));
    }, 250);
  }

  function installStorageBridge() {
    if (state.installed) return;
    state.installed = true;
    Storage.prototype.setItem = function elyonAgentRegistrySetItem(key, value) {
      nativeSetItem.call(this, key, value);
      if (this === localStorage && key === CUSTOM_KEY && !state.hydrating) {
        window.dispatchEvent(new CustomEvent("elyon:ai-agent-registry-local-change"));
        queuePush();
      }
    };
  }

  async function refresh() {
    const localAgents = readLocal();
    const result = await request(API_URL, { method: "GET" });
    if (!result.ok) {
      state.ready = true;
      window.dispatchEvent(new CustomEvent("elyon:ai-agent-registry-ready", {
        detail: { persistent: false, customAgents: localAgents, status: result.status },
      }));
      return { persistent: false, customAgents: localAgents };
    }

    state.storageConfigured = result.data?.storage?.configured === true;
    const serverAgents = Array.isArray(result.data?.customAgents) ? result.data.customAgents : [];
    const merged = mergeAgents(serverAgents, localAgents);

    if (state.storageConfigured && signature(merged) !== signature(serverAgents)) {
      const migrated = await request(API_URL, {
        method: "PUT",
        body: JSON.stringify({ customAgents: merged }),
      });
      if (migrated.ok && Array.isArray(migrated.data?.customAgents)) {
        writeLocal(migrated.data.customAgents);
      } else {
        writeLocal(merged);
      }
    } else {
      writeLocal(state.storageConfigured ? serverAgents : merged);
    }

    state.ready = true;
    window.dispatchEvent(new CustomEvent("elyon:ai-agent-registry-ready", {
      detail: {
        persistent: state.storageConfigured,
        customAgents: readLocal(),
        coreAgents: Array.isArray(result.data?.coreAgents) ? result.data.coreAgents : [],
      },
    }));
    return { persistent: state.storageConfigured, customAgents: readLocal() };
  }

  async function boot() {
    installStorageBridge();
    try {
      const auth = window.ElyonSellerAuth?.whenReady ? await window.ElyonSellerAuth.whenReady() : null;
      if (auth && auth.authenticated === false) return;
      await refresh();
    } catch (error) {
      console.warn("[Elyon Agent Registry] Initialisierung fehlgeschlagen", error);
    }
  }

  window.ElyonAIAgentRegistry = {
    refresh,
    push: () => pushLocal(),
    customAgents: readLocal,
    isPersistent: () => state.storageConfigured,
    isReady: () => state.ready,
  };

  installStorageBridge();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
