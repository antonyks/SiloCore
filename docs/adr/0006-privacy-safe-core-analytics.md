# ADR 0006: Privacy-Safe Core Analytics

Status: Accepted

Date: 2026-07-27

## Context

SiloCore Core includes admin analytics and system status. Admins need operational visibility, but they must not gain access to private workspace content.

Future Enterprise editions may add per-workspace analytics and RBAC-controlled reporting, but those are not Core features in this phase.

## Decision

Core analytics expose system-wide operational aggregates only.

Core analytics must not return prompt text, assistant text, reasoning content, chat history, future document text, private workspace resource contents, API keys, or secret provider headers.

Permitted Core analytics include aggregate counts, provider health, generation counts, success/failure/abort rates, aggregate latency, aggregate token usage, job counts, and queue or execution aggregates once the underlying records exist.

Per-workspace analytics, private-content drilldowns, advanced reporting, and RBAC-controlled reporting are Enterprise concerns.

## Consequences

Analytics data models must be append-only or operationally safe where practical, and they must avoid copying private content from chats, jobs, provider requests, or future document processing.

Admin routes can inspect operational state without becoming a bypass around workspace-content authorization.
