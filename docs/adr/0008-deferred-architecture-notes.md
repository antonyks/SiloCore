# ADR 0008: Deferred Architecture Notes

Status: Accepted

Date: 2026-07-27

## Context

The repository includes a refined pre-RAG task list and an Enterprise RBAC, multi-tenancy, and access-governance architecture report. These documents describe future directions beyond the current Core implementation.

The Enterprise architecture report explicitly states that its schema fragments, column names, data types, and code snippets are illustrative unless adopted by implementation tasks.

## Decision

The following work is deferred and must not be implemented as part of the current Core architecture stabilization task:

- RAG ingestion, vector storage, retrieval, citation reconciliation, pgvector, Atlas runtime vector-table provisioning, document parsing, and knowledge-base features.
- Dynamic context-window governance, token pruning, pinning, rolling summaries, exact BPE tokenization, context inspection, and KV-cache parameter pass-through.
- Blob storage and document-binary lifecycle.
- MCP, tool execution, workflow schemas, and multi-agent orchestration.
- Enterprise runtime access governance, including direct-user workspace sharing, group grants, nested groups, advanced RBAC, ABAC controls, effective-access materialization, PostgreSQL RLS, and SCIM.

Future implementations should use the relevant architecture reports and deferred task phases as design references, but should only adopt concrete schema names, column names, data types, routes, and code behavior through explicit future tasks.

## Consequences

Core implementation can proceed in small, reviewable steps without pulling in deferred features.

The architecture documents remain useful for intent and constraints while avoiding accidental commitment to illustrative implementation details.
