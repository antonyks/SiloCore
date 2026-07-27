# ADR 0002: Core Workspace Ownership And Access

Status: Accepted

Date: 2026-07-27

## Context

SiloCore Core is the non-Enterprise product. It needs multiple private workspaces per user, but it must not implement workspace sharing, invitations, multi-user membership management, ownership transfer, or RBAC in this phase.

The schema will later include forward-compatible access structures so Enterprise can activate richer governance without redesigning the workspace boundary. Those structures must not change Core authorization behavior.

## Decision

Every user receives exactly one private `PERSONAL` workspace. A user may create multiple additional private `STANDARD` workspaces.

Every Core workspace is single-owner and non-shareable. Core authorization is based on the workspace's canonical owner relation. The global `ADMIN` role does not grant workspace-content access and must not allow admins to read private chats or future private workspace resources.

The base schema may contain a forward-compatible membership or access relation. Core creates only the canonical owner's active `OWNER` membership. Core must not treat extra membership or grant rows, including future `EDITOR` or `VIEWER` values, as access grants.

Core exposes no share, invite, member-management, role-assignment, ownership-transfer, group, SCIM, or RBAC flows.

Enterprise may later activate direct-user grants, group principals, nested groups, role evaluation, ABAC modifiers, effective-permission materialization, PostgreSQL RLS, and SCIM behind the same workspace boundary.

## Consequences

Workspace ownership becomes the tenancy boundary for Core resources. User IDs on workspace-owned resources can remain useful as creator or actor metadata, but they are not the isolation boundary once workspace scoping is introduced.

Future Enterprise access structures must be introduced behind explicit policy/composition boundaries so Core does not accidentally enable sharing semantics.
