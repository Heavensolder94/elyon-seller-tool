(() => {
  "use strict";

  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const TASKS_KEY = "elyon_ai_workforce_tasks";
  const API = "/api/ai-workforce-v2";

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function collection(keys) {
    for (const key of keys) {
      const value = readJson(key, null);
      if (Array.isArray(value) && value.length) return value;
      if (value && typeof value === "object" && Array.isArray(value.items) && value.items.length) return value.items;
    }
    return [];
  }

  function tasks() {
    const value = readJson(TASKS_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function upsertTask(task) {
    const list = tasks();
    const index = list.findIndex((entry) => entry?.id === task.id);
    if (index >= 0) list[index] = task;
    else list.unshift(task);
    writeJson(TASKS_KEY, list.slice(0, 150));
    window.ElyonAIWorkforce?.mount?.();
    setTimeout(() => window.ElyonAIWorkforceV2?.render?.(), 0);
  }

  function toast(message) {
    document.querySelector(".aiw-v2-operations-toast")?.remove();
    const node = document.createElement("div");
    node.className = "aiw-toast aiw-v2-operations-toast";
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  async function runOperations() {
    const settings = readJson(SETTINGS_KEY, {});
    const manager = settings.agents?.["elyon-manager"] || {};
    if (manager.paused || manager.enabled === false || manager.active === false || Number(manager.autonomyLevel) === 0) {
      toast("Der Elyon Manager ist pausiert oder ausgeschaltet.");
      return;
    }
    const now = new Date().toISOString();
    const temporaryId = `ai-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const temporary = {
      id: temporaryId,
      agentId: "elyon-manager",
      type: "workflow_orchestration",
      title: "Elyon Manager · Betrieb prüfen",
      sourceType: "operations",
      sourceId: "",
      priority: "critical",
      status: "analyzing",
      provider: "local",
      model: "deterministic-orchestrator-v2",
      result: null,
      warnings: [],
      errors: [],
      createdAt: now,
      updatedAt: now,
    };
    upsertTask(temporary);

    try {
      const orders = collection(["elyonOrders", "ebayOrders", "elyonSales"]);
      const returns = collection(["elyonReturns", "elyonShopifyReturns", "ebayReturns"]);
      const response = await fetch(API, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_manager",
          workflowType: "operations",
          title: temporary.title,
          input: { context: { orders, returns } },
          tasks: tasks(),
          agent: {
            provider: manager.provider || "local",
            model: manager.model || "",
            allowFallback: manager.allowFallback !== false,
            maxTokens: manager.maxTokens || 4000,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.task) {
        upsertTask({ ...temporary, status: "failed", errors: [data.message || data.error || `HTTP ${response.status}`], updatedAt: new Date().toISOString() });
        toast(data.message || "Betriebsprüfung fehlgeschlagen.");
        return;
      }
      upsertTask({ ...data.task, id: temporaryId, agentId: "elyon-manager", title: temporary.title, createdAt: now, updatedAt: new Date().toISOString() });
      toast("Elyon Manager: Betriebsworkflow wurde geprüft.");
    } catch (error) {
      upsertTask({ ...temporary, status: "failed", errors: [error?.message || "Netzwerkfehler"], updatedAt: new Date().toISOString() });
      toast("Elyon Manager konnte den Betriebsworkflow nicht prüfen.");
    }
  }

  function installButton() {
    const card = document.querySelector('[data-agent-id="elyon-manager"]');
    const actions = card?.querySelector(".aiw-actions");
    if (!actions || actions.querySelector('[data-action="operations-check"]')) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "aiw-secondary";
    button.dataset.action = "operations-check";
    button.textContent = "Betrieb prüfen";
    button.addEventListener("click", runOperations);
    const advanced = actions.querySelector('[data-action="advanced"]');
    actions.insertBefore(button, advanced || null);
  }

  function install() {
    installButton();
    const observer = new MutationObserver(installButton);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    [100, 400, 900, 1800].forEach((delay) => setTimeout(installButton, delay));
    if (window.ElyonAIWorkforceV2) window.ElyonAIWorkforceV2.runOperations = runOperations;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
