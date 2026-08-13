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

const requireSupabase = (env) => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("supabase_not_configured");
  }
};

const hasSupabase = (env) => Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

const normalizeSupabaseUrl = (url) => {
  const normalized = String(url || "").trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:") throw new Error("invalid_protocol");
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    throw new Error("supabase_invalid_url");
  }
};

const isSupabaseSecretKey = (key) => String(key || "").startsWith("sb_secret_");

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

const supabaseRequest = async (env, path, init = {}) => {
  requireSupabase(env);

  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeaders = isSupabaseSecretKey(supabaseKey)
    ? { apikey: supabaseKey }
    : {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`
      };

  const response = await fetch(`${normalizeSupabaseUrl(env.SUPABASE_URL)}${path}`, {
    ...init,
    headers: {
      ...authHeaders,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`supabase_http_${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json().catch(() => null);
};

const taskKey = (id) => `jarvis:task:${id}`;

const toDbTask = (task) => ({
  id: task.id,
  type: task.type,
  status: task.status,
  payload: task.payload,
  output: task.output ?? null,
  progress: task.progress,
  error: task.error ?? null,
  created_at: task.createdAt,
  updated_at: task.updatedAt,
  started_at: task.startedAt ?? null,
  finished_at: task.finishedAt ?? null
});

const fromDbTask = (row) => ({
  id: row.id,
  type: row.type,
  payload: row.payload ?? {},
  output: row.output ?? null,
  status: row.status,
  progress: row.progress ?? 0,
  error: row.error ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  startedAt: row.started_at ?? null,
  finishedAt: row.finished_at ?? null,
  source: "supabase"
});

const persistTaskToSupabase = (env, task) => supabaseRequest(env, "/rest/v1/jarvis_tasks", {
  method: "POST",
  headers: {
    Prefer: "return=minimal"
  },
  body: JSON.stringify(toDbTask(task))
});

const getTaskFromSupabase = async (env, id) => {
  const rows = await supabaseRequest(
    env,
    `/rest/v1/jarvis_tasks?id=eq.${encodeURIComponent(id)}&select=*`,
    { method: "GET" }
  );

  if (!Array.isArray(rows) || rows.length === 0) return null;
  return fromDbTask(rows[0]);
};

const parseJsonBody = async (request) => {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, error: "invalid_json_payload" };
  }
};

const publicError = (error) => {
  if (!(error instanceof Error)) return "internal_error";
  if (/^(upstash|supabase)_/.test(error.message)) return error.message;
  return "internal_error";
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "elyon-jarvis-worker", version: "0.2.1" });
      }

      if (request.method === "GET" && url.pathname === "/redis/health") {
        const pong = await redis(env, ["PING"]);
        return json({ ok: pong === "PONG", service: "upstash-redis", result: pong });
      }

      if (request.method === "GET" && url.pathname === "/supabase/health") {
        await supabaseRequest(env, "/rest/v1/jarvis_tasks?select=id&limit=1", { method: "GET" });
        return json({ ok: true, service: "supabase", status: "connected" });
      }

      if (request.method === "POST" && url.pathname === "/tasks") {
        const parsed = await parseJsonBody(request);
        if (!parsed.ok) {
          return json({ ok: false, error: parsed.error }, { status: 400 });
        }

        const body = parsed.body;
        if (!body || typeof body.type !== "string" || !body.type.trim()) {
          return json({ ok: false, error: "invalid_task_type" }, { status: 400 });
        }

        if (!hasSupabase(env)) {
          return json({ ok: false, error: "supabase_not_configured" }, { status: 500 });
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
        try {
          await persistTaskToSupabase(env, task);
        } catch (error) {
          console.error("elyon-jarvis-worker supabase persist failed", error);
          return json({
            ok: false,
            error: "supabase_persist_failed",
            taskId: id,
            task
          }, { status: 502 });
        }

        return json({ ok: true, task }, { status: 201 });
      }

      if (request.method === "GET" && url.pathname.startsWith("/tasks/")) {
        const id = url.pathname.slice("/tasks/".length).trim();
        if (!id) return json({ ok: false, error: "missing_task_id" }, { status: 400 });

        const raw = await redis(env, ["GET", taskKey(id)]);
        if (!raw) {
          if (!hasSupabase(env)) {
            return json({ ok: false, error: "task_not_found" }, { status: 404 });
          }

          const task = await getTaskFromSupabase(env, id);
          if (!task) return json({ ok: false, error: "task_not_found" }, { status: 404 });
          return json({ ok: true, task });
        }

        const task = JSON.parse(raw);
        return json({ ok: true, task });
      }

      if (request.method === "GET" && url.pathname === "/") {
        return json({
          service: "elyon-jarvis-worker",
          status: "online",
          version: "0.2.1",
          endpoints: ["/health", "/redis/health", "/supabase/health", "POST /tasks", "GET /tasks/:id"]
        });
      }

      return json({ ok: false, error: "not_found" }, { status: 404 });
    } catch (error) {
      console.error("elyon-jarvis-worker error", error);
      return json({ ok: false, error: publicError(error) }, { status: 500 });
    }
  }
};
