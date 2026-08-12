(() => {
  "use strict";

  const API_URL = "/api/jarvis";
  const EVENTS_API_URL = "/api/jarvis-events";
  const JOBS_API_URL = "/api/jarvis-jobs";
  const CONTROL_API_URL = "/api/jarvis-control";
  const VERSION = "phase-e4-v1";

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

  async function plan(command, options = {}) {
    return request(API_URL, {
      method: "POST",
      body: JSON.stringify({
        ...options,
        command,
        execute: false,
        mode: "plan",
      }),
    });
  }

  async function execute(command, options = {}) {
    return request(API_URL, {
      method: "POST",
      body: JSON.stringify({
        ...options,
        command,
        execute: true,
        mode: "execute",
      }),
    });
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
