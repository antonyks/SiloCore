# Provider observability and privacy contract

This is the Core engineering contract for LLM provider integrations in SiloCore. It applies to the current Ollama and OpenAI-compatible adapters and to future adapters. Its purpose is to connect provider lifecycle log events to an originating HTTP request or worker job when that context exists, while keeping operational logs and metrics free of private request or response data.

## Identity and correlation

Each provider invocation has a server-generated UUID `operationId`. A chat caller creates one context and passes it to the adapter; chat and adapter events then share that ID. A model-registry request creates a separate child operation ID for each provider. All children carry the same validated HTTP `requestId` or, for a worker-owned request, the same numeric `jobId`. Background calls without an HTTP origin omit `requestId`; callers must never invent one. An adapter called without a context creates its own operation ID. Never take `operationId` from client input.

`GenerationUsage` and `ProviderHealthSample` rows do not store `operationId`, `requestId`, or `jobId`. They support operational analysis by provider, outcome, and time, but cannot be joined to a particular log event by a correlation ID. A failed provider-health sample write emits a correlated log event with the intended sample operation, status, and safe error code.

The `model` field in operational events and new `GenerationUsage` rows is the readable model ID selected or resolved for the request. That identifier is deliberately retained for diagnosis. A model name reported in an upstream completion or embedding response is an untrusted observation: it must not replace the selected model in logs, usage, or authorized assistant metadata. If a valid reported value differs, the adapter may emit `providerModelMismatch: true` without emitting the reported value. Model-listing results are returned through the authorized model-registry API as product data; they are not copied into operational event payloads.

## Event contract

Provider adapters use `runProviderOperation` for a single result and `runProviderStream` for streaming. These wrappers emit a `started` event and one terminal `success` or `error` event; a stream closed before completion emits `aborted`. Where a caller or registry also logs an event, it uses the same context. The embedding runtime currently forwards context to the adapter without emitting a separate caller event. Events use `layer` (`provider`, `chat`, or `runtime`), a fixed call-site `operation`, and `status` (`started`, `success`, `error`, `aborted`, or `skipped`). Terminal events normally include `latencyMs`.

Non-streaming completion callers may supply a cancellation signal and a fallback timeout. A provider-configured timeout takes precedence over that fallback, and either the effective deadline or caller signal can stop the request. Ordinary chat calls supply neither option and retain their existing timeout behavior. Session-title calls will use the worker shutdown signal and a 30-minute fallback when the title handler is added. Abort reasons are never logged.

Current adapter operations are `provider.initialise`, `provider.listModels`, `provider.complete`, `provider.stream`, `provider.embed`, and `provider.pullModel`. Current caller/runtime operations are `chat.complete`, `chat.stream`, `provider.modelRegistry`, `provider.test`, `provider.pullModel.runtime`, `provider.adapterUnavailable`, `generationUsage.record`, `providerHealthSample.record`, and `api.providerError`. Operation names come from code, never from provider responses or user content. When the registry evaluates an adapter, it logs the result even if a capability guard prevents an adapter call. A missing adapter has a specific `ADAPTER_UNAVAILABLE` event.

The shared `logLlmEvent` sink copies only named fields to Pino. Its event fields are:

| Group | Fields | Source and meaning |
| --- | --- | --- |
| Correlation | `operationId`, `requestId`, `jobId` | Server UUID; validated HTTP request ID when present; positive integer worker job ID when present. |
| Operation | `layer`, `operation`, `status`, `latencyMs` | Fixed code-owned event identity, lifecycle status, and elapsed milliseconds. |
| Provider | `providerId`, `providerType`, `model`, `providerModelMismatch` | Configured provider identity, selected model only, and optional mismatch flag. |
| Failure | `errorCode`, `stage`, `failureCategory`, `providerFailureCode`, `retryable`, `upstreamStatus` | Public error code, classified failure, bounded retryability, and numeric HTTP status where known. |
| Safe diagnostic | `failureKind`, `failureCode`, `failureReason`, `failureSite` | Structural values produced by `safeErrorDiagnostic`; `failureSite` comes from a fresh local stack, not the thrown stack. |
| Failed metric write | `sampleOperation`, `sampleStatus`, `sampleErrorCode` | The intended health sample's operation, status, and validated public provider error code. The event's own `errorCode` remains `PROVIDER_HEALTH_SAMPLE_RECORD_FAILED`. |

The sink validates UUID shape, positive job IDs, numeric latency and HTTP status, enum-like failure and sample fields, and public sample error codes; it drops unknown property names at runtime. Some allowed string fields, including `operation`, `model`, `errorCode`, and the structural diagnostic strings, are **not** value-allowlisted by the sink. Their producers must use fixed code-owned values, the selected model, public error mapping, and `safeErrorDiagnostic` respectively. Passing an exception or upstream object to the sink or directly to Pino is prohibited.

Adapter failure stages are `upstream_request`, `response_parse`, `stream_read`, and `local_abort`. The classifier's categories are `authentication`, `rate_limit`, `timeout`, `connection`, `http`, `malformed_response`, `stream`, `cancelled`, `capability`, `invalid_request`, and `unknown`. Corresponding `providerFailureCode` values are `AUTHENTICATION`, `RATE_LIMIT`, `TIMEOUT`, `CONNECTION`, `HTTP_ERROR`, `MALFORMED_RESPONSE`, `STREAM_ERROR`, `CANCELLED`, `CAPABILITY`, `INVALID_REQUEST`, and `UNKNOWN`. These are diagnostic classifications, separate from the public `errorCode`. Retryability is emitted only when the classifier can establish it; unknown is not treated as retryable by default.

## Errors and private data

The shared classifier maps known HTTP, timeout, connection, parsing, stream, capability, and invalid-request failures to bounded categories and public codes. For example, mapped OpenAI-compatible HTTP 401/403 becomes public `PROVIDER_AUTHENTICATION_ERROR`, 429 becomes `RATE_LIMITED`, and other HTTP failures can retain a matching `HTTP_<status>` code such as `HTTP_503`. Trusted Core capability rejection uses `LLM_PROVIDER_CAPABILITY_UNSUPPORTED`; adapter-thrown invalid input becomes `PROVIDER_INVALID_REQUEST`. Operation-specific fallback codes include `UPSTREAM_ERROR`, `UPSTREAM_STREAM_ERROR`, `LIST_MODELS_FAILED`, `PULL_MODEL_FAILED`, and `EMBEDDINGS_FAILED`. A failure without a recognized public code receives a generic public message. Provider-wrapper and chat events use `UNKNOWN_ERROR` as their logging fallback; a model-registry error event may instead omit `errorCode`. Public error messages and codes come from `getPublicLlmErrorMessage` and `getPublicLlmErrorCode`; they must not be copied from an upstream body or a thrown message. `safeErrorDiagnostic` may retain a known network or database code and its fixed explanation, an HTTP status, a safe error kind, and a local source location. It never logs the original exception message or stack.

For an error named `AbortError`, the adapter's confirmed signal cause determines whether the internal category is `timeout` or `cancelled`. The name check also accepts fetch errors from another JavaScript realm, which receive `failureKind: AbortError` without copying their message or stack. The public `errorCode: REQUEST_TIMEOUT` is retained for both confirmed causes; use `failureCategory` and `providerFailureCode` to distinguish them in logs. An `AbortError` without a confirmed cause keeps that public code but does not claim either internal category. If an HTTP, parsing, or other failure is caught after a signal fires, the classifier retains that failure's category and retryability.

Do not emit prompts, assistant content, reasoning content, embeddings, API keys, authorization credentials, custom-header names or values, upstream response-reported model values, upstream bodies or headers, or original exception messages or stacks to operational logs or metrics. Do not add these values to job payloads or results for the purpose of observability. Authorized chat persistence and responses may contain chat content as part of the product; they are separate from operational logging. `GenerationUsage` stores the selected model, outcome, latency, optional token counts, and sanitized error code. `ProviderHealthSample` stores provider identity, operation, status, latency, optional model count, and sanitized error code. Neither metric stores content or raw provider errors.

For example, a successful request for selected model `model-a` can produce these events with one operation ID (other safe fields omitted):

```json
{"layer":"chat","operation":"chat.complete","status":"started","requestId":"req-42","operationId":"11111111-1111-4111-8111-111111111111","providerId":"7","model":"model-a"}
{"layer":"provider","operation":"provider.complete","status":"started","requestId":"req-42","operationId":"11111111-1111-4111-8111-111111111111","providerId":"7","model":"model-a"}
{"layer":"provider","operation":"provider.complete","status":"success","requestId":"req-42","operationId":"11111111-1111-4111-8111-111111111111","providerId":"7","model":"model-a","latencyMs":84}
{"layer":"chat","operation":"chat.complete","status":"success","requestId":"req-42","operationId":"11111111-1111-4111-8111-111111111111","providerId":"7","model":"model-a","latencyMs":90}
```

If the upstream returns HTTP 503, the failure remains diagnosable without its body:

```json
{"layer":"provider","operation":"provider.complete","status":"error","requestId":"req-42","operationId":"11111111-1111-4111-8111-111111111111","providerId":"7","model":"model-a","errorCode":"HTTP_503","stage":"upstream_request","failureCategory":"http","providerFailureCode":"HTTP_ERROR","upstreamStatus":503,"retryable":true,"latencyMs":84}
{"layer":"chat","operation":"chat.complete","status":"error","requestId":"req-42","operationId":"11111111-1111-4111-8111-111111111111","providerId":"7","model":"model-a","errorCode":"HTTP_503","upstreamStatus":503,"latencyMs":90}
```

## Adding an adapter

1. Implement the provider interface with an optional `LlmOperationContext` on supported operations. Preserve the caller's context when supplied; use the shared wrapper to create one only for standalone calls. Use the stream wrapper for asynchronous streams, including early-close handling.
2. Declare provider capabilities accurately and use the shared operation wrapper, `providerHttpError`, and `classifyProviderFailure`. Mark the failure stage at parsing or stream-reading boundaries. Pass only the selected request model to the wrapper. Use `providerModelMismatch` only as a boolean observation when an upstream response reports a different model.
3. Keep API/SSE errors and persisted failure metadata on public messages and codes. Route operational events through `logLlmEvent` and diagnostic failures through `safeErrorDiagnostic`; never log raw fetch responses, headers, exception objects, or request/response content.
4. Test success, HTTP/transport/parsing failures, stream failure and early abort where supported. Assert shared operation IDs wherever both caller and adapter emit events; otherwise assert the adapter emits its own operation ID. Check request or job ID propagation when available, selected-model identity in usage and authorized metadata, bounded diagnostics, and absence of secret-like upstream content from logs and metrics. Cover the adapter with deterministic mock upstreams and the existing integration harness.

Implementation references: [operation context and wrappers](../backend/src/modules/llm/llm.operation.ts), [failure classifier](../backend/src/modules/llm/llm.failure.ts), [public error mapping](../backend/src/modules/llm/llm.safeError.ts), [allowlisted event sink](../backend/src/modules/llm/llm.logging.ts), and [safe structural diagnostics](../backend/src/config/safeErrorDiagnostic.ts).
