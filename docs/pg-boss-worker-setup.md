# pg-boss Worker Operations

SiloCore uses pg-boss as the durable PostgreSQL queue transport for the backend worker. Normal API/worker startup manages the pg-boss schema automatically, including first-time creation and pending pg-boss migrations. The API and worker use the same native `pgBoss.loader.cjs` helper; `npm run build` copies it into `dist/` automatically.

## Environment

The worker and API connect through `DATABASE_URL` and use `PGBOSS_SCHEMA` for the pg-boss schema name. The default schema is `pgboss`. The optional pg-boss CLI uses its own `PGBOSS_DATABASE_URL` setting, so point that at the same development database when using the commands below.

```bash
cd backend
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/silocore"
export PGBOSS_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/silocore"
export PGBOSS_SCHEMA="pgboss"
```

## Developer Checks

Generate SQL for review without touching the database:

```bash
npm run pgboss:plans
```

Apply pg-boss migrations manually when debugging or verifying a controlled development database:

```bash
npm run pgboss:migrate
```

Check the installed schema version:

```bash
npm run pgboss:version
```

Check for schema drift:

```bash
npm run pgboss:doctor
```

These commands are optional developer and operational helpers. A user pulling the repo should not need to run them before starting SiloCore.

## Worker Commands

Run the worker in development:

```bash
cd backend
npm run dev:worker
```

Start the API separately with `npm run dev` and the frontend from `frontend/` with `npm run dev`. Both backend processes must use the same `DATABASE_URL`. `WORKER_CONCURRENCY` sets the number of concurrent queue jobs handled by a worker process; `PISCINA_THREAD_COUNT` sets its CPU-task thread count. Both default to `1`.

Run the compiled worker:

```bash
cd backend
npm run build
npm run start:worker
```

Use `npm run start` in another terminal for the compiled API. The normal build includes the loader, so no manual copy is needed. Docker Compose includes a separate `worker` service that uses the same backend image as the API and runs `npm run dev:worker`.

## Session title scheduling

The worker scans for eligible placeholder chat sessions every five seconds. Set
`SESSION_TITLE_SCHEDULER_INTERVAL_MS` to change the interval and
`SESSION_TITLE_SCHEDULER_BATCH_SIZE` to change the maximum candidates per scan
(default 50, maximum 100). The scheduler starts after queue reconciliation and
stale-job recovery, and drains before the queue closes on shutdown.

For each session, it claims the latest eligible assistant reply under a
PostgreSQL advisory lock and creates a `chat.session_title` application job
through `JobService`. The application job contains only the session and
assistant message IDs; the pg-boss message contains only the application job
ID. A nonterminal title job blocks another attempt for the session. Once a
reply is claimed, failures and insufficient-context results do not schedule
that reply again. A later eligible reply permits another attempt after the
current job reaches a terminal state.

## Validation jobs

The current validation job is an internal deterministic queue check, not a frontend screen. An ADMIN can enqueue it with `POST /api/admin/system/validation-jobs` and optional JSON body `{ "mode": "success" }` or `{ "mode": "fail" }`. Supply `Authorization: Bearer <jwt>` and an owned workspace's numeric `X-Workspace-Id` on this and subsequent requests. The enqueue response is `202` with the public job under `data`.

Use `GET /api/jobs/:jobId` to inspect the job, `GET /api/jobs/:jobId/stream` to receive SSE snapshots and updates, and `POST /api/jobs/:jobId/cancel` to request cancellation. These routes are available only through the selected owned workspace. Cancellation first produces `CANCEL_REQUESTED`; the worker marks `CANCELLED` at a checkpoint. Jobs can also finish `SUCCEEDED` or `FAILED`. A fast job may reach a terminal state before the stream emits an intermediate progress event.

## Workspace job-status feed

`GET /api/jobs/events` is a reusable authenticated SSE feed for selected job categories in the request workspace. Both query parameters are required: `types` accepts up to 16 exact, comma-separated `Job.type` values (up to 128 characters each), and `statuses` accepts up to six comma-separated durable `JobStatus` values. Empty entries, wildcards and unknown statuses are rejected. For example:

```http
GET /api/jobs/events?types=validation.fixture&statuses=SUCCEEDED,FAILED
Authorization: Bearer <jwt>
X-Workspace-Id: <owned-workspace-id>
```

The stream sends `ready` with `{}` when established and `job` events with only `{jobId,type,status}`. It sends SSE comment keepalives every 15 seconds. PostgreSQL notifications contain only `{jobId,event}` and serve as wake-up hints; the feed re-reads durable job state under the request workspace before emitting. A five-second paginated fallback scan covers matching active jobs and jobs completed within the last 15 minutes. The feed deduplicates observed job/status pairs but does not replay every intermediate transition. Clients should reconcile their current state on `ready` and fetch authoritative data when a matching `job` event arrives.
