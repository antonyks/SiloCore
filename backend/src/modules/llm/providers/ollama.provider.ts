/**
 *
 * Adapter for the Ollama LLM service.
 */

import fetch from 'node-fetch';
import { AbstractLlmProvider } from '../llm.base';
import {
    LlmCompletionRequest,
    LlmCompletionResponse,
    LlmStreamChunk,
    LlmMessage,
    TokenUsage,
    LlmStreamingError,
    LlmModelCapabilities,
    LlmProviderConfig,
    LlmProviderListedModel,
} from '../llm.types';
import { getLlmErrorCode, logLlmEvent } from '../llm.logging';

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

function extractReasoning(message: OllamaGenerateResponse['message']): string | undefined {
    return message?.thinking ?? message?.reasoning ?? message?.reasoning_content;
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
    constructor(config: LlmProviderConfig) {
        super(config, {
            completion: true,
            streaming: true,
            reasoning: true,
            modelListing: true,
            modelPulling: true,
            embeddings: false,
            toolCalling: false,
            structuredOutput: false,
            tokenCounting: false,
        });
    }

    async initialise(): Promise<void> {
        if (!this.isEnabled) return;
        const startedAt = Date.now();
        logLlmEvent({
            providerId: this.id,
            providerType: this.config.type,
            operation: 'provider.initialise',
            status: 'started',
        });
        try {
            const res = await fetch(`${this.config.baseUrl}/api/tags`, {
                headers: this.buildRequestHeaders(),
                signal: this.buildAbortSignal(this.config.timeoutMs ?? 5000)
            });
            if (!res.ok) {
                this.throwProviderError(`Ollama health check failed with status ${res.status}`, 'HEALTH_CHECK_FAILED', res.status);
            }
            logLlmEvent({
                providerId: this.id,
                providerType: this.config.type,
                operation: 'provider.initialise',
                latencyMs: Date.now() - startedAt,
                status: 'success',
            });
        } catch (err) {
            logLlmEvent({
                providerId: this.id,
                providerType: this.config.type,
                operation: 'provider.initialise',
                latencyMs: Date.now() - startedAt,
                status: 'error',
                errorCode: getLlmErrorCode(err),
            });
            this.throwProviderError(`Ollama unreachable: ${(err as Error).message}`, 'CONNECTION_ERROR');
        }
    }

    async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
        const enriched = this.enrichRequest({ ...request, stream: false });
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
        const startedAt = Date.now();
        logLlmEvent({
            providerId: this.id,
            providerType: this.config.type,
            model: enriched.model,
            operation: 'provider.complete',
            status: 'started',
        });

        let result: { value: OllamaGenerateResponse; latencyMs: number };
        try {
            result = await this.withLatency(async () => {
                const res = await fetch(`${this.config.baseUrl}/api/chat`, {
                    method: 'POST',
                    headers: this.buildRequestHeaders({
                        'Content-Type': 'application/json',
                    }),
                    body: JSON.stringify(body),
                    signal: this.buildAbortSignal(),
                });

                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    this.throwProviderError(`Ollama completion error: ${text}`, `HTTP_${res.status}`, res.status);
                }

                return (await res.json()) as OllamaGenerateResponse;
            });
        } catch (error) {
            logLlmEvent({
                providerId: this.id,
                providerType: this.config.type,
                model: enriched.model,
                operation: 'provider.complete',
                latencyMs: Date.now() - startedAt,
                status: 'error',
                errorCode: getLlmErrorCode(error),
            });
            throw error;
        }

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
        logLlmEvent({
            providerId: this.id,
            providerType: this.config.type,
            model: enriched.model,
            operation: 'provider.complete',
            latencyMs,
            status: 'success',
        });

        return {
            content,
            reasoning,
            model: enriched.model,
            finishReason: raw.done_reason,
            usage,
            latencyMs,
        };
    }

    async *streamComplete(request: LlmCompletionRequest): AsyncIterable<LlmStreamChunk> {
        const enriched = this.enrichRequest({ ...request, stream: true });
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
        const startedAt = Date.now();
        let completed = false;
        let failed = false;
        logLlmEvent({
            providerId: this.id,
            providerType: this.config.type,
            model: enriched.model,
            operation: 'provider.stream',
            status: 'started',
        });

        try {
            const res = await fetch(`${this.config.baseUrl}/api/chat`, {
                method: 'POST',
                headers: this.buildRequestHeaders({
                    'Content-Type': 'application/json',
                }),
                body: JSON.stringify(body),
                signal: this.buildAbortSignal(),
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new LlmStreamingError(
                    `Ollama streaming error: ${text}`,
                    this.id,
                    `HTTP_${res.status}`,
                    res.status,
                );
            }

            // Ollama returns NDJSON (one JSON object per line).
            const reader = res.body as NodeJS.ReadableStream;
            const decoder = new TextDecoder();
            let buffer = '';

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
                        yield {
                            content: parsed.message?.content ?? '',
                            reasoning: extractReasoning(parsed.message),
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
                    yield {
                        content: parsed.message?.content ?? '',
                        reasoning: extractReasoning(parsed.message),
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
            completed = true;
            logLlmEvent({
                providerId: this.id,
                providerType: this.config.type,
                model: enriched.model,
                operation: 'provider.stream',
                latencyMs: Date.now() - startedAt,
                status: 'success',
            });
        } catch (error) {
            failed = true;
            logLlmEvent({
                providerId: this.id,
                providerType: this.config.type,
                model: enriched.model,
                operation: 'provider.stream',
                latencyMs: Date.now() - startedAt,
                status: 'error',
                errorCode: getLlmErrorCode(error),
            });
            throw error;
        } finally {
            if (!completed && !failed) {
                logLlmEvent({
                    providerId: this.id,
                    providerType: this.config.type,
                    model: enriched.model,
                    operation: 'provider.stream',
                    latencyMs: Date.now() - startedAt,
                    status: 'aborted',
                });
            }
        }
    }

    async listModels(): Promise<LlmProviderListedModel[]> {
        const startedAt = Date.now();
        logLlmEvent({
            providerId: this.id,
            providerType: this.config.type,
            operation: 'provider.listModels',
            status: 'started',
        });
        try {
            const res = await fetch(`${this.config.baseUrl}/api/tags`, {
                headers: this.buildRequestHeaders(),
                signal: this.buildAbortSignal(),
            });
            if (!res.ok) {
                this.throwProviderError(`Failed to list Ollama models`, 'LIST_MODELS_FAILED', res.status);
            }
            const json = (await res.json()) as { models?: Array<{ name: string }> };
            const models = json.models?.map((m) => ({
                modelId: m.name,
                modelName: m.name,
                capabilities: { ...UNKNOWN_MODEL_CAPABILITIES },
            })) ?? [];
            logLlmEvent({
                providerId: this.id,
                providerType: this.config.type,
                operation: 'provider.listModels',
                latencyMs: Date.now() - startedAt,
                status: 'success',
            });
            return models;
        } catch (error) {
            logLlmEvent({
                providerId: this.id,
                providerType: this.config.type,
                operation: 'provider.listModels',
                latencyMs: Date.now() - startedAt,
                status: 'error',
                errorCode: getLlmErrorCode(error),
            });
            throw error;
        }
    }

    async pullModel(model: string): Promise<void> {
        const startedAt = Date.now();
        logLlmEvent({
            providerId: this.id,
            providerType: this.config.type,
            model,
            operation: 'provider.pullModel',
            status: 'started',
        });
        try {
            const res = await fetch(`${this.config.baseUrl}/api/pull`, {
                method: 'POST',
                headers: this.buildRequestHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ name: model, stream: false }),
                signal: this.buildAbortSignal(),
            });
            if (!res.ok) {
                this.throwProviderError(`Failed to pull model ${model}`, `HTTP_${res.status}`, res.status);
            }
            logLlmEvent({
                providerId: this.id,
                providerType: this.config.type,
                model,
                operation: 'provider.pullModel',
                latencyMs: Date.now() - startedAt,
                status: 'success',
            });
        } catch (error) {
            logLlmEvent({
                providerId: this.id,
                providerType: this.config.type,
                model,
                operation: 'provider.pullModel',
                latencyMs: Date.now() - startedAt,
                status: 'error',
                errorCode: getLlmErrorCode(error),
            });
            throw error;
        }
    }
}
