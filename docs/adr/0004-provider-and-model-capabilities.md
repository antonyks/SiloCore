# ADR 0004: Provider And Model Capabilities

Status: Accepted

Date: 2026-07-27

## Context

SiloCore persists LLM provider configurations and currently implements an Ollama adapter. The provider type model also includes `OPENAI_COMPATIBLE`, but no adapter exists for it yet.

Provider capabilities and model capabilities need distinct meanings so the UI and backend do not infer unsupported behavior from provider type strings or incomplete model metadata.

## Decision

Provider capability booleans describe operations implemented by an adapter, such as completion, streaming, model listing, model pulling, embeddings, tool calling, structured output, and token counting. A provider capability means the adapter can attempt that operation; it does not mean every model exposed by that provider supports the feature.

Model-specific capabilities are separate metadata. Model capabilities may be `SUPPORTED`, `UNSUPPORTED`, or `UNKNOWN` when a provider cannot report them.

`UNKNOWN` must remain operationally distinct from `UNSUPPORTED` and must not be treated as unsupported by default.

`OPENAI_COMPATIBLE` remains a configured provider type without runtime adapter behavior until the later OpenAI-compatible implementation tasks.

## Consequences

Backend runtime checks and frontend action gating should eventually use explicit provider capabilities rather than provider type string checks.

Model metadata can safely represent uncertainty without disabling features that may work but cannot be detected from the provider registry.
