# ADR 0003: Explicit Workspace Request Scoping

Status: Accepted; amended 2026-10-07

Date: 2026-07-27

The original future-tense rollout notes below now describe implemented request and URL scoping. The classification of database-level isolation as future Enterprise enforcement is superseded: selective RLS is planned Core security and is not yet implemented.

## Context

SiloCore authenticates requests with JWT bearer tokens. Workspace support requires every authenticated operation to run in an explicit workspace context while keeping identity separate from tenancy selection.

The current project-wide database ID convention is numeric IDs. UUID examples in architecture reports are not authoritative for the current Core implementation.

## Decision

Authenticated API requests use `X-Workspace-Id` as the explicit workspace context header. Authentication endpoints that establish identity, such as login, are the exception.

JWTs remain identity-only. They must not include workspace ownership, membership, selected-workspace state, or authorization grants.

The login response includes the user's `PERSONAL` workspace metadata so the frontend can send the first authenticated workspace-scoped request. That metadata supplies the bootstrap context for owned-workspace loading.

Per-tab workspace selection is represented in authenticated routes, for example `/workspaces/:workspaceId/chat/home`, not in a separate selected-workspace localStorage key.

Workspace IDs remain numeric unless a future migration explicitly changes the project-wide ID strategy.

## Consequences

The backend rejects unknown, deleted, or inaccessible workspace contexts without disclosing workspace existence. The frontend supports multiple tabs in different workspaces through route-derived scoping.

Authorization must be checked in services and workspace-scoped repository queries. Planned selective Core RLS is defense in depth, not a replacement for application authorization.
