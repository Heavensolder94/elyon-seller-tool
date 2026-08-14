(() => {
  "use strict";

  const API_URL = "/api/jarvis";
  const AUTO_API_URL = "/api/jarvis-auto";
  const AUTO_PREVIEW_API_URL = "/api/jarvis-auto-preview";
  const CONVERSATION_STORAGE_KEY = "elyon_jarvis_conversation_id_v2a";
  const EVENTS_API_URL = "/api/jarvis-events";
  const JOBS_API_URL = "/api/jarvis-jobs";
  const CONTROL_API_URL = "/api/jarvis-control";
  const VERSION = "phase-e4-v1.5";
  const ASYNC_TASK_POLL_MS = 5000;
  const ASYNC_TASK_MAX_POLLS = 120;
  const trackedAsyncTasks = new Set();

  function getConversationId() {
    try { return window.sessionStorage.getItem(CONVERSATION_STORAGE_KEY) || ""; } catch { return ""; }
  }

  function rememberConversationId(payload) {
    try { if (payload?.conversationId) window.sessionStorage.setItem(CONVERSATION_STORAGE_KEY, String(payload.conversationId)); } catch { /* optional */ }
  }

  function plainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function normalizeCommand(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function directNoAgentFallback(command, payload = {}) {
    const normalized = normalizeCommand(command);
    let answer = "Ich bin da. Für diese Anfrage brauche ich keinen Spezial-Agenten. Sag mir einfach, was du wissen, prüfen oder erledigen möchtest.";

    if (/^(jarvis|jarvis bist du da|bist du da jarvis|hey jarvis|hallo jarvis)$/.test(normalized)) {
      answer = "Ja, ich bin da. Was möchtest du als Nächstes in Elyon prüfen oder erledigen?";
    } else if (/^(hi|hallo|hey|moin|servus)( jarvis)?$/.test(normalized)) {
      answer = "Hi. Jarvis ist da. Was möchtest du als Nächstes in Elyon prüfen oder erledigen?";
    }

    const sourcePlan = payload?.plan && typeof payload.plan === "object" ? payload.plan : {};
    return {
      ok: true,
      phase: payload?.phase || "C",
      mode: "direct",
      answer,
      plan: {
        ...sourcePlan,
        status: "ready",
        executable: false,
        answerDirectly: true,
        fallbackReason: "no_suitable_agent",
      },
      routing: {
        attemptedSpecialist: true,
        fallbackUsed: true,
      },
      summary: {
        status: "completed",
        summary: answer,
        successful: 0,
        failed: 0,
        blockers: [],
        warnings: Array.isArray(sourcePlan.warnings) ? sourcePlan.warnings : [],
      },
      safety: {
        externalActionsLocked: true,
        livePublishingAllowed: false,
        answerDirectly: true,
        nothingExecuted: true,
      },
    };
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data?.message || data?.error || `Jarvis HTTP ${response.status}`);
      error.status = response.status;
      error.payload = data;
      throw error;
    }
    return data;
  }

  async function status() {
    return request(AUTO_API_URL, { method: "GET" });
  }

  async function events(options = {}) {
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
    return request(`${EVENTS_API_URL}?limit=${encodeURIComponent(limit)}`, { method: "GET" });
  }

  async function jobs(options = {}) {
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
    const params = new URLSearchParams({ limit: String(limit) });
    if (options.status) params.set("status", String(options.status));
    return request(`${JOBS_API_URL}?${params.toString()}`, { method: "GET" });
  }

  async function control() {
    return request(CONTROL_API_URL, { method: "GET" });
  }

  async function updateControl(patch = {}) {
    return request(CONTROL_API_URL, {
      method: "PUT",
      body: JSON.stringify(patch && typeof patch === "object" ? patch : {}),
    });
  }

  function commandBody(command, options = {}, { execute = false, autoDelegate = false } = {}) {
    const conversationId = options?.conversationId || getConversationId();
    const context = plainObject(options?.context);
    return {
      ...options,
      context: {
        ...context,
        ...(conversationId ? { jarvisConversationId: conversationId } : {}),
      },
      conversationId,
      channel: options?.channel || "seller_tool",
      command,
      execute,
      autoDelegate,
      mode: execute ? "execute" : (autoDelegate ? "chat" : "plan"),
    };
  }

  async function delegationPreview(command, options = {}) {
    const body = commandBody(command, options, { execute: false, autoDelegate: options?.autoDelegate !== false });
    return request(AUTO_PREVIEW_API_URL, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  function dispatchDelegationPreview(command, preview) {
    try {
      window.dispatchEvent(new CustomEvent("elyon:jarvis-auto-preview", {
        detail: { command, preview },
      }));
    } catch {
      // UI preview is optional; execution must not depend on browser event support.
    }
  }

  function formatEuro(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "?";
    try { return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(number); } catch { return `${number.toFixed(2)} €`; }
  }

  function marketScoutAnswer(task = {}) {
    const output = plainObject(task.output);
    const candidates = Array.isArray(output.candidates) ? output.candidates : [];
    if (!candidates.length) {
      return output.summary || "Market Scout wurde abgeschlossen, hat aber keine ausreichend belegten Produktkandidaten geliefert.";
    }
    const lines = [
      `Market Scout ist fertig: ${candidates.length} belastbare Produktkandidaten.`,
      "",
    ];
    candidates.forEach((item, index) => {
      const margin = Number(item.estimatedMarginPercent);
      const marginText = Number.isFinite(margin) ? `${margin.toFixed(1)} % grobe Rohmarge` : "Marge offen";
      lines.push(`${index + 1}. ${String(item.productName || "Produkt").trim()}`);
      lines.push(`   EK ${formatEuro(item.purchasePrice)} · VK ${formatEuro(item.sellingPrice)} · ${marginText} · Risiko ${String(item.riskLevel || "unknown").toUpperCase()}`);
      if (item.demandSignal) lines.push(`   Nachfrage: ${String(item.demandSignal).trim()}`);
      if (item.rationale) lines.push(`   Warum interessant: ${String(item.rationale).trim()}`);
      if (item.supplierUrl) lines.push(`   Supplier: ${String(item.supplierUrl).trim()}`);
      const evidence = Array.isArray(item.evidence) ? item.evidence.find((entry) => entry?.url) : null;
      if (evidence?.url) lines.push(`   Marktquelle: ${String(evidence.url).trim()}`);
      lines.push("");
    });
    const warnings = Array.isArray(output.warnings) ? output.warnings.filter(Boolean) : [];
    if (warnings.length) {
      lines.push("Hinweise:");
      warnings.slice(0, 5).forEach((warning) => lines.push(`- ${String(warning).trim()}`));
      lines.push("");
    }
    lines.push("Die Margen sind Research-Schätzungen vor eBay-Gebühren, Retouren, Steuern und sonstigen Kosten. Nächster sinnvoller Schritt: die besten Kandidaten durch Product Check & Enrichment schicken.");
    return lines.join("\n").trim();
  }

  function appendAsyncJarvisMessage(answer, titleText = "Jarvis · Market Scout") {
    const feed = document.querySelector("#elyonJarvisPanel [data-jarvis-feed]");
    if (!feed || !answer) return false;
    const article = document.createElement("article");
    article.className = "elyon-jarvis-message jarvis";
    const head = document.createElement("div");
    head.className = "elyon-jarvis-message-head";
    const title = document.createElement("strong");
    title.textContent = titleText;
    const time = document.createElement("small");
    time.textContent = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
    head.append(title, time);
    const body = document.createElement("p");
    body.textContent = answer;
    body.style.whiteSpace = "pre-wrap";
    article.append(head, body);
    feed.appendChild(article);
    feed.scrollTop = feed.scrollHeight;
    return true;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function pollMarketScoutTask(taskMeta = {}) {
    const id = String(taskMeta.id || "").trim();
    const statusUrl = String(taskMeta.statusUrl || "").trim();
    if (!id || !statusUrl || trackedAsyncTasks.has(id)) return;
    trackedAsyncTasks.add(id);
    try {
      for (let attempt = 0; attempt < ASYNC_TASK_MAX_POLLS; attempt += 1) {
        if (attempt > 0) await wait(ASYNC_TASK_POLL_MS);
        let response;
        try {
          response = await fetch(statusUrl, { method: "GET", cache: "no-store", credentials: "omit" });
        } catch {
          continue;
        }
        if (!response.ok) continue;
        const payload = await response.json().catch(() => ({}));
        const task = payload?.task;
        const state = String(task?.status || "").toLowerCase();
        if (state === "completed") {
          const answer = marketScoutAnswer(task);
          appendAsyncJarvisMessage(answer);
          try {
            window.dispatchEvent(new CustomEvent("elyon:jarvis-async-result", { detail: { type: "market_scout", task, answer } }));
          } catch { /* optional */ }
          return;
        }
        if (["failed", "cancelled"].includes(state)) {
          const reason = String(task?.error || task?.lastError || "Research-Auftrag fehlgeschlagen.").trim();
          appendAsyncJarvisMessage(`Der Market-Scout-Hintergrundauftrag konnte nicht abgeschlossen werden: ${reason}`, "Jarvis · Market Scout Fehler");
          return;
        }
      }
      appendAsyncJarvisMessage("Der Market Scout läuft länger als erwartet. Der Auftrag bleibt im Jarvis Task Store gespeichert; du kannst im Seller Tool weiterarbeiten.", "Jarvis · Market Scout");
    } finally {
      trackedAsyncTasks.delete(id);
    }
  }

  function trackAsyncMarketScout(payload = {}) {
    const task = payload?.marketScout?.task;
    if (!task?.id || !task?.statusUrl) return;
    void pollMarketScoutTask(task);
  }

  async function runJarvisCommand(command, options, execute) {
    try {
      const autoDelegate = !execute && options?.autoDelegate !== false;
      if (autoDelegate) {
        try {
          const preview = await delegationPreview(command, options || {});
          dispatchDelegationPreview(command, preview);
        } catch {
          // Preview is side-effect-free and optional. Jarvis still proceeds with the protected auto route.
        }
      }

      const result = await request(execute ? API_URL : AUTO_API_URL, {
        method: "POST",
        body: JSON.stringify(commandBody(command, options, { execute, autoDelegate })),
      });
      rememberConversationId(result);
      trackAsyncMarketScout(result);
      return result;
    } catch (error) {
      if (error?.payload?.error === "jarvis_no_suitable_agent") {
        return directNoAgentFallback(command, error.payload);
      }
      throw error;
    }
  }

  async function preview(command, options = {}) {
    const result = await request(API_URL, {
      method: "POST",
      body: JSON.stringify(commandBody(command, options, { execute: false, autoDelegate: false })),
    });
    rememberConversationId(result);
    return result;
  }

  async function plan(command, options = {}) {
    return runJarvisCommand(command, options, false);
  }

  async function chat(command, options = {}) {
    return runJarvisCommand(command, options, false);
  }

  async function execute(command, options = {}) {
    return runJarvisCommand(command, options, true);
  }

  async function delegate(agentId, command, options = {}) {
    return execute(command, {
      ...options,
      agentId,
      maxAgents: 1,
    });
  }

  window.ElyonJarvis = Object.freeze({
    status,
    events,
    jobs,
    control,
    updateControl,
    chat,
    plan,
    preview,
    delegationPreview,
    execute,
    delegate,
    api: API_URL,
    autoApi: AUTO_API_URL,
    autoPreviewApi: AUTO_PREVIEW_API_URL,
    eventsApi: EVENTS_API_URL,
    jobsApi: JOBS_API_URL,
    controlApi: CONTROL_API_URL,
    version: VERSION,
  });

  window.dispatchEvent(new CustomEvent("elyon:jarvis-ready", {
    detail: { version: VERSION, api: API_URL, autoApi: AUTO_API_URL, autoPreviewApi: AUTO_PREVIEW_API_URL },
  }));
})();
