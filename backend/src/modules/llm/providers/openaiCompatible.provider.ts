/**
 *
 * Adapter for OpenAI-compatible chat completion APIs.
 */

import fetch, { Response } from 'node-fetch';
import { AbstractLlmProvider } from '../llm.base';
import {
  LlmAuthenticationError,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmMessage,
  LlmProviderConfig,
  LlmProviderError,
  LlmProviderListedModel,
  LlmRateLimitError,
  LlmStreamingError,
  LlmStreamChunk,
  TokenUsage,
} from '../llm.types';
import { getLlmErrorCode, logLlmEvent } from '../llm.logging';

interface OpenAiCompatibleChatRequest {
  model: string;
  messages: LlmMessage[];
  stream: false;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string[];
}

interface OpenAiCompatibleChatResponse {
  model?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: string | null;
      reasoning?: string;
      reasoning_content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

type OpenAiCompatibleMessage = NonNullable<
  NonNullable<OpenAiCompatibleChatResponse['choices']>[number]['message']
>;

function buildChatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeUsage(usage: OpenAiCompatibleChatResponse['usage']): TokenUsage | undefined {
  if (
    !usage ||
    !isFiniteNumber(usage.prompt_tokens) ||
    !isFiniteNumber(usage.completion_tokens) ||
    !isFiniteNumber(usage.total_tokens)
  ) {
    return undefined;
  }

  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

function extractReasoning(message: OpenAiCompatibleMessage | undefined): string | undefined {
  return message?.reasoning ?? message?.reasoning_content;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function readProviderErrorMessage(res: Response): Promise<string | undefined> {
  const parsed = await res.json().catch(() => undefined) as
    | { error?: { message?: unknown }; message?: unknown }
    | undefined;

  if (typeof parsed?.error?.message === 'string' && parsed.error.message.trim()) {
    return parsed.error.message;
  }

  if (typeof parsed?.message === 'string' && parsed.message.trim()) {
    return parsed.message;
  }

  const text = await res.text().catch(() => '');
  return text.trim() || undefined;
}

export class OpenAiCompatibleProvider extends AbstractLlmProvider {
  constructor(config: LlmProviderConfig) {
    super(config, {
      completion: true,
      streaming: false,
      reasoning: true,
      modelListing: false,
      modelPulling: false,
      embeddings: false,
      toolCalling: false,
      structuredOutput: false,
      tokenCounting: false,
    });
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const enriched = this.enrichRequest({ ...request, stream: false });
    const body: OpenAiCompatibleChatRequest = {
      model: enriched.model,
      messages: enriched.messages,
      stream: false,
      temperature: enriched.temperature,
      top_p: enriched.topP,
      max_tokens: enriched.maxTokens,
      stop: enriched.stopSequences,
    };
    const startedAt = Date.now();

    logLlmEvent({
      providerId: this.id,
      providerType: this.config.type,
      model: enriched.model,
      operation: 'provider.complete',
      status: 'started',
    });

    let result: { value: OpenAiCompatibleChatResponse; latencyMs: number };
    try {
      result = await this.withLatency(async () => {
        const res = await fetch(buildChatCompletionsUrl(this.config.baseUrl), {
          method: 'POST',
          headers: this.buildRequestHeaders({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(body),
          signal: this.buildAbortSignal(),
        });

        if (!res.ok) {
          await this.throwHttpError(res);
        }

        try {
          return (await res.json()) as OpenAiCompatibleChatResponse;
        } catch {
          throw this.createMalformedResponseError();
        }
      });
    } catch (error) {
      const normalizedError = this.normalizeCompletionError(error);
      logLlmEvent({
        providerId: this.id,
        providerType: this.config.type,
        model: enriched.model,
        operation: 'provider.complete',
        latencyMs: Date.now() - startedAt,
        status: 'error',
        errorCode: getLlmErrorCode(normalizedError),
      });
      throw normalizedError;
    }

    const completion = this.normalizeCompletionResponse(result.value, enriched.model, result.latencyMs);
    logLlmEvent({
      providerId: this.id,
      providerType: this.config.type,
      model: enriched.model,
      operation: 'provider.complete',
      latencyMs: result.latencyMs,
      status: 'success',
    });

    return completion;
  }

  streamComplete(request: LlmCompletionRequest): AsyncIterable<LlmStreamChunk> {
    void request;
    const error = new LlmStreamingError(
      'OpenAI-compatible streaming is not implemented',
      this.id,
      'STREAMING_UNSUPPORTED',
    );

    return {
      [Symbol.asyncIterator]: () => ({
        next: async () => Promise.reject(error),
      }),
    };
  }

  async listModels(): Promise<LlmProviderListedModel[]> {
    throw new LlmProviderError(
      'OpenAI-compatible model listing is not implemented',
      this.id,
      'MODEL_LISTING_UNSUPPORTED',
    );
  }

  private async throwHttpError(res: Response): Promise<never> {
    const detail = await readProviderErrorMessage(res);
    const suffix = detail ? `: ${detail}` : '';

    if (res.status === 401 || res.status === 403) {
      throw new LlmAuthenticationError(
        `OpenAI-compatible authentication failed${suffix}`,
        this.id,
        'AUTHENTICATION_ERROR',
        res.status,
      );
    }

    if (res.status === 429) {
      throw new LlmRateLimitError(
        `OpenAI-compatible rate limit exceeded${suffix}`,
        this.id,
        'RATE_LIMITED',
        res.status,
      );
    }

    throw new LlmProviderError(
      `OpenAI-compatible completion failed with status ${res.status}${suffix}`,
      this.id,
      `HTTP_${res.status}`,
      res.status,
    );
  }

  private normalizeCompletionError(error: unknown): Error {
    if (error instanceof LlmProviderError) {
      return error;
    }

    if (isAbortError(error)) {
      return new LlmProviderError(
        'OpenAI-compatible completion timed out or was aborted',
        this.id,
        'REQUEST_TIMEOUT',
      );
    }

    if (error instanceof Error) {
      return new LlmProviderError(
        `OpenAI-compatible completion failed: ${error.message}`,
        this.id,
        'UPSTREAM_ERROR',
      );
    }

    return new LlmProviderError(
      'OpenAI-compatible completion failed',
      this.id,
      'UPSTREAM_ERROR',
    );
  }

  private normalizeCompletionResponse(
    raw: OpenAiCompatibleChatResponse,
    fallbackModel: string,
    latencyMs: number,
  ): LlmCompletionResponse {
    const choice = raw.choices?.[0];
    const content = choice?.message?.content;

    if (!choice || typeof content !== 'string') {
      throw this.createMalformedResponseError();
    }

    return {
      content,
      reasoning: extractReasoning(choice.message),
      model: raw.model ?? fallbackModel,
      finishReason: choice.finish_reason ?? undefined,
      usage: normalizeUsage(raw.usage),
      latencyMs,
    };
  }

  private createMalformedResponseError(): LlmProviderError {
    return new LlmProviderError(
      'OpenAI-compatible completion response was malformed',
      this.id,
      'MALFORMED_RESPONSE',
    );
  }
}
