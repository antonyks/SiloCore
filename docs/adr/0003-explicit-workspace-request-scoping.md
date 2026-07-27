# ADR 0003: Explicit Workspace Request Scoping

Status: Accepted

Date: 2026-07-27

## Context

SiloCore currently authenticates requests with JWT bearer tokens. Planned workspace support requires every authenticated operation to run in an explicit workspace context while keeping identity separate from tenancy selection.

The current project-wide database ID convention is numeric IDs. UUID examples in architecture reports are not authoritative for the current Core implementation.

## Decision

Authenticated API requests will use `X-Workspace-Id` as the explicit workspace context header. Authentication endpoints that establish identity, such as login, are the only exception.

JWTs remain identity-only. They must not include workspace ownership, membership, selected-workspace state, or authorization grants.

The login response will later include the user's `PERSONAL` workspace metadata so the frontend can send the first authenticated workspace-scoped request. Before route-derived workspace selection is introduced, the frontend may use that personal workspace from the authenticated-user dataset as the request context.

Per-tab workspace selection will later be represented in authenticated routes, for example `/workspaces/:workspaceId/chat/home`, not in a separate selected-workspace localStorage key.

Workspace IDs remain numeric unless a future migration explicitly changes the project-wide ID strategy.

## Consequences

The backend can reject unknown, deleted, or inaccessible workspace contexts without disclosing workspace existence. The frontend can support multiple tabs in different workspaces once route-derived scoping is added.

Authorization must be checked in services and workspace-scoped repository queries. Future Enterprise database-level enforcement is defense in depth, not a replacement for application authorization.
