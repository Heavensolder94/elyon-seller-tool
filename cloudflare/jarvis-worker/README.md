# Elyon Jarvis Worker

Cloudflare Worker for the Elyon Jarvis task gateway, Task Runtime V1, and safe product checks.

## Architecture

The Worker keeps fast runtime state, durable history, and background execution separate:

- Vercel owns UI, light API calls, and the Jarvis interface.
- Cloudflare Worker validates HTTP requests, creates tasks, publishes queue messages, exposes status, and consumes queue jobs.
- Cloudflare Queue transports small job messages only.
- Upstash Redis stores short-lived runtime state, progress, retry counters, idempotency cache, locks, rate limits, and temporary state.
- Supabase stores durable task history, task output, agent runs, and memory.

Queue messages stay small:

```json
{
  "taskId": "UUID",
  "type": "product-check"
}
```

No product object, listing payload, buyer data, API token, or supplier payload belongs in the queue message.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | Service metadata and endpoint list |
| `GET` | `/health` | Worker-only healthcheck |
| `GET` | `/redis/health` | Upstash Redis connectivity check |
| `GET` | `/supabase/health` | Supabase connectivity check against `jarvis_tasks` |
| `GET` | `/runtime/health` | Runtime and queue binding health |
| `POST` | `/tasks` | Create a queued Jarvis task in Upstash and Supabase, then publish to Queue |
| `GET` | `/tasks/:id` | Read a task from Upstash, with Supabase fallback |

## Task Runtime Lifecycle

```txt
POST /tasks
  -> Upstash task write
  -> Supabase jarvis_tasks write
  -> Cloudflare Queue message
  -> HTTP response
  -> Queue consumer loads task
  -> queued -> running
  -> RuntimeTestHandler or ProductCheckHandler
  -> completed or failed
  -> Upstash updated
  -> Supabase updated
  -> jarvis_agent_runs written
```

The browser does not wait for handler execution. After the queue message is accepted, the task can finish with the browser closed.

## Producer

`POST /tasks` creates the task and publishes:

```json
{
  "taskId": "task-id",
  "type": "runtime-test"
}
```

If queue publishing fails, the Worker returns `queue_publish_failed` and marks the stored task as `failed` with a controlled `last_error`.

## Consumer

The Worker exports a Cloudflare Queue `queue(batch, env)` handler. For each message it:

- validates the queue message
- loads the task from Supabase first, with Upstash fallback
- skips and acknowledges missing, terminal, or cancelled tasks
- checks idempotency before executing
- creates a `jarvis_agent_runs` row
- sets the task to `running`
- dispatches to a handler
- stores output and marks the task `completed`
- stores failed attempts and retries until `max_attempts`

## Dispatcher and Handlers

V1 intentionally includes only safe handlers:

| Task type | Handler | Productive external action |
| --- | --- | --- |
| `runtime-test` | `runtime-test-handler` | No |
| `product-check` | `product-check-handler` | No |
| unknown | `unsupported-task-handler` | No |

The runtime-test output is:

```json
{
  "processed": true,
  "handler": "runtime-test",
  "message": "Jarvis Task Runtime V1 completed successfully"
}
```

No eBay draft, live listing, supplier mutation, Nova mutation, Company OS mutation, Listing Designer action, or Auto Lister action is executed.

## ProductCheckHandler V1

`ProductCheckHandler` is the first domain handler for Jarvis Runtime. It processes tasks of type:

```txt
product-check
```

Input payload:

```json
{
  "productId": "PRODUCT-MASTER-ID-OR-SKU"
}
```

The queue message still contains only:

```json
{
  "taskId": "task-id",
  "type": "product-check"
}
```

### Product Data Source

The handler reads product data from the existing Seller Product Master in Upstash:

```txt
elyon_products
```

It can fall back to legacy browser imports:

```txt
elyon_browser_imports
```

This is read-only. The handler does not write product records, Company OS records, Nova records, supplier records, eBay drafts, or live eBay listings.

### Checks

ProductCheckHandler V1 performs deterministic checks only:

- data quality and missing fields
- purchase price, selling price, known explicit costs, margin, and margin percentage
- Elyon minimum rule: at least 20 percent margin or at least 5 EUR profit
- manufacturer, EU responsible person, GPSR/compliance data
- sensitive product class indicators from existing title/category text
- listing readiness and recommendation

No LLM is called in V1. `model = null` and `cost = 0` are stored in `jarvis_agent_runs`.

### Output Schema

The task output is stable, structured, and machine-readable:

```json
{
  "processed": true,
  "handler": "product-check",
  "productId": "prod-001",
  "productSource": "seller_product_master",
  "product": {
    "id": "prod-001",
    "articleNumber": "ELY-000001",
    "sku": "ELY-000001",
    "title": "Product title",
    "source": "elyon_company_os",
    "supplier": {
      "id": null,
      "name": "Supplier",
      "url": "https://supplier.example"
    }
  },
  "dataQuality": {
    "score": 82,
    "missingFields": [],
    "warnings": []
  },
  "economics": {
    "purchasePrice": 12.5,
    "sellingPrice": 24.99,
    "absoluteMargin": 12.49,
    "marginPercent": 49.98,
    "knownAdditionalCosts": 0,
    "feeAmount": null,
    "status": "pass",
    "minimumRule": "Mindestens 20 % Marge oder mindestens 5 EUR Gewinn.",
    "reasons": []
  },
  "compliance": {
    "risk": "medium",
    "missing": [],
    "warnings": []
  },
  "listingReadiness": {
    "status": "needs_review",
    "reasons": []
  },
  "recommendation": {
    "decision": "review",
    "reasons": []
  },
  "cost": {
    "llmUsed": false,
    "model": null,
    "amount": 0
  }
}
```

### Decisions

Recommendation values:

```txt
pass
review
reject
```

Listing readiness values:

```txt
ready
needs_data
needs_review
reject
```

Every non-pass decision includes reason codes, for example:

```txt
missing_mainImage
missing_required_product_data
pricing_data_missing
margin_below_threshold
negative_margin
missing_compliance_data
high_compliance_risk
data_quality_below_threshold
```

### Error Codes

Controlled ProductCheck errors and reason codes:

```txt
invalid_product_id
product_not_found
product_source_unavailable
missing_required_product_data
pricing_data_missing
internal_error
```

`invalid_product_id` and `product_not_found` are non-retryable and fail the task after one consumer attempt. `product_source_unavailable` is retryable because it can be caused by temporary Upstash availability. `missing_required_product_data` and `pricing_data_missing` normally complete the task with `needs_data` or `needs_review`, so the missing facts remain visible in the structured output.

## Retry Behavior

Runtime V1 uses:

```txt
maxAttempts = 3
```

Consumer behavior:

- Invalid queue message: `ack`
- Missing task: `ack`
- Cancelled task: `ack`
- Completed/failed terminal task: `ack`
- Successful handler: `ack`
- Attempt 1 failure: task stays `queued`, message `retry`
- Attempt 2 failure: task stays `queued`, message `retry`
- Attempt 3 failure: task becomes `failed`, message `ack`

Cloudflare queue config also sets `max_retries` to `3`. The application-level attempt counter in Supabase is the durable source for final failure.

## Idempotency

Every task has an `idempotency_key`.

If the caller does not provide one, V1 uses:

```txt
<task-type>:<task-id>:v1
```

Before handler execution, the consumer checks:

- Upstash: `jarvis:idempotency:<key>`
- Supabase: completed `jarvis_tasks` rows with the same `idempotency_key`

If a completed idempotency record exists, the task is marked `completed` with the existing output and the queue message is acknowledged without executing the handler again.

## Upstash Keys

| Key | Purpose | TTL |
| --- | --- | --- |
| `jarvis:task:<id>` | Runtime task state and progress | 24 hours |
| `jarvis:task:<id>:attempt` | Current attempt counter | 24 hours |
| `jarvis:idempotency:<key>` | Completed idempotency cache | 30 days |
| `jarvis:lock:<resource>` | Reserved naming pattern for later locks | Depends on future lock |
| `elyon_products` | Existing Seller Product Master source for ProductCheckHandler | Product Master policy |
| `elyon_browser_imports` | Legacy read fallback for ProductCheckHandler | Legacy import policy |

## Supabase Tables

Runtime V1 uses:

- `jarvis_tasks`
- `jarvis_agent_runs`
- `jarvis_memory`

Additional task fields are added by the runtime migration:

```txt
attempt_count
max_attempts
idempotency_key
last_error
```

## Environment Variables

Configure these as Cloudflare Worker secrets. Do not commit real values.

```txt
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. It must not be used in the browser, Vercel frontend code, or the Chrome extension.

## Queue Configuration

Queue name:

```txt
elyon-jarvis-jobs
```

Worker binding:

```txt
JARVIS_TASK_QUEUE
```

Create the queue before deploy:

```bash
wrangler queues create elyon-jarvis-jobs
```

`wrangler.jsonc` configures this Worker as both producer and consumer.

## Migrations

Run migrations before deploying Runtime V1:

```bash
supabase db push
```

Relevant migrations:

```txt
supabase/migrations/20260813190000_jarvis_supabase_v1.sql
supabase/migrations/20260813203000_jarvis_task_runtime_v1.sql
```

## Local Tests

From the Worker folder:

```bash
npm test
```

Equivalent direct command:

```bash
node --test test/*.test.mjs
```

The tests mock Upstash, Supabase, and Cloudflare Queue. No real secrets are required.

## Deployment

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
curl https://elyon-jarvis-worker.mailvahanam-raoul.workers.dev/runtime/health
```

Expected runtime response:

```json
{
  "ok": true,
  "service": "jarvis-task-runtime",
  "queue": "configured",
  "maxAttempts": 3
}
```

## Live Test

Safe runtime test:

```bash
curl -X POST "https://elyon-jarvis-worker.mailvahanam-raoul.workers.dev/tasks" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"runtime-test\",\"payload\":{\"source\":\"manual-live-test\"}}"
```

Then poll:

```bash
curl "https://elyon-jarvis-worker.mailvahanam-raoul.workers.dev/tasks/<task-id>"
```

Expected transition:

```txt
queued -> running -> completed
```

Supabase checks:

- `jarvis_tasks.status = completed`
- `jarvis_tasks.output.processed = true`
- one `jarvis_agent_runs` row with `agent_name = runtime-test-handler`

Safe product-check test:

```bash
curl -X POST "https://elyon-jarvis-worker.mailvahanam-raoul.workers.dev/tasks" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"product-check\",\"payload\":{\"productId\":\"TEST-ID\"}}"
```

Then poll:

```bash
curl "https://elyon-jarvis-worker.mailvahanam-raoul.workers.dev/tasks/<task-id>"
```

Expected success transition for an existing Product Master record:

```txt
queued -> running -> completed
```

Expected controlled failure for an invalid or unknown product:

```txt
failed
```

Supabase checks:

- `jarvis_tasks.output.handler = product-check`
- `jarvis_tasks.output.recommendation.decision` is `pass`, `review`, or `reject`
- one `jarvis_agent_runs` row with `agent_name = product-check-handler`

## Next Steps

- Dedicated dead-letter handling
- Cancel endpoint
- Cloudflare Queue dashboards and alerts
- MarketAnalysisHandler
- Memory Retrieval
- Experiences
- Skills / Playbooks
- Optional OpenRouter Model Router summaries for qualitative product review
