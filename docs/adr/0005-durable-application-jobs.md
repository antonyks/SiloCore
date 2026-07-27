# ADR 0005: Durable Application Jobs

Status: Accepted

Date: 2026-07-27

## Context

SiloCore will need durable background processing before later RAG, context-governance, and multi-agent work. The application needs a user/API-visible job lifecycle while relying on a queue for delivery and retry mechanics.

## Decision

The application `Job` table will be the API-visible source of truth for job state, progress, result, cancellation, and sanitized failures.

`pg-boss` will provide durable queue delivery and retries. Queue messages should contain the application job ID and minimal handler payload, not the full authoritative state.

Piscina may be used inside the worker process for CPU-bound work. Network, provider, and normal orchestration work should remain in the worker process unless a handler has a clear CPU-bound step.

Every application job belongs to a workspace. Job payloads and results must contain only operational IDs and sanitized values. They must not store API keys, secret headers, prompt text, assistant content, or future document contents.

This ADR does not add the job schema, worker process, queue integration, or Piscina runtime. Those are later tasks.

## Consequences

APIs and SSE streams must read durable job state rather than treating in-memory events as authoritative.

Worker crash, queue retry, cancellation, and progress reporting can be implemented without losing the application-visible lifecycle.
