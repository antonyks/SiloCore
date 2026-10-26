import type { GenerationUsageServiceContract } from '../generationUsage/generationUsage.service';
import type { LlmRuntimeServiceContract } from '../llm/llmRuntime.service';
import { Prisma } from '@prisma/client';
import { safeErrorDiagnostic } from '../../config/safeErrorDiagnostic';
import { ChatRepository } from './chat.repository';
import {
  IChatSessionCreateInput,
  IChatSessionUpdateInput,
  IChatMessageCreateInput,
  IChatGenerationServiceInput,
  IChatGenerationResult,
  ChatGenerationStreamEvent,
  IChatGenerationParams,
  IChatWorkspaceContext,
  IChatSessionListServiceParams
} from './chat.types';
import { NotFoundError } from '../../errors';
import { SelectedChatSession, ChatSessionWithMessages, SelectedChatMessage, MessageAuthor } from './chat.model';
import { LlmRuntimeService } from '../llm/llmRuntime.service';
import { ILlmProvider } from '../llm/llm.interface';
import { LlmCompletionRequest, LlmMessage, LlmProviderError, LlmStreamingError, TokenUsage } from '../llm/llm.types';
import { getLlmErrorCode, logLlmEvent } from '../llm/llm.logging';
import { createLlmOperationContext, LlmOperationContext } from '../llm/llm.operation';
import { getPublicLlmErrorMessage, normalizeAdapterError } from '../llm/llm.safeError';
import { isGenerationFallbackEligible } from '../llm/llm.failure';
import { CoreSingleOwnerWorkspaceAuthorizationPolicy, WorkspaceAuthorizationPolicy, WorkspaceAction } from '../workspace';
import { GenerationUsageOutcome, GenerationUsageService } from '../generationUsage';

type ChatGenerationOperation = 'completion' | 'streaming';

type PreparedGeneration = {
  provider: ILlmProvider;
  fallbackProviderIds: number[];
  workspaceId: number;
  providerMetadata: {
    providerId: string;
    providerName: string;
    providerType: string;
  };
  request: LlmCompletionRequest;
  userMessage: SelectedChatMessage;
  startedAt: number;
  params: IChatGenerationParams;
  operationContext: LlmOperationContext;
};

function isDefaultGeneration(input: IChatGenerationServiceInput): boolean {
  return input.providerId === undefined && input.model === undefined;
}

const WORKSPACE_NOT_FOUND_MESSAGE = 'Workspace not found';

function toLlmRole(author: MessageAuthor): LlmMessage['role'] {
  if (author === MessageAuthor.ASSISTANT) return 'assistant';
  if (author === MessageAuthor.SYSTEM) return 'system';
  return 'user';
}

function toLlmMessages(messages: Array<{ author: MessageAuthor; content: string }>): LlmMessage[] {
  return messages.map((message) => ({
    role: toLlmRole(message.author),
    content: message.content,
  }));
}

async function completeFromAdapter(provider: ILlmProvider, request: LlmCompletionRequest, context: LlmOperationContext) {
  try {
    return await provider.complete(request, context);
  } catch (error) {
    throw normalizeAdapterError(error, provider.id);
  }
}

async function* streamFromAdapter(provider: ILlmProvider, request: LlmCompletionRequest, context: LlmOperationContext) {
  try {
    yield* provider.streamComplete(request, context);
  } catch (error) {
    throw normalizeAdapterError(error, provider.id);
  }
}

function removeUndefinedValues<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
  return Object.entries(data).reduce<Record<string, unknown>>((result, [key, value]) => {
    if (value !== undefined) {
      result[key] = value;
    }
    return result;
  }, {});
}

function applyGenerationDefaults(
  defaults: IChatGenerationParams,
  input: IChatGenerationServiceInput,
): IChatGenerationParams {
  return {
    temperature: input.temperature ?? defaults.temperature,
    topP: input.topP ?? defaults.topP,
    maxTokens: input.maxTokens ?? defaults.maxTokens,
    stopSequences: input.stopSequences ?? defaults.stopSequences,
  };
}

function createAssistantMetadata(data: {
  providerId: string;
  providerName: string;
  providerType: string;
  model: string;
  reasoning?: string;
  finishReason?: string;
  incomplete?: boolean;
  errorMessage?: string;
  usage?: TokenUsage;
  latencyMs?: number;
  params: IChatGenerationParams;
}): Prisma.InputJsonObject {
  return removeUndefinedValues({
    providerId: data.providerId,
    providerName: data.providerName,
    providerType: data.providerType,
    model: data.model,
    reasoning: data.reasoning,
    finishReason: data.finishReason,
    incomplete: data.incomplete,
    errorMessage: data.errorMessage,
    usage: data.usage,
    latencyMs: data.latencyMs,
    params: removeUndefinedValues(data.params as Record<string, unknown>),
  }) as Prisma.InputJsonObject;
}

function isIncompleteGeneration(data: {
  content: string;
  reasoning?: string;
  finishReason?: string;
}): boolean | undefined {
  if (data.reasoning && !data.content.trim()) {
    return true;
  }

  if (!data.finishReason) {
    return undefined;
  }

  const normalized = data.finishReason.toLowerCase();
  if (normalized === 'length' || normalized === 'max_tokens') {
    return true;
  }

  return undefined;
}

export interface ChatServiceDependencies {
  policy: WorkspaceAuthorizationPolicy;
  repository: typeof ChatRepository;
  llm: LlmRuntimeServiceContract;
  usage: GenerationUsageServiceContract;
}

export function createChatService(dependencies: Partial<ChatServiceDependencies> = {}) {
  const policy = dependencies.policy ?? new CoreSingleOwnerWorkspaceAuthorizationPolicy();
  const repository = dependencies.repository ?? ChatRepository;
  const llm = dependencies.llm ?? LlmRuntimeService;
  const usage = dependencies.usage ?? GenerationUsageService;

  function ensureAuthorizedWorkspace(
    context: IChatWorkspaceContext,
    action: WorkspaceAction,
  ): number {
    const decision = policy.checkWorkspaceAction(
      context.actor,
      context.workspace,
      action,
    );

    if (!decision.allowed) {
      throw new NotFoundError(WORKSPACE_NOT_FOUND_MESSAGE);
    }

    return context.workspace.id;
  }

  async function recordGenerationUsageSafely(data: {
    prepared: PreparedGeneration;
    streaming: boolean;
    outcome: GenerationUsageOutcome;
    latencyMs: number;
    usage?: TokenUsage;
    errorCode?: string;
  }): Promise<void> {
    try {
      await usage.recordGeneration({
        workspaceId: data.prepared.workspaceId,
        providerId: Number(data.prepared.providerMetadata.providerId),
        model: data.prepared.request.model,
        streaming: data.streaming,
        latencyMs: data.latencyMs,
        usage: data.usage,
        outcome: data.outcome,
        errorCode: data.errorCode,
      });
    } catch (error) {
      logLlmEvent({
        layer: 'chat',
        operationId: data.prepared.operationContext.operationId,
        requestId: data.prepared.operationContext.requestId,
        providerId: data.prepared.providerMetadata.providerId,
        providerType: data.prepared.providerMetadata.providerType,
        model: data.prepared.request.model,
        operation: 'generationUsage.record',
        status: 'error',
        ...safeErrorDiagnostic(error),
      });
    }
  }

  async function prepareFallback(
    initial: PreparedGeneration,
    input: IChatGenerationServiceInput,
    providerId: number,
    operation: ChatGenerationOperation,
  ): Promise<PreparedGeneration> {
    const resolved = await llm.resolveGenerationProvider({ providerId, operation });
    const params = applyGenerationDefaults(resolved.generationDefaults, input);
    return {
      ...initial,
      provider: resolved.provider,
      providerMetadata: {
        providerId: String(resolved.providerConfig.id),
        providerName: resolved.providerConfig.name,
        providerType: resolved.provider.config.type,
      },
      request: {
        ...initial.request,
        model: resolved.model,
        temperature: params.temperature,
        topP: params.topP,
        maxTokens: params.maxTokens,
        stopSequences: params.stopSequences,
      },
      params,
      startedAt: Date.now(),
    };
  }

  async function nextFallback(
    initial: PreparedGeneration,
    input: IChatGenerationServiceInput,
    ids: number[],
    operation: ChatGenerationOperation,
  ): Promise<PreparedGeneration | null> {
    while (ids.length) {
      const id = ids.shift();
      if (id === undefined) break;
      try {
        return await prepareFallback(initial, input, id, operation);
      } catch (error) {
        logLlmEvent({
          layer: 'chat', ...initial.operationContext,
          operation: 'chat.fallback.resolve', status: 'error',
          errorCode: getLlmErrorCode(error), ...safeErrorDiagnostic(error),
        });
      }
    }
    return null;
  }

  const service = {
    async createSession(
      data: IChatSessionCreateInput,
      context: IChatWorkspaceContext,
    ): Promise<SelectedChatSession> {
      const workspaceId = ensureAuthorizedWorkspace(context, WorkspaceAction.CREATE_RESOURCE);

      return await repository.createSession({
        ...data,
        workspaceId,
      });
    },

    async getSessionById(
      id: number,
      context: IChatWorkspaceContext,
    ): Promise<ChatSessionWithMessages | null> {
      const workspaceId = ensureAuthorizedWorkspace(context, WorkspaceAction.READ_WORKSPACE);
      const session = await repository.getSessionInWorkspace(id, workspaceId);

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      return session;
    },

    async getWorkspaceSessions(
      params: IChatSessionListServiceParams,
      context: IChatWorkspaceContext,
    ): Promise<SelectedChatSession[]> {
      const workspaceId = ensureAuthorizedWorkspace(context, WorkspaceAction.READ_WORKSPACE);

      return await repository.listSessionsInWorkspace({
        ...params,
        workspaceId,
      });
    },

    async updateSession(
      id: number,
      data: IChatSessionUpdateInput,
      context: IChatWorkspaceContext,
    ): Promise<SelectedChatSession | null> {
      const workspaceId = ensureAuthorizedWorkspace(context, WorkspaceAction.UPDATE_RESOURCE);
      const session = await repository.updateSessionInWorkspace(id, workspaceId, data);

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      return session;
    },

    async deleteSession(
      id: number,
      context: IChatWorkspaceContext,
    ): Promise<SelectedChatSession | null> {
      const workspaceId = ensureAuthorizedWorkspace(context, WorkspaceAction.DELETE_RESOURCE);
      const session = await repository.deleteSessionInWorkspace(id, workspaceId);

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      return session;
    },

    async createMessage(
      data: IChatMessageCreateInput,
      context: IChatWorkspaceContext,
    ): Promise<SelectedChatMessage> {
      const workspaceId = ensureAuthorizedWorkspace(context, WorkspaceAction.CREATE_RESOURCE);
      await this.ensureSessionInWorkspace(data.sessionId, workspaceId);
      return await repository.createMessage(data);
    },

    async getMessagesBySessionId(
      sessionId: number,
      context: IChatWorkspaceContext,
    ): Promise<SelectedChatMessage[] | []> {
      const workspaceId = ensureAuthorizedWorkspace(context, WorkspaceAction.READ_WORKSPACE);
      await this.ensureSessionInWorkspace(sessionId, workspaceId);
      return await repository.listMessagesInWorkspace(sessionId, workspaceId);
    },

    async ensureSessionInWorkspace(
      sessionId: number,
      workspaceId: number,
    ): Promise<ChatSessionWithMessages> {
      const session = await repository.getSessionInWorkspace(sessionId, workspaceId);

      if (!session) {
        throw new NotFoundError('Session not found');
      }

      return session;
    },

    async generateAssistantResponse(
      input: IChatGenerationServiceInput,
      context: IChatWorkspaceContext,
    ): Promise<IChatGenerationResult> {
      ensureAuthorizedWorkspace(context, WorkspaceAction.CREATE_RESOURCE);
      const initial = await this.prepareGeneration(input, context, 'completion');
      let prepared = initial;
      const fallbackIds = [...initial.fallbackProviderIds];
      let switched = false;
      while (true) {
        let emptyResponse = false;
        logLlmEvent({
          layer: 'chat',
          ...prepared.operationContext,
          providerId: prepared.providerMetadata.providerId,
          providerType: prepared.providerMetadata.providerType,
          model: prepared.request.model,
          operation: 'chat.complete',
          status: 'started',
        });

        try {
          const completion = await completeFromAdapter(prepared.provider, prepared.request, prepared.operationContext);
          if (!completion.content?.trim() && !completion.reasoning?.trim()) {
            emptyResponse = true;
            throw new LlmProviderError('Provider returned no response', prepared.providerMetadata.providerId, 'UPSTREAM_ERROR');
          }
          const latencyMs = Date.now() - prepared.startedAt;
          const assistantMessage = await repository.createMessage({
            content: completion.content,
            author: MessageAuthor.ASSISTANT,
            sessionId: input.sessionId,
            metadata: createAssistantMetadata({
              ...prepared.providerMetadata,
              model: prepared.request.model,
              reasoning: completion.reasoning,
              finishReason: completion.finishReason,
              incomplete: isIncompleteGeneration({
                content: completion.content,
                reasoning: completion.reasoning,
                finishReason: completion.finishReason,
              }),
              usage: completion.usage,
              latencyMs: completion.latencyMs,
              params: prepared.params,
            }),
          });
          await recordGenerationUsageSafely({
            prepared,
            streaming: false,
            outcome: GenerationUsageOutcome.SUCCEEDED,
            latencyMs,
            usage: completion.usage,
          });
          if (switched) {
            try {
              await llm.promoteDefaultProvider(
                Number(initial.providerMetadata.providerId), Number(prepared.providerMetadata.providerId),
              );
            } catch (error) {
              logLlmEvent({ layer: 'chat', ...prepared.operationContext,
                operation: 'chat.default.promote', status: 'error', ...safeErrorDiagnostic(error) });
            }
          }
          logLlmEvent({
            layer: 'chat',
            ...prepared.operationContext,
            providerId: prepared.providerMetadata.providerId,
            providerType: prepared.providerMetadata.providerType,
            model: prepared.request.model,
            operation: 'chat.complete',
            latencyMs,
            status: 'success',
          });

          return {
            userMessage: prepared.userMessage,
            assistantMessage,
            ...(switched ? { providerSwitch: {
              fromProviderName: initial.providerMetadata.providerName,
              toProviderName: prepared.providerMetadata.providerName,
            } } : {}),
          };
        } catch (error) {
          const latencyMs = Date.now() - prepared.startedAt;
          await recordGenerationUsageSafely({
            prepared,
            streaming: false,
            outcome: GenerationUsageOutcome.FAILED,
            latencyMs,
            errorCode: getLlmErrorCode(error),
          });
          logLlmEvent({
            layer: 'chat',
            ...prepared.operationContext,
            providerId: prepared.providerMetadata.providerId,
            providerType: prepared.providerMetadata.providerType,
            model: prepared.request.model,
            operation: 'chat.complete',
            latencyMs,
            status: 'error',
            errorCode: getLlmErrorCode(error),
            ...safeErrorDiagnostic(error),
          });
          if ((emptyResponse || isGenerationFallbackEligible(error)) && fallbackIds.length) {
            const fallback = await nextFallback(initial, input, fallbackIds, 'completion');
            if (fallback) {
              prepared = fallback;
              switched = true;
              continue;
            }
          }
          throw error;
        }
      }
    },

    async *streamAssistantResponse(
      input: IChatGenerationServiceInput,
      context: IChatWorkspaceContext,
    ): AsyncIterable<ChatGenerationStreamEvent> {
      ensureAuthorizedWorkspace(context, WorkspaceAction.CREATE_RESOURCE);
      const initial = await this.prepareGeneration(input, context, 'streaming');
      let prepared = initial;
      const fallbackIds = [...initial.fallbackProviderIds];
      let switched = false;
      logLlmEvent({
        layer: 'chat',
        ...prepared.operationContext,
        providerId: prepared.providerMetadata.providerId,
        providerType: prepared.providerMetadata.providerType,
        model: prepared.request.model,
        operation: 'chat.stream',
        status: 'started',
      });
      yield { event: 'user_message', data: prepared.userMessage };

      let content = '';
      let reasoning = '';
      let usage: TokenUsage | undefined;
      let finishReason: string | undefined;
      let assistantMessagePersisted = false;
      let completed = false;
      let failed = false;

      const persistAssistantMessage = async (options?: {
        finishReason?: string;
        incomplete?: boolean;
        errorMessage?: string;
      }): Promise<SelectedChatMessage | null> => {
        if (assistantMessagePersisted || (!content && !reasoning)) {
          return null;
        }

        assistantMessagePersisted = true;
        const resolvedFinishReason = options?.finishReason ?? finishReason;
        return repository.createMessage({
          content,
          author: MessageAuthor.ASSISTANT,
          sessionId: input.sessionId,
          metadata: createAssistantMetadata({
            ...prepared.providerMetadata,
            model: prepared.request.model,
            reasoning: reasoning || undefined,
            finishReason: resolvedFinishReason,
            incomplete: options?.incomplete ?? isIncompleteGeneration({
              content,
              reasoning: reasoning || undefined,
              finishReason: resolvedFinishReason,
            }),
            errorMessage: options?.errorMessage,
            usage,
            latencyMs: Date.now() - prepared.startedAt,
            params: prepared.params,
          }),
        });
      };

      try {
        while (true) {
          let attemptError: unknown;
          let emptyResponse = false;
          const previousPrepared = prepared;
          try {
            for await (const chunk of streamFromAdapter(prepared.provider, prepared.request, prepared.operationContext)) {
              if (chunk.usage) {
                usage = chunk.usage;
              }

              if (chunk.finishReason) {
                finishReason = chunk.finishReason;
              }

              if (!chunk.content && !chunk.reasoning) {
                continue;
              }

              if (chunk.content) {
                content += chunk.content;
              }

              if (chunk.reasoning) {
                reasoning += chunk.reasoning;
              }

              yield {
                event: 'delta',
                data: removeUndefinedValues({
                  content: chunk.content,
                  reasoning: chunk.reasoning,
                }),
              };
            }
            emptyResponse = !content && !reasoning;
            if (emptyResponse) {
              attemptError = new LlmStreamingError(
                'Provider returned no response', prepared.providerMetadata.providerId, 'UPSTREAM_STREAM_ERROR',
              );
            }
          } catch (error) {
            attemptError = error;
          }
          if (!attemptError) break;
          if ((!content && !reasoning) && fallbackIds.length
            && (emptyResponse || isGenerationFallbackEligible(attemptError))) {
            const fallback = await nextFallback(initial, input, fallbackIds, 'streaming');
            if (fallback) {
              await recordGenerationUsageSafely({
                prepared: previousPrepared, streaming: true, outcome: GenerationUsageOutcome.FAILED,
                latencyMs: Date.now() - previousPrepared.startedAt, usage,
                errorCode: getLlmErrorCode(attemptError),
              });
              prepared = fallback;
              switched = true;
              usage = undefined;
              finishReason = undefined;
              yield { event: 'provider_switch', data: {
                fromProviderName: previousPrepared.providerMetadata.providerName,
                toProviderName: fallback.providerMetadata.providerName,
                status: 'retrying',
              } };
              continue;
            }
          }
          throw attemptError;
        }

        const assistantMessage = await persistAssistantMessage();
        completed = true;
        const latencyMs = Date.now() - prepared.startedAt;
        await recordGenerationUsageSafely({
          prepared,
          streaming: true,
          outcome: GenerationUsageOutcome.SUCCEEDED,
          latencyMs,
          usage,
        });
        if (switched) {
          try {
            await llm.promoteDefaultProvider(
              Number(initial.providerMetadata.providerId), Number(prepared.providerMetadata.providerId),
            );
          } catch (error) {
            logLlmEvent({ layer: 'chat', ...prepared.operationContext,
              operation: 'chat.default.promote', status: 'error', ...safeErrorDiagnostic(error) });
          }
        }
        logLlmEvent({
          layer: 'chat',
          ...prepared.operationContext,
          providerId: prepared.providerMetadata.providerId,
          providerType: prepared.providerMetadata.providerType,
          model: prepared.request.model,
          operation: 'chat.stream',
          latencyMs,
          status: 'success',
        });
        if (assistantMessage) {
          yield { event: 'assistant_message', data: assistantMessage };
        }
        if (switched) {
          yield { event: 'provider_switch', data: {
            fromProviderName: initial.providerMetadata.providerName,
            toProviderName: prepared.providerMetadata.providerName,
            status: 'succeeded',
          } };
        }
        yield { event: 'done', data: { done: true } };
      } catch (error) {
        failed = true;
        const latencyMs = Date.now() - prepared.startedAt;
        const errorMessage = getPublicLlmErrorMessage(error, 'Streaming failed');
        const assistantMessage = await persistAssistantMessage({
          finishReason: 'error',
          incomplete: true,
          errorMessage,
        });
        if (assistantMessage) {
          yield { event: 'assistant_message', data: assistantMessage };
        }
        await recordGenerationUsageSafely({
          prepared,
          streaming: true,
          outcome: GenerationUsageOutcome.FAILED,
          latencyMs,
          usage,
          errorCode: getLlmErrorCode(error),
        });
        logLlmEvent({
          layer: 'chat',
          ...prepared.operationContext,
          providerId: prepared.providerMetadata.providerId,
          providerType: prepared.providerMetadata.providerType,
          model: prepared.request.model,
          operation: 'chat.stream',
          latencyMs,
          status: 'error',
          errorCode: getLlmErrorCode(error),
          ...safeErrorDiagnostic(error),
        });
        throw error;
      } finally {
        if (!completed && !failed) {
          const latencyMs = Date.now() - prepared.startedAt;
          await persistAssistantMessage({
            finishReason: 'aborted',
            incomplete: true,
          });
          await recordGenerationUsageSafely({
            prepared,
            streaming: true,
            outcome: GenerationUsageOutcome.ABORTED,
            latencyMs,
            usage,
          });
          logLlmEvent({
            layer: 'chat',
            ...prepared.operationContext,
            providerId: prepared.providerMetadata.providerId,
            providerType: prepared.providerMetadata.providerType,
            model: prepared.request.model,
            operation: 'chat.stream',
            latencyMs,
            status: 'aborted',
          });
        }
      }
    },

    async prepareGeneration(
      input: IChatGenerationServiceInput,
      context: IChatWorkspaceContext,
      operation: ChatGenerationOperation = 'completion',
    ): Promise<PreparedGeneration> {
      const workspaceId = ensureAuthorizedWorkspace(context, WorkspaceAction.READ_WORKSPACE);
      const session = await this.ensureSessionInWorkspace(input.sessionId, workspaceId);
      const resolved = await llm.resolveGenerationProvider({
        providerId: input.providerId,
        model: input.model,
        operation,
      });
      const fallbackProviderIds = isDefaultGeneration(input)
        ? await llm.listFallbackProviderIds(resolved.providerConfig.id) : [];

      const userMessage = await repository.createMessage({
        content: input.content,
        author: MessageAuthor.USER,
        sessionId: input.sessionId,
      });

      const params = applyGenerationDefaults(resolved.generationDefaults, input);

      return {
        provider: resolved.provider,
        fallbackProviderIds,
        workspaceId,
        operationContext: createLlmOperationContext({ requestId: input.requestId }),
        providerMetadata: {
          providerId: String(resolved.providerConfig.id),
          providerName: resolved.providerConfig.name,
          providerType: resolved.provider.config.type,
        },
        request: {
          model: resolved.model,
          messages: toLlmMessages([...session.messages, userMessage]),
          temperature: params.temperature,
          topP: params.topP,
          maxTokens: params.maxTokens,
          stopSequences: params.stopSequences,
        },
        userMessage,
        startedAt: Date.now(),
        params,
      };
    }
  };

  return service;
}

export type ChatServiceContract = ReturnType<typeof createChatService>;
export const ChatService = createChatService();
