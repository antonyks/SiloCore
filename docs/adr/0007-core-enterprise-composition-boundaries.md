# ADR 0007: Core Enterprise Composition Boundaries

Status: Accepted; amended 2026-10-07

Date: 2026-07-27

The original grouping of RLS and broadly defined advanced analytics with Enterprise is superseded. Selective RLS is planned Core security; only analytics explicitly classified for collaboration or governance belong to Enterprise.

## Context

SiloCore Core must remain open-source, owner-private, and non-shareable while leaving room for future Enterprise access governance, collaboration-specific analytics, and SCIM, as well as Core security hardening and neutral extension points.

Without explicit composition boundaries, future Enterprise behavior could leak into Core or make Core authorization depend on unavailable Enterprise services.

## Decision

Core code must not import future `ee/` implementation.

Core modules use typed composition factories and neutral frontend extension contracts for replaceable policies and runtime services, including workspace authorization, provider adapters, job handlers, worker/Piscina services, analytics services, navigation entries, workspace slots, admin routes, and presentation capabilities. These contracts do not activate Enterprise licensing or grant backend authorization.

Core remains the default implementation. Core workspace behavior is owner-private and non-shareable unless a future Enterprise composition explicitly replaces the relevant policies and UI extensions.

Enterprise composition may later import Core and supply Enterprise implementations behind the same contracts.

## Consequences

Core behavior stays testable and deployable without Enterprise code.

Future Enterprise work can extend the product without rewriting Core modules or weakening the default owner-only workspace model.
