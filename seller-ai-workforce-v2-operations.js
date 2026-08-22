(() => {
  "use strict";

  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const TASKS_KEY = "elyon_ai_workforce_tasks";
  const API = "/api/ai-workforce-v2";
  const SPECIALIST_IDS = [
    "elyon-product-data-specialist",
    "elyon-compliance-specialist",
    "elyon-profit-specialist",
    "elyon-listing-specialist",
    "elyon-draft-quality-guard",
    "elyon-order-specialist",
    "elyon-customer-support-specialist",
  ];

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

  function text(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function collection(keys) {
    for (const key of keys) {
      const value = readJson(key, null);
      if (Array.isArray(value) && value.length) return value;
      if (value && typeof value === "object" && Array.isArray(value.items) && value.items.length) return value.items;
      if (value && typeof value === "object" && Array.isArray(value.products) && value.products.length) return value.products;
    }
    return [];
  }

  function tasks() {
    const value = readJson(TASKS_KEY, []);
    return Array.isArray(value) ? value : [];
  }

  function upsertTask(task) {
    if (!task?.id) return;
    const list = tasks();
    const index = list.findIndex((entry) => entry?.id === task.id);
    if (index >= 0) list[index] = { ...list[index], ...task };
    else list.unshift(task);
    writeJson(TASKS_KEY, list.slice(0, 150));
    window.dispatchEvent(new CustomEvent("elyon:ai-workforce-v2-task-updated", { detail: task }));
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

  function managerSettings() {
    const settings = readJson(SETTINGS_KEY, {});
    return { settings, manager: settings.agents?.["elyon-manager"] || {} };
  }

  function managerAvailable(manager) {
    return !(manager.paused || manager.enabled === false || manager.active === false || Number(manager.autonomyLevel) === 0);
  }

  function delegationAllowlist(settings) {
    const agents = settings.agents && typeof settings.agents === "object" ? settings.agents : {};
    return SPECIALIST_IDS.filter((agentId) => {
      const agent = agents[agentId] || {};
      const enabled = !(agent.paused || agent.enabled === false || agent.active === false || Number(agent.autonomyLevel) === 0);
      const dailyLimit = Number(agent.dailyLimit || 0);
      const todayUsage = Number(agent.todayUsage || 0);
      return enabled && !(dailyLimit > 0 && todayUsage >= dailyLimit);
    });
  }

  function selectedProduct(products) {
    const selectedId = text(window.elyonSelectedProductId || localStorage.getItem("elyonSelectedProductId") || localStorage.getItem("elyon_active_product_id"));
    if (selectedId) {
      const match = products.find((item) => [item?.id, item?.productId, item?.sku].map(text).includes(selectedId));
      if (match) return match;
    }
    return products.find((item) => ["ready_for_seller_tool", "bereit_manuell_einstellen"].includes(item?.status)) || products[0] || {};
  }

  function workflowContext(workflowType) {
    const products = collection(["elyonProducts", "elyonSellerProducts", "sellerProductMaster", "elyonProductMaster"]);
    const orders = collection(["elyonOrders", "ebayOrders", "elyonSales"]);
    const returns = collection(["elyonReturns", "elyonShopifyReturns", "ebayReturns"]);
    if (workflowType === "operations") {
      return {
        sourceId: text(orders[0]?.id || orders[0]?.orderId || returns[0]?.id || returns[0]?.returnId),
        input: {
          order: orders[0] || {},
          returnCase: returns[0] || {},
          orders,
          returns,
          context: { orders, returns },
        },
      };
    }
    const product = selectedProduct(products);
    return {
      sourceId: text(product?.id || product?.productId || product?.sku),
      input: {
        product,
        context: { products, orders, returns, tasks: tasks() },
      },
    };
  }

  function persistDelegatedUsage(childTasks) {
    if (!Array.isArray(childTasks) || !childTasks.length) return;
    const settings = readJson(SETTINGS_KEY, {});
    settings.agents = settings.agents && typeof settings.agents === "object" ? settings.agents : {};
    const now = new Date().toISOString();
    childTasks.forEach((task) => {
      const agent = settings.agents[task.agentId];
      if (!agent) return;
      agent.lastRun = now;
      agent.lastResult = task.result?.summary || task.errors?.[0] || task.status || "Manager-Delegation abgeschlossen";
      if (task.provider && task.provider !== "local") agent.todayUsage = Number(agent.todayUsage || 0) + 0.01;
    });
    writeJson(SETTINGS_KEY, settings);
  }

  async function runManagerWorkflow(workflowType, { autoDelegate = false } = {}) {
    const { settings, manager } = managerSettings();
    if (!managerAvailable(manager)) {
      toast("Der Elyon Manager ist pausiert oder ausgeschaltet.");
      return;
    }
    if (autoDelegate && Number(manager.autonomyLevel) < 3) {
      toast("Für automatische interne Delegation muss der Elyon Manager auf Autonomiestufe 3 stehen.");
      return;
    }

    const context = workflowContext(workflowType);
    if (autoDelegate && workflowType === "product" && !Object.keys(context.input.product || {}).length) {
      toast("Kein Produkt für das Produktteam gefunden.");
      return;
    }
    if (autoDelegate && workflowType === "operations" && !(context.input.orders.length || context.input.returns.length)) {
      toast("Keine Order oder Retoure für eine Betriebsdelegation gefunden.");
      return;
    }

    const now = new Date().toISOString();
    const temporaryId = `ai-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const workflowId = `elyon-workflow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const title = workflowType === "operations"
      ? `Elyon Manager · ${autoDelegate ? "Betrieb delegieren" : "Betrieb prüfen"}`
      : `Elyon Manager · ${autoDelegate ? "Produktteam ausführen" : "Produktworkflow prüfen"}`;
    const temporary = {
      id: temporaryId,
      agentId: "elyon-manager",
      type: "workflow_orchestration",
      title,
      sourceType: workflowType,
      sourceId: context.sourceId,
      priority: "critical",
      status: "analyzing",
      provider: "local",
      model: autoDelegate ? "manager-orchestrator-v1" : "deterministic-orchestrator-v2",
      workflowId,
      result: null,
      warnings: [],
      errors: [],
      createdAt: now,
      updatedAt: now,
    };
    upsertTask(temporary);

    try {
      const response = await fetch(API, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_manager",
          workflowType,
          autoDelegate,
          taskId: temporaryId,
          workflowId,
          title,
          sourceId: context.sourceId,
          goal: workflowType === "operations" ? "Offene Seller-Vorgänge intern prüfen und priorisieren" : "Ausgewähltes Produkt intern vollständig prüfen",
          input: context.input,
          tasks: tasks(),
          allowedAgentIds: delegationAllowlist(settings),
          agent: {
            provider: manager.provider || "local",
            model: manager.model || "",
            allowFallback: manager.allowFallback !== false,
            maxTokens: manager.maxTokens || 4000,
            autonomyLevel: Number(manager.autonomyLevel || 0),
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.task) {
        upsertTask({ ...temporary, status: "failed", errors: [data.message || data.error || `HTTP ${response.status}`], updatedAt: new Date().toISOString() });
        toast(data.message || "Manager-Workflow fehlgeschlagen.");
        return;
      }

      (Array.isArray(data.childTasks) ? data.childTasks : []).forEach(upsertTask);
      persistDelegatedUsage(data.childTasks);
      upsertTask({ ...data.task, id: temporaryId, agentId: "elyon-manager", title, createdAt: now, updatedAt: new Date().toISOString() });

      const nextSettings = readJson(SETTINGS_KEY, {});
      if (nextSettings.agents?.["elyon-manager"]) {
        nextSettings.agents["elyon-manager"].lastRun = new Date().toISOString();
        nextSettings.agents["elyon-manager"].lastResult = data.task.result?.summary || "Manager-Workflow abgeschlossen";
        writeJson(SETTINGS_KEY, nextSettings);
      }

      if (autoDelegate) {
        const status = data.workflow?.status || data.task.result?.status;
        toast(status === "manual_approval_required"
          ? "Elyon Manager: Teamlauf fertig – finale manuelle Freigabe nötig."
          : status === "blocked"
            ? "Elyon Manager: Teamlauf an einem Blocker gestoppt."
            : "Elyon Manager: Teamlauf wartet auf deine Prüfung.");
      } else {
        toast("Elyon Manager: Workflow wurde geprüft.");
      }
    } catch (error) {
      upsertTask({ ...temporary, status: "failed", errors: [error?.message || "Netzwerkfehler"], updatedAt: new Date().toISOString() });
      toast("Elyon Manager konnte den Workflow nicht ausführen.");
    }
  }

  function runOperations() {
    const { manager } = managerSettings();
    return runManagerWorkflow("operations", { autoDelegate: Number(manager.autonomyLevel) >= 3 });
  }

  function runProductTeam() {
    return runManagerWorkflow("product", { autoDelegate: true });
  }

  function installButtons() {
    const card = document.querySelector('[data-agent-id="elyon-manager"]');
    const actions = card?.querySelector(".aiw-actions");
    if (!actions) return;
    const { manager } = managerSettings();
    const canDelegate = managerAvailable(manager) && Number(manager.autonomyLevel) >= 3;

    let productButton = actions.querySelector('[data-action="product-team"]');
    if (!productButton) {
      productButton = document.createElement("button");
      productButton.type = "button";
      productButton.className = "aiw-secondary";
      productButton.dataset.action = "product-team";
      productButton.addEventListener("click", runProductTeam);
      const advanced = actions.querySelector('[data-action="advanced"]');
      actions.insertBefore(productButton, advanced || null);
    }
    productButton.textContent = "Produktteam ausführen";
    productButton.disabled = !canDelegate;
    productButton.title = canDelegate ? "Manager delegiert intern an die Produkt-Fachagenten." : "Autonomiestufe 3 · interne Delegation erforderlich.";

    let operationsButton = actions.querySelector('[data-action="operations-check"]');
    if (!operationsButton) {
      operationsButton = document.createElement("button");
      operationsButton.type = "button";
      operationsButton.className = "aiw-secondary";
      operationsButton.dataset.action = "operations-check";
      operationsButton.addEventListener("click", runOperations);
      const advanced = actions.querySelector('[data-action="advanced"]');
      actions.insertBefore(operationsButton, advanced || null);
    }
    operationsButton.textContent = Number(manager.autonomyLevel) >= 3 ? "Betrieb delegieren" : "Betrieb prüfen";
    operationsButton.title = Number(manager.autonomyLevel) >= 3 ? "Order/Support intern delegieren." : "Nur Betriebsworkflow prüfen; keine Delegation.";
  }

  function install() {
    installButtons();
    const observer = new MutationObserver(installButtons);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    [100, 400, 900, 1800].forEach((delay) => setTimeout(installButtons, delay));
    window.addEventListener("elyon:ai-workforce-routing-updated", installButtons);
    window.addEventListener("elyon:ai-agent-resource-settings-changed", installButtons);
    if (window.ElyonAIWorkforceV2) {
      window.ElyonAIWorkforceV2.runOperations = runOperations;
      window.ElyonAIWorkforceV2.runProductTeam = runProductTeam;
      window.ElyonAIWorkforceV2.runManagerWorkflow = runManagerWorkflow;
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
