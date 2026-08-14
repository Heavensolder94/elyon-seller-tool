(() => {
  "use strict";

  const API_URL = "/api/jarvis";
  const CONVERSATION_STORAGE_KEY = "elyon_jarvis_conversation_id_v2a";
  const EVENTS_API_URL = "/api/jarvis-events";
  const JOBS_API_URL = "/api/jarvis-jobs";
  const CONTROL_API_URL = "/api/jarvis-control";
  const VERSION = "phase-e4-v1.1";

  function getConversationId() {
    try { return window.sessionStorage.getItem(CONVERSATION_STORAGE_KEY) || ""; } catch { return ""; }
  }

  function rememberConversationId(payload) {
    try { if (payload?.conversationId) window.sessionStorage.setItem(CONVERSATION_STORAGE_KEY, String(payload.conversationId)); } catch { /* optional */ }
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
    return request(API_URL, { method: "GET" });
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

  async function runJarvisCommand(command, options, execute) {
    try {
      const result = await request(API_URL, {
        method: "POST",
        body: JSON.stringify({
          ...options,
          conversationId: options?.conversationId || getConversationId(),
          channel: options?.channel || "seller_tool",
          command,
          execute,
          mode: execute ? "execute" : "plan",
        }),
      });
      rememberConversationId(result);
      return result;
    } catch (error) {
      if (error?.payload?.error === "jarvis_no_suitable_agent") {
        return directNoAgentFallback(command, error.payload);
      }
      throw error;
    }
  }

  async function plan(command, options = {}) {
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
    plan,
    execute,
    delegate,
    api: API_URL,
    eventsApi: EVENTS_API_URL,
    jobsApi: JOBS_API_URL,
    controlApi: CONTROL_API_URL,
    version: VERSION,
  });

  window.dispatchEvent(new CustomEvent("elyon:jarvis-ready", {
    detail: { version: VERSION, api: API_URL },
  }));
})();
