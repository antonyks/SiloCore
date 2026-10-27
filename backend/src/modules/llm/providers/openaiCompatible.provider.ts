/**
 *
 * Adapter for OpenAI-compatible chat completion APIs.
 */

import fetch from 'node-fetch';
import { AbstractLlmProvider } from '../llm.base';
import {
  LlmCompletionRequest,
  LlmCompletionOptions,
  LlmCompletionResponse,
  LlmEmbeddingRequest,
  LlmEmbeddingResponse,
  LlmMessage,
  LlmModelCapabilities,
  LlmProviderConfig,
  LlmProviderError,
  LlmProviderListedModel,
  LlmStreamingError,
  LlmStreamChunk,
  TokenUsage,
} from '../llm.types';
import { providerModelMismatch } from '../llm.modelIdentity';
import { classifyProviderFailure, confirmedDeadline, providerHttpError, ProviderFailureOperation, ProviderFailureStage } from '../llm.failure';
import { LlmOperationContext, runProviderOperation, runProviderStream } from '../llm.operation';

interface OpenAiCompatibleChatRequest {
  model: string;
  messages: LlmMessage[];
  stream: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string[];
}

interface OpenAiCompatibleEmbeddingRequest {
  model: string;
  input: string | string[];
  dimensions?: number;
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

interface OpenAiCompatibleStreamResponse {
  choices?: Array<{
    finish_reason?: string | null;
    delta?: {
      content?: string | null;
      reasoning?: string;
      reasoning_content?: string;
    };
  }>;
  usage?: OpenAiCompatibleChatResponse['usage'];
}

interface OpenAiCompatibleModelListResponse {
  data?: Array<{
    id?: unknown;
  }>;
}

interface OpenAiCompatibleEmbeddingResponse {
  model?: string;
  data?: Array<{
    embedding?: unknown;
    index?: unknown;
  }>;
  usage?: {
    prompt_tokens?: number;
    total_tokens?: number;
  };
}

type OpenAiCompatibleMessage = NonNullable<
  NonNullable<OpenAiCompatibleChatResponse['choices']>[number]['message']
>;

type OpenAiCompatibleDelta = NonNullable<
  NonNullable<OpenAiCompatibleStreamResponse['choices']>[number]['delta']
>;

function buildChatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

function buildModelsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/models`;
}

function buildEmbeddingsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/embeddings`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isEmbeddingVector(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isFiniteNumber);
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

function extractDeltaReasoning(delta: OpenAiCompatibleDelta | undefined): string | undefined {
  return delta?.reasoning ?? delta?.reasoning_content;
}

export class OpenAiCompatibleProvider extends AbstractLlmProvider {
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
      modelPulling: false,
      embeddings: true,
      toolCalling: false,
      structuredOutput: false,
      tokenCounting: false,
    });
  }

  async initialise(context?: LlmOperationContext): Promise<void> {
    if (!this.isEnabled) return;
    const signal = this.buildAbortSignal(this.config.timeoutMs ?? 5000);
    return runProviderOperation(this.operationOptions('initialise', undefined, context, () => signal), async ({ setStage }) => {
      const raw = await this.fetchModelList(signal, setStage);
      this.normalizeModelListResponse(raw);
      return { value: undefined };
    });
  }

  async embed(request: LlmEmbeddingRequest, context?: LlmOperationContext): Promise<LlmEmbeddingResponse> {
    const signal = this.buildAbortSignal();
    const body: OpenAiCompatibleEmbeddingRequest = {
      model: request.model,
      input: request.input,
      dimensions: request.dimensions,
    };
    return runProviderOperation(this.operationOptions('embed', request.model, context, () => signal), async ({ setStage }) => {
      const result = await this.withLatency(async () => {
        const res = await fetch(buildEmbeddingsUrl(this.config.baseUrl), {
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

        setStage('response_parse');
        try {
          return (await res.json()) as OpenAiCompatibleEmbeddingResponse;
        } catch {
          throw this.createMalformedEmbeddingResponseError();
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
    const body: OpenAiCompatibleChatRequest = {
      model: enriched.model,
      messages: enriched.messages,
      stream: false,
      temperature: enriched.temperature,
      top_p: enriched.topP,
      max_tokens: enriched.maxTokens,
      stop: enriched.stopSequences,
    };
    return runProviderOperation(this.operationOptions('complete', enriched.model, context, () => signal, abortCause), async ({ setStage }) => {
      const result = await this.withLatency(async () => {
        const res = await fetch(buildChatCompletionsUrl(this.config.baseUrl), {
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
        try {
          return (await res.json()) as OpenAiCompatibleChatResponse;
        } catch {
          throw this.createMalformedResponseError();
        }
      });
      return {
        value: this.normalizeCompletionResponse(result.value, enriched.model, result.latencyMs),
        providerModelMismatch: providerModelMismatch(enriched.model, result.value.model),
      };
    });
  }

  async *streamComplete(request: LlmCompletionRequest, context?: LlmOperationContext): AsyncIterable<LlmStreamChunk> {
    const enriched = this.enrichRequest({ ...request, stream: true });
    const signal = this.buildAbortSignal();
    const body: OpenAiCompatibleChatRequest = {
      model: enriched.model,
      messages: enriched.messages,
      stream: true,
      temperature: enriched.temperature,
      top_p: enriched.topP,
      max_tokens: enriched.maxTokens,
      stop: enriched.stopSequences,
    };
    const url = buildChatCompletionsUrl(this.config.baseUrl);
    const headers = this.buildRequestHeaders({ 'Content-Type': 'application/json' });
    const providerType = this.config.type;
    const providerId = this.id;
    const readChunks = (reader: NodeJS.ReadableStream) => this.readStreamChunks(reader);
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

      setStage('stream_read');
      const reader = res.body as NodeJS.ReadableStream;
      for await (const chunk of readChunks(reader)) {
        yield chunk;
      }
    });
  }

  async listModels(context?: LlmOperationContext): Promise<LlmProviderListedModel[]> {
    const signal = this.buildAbortSignal();
    return runProviderOperation(this.operationOptions('listModels', undefined, context, () => signal), async ({ setStage }) => {
      const raw = await this.fetchModelList(signal, setStage);
      const models = this.normalizeModelListResponse(raw);
      return { value: models };
    });
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
      model: fallbackModel,
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

  private createMalformedStreamChunkError(): LlmStreamingError {
    return new LlmStreamingError(
      'OpenAI-compatible stream chunk was malformed',
      this.id,
      'MALFORMED_STREAM_CHUNK',
    );
  }

  private createMalformedModelListError(): LlmProviderError {
    return new LlmProviderError(
      'OpenAI-compatible model list response was malformed',
      this.id,
      'MALFORMED_MODEL_LIST',
    );
  }

  private createMalformedEmbeddingResponseError(): LlmProviderError {
    return new LlmProviderError(
      'OpenAI-compatible embedding response was malformed',
      this.id,
      'MALFORMED_EMBEDDING_RESPONSE',
    );
  }

  private async fetchModelList(
    signal?: AbortSignal, setStage?: (stage: ProviderFailureStage) => void,
  ): Promise<OpenAiCompatibleModelListResponse> {
    const res = await fetch(buildModelsUrl(this.config.baseUrl), {
      headers: this.buildRequestHeaders(),
      signal,
    });

    if (!res.ok) {
      throw providerHttpError({ providerType: this.config.type, providerId: this.id, operation: 'listModels' }, res.status);
    }

    setStage?.('response_parse');
    try {
      return (await res.json()) as OpenAiCompatibleModelListResponse;
    } catch {
      throw this.createMalformedModelListError();
    }
  }

  private normalizeModelListResponse(raw: OpenAiCompatibleModelListResponse): LlmProviderListedModel[] {
    if (!Array.isArray(raw.data)) {
      throw this.createMalformedModelListError();
    }

    return raw.data
      .filter((model): model is { id: string } => typeof model.id === 'string' && model.id.trim().length > 0)
      .map((model) => ({
        modelId: model.id,
        modelName: model.id,
        capabilities: { ...UNKNOWN_MODEL_CAPABILITIES },
      }));
  }

  private normalizeEmbeddingResponse(
    raw: OpenAiCompatibleEmbeddingResponse,
    fallbackModel: string,
    latencyMs: number,
  ): LlmEmbeddingResponse {
    if (!Array.isArray(raw.data)) {
      throw this.createMalformedEmbeddingResponseError();
    }

    const embeddings = raw.data.map((item) => {
      if (!isEmbeddingVector(item.embedding) || !isFiniteNumber(item.index)) {
        throw this.createMalformedEmbeddingResponseError();
      }

      return {
        embedding: item.embedding,
        index: item.index,
      };
    }).sort((left, right) => left.index - right.index);

    const promptTokens = isFiniteNumber(raw.usage?.prompt_tokens)
      ? raw.usage.prompt_tokens
      : undefined;
    const totalTokens = isFiniteNumber(raw.usage?.total_tokens)
      ? raw.usage.total_tokens
      : undefined;

    return {
      providerId: this.id,
      providerName: this.config.name,
      providerType: this.config.type,
      model: fallbackModel,
      embeddings,
      usage: promptTokens === undefined || totalTokens === undefined
        ? undefined
        : {
          promptTokens,
          totalTokens,
        },
      latencyMs,
    };
  }

  private async *readStreamChunks(reader: NodeJS.ReadableStream): AsyncIterable<LlmStreamChunk> {
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const rawChunk of reader) {
      buffer += typeof rawChunk === 'string'
        ? rawChunk
        : decoder.decode(rawChunk, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const chunk = this.parseStreamFrame(frame);
        if (chunk === 'done') {
          return;
        }
        if (chunk) {
          yield chunk;
        }
      }
    }

    if (buffer.trim()) {
      const chunk = this.parseStreamFrame(buffer);
      if (chunk !== 'done' && chunk) {
        yield chunk;
      }
    }
  }

  private parseStreamFrame(frame: string): LlmStreamChunk | 'done' | undefined {
    const dataLines = frame
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.trim() && !line.trimStart().startsWith(':'))
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trimStart());

    if (dataLines.length === 0) {
      return undefined;
    }

    const data = dataLines.join('\n');
    if (data.trim() === '[DONE]') {
      return 'done';
    }

    let parsed: OpenAiCompatibleStreamResponse;
    try {
      parsed = JSON.parse(data) as OpenAiCompatibleStreamResponse;
    } catch {
      throw this.createMalformedStreamChunkError();
    }

    return this.normalizeStreamResponse(parsed);
  }

  private normalizeStreamResponse(raw: OpenAiCompatibleStreamResponse): LlmStreamChunk | undefined {
    const usage = normalizeUsage(raw.usage);
    const choice = raw.choices?.[0];

    if (!choice) {
      if (usage) {
        return { usage };
      }
      throw this.createMalformedStreamChunkError();
    }

    const content = choice.delta?.content;
    const reasoning = extractDeltaReasoning(choice.delta);

    if (content !== undefined && content !== null && typeof content !== 'string') {
      throw this.createMalformedStreamChunkError();
    }

    return {
      content: content ?? undefined,
      reasoning,
      done: Boolean(choice.finish_reason),
      finishReason: choice.finish_reason ?? undefined,
      usage,
    };
  }
}
