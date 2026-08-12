(() => {
  "use strict";

  if (window.__elyonManagerOrchestratorV1Installed) return;
  window.__elyonManagerOrchestratorV1Installed = true;

  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const TASKS_KEY = "elyon_ai_workforce_tasks";
  const WORKFLOWS_KEY = "elyon_ai_manager_workflows_v1";
  const PANEL_ID = "elyonManagerOrchestratorV1Panel";
  const AUTONOMY_ID = "elyonManagerAutonomyV1Panel";
  const STYLE_ID = "elyonManagerOrchestratorV1Styles";
  const MAX_TASKS = 150;
  const MAX_WORKFLOWS = 40;
  const MAX_DEPTH = 3;
  const MAX_AGENT_RUNS = 7;
  const MAX_RETRIES = 1;
  const AGENT_TIMEOUT_MS = 35000;
  const FAILURE_COOLDOWN_MS = 30000;

  const MANAGER = { visibleId: "elyon-manager", backendId: "elyon-operations-manager", name: "Elyon Manager", action: "create_daily_briefing" };
  const AGENTS = {
    "elyon-product-data-checker": { visibleId: "elyon-product-data-specialist", name: "Produktdaten-Check", action: "analyze_product", context: "product", provider: "local", stopOnBlocker: true },
    "elyon-compliance-guard": { visibleId: "elyon-compliance-specialist", name: "Compliance Guard", action: "analyze_product", context: "product", provider: "deepseek", stopOnBlocker: true },
    "elyon-profit-analyst": { visibleId: "elyon-profit-specialist", name: "Profit Analyst", action: "analyze_product", context: "product", provider: "openai", stopOnBlocker: true },
    "elyon-listing-pro": { visibleId: "elyon-listing-specialist", name: "Listing Pro", action: "analyze_listing", context: "product", provider: "deepseek", stopOnBlocker: true },
    "elyon-order-coordinator": { visibleId: "elyon-order-specialist", name: "Order Coordinator", action: "analyze_order", context: "order", provider: "deepseek", stopOnBlocker: false },
    "elyon-support-assistant": { visibleId: "elyon-customer-support-specialist", name: "Support Assistant", action: "analyze_return", context: "return", provider: "openai", stopOnBlocker: false },
  };
  const PRODUCT_FLOW = ["elyon-product-data-checker", "elyon-compliance-guard", "elyon-profit-analyst", "elyon-listing-pro"];
  const OPERATIONS_FLOW = ["elyon-order-coordinator", "elyon-support-assistant"];
  const EVENT_FLOW = {
    "product-approved": { level2: ["elyon-compliance-guard"], level3: PRODUCT_FLOW },
    "listing-updated": { level2: ["elyon-listing-pro"], level3: ["elyon-compliance-guard", "elyon-profit-analyst", "elyon-listing-pro"] },
    "new-order": { level2: ["elyon-order-coordinator"], level3: ["elyon-order-coordinator"] },
    "return-created": { level2: ["elyon-support-assistant"], level3: ["elyon-support-assistant"] },
  };
  const LEGACY_TRIGGER_AGENT = {
    "product-approved": "elyon-compliance-guard",
    "listing-updated": "elyon-listing-pro",
    "new-order": "elyon-order-coordinator",
    "return-created": "elyon-support-assistant",
  };

  const state = { running: false, renderQueued: false };
  const text = (value, fallback = "") => value === null || value === undefined ? fallback : String(value).trim();
  const escapeHtml = (value) => text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const nowIso = () => new Date().toISOString();

  function readJson(key, fallback) {
    try { const value = JSON.parse(localStorage.getItem(key) || "null"); return value === null ? fallback : value; }
    catch { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  }

  function plainObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function finite(value, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, finite(value, min))); }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .elyon-manager-summary{grid-column:1/-1;margin-top:12px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.elyon-manager-kpi{padding:8px 9px;border-radius:10px;background:rgba(2,6,23,.32);border:1px solid rgba(148,163,184,.11)}.elyon-manager-kpi strong{display:block;font-size:13px;color:#eef6ff}.elyon-manager-kpi small{display:block;margin-top:2px;color:#7f93aa;font-size:8px}.elyon-manager-approval{grid-column:1/-1;margin-top:10px;padding:11px;border-radius:12px;background:rgba(245,158,11,.055);border:1px solid rgba(245,158,11,.15)}.elyon-manager-approval h4{margin:0 0 7px;font-size:10px}.elyon-manager-approval-list{display:grid;gap:6px}.elyon-manager-approval-row{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px;border-radius:9px;background:rgba(2,6,23,.34)}.elyon-manager-approval-row strong{font-size:9px}.elyon-manager-approval-row small{display:block;color:#8fa2b8;font-size:8px;margin-top:2px}.elyon-manager-priority{padding:3px 6px;border-radius:999px;font-size:7px;font-weight:900;background:rgba(148,163,184,.1)}.elyon-manager-priority.critical{color:#fecaca;background:rgba(239,68,68,.14)}.elyon-manager-priority.high{color:#fde68a;background:rgba(245,158,11,.12)}.elyon-manager-panel{position:fixed;inset:0;z-index:22000;background:rgba(2,6,23,.86);backdrop-filter:blur(8px);display:flex;justify-content:flex-end}.elyon-manager-panel-inner{width:min(760px,100%);height:100%;overflow:auto;background:#0b1422;border-left:1px solid rgba(148,163,184,.17);padding:20px;color:#e8eef7}.elyon-manager-panel-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding-bottom:13px;border-bottom:1px solid rgba(148,163,184,.13)}.elyon-manager-panel-head h2{margin:0;font-size:19px}.elyon-manager-panel-head p{margin:5px 0 0;color:#8fa2b8;font-size:10px;line-height:1.5}.elyon-manager-section{padding:14px 0;border-bottom:1px solid rgba(148,163,184,.1)}.elyon-manager-section h3{margin:0 0 9px;font-size:11px}.elyon-manager-actions{display:flex;gap:7px;flex-wrap:wrap}.elyon-manager-actions button{padding:8px 10px;border-radius:9px;font-size:9px}.elyon-manager-primary{background:linear-gradient(135deg,#2563eb,#3b82f6)!important;color:#fff!important;border-color:transparent!important}.elyon-manager-form{display:grid;gap:9px}.elyon-manager-field{display:grid;gap:5px}.elyon-manager-field span{font-size:9px;color:#aebdce;font-weight:800}.elyon-manager-field select,.elyon-manager-field textarea{background:#07101d;border:1px solid rgba(148,163,184,.16);border-radius:10px;color:#e8eef7;padding:10px}.elyon-manager-field textarea{min-height:110px;resize:vertical}.elyon-manager-note{padding:9px 10px;border-radius:10px;background:rgba(37,99,235,.07);border:1px solid rgba(96,165,250,.14);font-size:9px;color:#a8bbcf;line-height:1.5}.elyon-manager-workflow{padding:9px 10px;border-radius:10px;background:rgba(2,6,23,.35);border:1px solid rgba(148,163,184,.1);margin-bottom:6px}.elyon-manager-workflow strong{font-size:9px}.elyon-manager-workflow small{display:block;color:#8194aa;font-size:8px;margin-top:3px}.elyon-manager-progress{min-height:24px;font-size:9px;color:#a8bbcf}.elyon-manager-autonomy-options{display:grid;gap:7px}.elyon-manager-autonomy-option{display:flex;gap:9px;align-items:flex-start;padding:9px;border-radius:10px;background:rgba(2,6,23,.34);border:1px solid rgba(148,163,184,.1)}.elyon-manager-autonomy-option input{margin-top:2px}.elyon-manager-autonomy-option strong{font-size:9px}.elyon-manager-autonomy-option small{display:block;color:#8194aa;font-size:8px;margin-top:2px;line-height:1.4}@media(max-width:720px){.elyon-manager-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.elyon-manager-approval-row{align-items:flex-start;flex-direction:column}.elyon-manager-panel-inner{padding:15px}}
    `;
    document.head.appendChild(style);
  }

  function tasks() { const value = readJson(TASKS_KEY, []); return Array.isArray(value) ? value : []; }
  function workflows() { const value = readJson(WORKFLOWS_KEY, []); return Array.isArray(value) ? value : []; }
  function saveWorkflows(value) { writeJson(WORKFLOWS_KEY, (Array.isArray(value) ? value : []).slice(0, MAX_WORKFLOWS)); }

  function upsertTask(task) {
    if (!task?.id) return;
    const list = tasks();
    const index = list.findIndex((entry) => entry?.id === task.id);
    if (index >= 0) list[index] = { ...list[index], ...task, updatedAt: task.updatedAt || nowIso() };
    else list.unshift(task);
    writeJson(TASKS_KEY, list.slice(0, MAX_TASKS));
    window.dispatchEvent(new CustomEvent("elyon:ai-workforce-v2-task-updated", { detail: task }));
  }

  function upsertWorkflow(workflow) {
    const list = workflows();
    const index = list.findIndex((entry) => entry?.workflowId === workflow.workflowId);
    if (index >= 0) list[index] = { ...list[index], ...workflow };
    else list.unshift(workflow);
    saveWorkflows(list);
    window.dispatchEvent(new CustomEvent("elyon:ai-manager-workflow-updated", { detail: workflow }));
  }

  function backendForVisible(id) {
    if (id === MANAGER.visibleId || id === MANAGER.backendId) return MANAGER.backendId;
    return Object.entries(AGENTS).find(([, definition]) => definition.visibleId === id)?.[0] || id;
  }

  function visibleForBackend(id) {
    if (id === MANAGER.backendId) return MANAGER.visibleId;
    return AGENTS[id]?.visibleId || id;
  }

  function sanitizeAutonomy() {
    const settings = plainObject(readJson(SETTINGS_KEY, {}));
    settings.agents = { ...plainObject(settings.agents) };
    const modeToLevel = { off: 0, manual: 1, assisted: 2, semi: 3, auto_internal: 3, auto_external: 3 };
    const levelToMode = ["off", "manual", "assisted", "semi"];
    const ids = [MANAGER.backendId, MANAGER.visibleId, ...Object.keys(AGENTS), ...Object.values(AGENTS).map((agent) => agent.visibleId)];
    ids.forEach((id) => {
      const current = plainObject(settings.agents[id]);
      const rawMode = text(current.autonomyMode || current.autonomy?.mode).toLowerCase();
      const rawLevel = current.autonomyLevel;
      const level = Math.round(clamp(rawMode in modeToLevel ? modeToLevel[rawMode] : rawLevel ?? 1, 0, 3));
      settings.agents[id] = {
        ...current,
        autonomyLevel: level,
        autonomyMode: levelToMode[level],
        autonomy: {
          ...plainObject(current.autonomy),
          mode: levelToMode[level],
          permissions: {
            ...plainObject(current.autonomy?.permissions),
            publishListing: false,
            updateLivePrice: false,
            placeSupplierOrder: false,
            sendCustomerMessage: false,
            issueRefund: false,
            deleteProduct: false,
            changeLegalData: false,
          },
        },
        externalAutomationUnlocked: false,
      };
    });
    settings.maxAutonomyLevel = 3;
    settings.externalActionsLocked = true;
    writeJson(SETTINGS_KEY, settings);
    return settings;
  }

  function agentSettings(id) {
    const settings = sanitizeAutonomy();
    const backendId = backendForVisible(id);
    const visibleId = visibleForBackend(backendId);
    const source = plainObject(settings.agents[backendId] || settings.agents[visibleId]);
    return {
      id: backendId,
      visibleId,
      active: source.active !== false && source.enabled !== false && source.paused !== true,
      autonomyLevel: Math.round(clamp(source.autonomyLevel ?? 1, 0, 3)),
      provider: text(source.provider, backendId === "elyon-product-data-checker" ? "local" : AGENTS[backendId]?.provider || "deepseek"),
      model: text(source.model),
      allowFallback: source.allowFallback !== false,
      temperature: clamp(source.temperature ?? 0.2, 0, 2),
      maxTokens: Math.round(clamp(source.maxTokens ?? 4000, 200, 12000)),
      dailyLimit: Math.max(0, finite(source.dailyLimit, 0)),
      todayUsage: Math.max(0, finite(source.todayUsage, 0)),
      cooldownUntil: text(source.cooldownUntil),
    };
  }

  function updateUsage(id, task) {
    const settings = sanitizeAutonomy();
    const backendId = backendForVisible(id);
    const visibleId = visibleForBackend(backendId);
    const targetIds = [backendId, visibleId];
    const external = text(task?.provider).toLowerCase() && text(task?.provider).toLowerCase() !== "local";
    const costDelta = external ? 0.01 : 0;
    const totalTokens = finite(task?.usage?.total_tokens ?? task?.usage?.totalTokens, 0);
    targetIds.forEach((targetId) => {
      const current = plainObject(settings.agents[targetId]);
      settings.agents[targetId] = {
        ...current,
        lastRun: nowIso(),
        lastResult: text(task?.result?.summary, "Analyse abgeschlossen"),
        todayUsage: Math.max(0, finite(current.todayUsage, 0) + costDelta),
        todayRuns: Math.max(0, finite(current.todayRuns, 0) + 1),
        todayTokens: Math.max(0, finite(current.todayTokens, 0) + totalTokens),
      };
    });
    settings.globalTodayUsage = Math.max(0, finite(settings.globalTodayUsage, 0) + costDelta);
    writeJson(SETTINGS_KEY, settings);
  }

  function collection(keys) {
    for (const key of keys) {
      const value = readJson(key, null);
      if (Array.isArray(value) && value.length) return value;
      if (Array.isArray(value?.items) && value.items.length) return value.items;
      if (Array.isArray(value?.products) && value.products.length) return value.products;
    }
    return [];
  }

  function selectedProduct(products) {
    const selectedId = text(window.elyonSelectedProductId || localStorage.getItem("elyonSelectedProductId") || localStorage.getItem("elyon_active_product_id"));
    return products.find((item) => selectedId && [item?.id, item?.productId, item?.sku].map(text).includes(selectedId)) || products.find((item) => ["ready_for_seller_tool", "bereit_manuell_einstellen"].includes(text(item?.status).toLowerCase())) || products[0] || {};
  }

  function orderSummary(order = {}) {
    return { id: order.id || order.orderId || order.ebayOrderId || "", orderId: order.orderId || order.id || order.ebayOrderId || "", status: order.status || order.orderStatus || "", orderDate: order.orderDate || order.createdAt || "", shippingDeadline: order.shippingDeadline || order.shipByDate || "", trackingNumber: order.trackingNumber || order.tracking || "", total: order.total || order.totalAmount || "", currency: order.currency || "EUR", items: Array.isArray(order.items) ? order.items.slice(0, 20) : [] };
  }

  function returnSummary(item = {}) {
    return { id: item.id || item.returnId || "", returnId: item.returnId || item.id || "", orderId: item.orderId || item.ebayOrderId || "", status: item.status || "", reason: item.reason || item.returnReason || item.issue || "", customerMessage: item.customerMessage || item.message || "", requestedResolution: item.requestedResolution || item.resolution || "", createdAt: item.createdAt || item.date || "", amount: item.amount || item.refundAmount || "" };
  }

  function dataset() {
    const products = collection(["elyonProducts", "elyonSellerProducts", "sellerProductMaster", "elyonProductMaster"]);
    const orders = collection(["elyonOrders", "ebayOrders", "elyonSales"]).map(orderSummary);
    const returns = collection(["elyonReturns", "elyonShopifyReturns", "ebayReturns"]).map(returnSummary);
    const invoices = collection(["elyonInvoices", "sellerInvoices"]);
    return { products, product: selectedProduct(products), orders, order: orders[0] || {}, returns, returnCase: returns[0] || {}, invoices, tasks: tasks(), agentResults: tasks().filter((task) => task?.result) };
  }

  function stableSerialize(value, depth = 0) {
    if (depth > 4) return "null";
    if (value === null || value === undefined) return "null";
    if (["string", "number", "boolean"].includes(typeof value)) return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.slice(0, 40).map((entry) => stableSerialize(entry, depth + 1)).join(",")}]`;
    if (typeof value !== "object") return "null";
    return `{${Object.keys(value).sort().slice(0, 80).map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key], depth + 1)}`).join(",")}}`;
  }

  function fingerprint(value) {
    const raw = stableSerialize(value);
    let hash = 2166136261;
    for (let index = 0; index < raw.length; index += 1) hash = Math.imul(hash ^ raw.charCodeAt(index), 16777619);
    return (hash >>> 0).toString(36);
  }

  function contextForAgent(agentId, data) {
    const definition = AGENTS[agentId];
    if (definition?.context === "product") return { product: data.product || {} };
    if (definition?.context === "order") return { order: data.order || {} };
    if (definition?.context === "return") return { returnCase: data.returnCase || {} };
    return { context: data };
  }

  function sourceId(agentId, context) {
    if (AGENTS[agentId]?.context === "product") return text(context.product?.productId || context.product?.id || context.product?.sku);
    if (AGENTS[agentId]?.context === "order") return text(context.order?.orderId || context.order?.id || context.order?.ebayOrderId);
    if (AGENTS[agentId]?.context === "return") return text(context.returnCase?.returnId || context.returnCase?.id);
    return "operations";
  }

  function makeDedupeKey(agentId, action, source, context) { return `${agentId}:${action}:${source || "no-source"}:${fingerprint(context)}`; }

  function outcome(task) {
    const status = text(task?.status).toLowerCase();
    const result = text(task?.result?.status).toLowerCase();
    if (["failed", "blocked", "rejected"].includes(status) || result === "blocked") return "blocked";
    if (["queued", "analyzing", "running"].includes(status)) return "running";
    if (["passed", "completed", "approved"].includes(result) || ["completed", "approved"].includes(status)) return "completed";
    if (["warning", "manualreviewrequired"].includes(result) || ["approval_required", "draft_ready"].includes(status)) return "review";
    return "pending";
  }

  function approvalRequired(task) {
    const agentId = text(task?.agentId);
    const blockers = Array.isArray(task?.result?.blockers) ? task.result.blockers.filter(Boolean) : [];
    const missing = Array.isArray(task?.result?.missingFacts) ? task.result.missingFacts.filter(Boolean) : [];
    if (agentId === "elyon-listing-pro" || agentId === "elyon-support-assistant") return true;
    if (agentId === "elyon-compliance-guard") return outcome(task) === "blocked" || blockers.length > 0 || missing.length > 0;
    if (agentId === "elyon-profit-analyst") return task?.result?.generatedContent?.calculation?.passesMinimum === false || outcome(task) === "blocked" || missing.length > 0;
    if (agentId === "elyon-product-data-checker") return outcome(task) === "blocked";
    return false;
  }

  function priority(task) {
    const agentId = text(task?.agentId);
    const blockers = Array.isArray(task?.result?.blockers) ? task.result.blockers.filter(Boolean) : [];
    const warnings = Array.isArray(task?.result?.warnings) ? task.result.warnings.filter(Boolean) : [];
    const missing = Array.isArray(task?.result?.missingFacts) ? task.result.missingFacts.filter(Boolean) : [];
    if (outcome(task) === "blocked" && agentId === "elyon-order-coordinator") return "critical";
    if (outcome(task) === "blocked" || blockers.length || approvalRequired(task)) return "high";
    if (warnings.length || missing.length) return "medium";
    return "low";
  }

  function normalizeTask(task, meta = {}) {
    const needsApproval = approvalRequired(task);
    let status = text(task?.status, "completed");
    if (!needsApproval && ["approval_required", "draft_ready"].includes(status) && ["completed", "review"].includes(outcome(task))) status = "completed";
    return { ...task, ...meta, status, approvalRequired: needsApproval, managerPriority: priority(task) };
  }

  function reusableTask(dedupeKey) {
    return tasks().find((task) => task?.dedupeKey === dedupeKey && task?.result && !["failed", "rejected"].includes(text(task.status).toLowerCase())) || null;
  }

  function settingsGate(agentId, requiredLevel) {
    const agent = agentSettings(agentId);
    if (!agent.active) return { ok: false, agent, message: `${AGENTS[agentId]?.name || "Mitarbeiter"} ist pausiert.` };
    if (agent.autonomyLevel < requiredLevel) return { ok: false, agent, message: `${AGENTS[agentId]?.name || "Mitarbeiter"} benötigt Autonomiestufe ${requiredLevel}.` };
    if (agent.dailyLimit > 0 && agent.todayUsage >= agent.dailyLimit) return { ok: false, agent, message: `${AGENTS[agentId]?.name || "Mitarbeiter"}: Tageslimit erreicht.` };
    if (agent.cooldownUntil && Date.parse(agent.cooldownUntil) > Date.now()) return { ok: false, agent, message: `${AGENTS[agentId]?.name || "Mitarbeiter"} ist nach einem Fehler kurz im Cooldown.` };
    const settings = sanitizeAutonomy();
    const globalLimit = Math.max(0, finite(settings.globalDailyLimit, 0));
    const globalUsage = Math.max(0, finite(settings.globalTodayUsage, 0));
    if (globalLimit > 0 && globalUsage >= globalLimit) return { ok: false, agent, message: "Globales KI-Tageslimit erreicht." };
    return { ok: true, agent };
  }

  function setCooldown(agentId) {
    const settings = sanitizeAutonomy();
    const backendId = backendForVisible(agentId);
    const visibleId = visibleForBackend(backendId);
    const until = new Date(Date.now() + FAILURE_COOLDOWN_MS).toISOString();
    [backendId, visibleId].forEach((id) => { settings.agents[id] = { ...plainObject(settings.agents[id]), cooldownUntil: until }; });
    writeJson(SETTINGS_KEY, settings);
  }

  function withTimeout(promise, timeoutMs = AGENT_TIMEOUT_MS) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Agentenlauf hat das Zeitlimit erreicht.")), timeoutMs); }),
    ]).finally(() => clearTimeout(timer));
  }

  async function callAgent(agentId, context, workflow, stepIndex, requiredLevel) {
    const definition = AGENTS[agentId];
    const gate = settingsGate(agentId, requiredLevel);
    const source = sourceId(agentId, context);
    const dedupeKey = makeDedupeKey(agentId, definition.action, source, context);
    const meta = { workflowId: workflow.workflowId, parentTaskId: workflow.parentTaskId, workflowDepth: workflow.depth + 1, workflowStep: stepIndex + 1, dedupeKey };

    const duplicate = reusableTask(dedupeKey);
    if (duplicate) {
      const reused = normalizeTask(duplicate, { ...meta, reused: true });
      workflow.auditLog.push({ at: nowIso(), event: "agent_reused", agentId, taskId: reused.id, reason: "Identische Analyse bereits vorhanden." });
      return reused;
    }

    if (!gate.ok) {
      const blocked = normalizeTask({
        id: `ai-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        agentId,
        type: "workflow_guard",
        title: `${definition.name} · nicht gestartet`,
        sourceType: "workflow",
        sourceId: source,
        priority: "high",
        status: "blocked",
        provider: gate.agent.provider,
        model: gate.agent.model,
        inputSnapshot: context,
        result: { summary: gate.message, status: "blocked", confidence: 1, findings: [], recommendations: ["Mitarbeiterstatus, Autonomie oder Tageslimit prüfen."], missingFacts: [], warnings: [], blockers: [gate.message], suggestedActions: [], generatedContent: {}, assumptions: [] },
        warnings: [], errors: [], createdAt: nowIso(), updatedAt: nowIso(),
      }, meta);
      upsertTask(blocked);
      workflow.auditLog.push({ at: nowIso(), event: "agent_policy_block", agentId, reason: gate.message });
      return blocked;
    }

    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      workflow.agentRuns += 1;
      workflow.auditLog.push({ at: nowIso(), event: "agent_started", agentId, attempt: attempt + 1, reason: workflow.managerInstruction || workflow.workflowType });
      try {
        const response = await withTimeout(fetch("/api/ai-agent-run", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: definition.action,
            agentId,
            title: `${workflow.title} · ${definition.name}`,
            priority: workflow.priority,
            sourceId: source,
            input: context,
            agent: { provider: gate.agent.provider, model: gate.agent.model, allowFallback: gate.agent.allowFallback, temperature: gate.agent.temperature, maxTokens: gate.agent.maxTokens },
          }),
        }));
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.task) throw Object.assign(new Error(payload.message || payload.error || `HTTP ${response.status}`), { retryable: response.status >= 500 });
        const task = normalizeTask(payload.task, { ...meta, retryCount: attempt });
        upsertTask(task);
        updateUsage(agentId, task);
        workflow.auditLog.push({ at: nowIso(), event: "agent_completed", agentId, taskId: task.id, result: task.result?.status || task.status, approvalRequired: task.approvalRequired });
        return task;
      } catch (error) {
        lastError = error;
        workflow.auditLog.push({ at: nowIso(), event: attempt < MAX_RETRIES && error.retryable !== false ? "agent_retry" : "agent_failed", agentId, attempt: attempt + 1, reason: text(error?.message, "Agentenlauf fehlgeschlagen.") });
        if (attempt >= MAX_RETRIES || error.retryable === false) break;
      }
    }

    setCooldown(agentId);
    const failed = normalizeTask({
      id: `ai-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agentId,
      type: "workflow_failure",
      title: `${definition.name} · fehlgeschlagen`,
      sourceType: "workflow",
      sourceId: source,
      priority: "high",
      status: "failed",
      provider: gate.agent.provider,
      model: gate.agent.model,
      inputSnapshot: context,
      result: null,
      warnings: [],
      errors: [text(lastError?.message, "Agentenlauf fehlgeschlagen.")],
      createdAt: nowIso(), updatedAt: nowIso(),
    }, meta);
    upsertTask(failed);
    return failed;
  }

  function workflowSteps(type, data, eventType = "", executionMode = "manual") {
    if (eventType && EVENT_FLOW[eventType]) return executionMode === "event_level_3" ? EVENT_FLOW[eventType].level3.slice() : EVENT_FLOW[eventType].level2.slice();
    if (type === "product") return PRODUCT_FLOW.slice();
    if (type === "operations") {
      const result = [];
      if (data.orders.length) result.push("elyon-order-coordinator");
      if (data.returns.length) result.push("elyon-support-assistant");
      return result;
    }
    if (type === "seller") {
      const result = [];
      if (data.product && Object.keys(data.product).length) result.push(...PRODUCT_FLOW);
      if (data.orders.length) result.push("elyon-order-coordinator");
      if (data.returns.length) result.push("elyon-support-assistant");
      return [...new Set(result)].slice(0, MAX_AGENT_RUNS - 1);
    }
    return [];
  }

  function managerDecision(childTasks) {
    const list = childTasks.map((task) => normalizeTask(task));
    const approvals = list.filter((task) => task.approvalRequired).map((task) => ({ taskId: task.id, workflowId: task.workflowId, agentId: task.agentId, type: task.agentId === "elyon-listing-pro" ? "Listing-Freigabe" : task.agentId === "elyon-support-assistant" ? "Kundenantwort / Retoure" : task.agentId === "elyon-compliance-guard" ? "Compliance-Fall" : task.agentId === "elyon-profit-analyst" ? "Preis-/Margenentscheidung" : "Freigabe", priority: priority(task), title: task.title, summary: text(task.result?.summary), blockers: Array.isArray(task.result?.blockers) ? task.result.blockers : [], warnings: Array.isArray(task.result?.warnings) ? task.result.warnings : [] }));
    const blockers = [...new Set(list.flatMap((task) => Array.isArray(task.result?.blockers) ? task.result.blockers.filter(Boolean) : []))];
    const attention = list.filter((task) => !task.approvalRequired && ["critical", "high", "medium"].includes(priority(task))).map((task) => ({ taskId: task.id, agentId: task.agentId, priority: priority(task), title: task.title, summary: text(task.result?.summary) }));
    const automatedDone = list.filter((task) => !task.approvalRequired && outcome(task) === "completed").map((task) => ({ taskId: task.id, agentId: task.agentId, title: task.title, summary: text(task.result?.summary) }));
    return { status: blockers.length ? "blocked" : approvals.length ? "approval_required" : attention.length ? "attention" : "completed", approvals, blockers, attention, automatedDone };
  }

  function deterministicBriefing(childTasks, decision) {
    const buckets = { critical: [], high: [], medium: [], low: [] };
    childTasks.forEach((task) => { const p = priority(task); const summary = text(task.result?.summary || task.title); if (summary) buckets[p].push(summary); });
    return { generatedAt: nowIso(), relevantCount: childTasks.length, critical: [...new Set(buckets.critical)].slice(0, 12), high: [...new Set(buckets.high)].slice(0, 12), medium: [...new Set(buckets.medium)].slice(0, 12), low: [...new Set(buckets.low)].slice(0, 12), approvals: decision.approvals.slice(0, 20), automatedDone: decision.automatedDone.slice(0, 20), blockers: decision.blockers.slice(0, 20) };
  }

  async function callManagerBriefing(data, workflow, childTasks) {
    const gate = settingsGate(MANAGER.backendId, workflow.executionMode === "event_level_3" ? 3 : workflow.executionMode === "event_level_2" ? 2 : 1);
    const decision = managerDecision(childTasks);
    const briefing = deterministicBriefing(childTasks, decision);
    const meta = { workflowId: workflow.workflowId, parentTaskId: null, workflowDepth: workflow.depth, workflowStep: 0, dedupeKey: `${workflow.workflowId}:${MANAGER.backendId}:briefing`, approvalRequired: false };

    if (!gate.ok) {
      const task = normalizeTask({ id: workflow.parentTaskId, agentId: MANAGER.backendId, type: "daily_briefing", title: workflow.title, sourceType: "workflow", sourceId: workflow.workflowId, priority: "high", status: "blocked", provider: gate.agent.provider, model: gate.agent.model, inputSnapshot: {}, result: { summary: gate.message, status: "blocked", confidence: 1, findings: [], recommendations: [], missingFacts: [], warnings: [], blockers: [gate.message], suggestedActions: [], generatedContent: { managerDecision: decision, briefing }, assumptions: [] }, warnings: [], errors: [], createdAt: workflow.startedAt, updatedAt: nowIso() }, meta);
      upsertTask(task);
      return task;
    }

    try {
      const response = await withTimeout(fetch("/api/ai-agent-run", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: MANAGER.action, agentId: MANAGER.backendId, title: workflow.title, priority: decision.blockers.length ? "critical" : decision.approvals.length ? "high" : "medium", sourceId: workflow.workflowId, input: { context: { products: data.products.slice(0, 40), orders: data.orders.slice(0, 30), returns: data.returns.slice(0, 30), invoices: data.invoices.slice(0, 30), tasks: [...tasks(), ...childTasks].slice(0, 100), agentResults: [...tasks(), ...childTasks].filter((task) => task?.result).slice(0, 100) } }, agent: { provider: gate.agent.provider, model: gate.agent.model, allowFallback: gate.agent.allowFallback, temperature: gate.agent.temperature, maxTokens: gate.agent.maxTokens } }),
      }));
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.task) throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
      const baseResult = plainObject(payload.task.result);
      const task = { ...payload.task, ...meta, status: decision.approvals.length || decision.blockers.length ? "approval_required" : "completed", result: { ...baseResult, status: decision.blockers.length ? "blocked" : decision.approvals.length ? "manualReviewRequired" : decision.attention.length ? "warning" : "passed", generatedContent: { ...plainObject(baseResult.generatedContent), managerDecision: decision, briefing }, blockers: [...new Set([...(Array.isArray(baseResult.blockers) ? baseResult.blockers : []), ...decision.blockers])] } };
      upsertTask(task);
      updateUsage(MANAGER.backendId, task);
      return task;
    } catch (error) {
      const task = { id: workflow.parentTaskId, agentId: MANAGER.backendId, type: "daily_briefing", title: workflow.title, sourceType: "workflow", sourceId: workflow.workflowId, priority: "high", status: "failed", provider: gate.agent.provider, model: gate.agent.model, inputSnapshot: {}, result: { summary: "Manager-Briefing konnte nicht über den Provider erzeugt werden; die deterministische Zusammenfassung bleibt verfügbar.", status: decision.blockers.length ? "blocked" : decision.approvals.length ? "manualReviewRequired" : "warning", confidence: 1, findings: [], recommendations: [], missingFacts: [], warnings: [text(error?.message)], blockers: decision.blockers, suggestedActions: [], generatedContent: { managerDecision: decision, briefing }, assumptions: [] }, warnings: [], errors: [text(error?.message)], createdAt: workflow.startedAt, updatedAt: nowIso(), ...meta };
      upsertTask(task);
      return task;
    }
  }

  function createWorkflow({ workflowType = "briefing", executionMode = "manual", eventType = "", title = "Elyon Manager", priority: requestedPriority = "medium", managerInstruction = "", depth = 0 } = {}) {
    const workflowId = `elyon-wf-${eventType || workflowType}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    return { version: 1, workflowId, parentTaskId: `ai-manager-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, workflowType, executionMode, eventType, title, priority: requestedPriority, managerInstruction, depth, status: "running", agentRuns: 0, childTaskIds: [], reusedTaskIds: [], approvals: [], blockers: [], attention: [], auditLog: [{ at: nowIso(), event: "workflow_started", reason: managerInstruction || workflowType }], startedAt: nowIso(), completedAt: null };
  }

  async function runWorkflow(options = {}) {
    if (state.running) return { ok: false, error: "manager_busy", message: "Der Elyon Manager bearbeitet bereits einen Workflow." };
    const workflow = createWorkflow(options);
    if (workflow.depth >= MAX_DEPTH) return { ok: false, error: "workflow_depth_limit", message: "Maximale Workflow-Tiefe erreicht." };
    const managerLevel = agentSettings(MANAGER.backendId).autonomyLevel;
    const requiredManagerLevel = workflow.executionMode === "event_level_3" ? 3 : workflow.executionMode === "event_level_2" ? 2 : 1;
    if (managerLevel < requiredManagerLevel) return { ok: false, error: "manager_autonomy_too_low", message: `Elyon Manager benötigt mindestens Autonomiestufe ${requiredManagerLevel}.` };

    state.running = true;
    upsertWorkflow(workflow);
    renderManagerSurface();
    const data = dataset();
    const steps = workflowSteps(workflow.workflowType, data, workflow.eventType, workflow.executionMode);
    const childTasks = [];
    let stoppedReason = "";

    try {
      for (let index = 0; index < steps.length; index += 1) {
        if (workflow.agentRuns >= MAX_AGENT_RUNS - 1) { stoppedReason = "max_agent_runs"; break; }
        const agentId = steps[index];
        const context = contextForAgent(agentId, data);
        const requiredAgentLevel = workflow.executionMode === "manual" ? 1 : 2;
        const task = await callAgent(agentId, context, workflow, index, requiredAgentLevel);
        childTasks.push(task);
        workflow.childTaskIds.push(task.id);
        if (task.reused) workflow.reusedTaskIds.push(task.id);
        upsertWorkflow(workflow);
        if (AGENTS[agentId]?.stopOnBlocker && outcome(task) === "blocked") { stoppedReason = `blocked:${agentId}`; break; }
      }

      const managerTask = await callManagerBriefing(data, workflow, childTasks);
      const decision = managerTask?.result?.generatedContent?.managerDecision || managerDecision(childTasks);
      workflow.status = stoppedReason ? "stopped" : decision.status;
      workflow.stoppedReason = stoppedReason || null;
      workflow.approvals = Array.isArray(decision.approvals) ? decision.approvals : [];
      workflow.blockers = Array.isArray(decision.blockers) ? decision.blockers : [];
      workflow.attention = Array.isArray(decision.attention) ? decision.attention : [];
      workflow.managerTaskId = managerTask.id;
      workflow.completedAt = nowIso();
      workflow.auditLog.push({ at: nowIso(), event: "manager_decision", status: decision.status, approvals: workflow.approvals.length, blockers: workflow.blockers.length });
      upsertWorkflow(workflow);
      return { ok: true, workflow, managerTask, childTasks };
    } finally {
      state.running = false;
      renderManagerSurface();
    }
  }

  function latestManagerTask() { return tasks().find((task) => task?.agentId === MANAGER.backendId && task?.result?.generatedContent?.briefing) || null; }
  function approvalTasks() { return tasks().filter((task) => task?.approvalRequired === true || approvalRequired(task)).slice(0, 30); }
  function runningWorkflows() { return workflows().filter((workflow) => workflow?.status === "running"); }

  function formatBudget() {
    const settings = sanitizeAutonomy();
    const agents = [MANAGER.backendId, ...Object.keys(AGENTS)].map((id) => agentSettings(id));
    const usage = Math.max(finite(settings.globalTodayUsage, 0), agents.reduce((sum, agent) => sum + finite(agent.todayUsage, 0), 0));
    const limit = Math.max(0, finite(settings.globalDailyLimit, 0));
    return { usage, limit };
  }

  function briefingLines(briefing) {
    if (!briefing) return '<div class="elyon-manager-note">Noch kein Manager-Briefing vorhanden.</div>';
    const groups = [["KRITISCH", briefing.critical], ["HOCH", briefing.high], ["MITTEL", briefing.medium], ["NIEDRIG", briefing.low]];
    const rows = groups.filter(([, items]) => Array.isArray(items) && items.length).map(([label, items]) => `<div class="elyon-manager-workflow"><strong>${label}</strong><small>${items.slice(0, 4).map(escapeHtml).join(" · ")}</small></div>`).join("");
    return rows || '<div class="elyon-manager-note">Keine priorisierten offenen Punkte im letzten Briefing.</div>';
  }

  function renderManagerSurface() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(() => {
      state.renderQueued = false;
      const card = document.querySelector(".aiw-v6-manager");
      if (!card) return;
      card.querySelector(".elyon-manager-summary")?.remove();
      card.querySelector(".elyon-manager-approval")?.remove();
      const latest = latestManagerTask();
      const briefing = latest?.result?.generatedContent?.briefing;
      const approvals = approvalTasks();
      const running = runningWorkflows();
      const budget = formatBudget();
      const summary = document.createElement("div");
      summary.className = "elyon-manager-summary";
      summary.innerHTML = `<div class="elyon-manager-kpi"><strong>${running.length}</strong><small>laufende Workflows</small></div><div class="elyon-manager-kpi"><strong>${approvals.length}</strong><small>Freigaben</small></div><div class="elyon-manager-kpi"><strong>${workflows().filter((item) => item?.blockers?.length).length}</strong><small>Workflows mit Blockern</small></div><div class="elyon-manager-kpi"><strong>${budget.usage.toFixed(2)} €${budget.limit ? ` / ${budget.limit.toFixed(2)} €` : ""}</strong><small>Budgetzähler heute · Schätzung</small></div>`;
      card.appendChild(summary);
      const inbox = document.createElement("section");
      inbox.className = "elyon-manager-approval";
      inbox.innerHTML = `<h4>Freigabe erforderlich</h4><div class="elyon-manager-approval-list">${approvals.length ? approvals.slice(0, 5).map((task) => `<div class="elyon-manager-approval-row" data-manager-task="${escapeHtml(task.id)}"><div><strong>${escapeHtml(task.title || task.agentId)}</strong><small>${escapeHtml(task.result?.summary || "Entscheidung erforderlich.")}</small></div><div class="elyon-manager-actions"><span class="elyon-manager-priority ${priority(task)}">${priority(task)}</span><button class="elyon-manager-primary" data-manager-approve="${escapeHtml(task.id)}">Freigeben</button><button data-manager-reject="${escapeHtml(task.id)}">Verwerfen</button></div></div>`).join("") : '<div class="elyon-manager-note">Aktuell ist keine Entscheidung von dir erforderlich.</div>'}</div>`;
      card.appendChild(inbox);
      if (briefing) card.dataset.managerBriefingReady = "true";
    });
  }

  function closePanel(id) { document.getElementById(id)?.remove(); }

  function openManagerPanel(view = "run") {
    closePanel(PANEL_ID);
    const latest = latestManagerTask();
    const briefing = latest?.result?.generatedContent?.briefing;
    const list = workflows().slice(0, 8);
    const root = document.createElement("div");
    root.id = PANEL_ID;
    root.className = "elyon-manager-panel";
    root.innerHTML = `<aside class="elyon-manager-panel-inner"><div class="elyon-manager-panel-head"><div><h2>🧠 Elyon Manager</h2><p>Zentrale Orchestrierung der bestehenden virtuellen Mitarbeiter. Maximal Autonomiestufe 3; externe irreversible Aktionen bleiben gesperrt.</p></div><button data-manager-close>✕</button></div><section class="elyon-manager-section"><h3>Manager-Auftrag</h3><div class="elyon-manager-form"><label class="elyon-manager-field"><span>Was soll der Manager tun?</span><select data-manager-workflow-type><option value="briefing">Was muss ich heute machen? · Briefing</option><option value="seller">Was blockiert aktuell Verkäufe? · Gesamtcheck</option><option value="product">Welche Produkte brauchen Aufmerksamkeit? · Produktworkflow</option><option value="operations">Gibt es Probleme mit Bestellungen / Retouren? · Operations</option></select></label><label class="elyon-manager-field"><span>Optionaler Auftrag</span><textarea data-manager-instruction placeholder="z. B. Prüfe, welche Listings als Nächstes fertiggestellt werden können."></textarea></label><div class="elyon-manager-note">V1 nutzt bewusst keinen neuen Chatbot. Der Manager delegiert über die bestehende Agenten-API und bündelt die Ergebnisse.</div><div class="elyon-manager-progress" data-manager-progress></div><div class="elyon-manager-actions"><button class="elyon-manager-primary" data-manager-run>Manager starten</button><button data-manager-close>Schließen</button></div></div></section><section class="elyon-manager-section"><h3>Letztes Tages-/Operations-Briefing</h3>${briefingLines(briefing)}</section><section class="elyon-manager-section"><h3>Letzte Workflows</h3>${list.length ? list.map((workflow) => `<div class="elyon-manager-workflow"><strong>${escapeHtml(workflow.title || workflow.workflowType)} · ${escapeHtml(workflow.status || "")}</strong><small>${escapeHtml(workflow.workflowId)} · ${workflow.childTaskIds?.length || 0} Fachaufgaben · ${workflow.approvals?.length || 0} Freigaben${workflow.stoppedReason ? ` · Stopp: ${escapeHtml(workflow.stoppedReason)}` : ""}</small></div>`).join("") : '<div class="elyon-manager-note">Noch keine Manager-Workflows ausgeführt.</div>'}</section><section class="elyon-manager-section"><h3>Sicherheitsgrenzen</h3><div class="elyon-manager-note">Gesperrt bleiben: LIVE veröffentlichen, Live-Preis ändern, Lieferantenbestellung, Kundennachricht senden, Erstattung, Produktlöschung und rechtlich relevante Datenänderungen.</div></section></aside>`;
    document.body.appendChild(root);
    if (view === "details") root.querySelector("[data-manager-workflow-type]").value = "briefing";
  }

  function openAutonomyPanel(agentId) {
    closePanel(AUTONOMY_ID);
    const backendId = backendForVisible(agentId);
    const visibleId = visibleForBackend(backendId);
    const agent = agentSettings(backendId);
    const name = backendId === MANAGER.backendId ? "Elyon Manager" : AGENTS[backendId]?.name || visibleId;
    const modes = [
      { level: 0, label: "Stufe 0 · Aus", desc: "Keine Ausführung." },
      { level: 1, label: "Stufe 1 · Manuell", desc: "Nur nach deinem Klick." },
      { level: 2, label: "Stufe 2 · Vorschläge", desc: "Events dürfen Aufgaben erkennen und einen kontrollierten Fachlauf mit Vorschlag erzeugen." },
      { level: 3, label: "Stufe 3 · Intern automatisch", desc: "Interne Analysen, Delegationen und Entwürfe dürfen bis zum Freigabepunkt laufen. Keine externe irreversible Aktion." },
    ];
    const root = document.createElement("div");
    root.id = AUTONOMY_ID;
    root.className = "elyon-manager-panel";
    root.innerHTML = `<aside class="elyon-manager-panel-inner"><div class="elyon-manager-panel-head"><div><h2>Autonomie · ${escapeHtml(name)}</h2><p>Die maximale Elyon-Autonomiestufe ist 3.</p></div><button data-manager-autonomy-close>✕</button></div><section class="elyon-manager-section"><div class="elyon-manager-autonomy-options">${modes.map((mode) => `<label class="elyon-manager-autonomy-option"><input type="radio" name="elyonManagerAutonomy" value="${mode.level}" ${agent.autonomyLevel === mode.level ? "checked" : ""}><div><strong>${mode.label}</strong><small>${mode.desc}</small></div></label>`).join("")}</div><div class="elyon-manager-actions" style="margin-top:12px"><button class="elyon-manager-primary" data-manager-autonomy-save="${escapeHtml(backendId)}">Speichern</button><button data-manager-autonomy-close>Abbrechen</button></div></section></aside>`;
    document.body.appendChild(root);
  }

  function saveAutonomy(agentId) {
    const root = document.getElementById(AUTONOMY_ID);
    const selected = root?.querySelector('input[name="elyonManagerAutonomy"]:checked');
    if (!selected) return;
    const level = Math.round(clamp(selected.value, 0, 3));
    const mode = ["off", "manual", "assisted", "semi"][level];
    const settings = sanitizeAutonomy();
    const backendId = backendForVisible(agentId);
    const visibleId = visibleForBackend(backendId);
    [backendId, visibleId].forEach((id) => {
      const current = plainObject(settings.agents[id]);
      settings.agents[id] = { ...current, autonomyLevel: level, autonomyMode: mode, autonomy: { ...plainObject(current.autonomy), mode } };
    });
    writeJson(SETTINGS_KEY, settings);
    closePanel(AUTONOMY_ID);
    window.ElyonAIWorkforceTeamV6?.render?.();
    renderManagerSurface();
  }

  function setTaskDecision(taskId, status) {
    const list = tasks();
    const task = list.find((entry) => entry?.id === taskId);
    if (!task) return;
    task.status = status;
    task.updatedAt = nowIso();
    task.approvalRequired = false;
    if (status === "approved") { task.approvedAt = nowIso(); task.approvedBy = "seller-user"; }
    writeJson(TASKS_KEY, list);
    window.dispatchEvent(new CustomEvent("elyon:ai-workforce-v2-task-updated", { detail: task }));
    renderManagerSurface();
  }

  function markLegacyTriggerSuperseded(eventType, detail, workflowId) {
    const source = text(detail?.sourceId || detail?.id || detail?.productId || detail?.orderId || detail?.returnId);
    const agentId = LEGACY_TRIGGER_AGENT[eventType];
    const list = tasks();
    let changed = false;
    list.forEach((task) => {
      if (task?.agentId !== agentId || task?.status !== "queued" || task?.sourceType !== "trigger") return;
      if (source && task.sourceId && text(task.sourceId) !== source) return;
      task.status = "completed";
      task.updatedAt = nowIso();
      task.supersededByWorkflowId = workflowId;
      task.warnings = [...(Array.isArray(task.warnings) ? task.warnings : []), "Legacy-Trigger wurde vom Elyon Manager übernommen; kein doppelter KI-Aufruf ausgeführt."];
      changed = true;
    });
    if (changed) writeJson(TASKS_KEY, list);
  }

  async function handleBusinessEvent(eventType, detail = {}) {
    const managerLevel = agentSettings(MANAGER.backendId).autonomyLevel;
    if (managerLevel < 2 || state.running) return;
    const executionMode = managerLevel >= 3 ? "event_level_3" : "event_level_2";
    const data = dataset();
    if (eventType === "product-approved" || eventType === "listing-updated") {
      const candidate = detail.product || detail;
      if (candidate && typeof candidate === "object" && Object.keys(candidate).length) data.product = candidate;
    }
    if (eventType === "new-order") data.order = orderSummary(detail.order || detail);
    if (eventType === "return-created") data.returnCase = returnSummary(detail.returnCase || detail.return || detail);
    const type = ["product-approved", "listing-updated"].includes(eventType) ? "product" : "operations";
    const result = await runWorkflow({ workflowType: type, executionMode, eventType, title: `Elyon Manager · ${eventType}`, priority: eventType === "new-order" ? "high" : "medium", managerInstruction: `Automatischer Event: ${eventType}` });
    if (result.ok) markLegacyTriggerSuperseded(eventType, detail, result.workflow.workflowId);
  }

  async function handleClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const managerAssign = target.closest('[data-v6-assign="manager"],[data-v6-panel-assign="manager"]');
    if (managerAssign) {
      event.preventDefault(); event.stopImmediatePropagation();
      openManagerPanel("run");
      return;
    }

    const managerDetails = target.closest('[data-v6-details="manager"]');
    if (managerDetails) {
      event.preventDefault(); event.stopImmediatePropagation();
      openManagerPanel("details");
      return;
    }

    const autonomy = target.closest("[data-v6-skill-autonomy]");
    if (autonomy) {
      event.preventDefault(); event.stopImmediatePropagation();
      openAutonomyPanel(autonomy.dataset.v6SkillAutonomy);
      return;
    }

    if (target.closest("[data-manager-close]")) { event.preventDefault(); closePanel(PANEL_ID); return; }
    if (target.closest("[data-manager-autonomy-close]")) { event.preventDefault(); closePanel(AUTONOMY_ID); return; }
    const saveAutonomyButton = target.closest("[data-manager-autonomy-save]");
    if (saveAutonomyButton) { event.preventDefault(); saveAutonomy(saveAutonomyButton.dataset.managerAutonomySave); return; }
    const approve = target.closest("[data-manager-approve]");
    if (approve) { event.preventDefault(); setTaskDecision(approve.dataset.managerApprove, "approved"); return; }
    const reject = target.closest("[data-manager-reject]");
    if (reject) { event.preventDefault(); setTaskDecision(reject.dataset.managerReject, "rejected"); return; }

    const run = target.closest("[data-manager-run]");
    if (run) {
      event.preventDefault();
      if (state.running) return;
      const root = document.getElementById(PANEL_ID);
      const workflowType = text(root?.querySelector("[data-manager-workflow-type]")?.value, "briefing");
      const instruction = text(root?.querySelector("[data-manager-instruction]")?.value);
      const progress = root?.querySelector("[data-manager-progress]");
      run.disabled = true;
      if (progress) progress.textContent = "Elyon Manager analysiert und delegiert …";
      const result = await runWorkflow({ workflowType, executionMode: "manual", title: instruction ? `Elyon Manager · ${instruction.slice(0, 80)}` : "Elyon Manager · Operations-Briefing", priority: "medium", managerInstruction: instruction || workflowType });
      run.disabled = false;
      if (progress) progress.textContent = result.ok ? `Fertig · ${result.workflow.approvals.length} Freigabe(n), ${result.workflow.blockers.length} Blocker.` : result.message || result.error || "Managerlauf fehlgeschlagen.";
      if (result.ok) {
        setTimeout(() => { closePanel(PANEL_ID); openManagerPanel("details"); }, 350);
      }
    }
  }

  function bindEvents() {
    const bindings = {
      "elyon:product-approved": "product-approved",
      "elyon:listing-updated": "listing-updated",
      "elyon:new-order": "new-order",
      "elyon:return-created": "return-created",
    };
    Object.entries(bindings).forEach(([eventName, eventType]) => window.addEventListener(eventName, (event) => { void handleBusinessEvent(eventType, event.detail || {}); }));
    window.addEventListener("elyon:ai-workforce-team-v6-rendered", renderManagerSurface);
    window.addEventListener("elyon:ai-workforce-v2-task-updated", renderManagerSurface);
    window.addEventListener("elyon:ai-manager-workflow-updated", renderManagerSurface);
    window.addEventListener("elyon:runtime-group-loaded", (event) => { if (event.detail?.tabId === "virtualAgentsTab") renderManagerSurface(); });
  }

  function install() {
    installStyles();
    sanitizeAutonomy();
    document.addEventListener("click", handleClick, true);
    bindEvents();
    [0, 80, 260].forEach((delay) => setTimeout(renderManagerSurface, delay));
  }

  window.ElyonManagerOrchestratorV1 = {
    version: 1,
    runWorkflow,
    open: openManagerPanel,
    approvals: approvalTasks,
    workflows,
    settings: sanitizeAutonomy,
    limits: { maxDepth: MAX_DEPTH, maxAgentRuns: MAX_AGENT_RUNS, maxRetries: MAX_RETRIES, timeoutMs: AGENT_TIMEOUT_MS },
    safety: { maxAutonomyLevel: 3, externalActionsLocked: true },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
