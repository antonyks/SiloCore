# ADR 0006: Privacy-Safe Core Analytics

Status: Accepted; amended 2026-10-07

Date: 2026-07-27

The original blanket classification of per-workspace, advanced, or permission-controlled reporting as Enterprise is superseded. Suitable privacy-safe workspace usage reporting remains Core; only analytics explicitly classified for collaboration or governance belong to Enterprise. The private-content prohibition remains in force.

## Context

SiloCore Core includes admin analytics and system status. Admins need operational visibility, but they must not gain access to private workspace content.

At the time of this decision, only system-wide admin aggregates were implemented. Future reporting must be classified individually by purpose and privacy, rather than by workspace scope or the presence of a permission check.

## Decision

Current Core admin analytics expose system-wide operational aggregates. Core may also add suitable privacy-safe workspace usage reporting.

Core analytics must not return prompt text, assistant text, reasoning content, chat history, future document text, private workspace resource contents, API keys, or secret provider headers.

Permitted Core analytics include aggregate counts, provider health, generation counts, success/failure/abort rates, aggregate latency, aggregate token usage, job counts, and queue or execution aggregates once the underlying records exist.

General operational and privacy-safe usage reporting remain Core. Only reporting explicitly classified as collaboration or governance functionality belongs to Enterprise. Neither edition permits private-content drilldowns merely by calling them analytics; a future content-audit feature needs a separate product and privacy decision.

## Consequences

Analytics data models must be append-only or operationally safe where practical, and they must avoid copying private content from chats, jobs, provider requests, or future document processing.

Admin routes can inspect operational state without becoming a bypass around workspace-content authorization.
