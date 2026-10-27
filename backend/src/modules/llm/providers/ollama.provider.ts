/**
 *
 * Adapter for the Ollama LLM service.
 */

import fetch from 'node-fetch';
import { AbstractLlmProvider } from '../llm.base';
import {
    LlmCompletionRequest,
    LlmCompletionOptions,
    LlmCompletionResponse,
    LlmEmbeddingRequest,
    LlmEmbeddingResponse,
    LlmStreamChunk,
    LlmStreamingError,
    LlmMessage,
    TokenUsage,
    LlmModelCapabilities,
    LlmProviderConfig,
    LlmProviderListedModel,
} from '../llm.types';
import { providerModelMismatch } from '../llm.modelIdentity';
import { classifyProviderFailure, confirmedDeadline, providerHttpError, ProviderFailureOperation, ProviderFailureStage } from '../llm.failure';
import { LlmOperationContext, runProviderOperation, runProviderStream } from '../llm.operation';

/** Ollama-specific API request shape. */
interface OllamaGenerateRequest {
    model: string;
    prompt?: string;        // Legacy single-prompt field (not used here)
    stream?: boolean;
    options?: Record<string, unknown>;
    messages?: LlmMessage[]; // Chat-completion style supported in newer Ollama versions
}

interface OllamaGenerateResponse {
    model: string;
    message?: {
        content?: string;
        thinking?: string;
        reasoning?: string;
        reasoning_content?: string;
    };
    done?: boolean;
    done_reason?: string;
    total_duration?: number;    // nanoseconds
    load_duration?: number;
    prompt_eval_count?: number;
    eval_count?: number;
}

interface OllamaEmbeddingRequest {
    model: string;
    input: string | string[];
    truncate?: boolean;
    dimensions?: number;
}

interface OllamaEmbeddingResponse {
    model?: string;
    embeddings?: unknown;
    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
}

function extractReasoning(message: OllamaGenerateResponse['message']): string | undefined {
    return message?.thinking ?? message?.reasoning ?? message?.reasoning_content;
}

function isEmbeddingVector(value: unknown): value is number[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

const UNKNOWN_MODEL_CAPABILITIES: LlmModelCapabilities = {
    completion: 'UNKNOWN',
    streaming: 'UNKNOWN',
    reasoning: 'UNKNOWN',
    embeddings: 'UNKNOWN',
    toolCalling: 'UNKNOWN',
    structuredOutput: 'UNKNOWN',
    tokenCounting: 'UNKNOWN',
};

export class OllamaProvider extends AbstractLlmProvider {
    private operationOptions(
        operation: ProviderFailureOperation, model: string | undefined,
        context: LlmOperationContext | undefined, signal: () => AbortSignal | undefined,
        abortCause: () => 'deadline' | 'local_cancel' | undefined = () => confirmedDeadline(signal()),
    ) {
        return {
            providerType: this.config.type,
            providerId: this.id,
            operation, model, context,
            classify: (error: unknown, stage: ProviderFailureStage, diagnostics: Record<string, string | number>) =>
                classifyProviderFailure({
                    providerType: this.config.type, providerId: this.id, operation, stage, error,
                    diagnostics, abortCause: abortCause(),
                }),
        };
    }

    constructor(config: LlmProviderConfig) {
        super(config, {
            completion: true,
            streaming: true,
            reasoning: true,
            modelListing: true,
            modelPulling: true,
            embeddings: true,
            toolCalling: false,
            structuredOutput: false,
            tokenCounting: false,
        });
    }

    async initialise(context?: LlmOperationContext): Promise<void> {
        if (!this.isEnabled) return;
        const signal = this.buildAbortSignal(this.config.timeoutMs ?? 5000);
        return runProviderOperation(this.operationOptions('initialise', undefined, context, () => signal), async () => {
            const res = await fetch(`${this.config.baseUrl}/api/tags`, {
                headers: this.buildRequestHeaders(),
                signal
            });
            if (!res.ok) {
                throw providerHttpError({ providerType: this.config.type, providerId: this.id, operation: 'initialise' }, res.status);
            }
            return { value: undefined };
        });
    }

    async embed(request: LlmEmbeddingRequest, context?: LlmOperationContext): Promise<LlmEmbeddingResponse> {
        const signal = this.buildAbortSignal();
        const body: OllamaEmbeddingRequest = {
            model: request.model,
            input: request.input,
            truncate: request.truncate,
            dimensions: request.dimensions,
        };
        return runProviderOperation(this.operationOptions('embed', request.model, context, () => signal), async () => {
            const result = await this.withLatency(async () => {
                const res = await fetch(`${this.config.baseUrl}/api/embed`, {
                    method: 'POST',
                    headers: this.buildRequestHeaders({
                        'Content-Type': 'application/json',
                    }),
                    body: JSON.stringify(body),
                    signal,
                });

                if (!res.ok) {
                    throw providerHttpError({ providerType: this.config.type, providerId: this.id, operation: 'embed' }, res.status);
                }

                try {
                    return (await res.json()) as OllamaEmbeddingResponse;
                } catch {
                    this.throwProviderError('Ollama embedding response was malformed', 'MALFORMED_EMBEDDING_RESPONSE');
                }
            });
            return {
                value: this.normalizeEmbeddingResponse(result.value, request.model, result.latencyMs),
                providerModelMismatch: providerModelMismatch(request.model, result.value.model),
            };
        });
    }

    async complete(request: LlmCompletionRequest, context?: LlmOperationContext, options?: LlmCompletionOptions): Promise<LlmCompletionResponse> {
        const enriched = this.enrichRequest({ ...request, stream: false });
        const { signal, abortCause } = this.buildCompletionAbort(options);
        const body: OllamaGenerateRequest = {
            model: enriched.model,
            stream: false,
            messages: enriched.messages,
            options: {
                temperature: enriched.temperature ?? 0.7,
                top_p: enriched.topP ?? 1,
                num_predict: enriched.maxTokens ?? 2048,
                stop: enriched.stopSequences,
            },
        };
        return runProviderOperation(this.operationOptions('complete', enriched.model, context, () => signal, abortCause), async ({ setStage }) => {
            const result = await this.withLatency(async () => {
                const res = await fetch(`${this.config.baseUrl}/api/chat`, {
                    method: 'POST',
                    headers: this.buildRequestHeaders({
                        'Content-Type': 'application/json',
                    }),
                    body: JSON.stringify(body),
                    signal,
                });

                if (!res.ok) {
                    throw providerHttpError({ providerType: this.config.type, providerId: this.id, operation: 'complete' }, res.status);
                }

                setStage('response_parse');
                return (await res.json()) as OllamaGenerateResponse;
            });
            const { value: raw, latencyMs } = result;
            const content = raw.message?.content ?? '';
            const reasoning = extractReasoning(raw.message);
            const usage: TokenUsage | undefined = raw.prompt_eval_count != null && raw.eval_count != null
                ? {
                    promptTokens: raw.prompt_eval_count,
                    completionTokens: raw.eval_count,
                    totalTokens: raw.prompt_eval_count + raw.eval_count,
                }
                : undefined;
            return { value: {
                content, reasoning, model: enriched.model, finishReason: raw.done_reason, usage, latencyMs,
            } };
        });
    }

    async *streamComplete(request: LlmCompletionRequest, context?: LlmOperationContext): AsyncIterable<LlmStreamChunk> {
        const enriched = this.enrichRequest({ ...request, stream: true });
        const signal = this.buildAbortSignal();
        const body: OllamaGenerateRequest = {
            model: enriched.model,
            stream: true,
            messages: enriched.messages,
            options: {
                temperature: enriched.temperature ?? 0.7,
                top_p: enriched.topP ?? 1,
                num_predict: enriched.maxTokens ?? 2048,
                stop: enriched.stopSequences,
            },
        };
        const url = `${this.config.baseUrl}/api/chat`;
        const headers = this.buildRequestHeaders({ 'Content-Type': 'application/json' });
        const providerType = this.config.type;
        const providerId = this.id;
        yield* runProviderStream(this.operationOptions('stream', enriched.model, context, () => signal), async function* ({ setStage }) {
            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal,
            });

            if (!res.ok) {
                throw providerHttpError({ providerType, providerId, operation: 'stream' }, res.status);
            }

            // Ollama returns NDJSON (one JSON object per line).
            setStage('stream_read');
            const reader = res.body as NodeJS.ReadableStream;
            const decoder = new TextDecoder();
            let buffer = '';
            let sawCompletion = false;
            let sawOutput = false;

            for await (const chunk of reader) {
                buffer += typeof chunk === 'string'
                    ? chunk
                    : decoder.decode(chunk, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const parsed = JSON.parse(line) as OllamaGenerateResponse;
                        const content = parsed.message?.content || undefined;
                        const reasoning = extractReasoning(parsed.message);
                        sawOutput ||= Boolean(content || reasoning);
                        sawCompletion ||= parsed.done === true;
                        yield {
                            content,
                            reasoning,
                            done: parsed.done ?? false,
                            finishReason: parsed.done_reason,
                            usage:
                                parsed.prompt_eval_count != null && parsed.eval_count != null
                                    ? {
                                        promptTokens: parsed.prompt_eval_count,
                                        completionTokens: parsed.eval_count,
                                        totalTokens: parsed.prompt_eval_count + parsed.eval_count,
                                    }
                                    : undefined,
                        };
                    } catch {
                        // Ignore malformed lines
                    }
                }
            }

            // Flush remaining buffer
            if (buffer.trim()) {
                try {
                    const parsed = JSON.parse(buffer) as OllamaGenerateResponse;
                    const content = parsed.message?.content || undefined;
                    const reasoning = extractReasoning(parsed.message);
                    sawOutput ||= Boolean(content || reasoning);
                    sawCompletion ||= parsed.done === true;
                    yield {
                        content,
                        reasoning,
                        done: parsed.done ?? false,
                        finishReason: parsed.done_reason,
                        usage:
                            parsed.prompt_eval_count != null && parsed.eval_count != null
                                ? {
                                    promptTokens: parsed.prompt_eval_count,
                                    completionTokens: parsed.eval_count,
                                    totalTokens: parsed.prompt_eval_count + parsed.eval_count,
                                }
                                : undefined,
                    };
                } catch {
                    // Ignore
                }
            }
            if (sawOutput && !sawCompletion) {
                throw new LlmStreamingError('Ollama stream ended before completion', providerId, 'UPSTREAM_STREAM_ERROR');
            }
        });
    }

    async listModels(context?: LlmOperationContext): Promise<LlmProviderListedModel[]> {
        const signal = this.buildAbortSignal();
        return runProviderOperation(this.operationOptions('listModels', undefined, context, () => signal), async ({ setStage }) => {
            const res = await fetch(`${this.config.baseUrl}/api/tags`, {
                headers: this.buildRequestHeaders(),
                signal,
            });
            if (!res.ok) {
                throw providerHttpError({ providerType: this.config.type, providerId: this.id, operation: 'listModels' }, res.status);
            }
            setStage('response_parse');
            const json = (await res.json()) as { models?: Array<{ name: string }> };
            const models = json.models?.map((m) => ({
                modelId: m.name,
                modelName: m.name,
                capabilities: { ...UNKNOWN_MODEL_CAPABILITIES },
            })) ?? [];
            return { value: models };
        });
    }

    async pullModel(model: string, context?: LlmOperationContext): Promise<void> {
        const signal = this.buildAbortSignal();
        return runProviderOperation(this.operationOptions('pullModel', model, context, () => signal), async () => {
            const res = await fetch(`${this.config.baseUrl}/api/pull`, {
                method: 'POST',
                headers: this.buildRequestHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ name: model, stream: false }),
                signal,
            });
            if (!res.ok) {
                throw providerHttpError({ providerType: this.config.type, providerId: this.id, operation: 'pullModel' }, res.status);
            }
            return { value: undefined };
        });
    }

    private normalizeEmbeddingResponse(
        raw: OllamaEmbeddingResponse,
        fallbackModel: string,
        latencyMs: number,
    ): LlmEmbeddingResponse {
        if (!Array.isArray(raw.embeddings) || !raw.embeddings.every(isEmbeddingVector)) {
            this.throwProviderError('Ollama embedding response was malformed', 'MALFORMED_EMBEDDING_RESPONSE');
        }
        const embeddings = raw.embeddings as number[][];

        const promptTokens = typeof raw.prompt_eval_count === 'number' && Number.isFinite(raw.prompt_eval_count)
            ? raw.prompt_eval_count
            : undefined;

        return {
            providerId: this.id,
            providerName: this.config.name,
            providerType: this.config.type,
            model: fallbackModel,
            embeddings: embeddings.map((embedding, index) => ({
                embedding,
                index,
            })),
            usage: promptTokens === undefined
                ? undefined
                : {
                    promptTokens,
                    totalTokens: promptTokens,
                },
            latencyMs,
        };
    }

}
