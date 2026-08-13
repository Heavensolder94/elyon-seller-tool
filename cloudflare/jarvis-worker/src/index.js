const json = (data, init = {}) => Response.json(data, {
  ...init,
  headers: {
    "cache-control": "no-store",
    ...(init.headers || {})
  }
});

const requireRedis = (env) => {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error("upstash_not_configured");
  }
};

const redis = async (env, command) => {
  requireRedis(env);
  const response = await fetch(env.UPSTASH_REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    throw new Error(body.error || `upstash_http_${response.status}`);
  }
  return body.result;
};

const taskKey = (id) => `jarvis:task:${id}`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "elyon-jarvis-worker", version: "0.2.0" });
      }

      if (request.method === "GET" && url.pathname === "/redis/health") {
        const pong = await redis(env, ["PING"]);
        return json({ ok: pong === "PONG", service: "upstash-redis", result: pong });
      }

      if (request.method === "POST" && url.pathname === "/tasks") {
        const body = await request.json().catch(() => null);
        if (!body || typeof body.type !== "string" || !body.type.trim()) {
          return json({ ok: false, error: "invalid_task_type" }, { status: 400 });
        }

        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const task = {
          id,
          type: body.type.trim(),
          payload: body.payload ?? {},
          status: "queued",
          progress: 0,
          createdAt: now,
          updatedAt: now
        };

        await redis(env, ["SET", taskKey(id), JSON.stringify(task), "EX", "86400"]);
        return json({ ok: true, task }, { status: 201 });
      }

      if (request.method === "GET" && url.pathname.startsWith("/tasks/")) {
        const id = url.pathname.slice("/tasks/".length).trim();
        if (!id) return json({ ok: false, error: "missing_task_id" }, { status: 400 });

        const raw = await redis(env, ["GET", taskKey(id)]);
        if (!raw) return json({ ok: false, error: "task_not_found" }, { status: 404 });

        const task = JSON.parse(raw);
        return json({ ok: true, task });
      }

      if (request.method === "GET" && url.pathname === "/") {
        return json({
          service: "elyon-jarvis-worker",
          status: "online",
          version: "0.2.0",
          endpoints: ["/health", "/redis/health", "POST /tasks", "GET /tasks/:id"]
        });
      }

      return json({ ok: false, error: "not_found" }, { status: 404 });
    } catch (error) {
      console.error("elyon-jarvis-worker error", error);
      const message = error instanceof Error ? error.message : "internal_error";
      return json({ ok: false, error: message }, { status: 500 });
    }
  }
};
