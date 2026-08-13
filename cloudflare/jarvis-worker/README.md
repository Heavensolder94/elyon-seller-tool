# Elyon Jarvis Worker

Cloudflare Worker for the Elyon Jarvis task entrypoint.

## Architecture

The Worker keeps fast task state and durable Jarvis history separate:

- Cloudflare Worker receives HTTP requests.
- Upstash Redis stores short-lived task state, progress, locks, cache, rate limits, and temporary data.
- Supabase stores durable task history and prepares the database layer for later agent runs, Jarvis memory, experiences, skills, and playbooks.

V1 performs a dual write for new tasks: first to Upstash, then to Supabase `jarvis_tasks`. Existing Upstash behavior remains the fast read path.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | Service metadata and endpoint list |
| `GET` | `/health` | Worker-only healthcheck |
| `GET` | `/redis/health` | Upstash Redis connectivity check |
| `GET` | `/supabase/health` | Supabase connectivity check against `jarvis_tasks` |
| `POST` | `/tasks` | Create a queued Jarvis task in Upstash and Supabase |
| `GET` | `/tasks/:id` | Read a task from Upstash, with Supabase fallback |

## Environment Variables

Configure these as Cloudflare Worker secrets. Do not commit real values.

```txt
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. It must not be used in the browser, Vercel frontend code, or the Chrome extension.

## Upstash Role

Upstash remains responsible for short-lived operational state:

- queued, running, completed, failed, and cancelled task status
- progress
- locks
- cache
- rate limits
- temporary task data

Task keys use `jarvis:task:{id}` and currently expire after 24 hours.

## Supabase Role

Supabase is the durable persistence layer for:

- task history in `jarvis_tasks`
- agent run history in `jarvis_agent_runs`
- Jarvis memory in `jarvis_memory`
- later experiences
- later skills and playbooks

Run the migration before using `/supabase/health` or the task dual write:

```bash
supabase db push
```

Migration:

```txt
supabase/migrations/20260813190000_jarvis_supabase_v1.sql
```

## Local Tests

From the Worker folder:

```bash
npm test
```

The tests mock Upstash and Supabase, so no real secrets are required.

## Cloudflare Deployment

Set secrets:

```bash
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Deploy:

```bash
wrangler deploy
```

## Healthchecks

After deployment:

```bash
curl https://elyon-jarvis-worker.mailvahanam-raoul.workers.dev/redis/health
curl https://elyon-jarvis-worker.mailvahanam-raoul.workers.dev/supabase/health
```

Expected Supabase response:

```json
{
  "ok": true,
  "service": "supabase",
  "status": "connected"
}
```

## Next Steps

- Cloudflare Queue
- Worker Consumer
- Agent Runs
- Experiences
- Memory Retrieval
- Skills / Playbooks
- OpenRouter Model Router
