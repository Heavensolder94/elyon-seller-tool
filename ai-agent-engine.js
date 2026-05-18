(function () {
  "use strict";

  const SETTINGS_KEY = "elyon_ai_agents_settings";
  const INTERVAL_MS = 45000;
  const MAX_QUEUE = 50;
  const MAX_AGENT_LOGS = 12;
  const MAX_RUNTIME_LOGS = 120;

  const AGENT_ID_ORDER = [
    "soul-scout",
    "soul-seo",
    "soul-guard",
    "soul-finance",
    "soul-support",
    "soul-operations",
  ];

  const readJson = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };

  const writeJson = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };

  const readSettings = () => readJson(SETTINGS_KEY, {});

  const normalizeText = (value, fallback = "") => {
    if (typeof value === "string") return value.trim();
    if (value === null || value === undefined) return fallback;
    return String(value);
  };

  const normalizeBool = (value, fallback = false) => (typeof value === "boolean" ? value : fallback);

  const normalizeNumber = (value, fallback = 0, min = 0, max = Number.POSITIVE_INFINITY) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  };

  const normalizeArray = (value, fallback = []) => (Array.isArray(value) ? value.slice() : fallback.slice());

  const clampList = (list, max) => (Array.isArray(list) ? list.slice(0, max) : []);

  const nowIso = () => new Date().toISOString();

  const makeLogEntry = (level, agentId, message) => ({
    id: `log-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
    level: ["info", "warn", "error", "success"].includes(level) ? level : "info",
    agentId: normalizeText(agentId, ""),
    message: normalizeText(message, ""),
    createdAt: nowIso(),
  });

  const makeQueueTask = (agentId, type, title, payload, mode, warnings = []) => ({
    id: `task-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
    agentId: normalizeText(agentId, ""),
    type: normalizeText(type, "analysis"),
    title: normalizeText(title, "Lokale Aufgabe"),
    payload: payload && typeof payload === "object" ? payload : {},
    createdAt: nowIso(),
    updatedAt: nowIso(),
    result: "",
    warnings: normalizeArray(warnings).map((item) => normalizeText(item, "")).filter(Boolean),
    executionMode: normalizeText(mode, "sandboxed"),
    status: "queued",
    priority: "medium",
  });

  const readCollection = (key) => normalizeArray(readJson(key, []), []);

  const buildDatasetSnapshot = () => {
    const products = readCollection("elyonProducts");
    const sales = readCollection("elyonSales");
    const returns = readCollection("elyonReturns");
    const shopifyReturns = readCollection("elyonShopifyReturns");
    const suppliers = readCollection("elyonSuppliers");
    const runningCosts = readCollection("elyonCosts");
    const invoices = readCollection("elyonInvoices");

    return {
      products,
      sales,
      returns,
      shopifyReturns,
      suppliers,
      runningCosts,
      invoices,
    };
  };

  const getAgentTemplates = (settings) => {
    const agents = settings && settings.agents && typeof settings.agents === "object" ? settings.agents : {};
    return AGENT_ID_ORDER.filter((agentId) => agents[agentId]).map((agentId) => {
      const agent = agents[agentId] || {};
      return {
        id: agentId,
        name: normalizeText(agent.name, agentId),
        active: normalizeBool(agent.active, true),
        enabled: normalizeBool(agent.enabled, true),
        paused: normalizeBool(agent.paused, false),
        autonomyLevel: normalizeNumber(agent.autonomyLevel, 1, 0, 4),
        model: normalizeText(agent.model, "deepseek"),
        dailyLimit: normalizeNumber(agent.dailyLimit, 0.25, 0, 9999),
        todayUsage: normalizeNumber(agent.todayUsage, 0, 0, 9999),
        prompt: normalizeText(agent.prompt, ""),
        description: normalizeText(agent.description, ""),
        guardrails: normalizeText(agent.guardrails, ""),
        capabilities: normalizeArray(agent.capabilities, []),
        lastRun: normalizeText(agent.lastRun, ""),
        lastResult: normalizeText(agent.lastResult, ""),
        lastExecutionMode: normalizeText(agent.lastExecutionMode, "sandboxed"),
        logs: normalizeArray(agent.logs, []),
        queue: normalizeArray(agent.queue, []),
        warnings: normalizeArray(agent.warnings, []),
        statusState: normalizeText(agent.statusState, "Idle"),
      };
    });
  };

  const buildAgentStateMap = (settings, existingRuntime) => {
    const agents = getAgentTemplates(settings);
    const current = existingRuntime && existingRuntime.agentStates && typeof existingRuntime.agentStates === "object" ? existingRuntime.agentStates : {};
    const next = {};

    agents.forEach((agent) => {
      const runtime = current[agent.id] && typeof current[agent.id] === "object" ? current[agent.id] : {};
      next[agent.id] = {
        id: agent.id,
        name: agent.name,
        role: agent.description,
        enabled: normalizeBool(runtime.enabled, agent.active && agent.enabled),
        paused: normalizeBool(runtime.paused, !agent.active || !agent.enabled),
        autonomyLevel: normalizeNumber(runtime.autonomyLevel, agent.autonomyLevel, 0, 4),
        model: normalizeText(runtime.model, agent.model),
        dailyLimit: normalizeNumber(runtime.dailyLimit, agent.dailyLimit, 0, 9999),
        todayUsage: normalizeNumber(runtime.todayUsage, agent.todayUsage, 0, 9999),
        prompt: normalizeText(runtime.prompt, agent.prompt),
        description: normalizeText(runtime.description, agent.description),
        guardrails: normalizeText(runtime.guardrails, agent.guardrails),
        capabilities: normalizeArray(runtime.capabilities, agent.capabilities),
        lastRun: normalizeText(runtime.lastRun, agent.lastRun),
        lastResult: normalizeText(runtime.lastResult, agent.lastResult),
        lastExecutionMode: normalizeText(runtime.lastExecutionMode, agent.lastExecutionMode || "sandboxed"),
        logs: clampList(normalizeArray(runtime.logs, agent.logs), MAX_AGENT_LOGS),
        queue: clampList(normalizeArray(runtime.queue, agent.queue), MAX_QUEUE),
        warnings: normalizeArray(runtime.warnings, agent.warnings).map((item) => normalizeText(item, "")).filter(Boolean),
        statusState: normalizeText(runtime.statusState, agent.statusState),
      };
    });

    return next;
  };

  const getWorkerMode = (settings) => {
    const securityLocked = settings.securityMode !== false || settings.sandboxMode !== false;
    if (settings.pauseAllAgents === true || settings.pausedAll === true) return "paused";
    if (securityLocked) return "sandboxed";
    if (settings.advancedMode === true && settings.autonomyLocked === false) return "local";
    return "sandboxed";
  };

  const createWorkerState = (settings, existingRuntime, queueLength) => {
    const worker = existingRuntime && existingRuntime.worker && typeof existingRuntime.worker === "object" ? existingRuntime.worker : {};
    const mode = getWorkerMode(settings);
    return {
      status: mode === "local" ? "running" : mode,
      mode,
      lastTick: nowIso(),
      lastRun: nowIso(),
      nextTickAt: new Date(Date.now() + normalizeNumber(worker.intervalMs, INTERVAL_MS, 15000, 24 * 60 * 60 * 1000)).toISOString(),
      intervalMs: normalizeNumber(worker.intervalMs, INTERVAL_MS, 15000, 24 * 60 * 60 * 1000),
      processedToday: normalizeNumber(worker.processedToday, 0, 0, 9999),
      failuresToday: normalizeNumber(worker.failuresToday, 0, 0, 9999),
      queueLength,
      notes: mode === "paused"
        ? "Alle Agenten pausiert"
        : mode === "sandboxed"
          ? "Sandbox aktiv - nur Vorschlaege und lokale Vorbereitung"
          : "Lokale Automationen aktiv",
    };
  };

  const summarizeProducts = (products) => {
    const list = Array.isArray(products) ? products : [];
    return {
      count: list.length,
      withTitle: list.filter((item) => item && typeof item.title === "string" && item.title.trim()).length,
      withPrice: list.filter((item) => item && Number.isFinite(Number(item.price))).length,
    };
  };

  const buildAgentTask = (agentId, agent, snapshot, mode) => {
    const productStats = summarizeProducts(snapshot.products);
    const returnCount = snapshot.returns.length + snapshot.shopifyReturns.length;
    const costCount = snapshot.runningCosts.length;
    const warnings = [];
    let title = "Lokale Analyse";
    let type = "analysis";
    let result = "Keine klare Aufgabe gefunden.";
    let payload = {};

    if (agentId === "soul-scout") {
      type = "research";
      title = "Produktdaten pruefen";
      result = `${productStats.count} Produkte lokal geprueft.`;
      if (!productStats.count) warnings.push("Keine Produktdaten vorhanden.");
      if (!productStats.withTitle) warnings.push("Titel fehlen teilweise.");
      payload = { productCount: productStats.count };
    } else if (agentId === "soul-seo") {
      type = "seo_audit";
      title = "SEO-Check vorbereiten";
      result = `${productStats.withTitle} Titel fuer SEO-Check bereit.`;
      if (!productStats.withTitle) warnings.push("Keine Titel fuer SEO-Analyse gefunden.");
      payload = { titles: productStats.withTitle };
    } else if (agentId === "soul-guard") {
      type = "risk_audit";
      title = "Risiko-Warnungen auswerten";
      result = `${returnCount} Rueckgaben und Warnsignale geprueft.`;
      if (returnCount > 0) warnings.push(`${returnCount} Rueckgabe-Eintraege sichtbar.`);
      payload = { returns: returnCount };
    } else if (agentId === "soul-finance") {
      type = "margin_check";
      title = "Marge und Kosten pruefen";
      result = `${costCount} Kostenpunkte gegen ${snapshot.sales.length} Sales geprueft.`;
      if (!snapshot.sales.length) warnings.push("Noch keine Sales-Daten vorhanden.");
      payload = { sales: snapshot.sales.length, costs: costCount };
    } else if (agentId === "soul-support") {
      type = "support_summary";
      title = "Support vorbereiten";
      result = `${returnCount} Support-faehige Vorgaenge fuer Antworten vorbereitet.`;
      if (!returnCount) warnings.push("Keine offenen Support-Faelle gefunden.");
      payload = { returns: returnCount };
    } else if (agentId === "soul-operations") {
      type = "operations_check";
      title = "Betriebsstatus pruefen";
      result = `${snapshot.products.length} Produkte, ${snapshot.suppliers.length} Lieferanten und ${snapshot.invoices.length} Rechnungen abgeglichen.`;
      if (!snapshot.suppliers.length) warnings.push("Lieferantenliste ist leer.");
      payload = {
        products: snapshot.products.length,
        suppliers: snapshot.suppliers.length,
        invoices: snapshot.invoices.length,
      };
    }

    if (mode === "paused") {
      return {
        ...makeQueueTask(agentId, type, title, payload, "blocked", ["Alle Agenten sind pausiert."]),
        status: "blocked",
        result: "Agent ist pausiert. Aufgabe wurde nicht ausgefuehrt.",
        warnings: warnings.concat(["Agent ist pausiert."]),
      };
    }

    if (mode === "sandboxed") {
      return {
        ...makeQueueTask(agentId, type, title, payload, "sandboxed", warnings),
        status: "sandboxed",
        result: `${result} Nur Sandbox-Vorschau.`,
        warnings,
      };
    }

    return {
      ...makeQueueTask(agentId, type, title, payload, "local", warnings),
      status: "completed",
      result,
      warnings,
    };
  };

  const pushLimited = (list, entry, limit) => {
    const next = Array.isArray(list) ? list.slice() : [];
    next.push(entry);
    while (next.length > limit) next.shift();
    return next;
  };

  const writeRuntime = (nextRuntime) => {
    const settings = readSettings();
    settings.agentRuntime = nextRuntime;
    if (!settings.agentRuntime.version) settings.agentRuntime.version = 1;
    writeJson(SETTINGS_KEY, settings);
    return settings;
  };

  const buildRuntimeLog = (runtime, level, agentId, message) => {
    runtime.logs = pushLimited(runtime.logs, makeLogEntry(level, agentId, message), MAX_RUNTIME_LOGS);
    return runtime;
  };

  const syncAgentState = (settings, runtime, agentId, patch) => {
    settings.agents = settings.agents && typeof settings.agents === "object" ? settings.agents : {};
    const agent = settings.agents[agentId] && typeof settings.agents[agentId] === "object" ? settings.agents[agentId] : {};
    const nextAgent = {
      ...agent,
      active: normalizeBool(patch.active, agent.active !== false),
      enabled: normalizeBool(patch.enabled, agent.enabled !== false),
      paused: normalizeBool(patch.paused, agent.paused === true),
      autonomyLevel: normalizeNumber(patch.autonomyLevel, agent.autonomyLevel || 1, 0, 4),
      model: normalizeText(patch.model, normalizeText(agent.model, "deepseek")),
      dailyLimit: normalizeNumber(patch.dailyLimit, normalizeNumber(agent.dailyLimit, 0.25, 0, 9999), 0, 9999),
      todayUsage: normalizeNumber(patch.todayUsage, normalizeNumber(agent.todayUsage, 0, 0, 9999), 0, 9999),
      prompt: normalizeText(patch.prompt, normalizeText(agent.prompt, "")),
      description: normalizeText(patch.description, normalizeText(agent.description, "")),
      guardrails: normalizeText(patch.guardrails, normalizeText(agent.guardrails, "")),
      capabilities: normalizeArray(patch.capabilities, normalizeArray(agent.capabilities, [])),
      statusState: normalizeText(patch.statusState, normalizeText(agent.statusState, "Idle")),
      lastActivity: normalizeText(patch.lastActivity, normalizeText(agent.lastActivity, "")),
      lastTestResponse: normalizeText(patch.lastTestResponse, normalizeText(agent.lastTestResponse, "")),
      lastTestedAt: normalizeText(patch.lastTestedAt, normalizeText(agent.lastTestedAt, "")),
      lastRun: normalizeText(patch.lastRun, normalizeText(agent.lastRun, "")),
      lastResult: normalizeText(patch.lastResult, normalizeText(agent.lastResult, "")),
      lastExecutionMode: normalizeText(patch.lastExecutionMode, normalizeText(agent.lastExecutionMode, "sandboxed")),
      logs: clampList(normalizeArray(patch.logs, normalizeArray(agent.logs, [])), MAX_AGENT_LOGS),
      queue: clampList(normalizeArray(patch.queue, normalizeArray(agent.queue, [])), MAX_QUEUE),
      warnings: normalizeArray(patch.warnings, normalizeArray(agent.warnings, [])),
    };
    settings.agents[agentId] = nextAgent;

    runtime.agentStates = runtime.agentStates && typeof runtime.agentStates === "object" ? runtime.agentStates : {};
    runtime.agentStates[agentId] = {
      ...(runtime.agentStates[agentId] && typeof runtime.agentStates[agentId] === "object" ? runtime.agentStates[agentId] : {}),
      ...patch,
    };

    return { settings, runtime, agent: nextAgent };
  };

  const emitCommunication = (runtime, fromAgentId, toAgentId, message, level = "info") => {
    runtime.communications = pushLimited(runtime.communications, makeLogEntry(level, fromAgentId, `${fromAgentId} -> ${toAgentId}: ${message}`), MAX_RUNTIME_LOGS);
    return runtime;
  };

  const queueFallbackTasks = (runtime, settings, snapshot, mode) => {
    const activeAgents = getAgentTemplates(settings).filter((agent) => agent.active !== false && agent.enabled !== false);
    const hasQueue = Array.isArray(runtime.queue) && runtime.queue.length > 0;
    if (hasQueue) return runtime;
    const next = [];

    activeAgents.forEach((agent) => {
      next.push(buildAgentTask(agent.id, agent, snapshot, mode));
    });

    runtime.queue = clampList(next, MAX_QUEUE);
    return runtime;
  };

  const processQueue = (settings, runtime, snapshot, mode) => {
    const queue = Array.isArray(runtime.queue) ? runtime.queue.slice() : [];
    const processed = [];
    const agents = getAgentTemplates(settings);
    const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
    runtime.worker = runtime.worker && typeof runtime.worker === "object" ? runtime.worker : {};

    while (queue.length && processed.length < 4) {
      const task = queue.shift();
      const agent = agentMap.get(task.agentId);
      if (!agent) {
        task.status = "failed";
        task.result = "Agent nicht gefunden.";
        task.updatedAt = nowIso();
        processed.push(task);
        runtime = buildRuntimeLog(runtime, "warn", task.agentId, `Aufgabe ${task.id} ohne Agent verarbeitet.`);
        continue;
      }

      const runtimeAgent = runtime.agentStates && runtime.agentStates[agent.id] ? runtime.agentStates[agent.id] : null;
      const agentPaused = settings.pauseAllAgents === true || settings.pausedAll === true || normalizeBool(agent.paused, false) || (runtimeAgent && normalizeBool(runtimeAgent.paused, false));
      const disabled = normalizeBool(agent.active, true) === false || normalizeBool(agent.enabled, true) === false || agentPaused;
      const securityLocked = settings.securityMode !== false || settings.sandboxMode !== false;
      const liveAllowed = settings.advancedMode === true && settings.autonomyLocked === false && !securityLocked && !disabled;

      task.updatedAt = nowIso();
      task.executionMode = liveAllowed ? "local" : (securityLocked || disabled ? "sandboxed" : "local");

      if (disabled) {
        task.status = "blocked";
        task.result = "Agent ist pausiert oder deaktiviert.";
        runtime.worker.failuresToday = normalizeNumber(runtime.worker.failuresToday, 0, 0, 9999) + 1;
      } else if (securityLocked) {
        task.status = "sandboxed";
        task.result = `${task.title} nur lokal vorbereitet.`;
        runtime.worker.processedToday = normalizeNumber(runtime.worker.processedToday, 0, 0, 9999) + 1;
      } else {
        task.status = "completed";
        task.result = task.result || `${task.title} lokal verarbeitet.`;
        runtime.worker.processedToday = normalizeNumber(runtime.worker.processedToday, 0, 0, 9999) + 1;
      }

      const agentLogMessage = `${task.title} · ${task.status} · ${task.executionMode}`;
      const nextAgentLogs = pushLimited(
        normalizeArray(runtimeAgent && runtimeAgent.logs, []),
        makeLogEntry(task.status === "completed" ? "success" : task.status === "blocked" ? "warn" : "info", agent.id, agentLogMessage),
        MAX_AGENT_LOGS
      );
      const nextAgentQueue = pushLimited(
        normalizeArray(runtimeAgent && runtimeAgent.queue, []),
        {
          id: task.id,
          title: task.title,
          status: task.status,
          executionMode: task.executionMode,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
        },
        MAX_QUEUE
      );
      const nextAgentWarnings = Array.isArray(task.warnings) ? task.warnings.slice() : [];
      const nextAgentRuntimePatch = {
        enabled: !disabled,
        paused: disabled,
        autonomyLevel: liveAllowed ? 3 : (securityLocked ? 1 : 2),
        statusState: task.status === "completed" ? "Active" : task.status === "blocked" ? "Idle" : "Warn",
        lastRun: nowIso(),
        lastResult: task.result,
        lastExecutionMode: task.executionMode,
        logs: nextAgentLogs,
        queue: nextAgentQueue,
        warnings: nextAgentWarnings,
        todayUsage: liveAllowed ? normalizeNumber((runtimeAgent && runtimeAgent.todayUsage) || agent.todayUsage, 0, 0, 9999) + 0.01 : normalizeNumber((runtimeAgent && runtimeAgent.todayUsage) || agent.todayUsage, 0, 0, 9999),
        lastActivity: task.result,
      };

      const synced = syncAgentState(settings, runtime, agent.id, nextAgentRuntimePatch);
      settings = synced.settings;
      runtime = synced.runtime;

      if (task.agentId === "soul-guard" && task.warnings && task.warnings.length) {
        runtime = emitCommunication(runtime, "soul-guard", "soul-operations", task.warnings[0], "warn");
      }
      if (task.agentId === "soul-seo" && task.warnings && task.warnings.length) {
        runtime = emitCommunication(runtime, "soul-seo", "soul-scout", task.warnings[0], "info");
      }
      if (task.agentId === "soul-finance" && task.warnings && task.warnings.length) {
        runtime = emitCommunication(runtime, "soul-finance", "soul-guard", task.warnings[0], "warn");
      }

      processed.push(task);
      runtime = buildRuntimeLog(runtime, task.status === "completed" ? "success" : task.status === "blocked" ? "warn" : "info", task.agentId, `${task.title} -> ${task.status}`);
    }

    runtime.queue = queue;
    return { settings, runtime, processed };
  };

  const maybeSyncServer = async (runtime) => {
    if (!["http:", "https:"].includes(window.location.protocol)) return;
    const endpoint = "/api/agent-engine";
    try {
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "tick", runtime, settings: readSettings() }),
      });
    } catch {
      // Server sync is optional and should never break the local worker.
    }
  };

  const tick = async (reason = "interval") => {
    try {
      const settings = readSettings();
      const existingRuntime = settings.agentRuntime && typeof settings.agentRuntime === "object" ? settings.agentRuntime : {};
      const snapshot = buildDatasetSnapshot();
      const mode = getWorkerMode(settings);

      let runtime = {
        ...existingRuntime,
        worker: createWorkerState(settings, existingRuntime, normalizeArray(existingRuntime.queue, []).length),
        queue: clampList(normalizeArray(existingRuntime.queue, []), MAX_QUEUE),
        logs: clampList(normalizeArray(existingRuntime.logs, []), MAX_RUNTIME_LOGS),
        communications: clampList(normalizeArray(existingRuntime.communications, []), MAX_RUNTIME_LOGS),
        agentStates: existingRuntime.agentStates && typeof existingRuntime.agentStates === "object" ? existingRuntime.agentStates : {},
      };

      runtime = queueFallbackTasks(runtime, settings, snapshot, mode);
      const next = processQueue(settings, runtime, snapshot, mode);
      runtime = next.runtime;
      runtime.worker = createWorkerState(settings, runtime, Array.isArray(runtime.queue) ? runtime.queue.length : 0);
      runtime.worker.status = mode === "local" ? "running" : mode;
      runtime.worker.notes = mode === "paused"
        ? "Alle Agenten pausiert"
        : mode === "sandboxed"
          ? "Sandbox aktiv - nur Vorschlaege und lokale Vorbereitung"
          : "Lokale Automationen aktiv";

      const settingsToWrite = next.settings;
      settingsToWrite.agentRuntime = runtime;
      writeJson(SETTINGS_KEY, settingsToWrite);

      if (typeof window.reloadVirtualAgentsSettings === "function") {
        window.reloadVirtualAgentsSettings();
      } else if (typeof window.renderVirtualAgentsSettings === "function") {
        window.renderVirtualAgentsSettings();
      }

      await maybeSyncServer(runtime);
      return { ok: true, reason, runtime };
    } catch (error) {
      try {
        const settings = readSettings();
        const runtime = settings.agentRuntime && typeof settings.agentRuntime === "object" ? settings.agentRuntime : {};
        runtime.worker = runtime.worker && typeof runtime.worker === "object" ? runtime.worker : createWorkerState(settings, runtime, 0);
        runtime.worker.status = "error";
        runtime.worker.notes = normalizeText(error && error.message, "Unbekannter Worker-Fehler");
        runtime.logs = pushLimited(normalizeArray(runtime.logs, []), makeLogEntry("error", "", runtime.worker.notes), MAX_RUNTIME_LOGS);
        settings.agentRuntime = runtime;
        writeJson(SETTINGS_KEY, settings);
      } catch {
        // Final fallback: keep the error contained.
      }
      return { ok: false, reason, error };
    }
  };

  const start = () => {
    if (window.__elyonAgentEngineStarted) return window.__elyonAgentEngineStarted;
    const state = {
      intervalId: null,
      lastTick: 0,
      running: true,
    };
    window.__elyonAgentEngineStarted = state;
    tick("startup");
    state.intervalId = window.setInterval(() => {
      if (!state.running) return;
      tick("interval");
    }, INTERVAL_MS);
    return state;
  };

  const stop = () => {
    const state = window.__elyonAgentEngineStarted;
    if (!state) return;
    state.running = false;
    if (state.intervalId) window.clearInterval(state.intervalId);
    state.intervalId = null;
  };

  window.ElyonAgentEngine = {
    tick,
    start,
    stop,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
