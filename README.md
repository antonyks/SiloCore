# SiloCore

SiloCore is an open-source, full-stack AI chat platform for teams and developers who want a private application layer around dedicated or self-hosted AI infrastructure.

The project is currently in **active alpha**. Core chat, private workspaces, admin tools, jobs, and Ollama and OpenAI-compatible inference are implemented, but APIs and setup details may still change.

## What It Does

- Provides authenticated AI chat for regular users.
- Streams assistant responses over server-sent events.
- Supports Ollama and OpenAI-compatible inference through persisted provider configuration.
- Lets admins manage users, access status, provider settings, and model discovery.
- Keeps workspace content private to its owner in Core mode.
- Exposes aggregate admin analytics and system health without giving admins direct access to private user conversations.
- Ships as a TypeScript monorepo with a React frontend, Express backend, Prisma, PostgreSQL, and Docker Compose.

## Tech Stack

**Frontend**

- React, TypeScript, Vite
- Tailwind CSS
- React Router
- TanStack Query
- Axios
- React Hook Form and Zod

**Backend**

- Node.js, Express, TypeScript
- Prisma ORM
- PostgreSQL
- JWT authentication
- Ollama and OpenAI-compatible provider adapters
- pg-boss job queue and Piscina worker threads
- Jest tests

**Local infrastructure**

- Docker Compose
- PostgreSQL 16
- Optional local Ollama runtime

## Project Structure

```text
.
├── backend/                 # Express API, Prisma schema, tests, Bruno API collection
├── frontend/                # React app and route-level feature modules
├── docker-compose.yml       # Local development stack
├── CONTRIBUTING.md          # Contribution guidance
└── LICENSE                  # Apache-2.0 license
```

The backend is organized by feature modules under `backend/src/modules`. Controllers handle HTTP parsing, services hold business rules, repositories handle Prisma access, and route files wire middleware and validation.

The frontend is organized by features under `frontend/src/features`, with shared layout, routing, UI, config, and API client utilities under `frontend/src`.

## Prerequisites

- Docker and Docker Compose
- Node.js 22.12+ if running backend services outside Docker
- npm
- Ollama if you want local Ollama inference; an accessible OpenAI-compatible endpoint is another option

For local Ollama chat generation, start Ollama on your host machine and make sure the model configured in `backend/.env` is available.

```bash
ollama pull llama3.1
```

You can use a different model as long as `OLLAMA_MODEL` matches it.

## Quick Start With Docker

1. Copy the environment files:

   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

2. Edit `backend/.env` and set a real JWT secret:

   ```env
   JWT_SECRET=replace_this_with_a_long_random_secret
   OLLAMA_HOST=http://host.docker.internal:11434
   OLLAMA_MODEL=llama3.1
   ```

3. Start the stack:

   ```bash
   docker compose up --build
   ```

Docker Compose starts PostgreSQL, the API, a separate worker service, and the frontend. The API container applies existing Prisma migrations and seeds local demo users. The API and worker manage the pg-boss queue schema on startup. The frontend runs at `http://localhost:5173`, and the API health check is at `http://localhost:5000/health`.

### Local Demo Accounts

These accounts are created by the seed script for local development only:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@example.com` | `Admin123!` |
| User | `user@example.com` | `User123!` |

## Running Without Docker

Use this path when you want direct control over each service during development.

1. Start PostgreSQL and create a database named `silocore`.

2. Install backend dependencies:

   ```bash
   cd backend
   npm install
   cp .env.example .env
   ```

3. For a local PostgreSQL process, set `DATABASE_URL` in `backend/.env` to use `localhost`:

   ```env
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/silocore
   JWT_SECRET=replace_this_with_a_long_random_secret
   OLLAMA_HOST=http://localhost:11434
   OLLAMA_MODEL=llama3.1
   ```

4. Apply the existing database migrations, seed demo users, and start the API from `backend/`:

   ```bash
   npm run prisma:generate
   npx prisma migrate deploy
   npx prisma db seed
   npm run dev
   ```

5. In a second terminal, start the worker from `backend/`:

   ```bash
   cd backend
   npm run dev:worker
   ```

6. In a third terminal, start the frontend:

   ```bash
   cd frontend
   npm install
   cp .env.example .env
   npm run dev
   ```

The frontend runs at `http://localhost:5173`. The default frontend API URL is `http://localhost:5000/api`. Use the same `DATABASE_URL` for the API and worker. Starting the worker requires no separate pg-boss migration or loader-copy command.

For compiled execution, run `npm run build` in `backend/`, then use `npm run start` for the API and `npm run start:worker` in separate terminals. The build includes the shared native pg-boss loader in `dist/` automatically.

## Environment Variables

Backend variables live in `backend/.env`:

| Variable | Purpose |
| --- | --- |
| `PORT` | Backend port, default `5000` |
| `NODE_ENV` | Runtime environment |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret used to sign JWTs |
| `OLLAMA_HOST` | Ollama base URL |
| `OLLAMA_MODEL` | Default model used when bootstrapping the local provider |
| `EMBEDDING_MODEL` | Reserved for embedding-related work |
| `WORKER_CONCURRENCY` | Concurrent queue jobs handled by the worker, default `1` |
| `PISCINA_THREAD_COUNT` | Piscina CPU task threads used by worker handlers, default `1` |
| `WORKER_SHUTDOWN_GRACE_MS` | Worker graceful shutdown timeout in milliseconds, default `30000` |
| `WORKER_JOB_HEARTBEAT_INTERVAL_MS` | Worker application job heartbeat interval in milliseconds, default `10000` |
| `WORKER_STALE_JOB_MS` | Running job stale recovery threshold in milliseconds, default `300000` |
| `PGBOSS_SCHEMA` | PostgreSQL schema used by pg-boss, default `pgboss` |

Frontend variables live in `frontend/.env`:

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Backend API base URL, usually `http://localhost:5000/api` |
| `VITE_APP_NAME` | App name displayed by the frontend |

## Main Application Areas

### Workspaces and User Chat

Each user receives one `PERSONAL` workspace and can create additional `STANDARD` workspaces. In Core mode, both are owner-private and non-shareable. Users can rename or delete their own `STANDARD` workspaces; a `PERSONAL` workspace cannot be renamed, deleted, shared, or transferred. A membership row for a non-owner does not grant Core access, even if it remains stored and active. The membership schema is forward-compatible; Core does not require dormant grants to be deleted or rewritten.

Regular users can create, retitle, delete, and search recent chat sessions in their selected workspace. Chat supports streaming responses, model selection, and generation settings such as temperature, top-p, max tokens, and stop sequences. Workspace selection comes from each tab's URL, such as `/workspaces/12/chat/home`, so separate tabs can select different workspaces. A regular-user login opens their `PERSONAL` workspace; an admin login opens `/analytics/dashboard`.

### Admin Console

Admins can manage users, provider settings, model discovery, and `STANDARD` workspace metadata, including listing and soft deletion. These powers do not grant access to another owner's private chat or other workspace content. The current admin dashboard shows system-wide operational aggregates such as generation, job, and provider-health metrics, without private prompt or response text.

### LLM Provider Layer

Provider configuration is stored in PostgreSQL. Admins can configure an `ollama` or `openai-compatible` provider with a name, base URL, default model, enabled state, and optional API key, extra headers, timeout, and generation defaults. For an OpenAI-compatible server, enter its API root as `baseUrl` (commonly ending in `/v1`); the adapter appends `/models`, `/chat/completions`, and `/embeddings`. Use an API key if the endpoint requires one. API responses report `hasApiKey` instead of returning the key.

Provider capabilities describe adapter operations, such as streaming, model listing, embeddings, and model pulling. Model capabilities are separate `SUPPORTED`, `UNSUPPORTED`, or `UNKNOWN` observations, rather than a guarantee inferred from the provider type. OpenAI-compatible model pulling is unsupported; Ollama supports it. The backend enforces capability guards, while the frontend uses these flags to show available controls.

### Jobs

The API and worker share a durable pg-boss queue. A job moves through `QUEUED`, `RUNNING`, and optionally `CANCEL_REQUESTED`, then finishes as `SUCCEEDED`, `FAILED`, or `CANCELLED`. Cancellation is a request: a queued or running job is marked `CANCEL_REQUESTED`, and the worker completes cancellation at a checkpoint. Repeating a cancellation request on a terminal job returns its current state. Job status and SSE results contain sanitized public job fields rather than the stored job payload.

The current validation job is an internal, deterministic worker check. Only an admin may enqueue it; any authenticated owner of its workspace may read its status, stream updates, or request cancellation. There is no frontend job screen.

## API Overview

All API routes are mounted under `/api`.

| Area | Routes |
| --- | --- |
| Auth | `POST /api/auth/login` |
| Current user and admin user management | `/api/users/*` |
| Chat sessions, messages, and generation | `/api/chat/*` |
| Workspace selection and management | `/api/workspaces/*` |
| Authenticated model registry | `/api/llm/*` |
| Admin provider management | `/api/admin/llm/providers/*` |
| Admin analytics and system status | `/api/admin/analytics/*`, `/api/admin/system/*` |
| Workspace-scoped job status, stream, cancellation | `/api/jobs/:jobId`, `/api/jobs/:jobId/stream`, `/api/jobs/:jobId/cancel` |

Every authenticated request requires a positive numeric `X-Workspace-Id` for an active workspace the caller owns, including admin and job routes. Identity-establishing authentication requests such as login are exempt. The login response supplies the user's personal workspace ID for the first authenticated request. JWTs identify users; they do not select a workspace or confer membership. Missing, malformed, or inaccessible workspace IDs are rejected without revealing whether another user's workspace exists.

Authenticated requests use both headers:

```http
Authorization: Bearer <jwt>
X-Workspace-Id: <owned-workspace-id>
```

For example, after admin login, enqueue a validation job in an owned workspace, then use the returned `data.id` as `<job-id>`:

```bash
curl -X POST http://localhost:5000/api/admin/system/validation-jobs \
  -H 'Authorization: Bearer <admin-jwt>' \
  -H 'X-Workspace-Id: <owned-workspace-id>' \
  -H 'Content-Type: application/json' \
  -d '{"mode":"success"}'
curl 'http://localhost:5000/api/jobs/<job-id>' \
  -H 'Authorization: Bearer <jwt>' -H 'X-Workspace-Id: <owned-workspace-id>'
curl -N 'http://localhost:5000/api/jobs/<job-id>/stream' \
  -H 'Authorization: Bearer <jwt>' -H 'X-Workspace-Id: <owned-workspace-id>'
curl -X POST 'http://localhost:5000/api/jobs/<job-id>/cancel' \
  -H 'Authorization: Bearer <jwt>' -H 'X-Workspace-Id: <owned-workspace-id>'
```

The enqueue route accepts `mode: "success"` (default) or `mode: "fail"`. It returns `202` with a public job in `data`; the status route returns `data` for that job. The SSE route sends a `snapshot`, possible `progress` and `heartbeat` events, and a terminal `succeeded`, `failed`, or `cancelled` event. Fast jobs may finish before an intermediate update is observed.

The backend includes a Bruno API collection under `backend/bruno/SiloCore` for manual API testing.

## Development Commands

Backend commands are run from `backend/`:

```bash
npm run dev
npm run dev:worker
npm run build
npm run start
npm run start:worker
npm test
npm run test:integration
npm run lint
npm run prisma:generate
npm run prisma:migrate
npm run pgboss:plans
npm run pgboss:migrate
npm run pgboss:version
npm run pgboss:doctor
```

Frontend commands are run from `frontend/`:

```bash
npm run dev
npm run build
npm run lint
npm run test
npm run test:e2e
npm run preview
```

### End-to-End Tests

Playwright tests live in `frontend/e2e` and manage their own local test stack. The suite requires Docker, installed backend and frontend dependencies, and a Playwright browser. Do not point it at a production database or reuse a running application stack. It checks that its ports are free, starts a disposable PostgreSQL 16 container on `127.0.0.1:55432`, builds the backend, applies existing migrations and seeds that test database, and starts its own API on port `5001`, frontend on port `5173`, deterministic local provider upstreams, and worker when a job test needs it. It stops only test-owned services and removes its test container during teardown; unrelated services are left alone. If one of these ports is occupied, free it before running the suite.

Coverage includes multi-tab workspace isolation, real API streaming through deterministic Ollama and OpenAI-compatible mock upstreams, validation-job execution, and login redirects. No external model service or paid provider credentials are needed. Use synthetic test data and credentials. On failure, Playwright retains screenshots and traces in `frontend/test-results/`, an HTML report in `frontend/playwright-report/`, and sanitized API/worker diagnostics as a test attachment.

Before the first local Playwright run, install browser binaries:

```bash
cd frontend
npx playwright install
```

Run the suite from `frontend/`:

```bash
npm run test:e2e
```

Optional environment overrides:

| Variable | Managed stack default | Purpose |
| --- | --- | --- |
| `PLAYWRIGHT_BASE_URL` | `http://127.0.0.1:5173` | Test-owned frontend URL |
| `PLAYWRIGHT_API_URL` | `http://127.0.0.1:5001/api` | Test-owned API URL |

These overrides must remain local HTTP URLs on free ports. The managed fixture supplies its own frontend URL to Playwright and builds both URLs into the services it starts.

## Testing

The backend uses Jest and includes tests for auth, users, chat, LLM provider behavior, provider config management, model registry aggregation, streaming flows, and system status logic.

```bash
cd backend
npm test
```

Backend integration tests are opt-in and use a disposable PostgreSQL database. Set `INTEGRATION_DATABASE_URL` to a database whose name includes `test`; the harness drops, recreates, migrates, and truncates that database during the run. Use only a database you intend the harness to replace. If local port `5432` is occupied by another PostgreSQL instance, start a disposable PostgreSQL container on port `55432` and change the URL accordingly. Shut down only the container you started after the run. Provider integration tests use deterministic local upstreams, not paid services.

```bash
cd backend
INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/silocore_integration_test npm run test:integration
```

The frontend uses Vitest for unit tests and Playwright for local E2E coverage:

```bash
cd frontend
npm run test
npm run test:e2e
npm run build
npm run lint
```

## Current and Planned Boundaries

Current Core has private, single-owner workspaces; neutral backend composition factories and frontend extension registration, routes, navigation, capabilities, and workspace slots are implemented. These presentation contracts do not grant backend access. Current admin analytics are system-wide operational aggregates. General operational metrics and suitable privacy-safe workspace usage reporting remain Core work; only analytics explicitly classified for Enterprise collaboration or governance belong to Enterprise.

Planned Core work includes admin recovery that can reassign any `STANDARD` workspace from any owner to any target user without the current owner's participation, and selective PostgreSQL row-level security for sensitive workspace-owned content. Neither recovery nor RLS is implemented. RLS will supplement service authorization and scoped queries, while preserving global worker and administrative operations where needed.

Future Enterprise work may activate sharing and governance for `STANDARD` workspaces and return to ordinary Core owner-only behavior when its entitlement is disabled or expires, without deleting dormant membership and governance data. Enterprise licensing, optional extension loading, live activation and downgrade, sharing, groups, and RBAC are not implemented. RAG and retrieval, context governance, blob storage, MCP and tool execution, and multi-agent orchestration are also deferred.

## Contributing

Contributions are welcome. See `CONTRIBUTING.md` for setup notes, code style, and pull request guidance.

## License

SiloCore is licensed under the Apache License 2.0. See `LICENSE` for details.
