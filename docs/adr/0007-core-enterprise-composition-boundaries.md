# ADR 0007: Core Enterprise Composition Boundaries

Status: Accepted

Date: 2026-07-27

## Context

SiloCore Core must remain open-source, owner-private, and non-shareable while leaving room for future Enterprise access governance, advanced analytics, SCIM, RLS, and extension points.

Without explicit composition boundaries, future Enterprise behavior could leak into Core or make Core authorization depend on unavailable Enterprise services.

## Decision

Core code must not import future `ee/` implementation.

Core modules should depend on interfaces and composition roots for replaceable policies and runtime services, including workspace authorization, provider adapters, job handlers, worker/Piscina services, analytics services, navigation entries, workspace switcher augmentations, admin pages, and feature flags.

Core remains the default implementation. Core workspace behavior is owner-private and non-shareable unless a future Enterprise composition explicitly replaces the relevant policies and UI extensions.

Enterprise composition may later import Core and supply Enterprise implementations behind the same contracts.

## Consequences

Core behavior stays testable and deployable without Enterprise code.

Future Enterprise work can extend the product without rewriting Core modules or weakening the default owner-only workspace model.
