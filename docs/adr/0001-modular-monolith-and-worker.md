# ADR 0001: Modular Monolith And Worker

Status: Accepted

Date: 2026-07-27

## Context

SiloCore is currently a TypeScript monorepo with an Express API in `backend/`, a React/Vite frontend in `frontend/`, Prisma for relational data access, PostgreSQL for persistence, and Docker Compose for local infrastructure. The backend follows a feature-module structure under `backend/src/modules`, where controllers handle HTTP parsing, services own business rules, repositories own Prisma access, and route files wire middleware and validation.

Future durable background work is planned before RAG, context governance, and multi-agent features. That work needs a separately runnable worker process, but it should not split the backend into separate services or repositories at this stage.

## Decision

Keep SiloCore as a modular monolith.

The API and worker will live in the same backend codebase and build artifact, with separately runnable entry points for request-serving and background work. Backend domain code should continue to be organized under `backend/src/modules` unless a later decision establishes a clearer shared-runtime boundary.

The worker will be introduced by a later implementation task. This ADR records the target architecture only and does not add worker runtime code.

## Consequences

The project keeps simple local development, shared types, shared infrastructure, and one deployable backend codebase while still allowing API and worker processes to scale independently later.

Module boundaries remain important. Background handlers should call application services or clearly separated worker services rather than bypassing business rules or repository scoping.
