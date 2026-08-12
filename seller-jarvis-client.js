(() => {
  "use strict";

  const API_URL = "/api/jarvis";

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
    plan,
    execute,
    delegate,
    api: API_URL,
    version: "phase-c-v1",
  });

  window.dispatchEvent(new CustomEvent("elyon:jarvis-ready", {
    detail: { version: "phase-c-v1", api: API_URL },
  }));
})();
