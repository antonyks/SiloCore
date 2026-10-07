# ADR 0002: Core Workspace Ownership And Access

Status: Accepted; amended 2026-10-07

Date: 2026-07-27

This ADR's original phase exclusion of ownership transfer is superseded for planned Core admin recovery of `STANDARD` ownership. Its classification of RLS as Enterprise work is also superseded: selective RLS is planned Core security. The original Core owner-private decision remains in force; neither recovery nor RLS is implemented yet.

## Context

SiloCore Core is the non-Enterprise product. At the time of this decision, it needed multiple private workspaces per user without workspace sharing, invitations, multi-user membership management, ownership transfer, or RBAC in that implementation phase. The transfer exclusion was phase-specific and is superseded for planned Core admin recovery.

The schema includes forward-compatible membership structures so Enterprise can later activate richer governance without redesigning the workspace boundary. Those structures do not change Core authorization behavior.

## Decision

Every user receives exactly one private `PERSONAL` workspace. A user may create multiple additional private `STANDARD` workspaces.

Every Core workspace is single-owner and non-shareable. Core authorization is based on the workspace's canonical owner relation. The global `ADMIN` role does not grant workspace-content access and must not allow admins to read private chats or future private workspace resources.

The base schema contains a forward-compatible membership relation. Core creates the canonical owner's active `OWNER` membership. Core must not treat extra membership or grant rows, including `EDITOR` or `VIEWER` values, as access grants; existing non-owner rows need no deletion or status rewrite for Core operation.

Core currently exposes no share, invite, member-management, role-assignment, ownership-transfer, group, SCIM, or RBAC flows. A future Core admin recovery operation may reassign any `STANDARD` workspace from any owner to any target user without current-owner participation. That operation is not yet implemented and will not permit `PERSONAL` ownership transfer.

Enterprise may later activate direct-user grants, group principals, nested groups, role evaluation, ABAC modifiers, effective-permission materialization, and SCIM behind the same workspace boundary. Selective PostgreSQL RLS is planned Core security, not an Enterprise entitlement.

## Consequences

Workspace ownership becomes the tenancy boundary for Core resources. User IDs on workspace-owned resources can remain useful as creator or actor metadata, but they are not the isolation boundary once workspace scoping is introduced.

Future Enterprise access structures must be introduced behind explicit policy/composition boundaries so Core does not accidentally enable sharing semantics.
