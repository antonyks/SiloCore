import { Prisma } from '@prisma/client';
import { ChatRepository } from './chat.repository';
import { 
  IChatSessionCreateInput, 
  IChatSessionUpdateInput, 
  IChatMessageCreateInput,
  IChatSessionListParams,
  IChatGenerationServiceInput,
  IChatGenerationResult,
  ChatGenerationStreamEvent,
  IChatGenerationParams
} from './chat.types';
import { NotFoundError, AuthenticationError } from '../../errors';
import { SelectedChatSession, ChatSessionWithMessages, SelectedChatMessage, MessageAuthor } from './chat.model';
import { LlmRuntimeService } from '../llm/llmRuntime.service';
import { ILlmProvider } from '../llm/llm.interface';
import { LlmCompletionRequest, LlmMessage, TokenUsage } from '../llm/llm.types';

type PreparedGeneration = {
  provider: ILlmProvider;
  providerMetadata: {
    providerId: string;
    providerName: string;
    providerType: string;
  };
  request: LlmCompletionRequest;
  userMessage: SelectedChatMessage;
  startedAt: number;
  params: IChatGenerationParams;
};

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

export const ChatService = {
  async createSession(data: IChatSessionCreateInput): Promise<SelectedChatSession> {
    return await ChatRepository.createSession(data);
  },

  async getSessionById(id: number, userId: number): Promise<ChatSessionWithMessages | null> {
    const session = await ChatRepository.getSessionById(id);
    
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    
    if (session.userId !== userId) {
      throw new AuthenticationError('Access denied to this session');
    }
    
    return session;
  },

  async getUserSessions(params: IChatSessionListParams): Promise<SelectedChatSession[]> {
    return await ChatRepository.getSessionsByUserId(params);
  },

  async updateSession(id: number, userId: number, data: IChatSessionUpdateInput): Promise<SelectedChatSession | null> {
    const session = await ChatRepository.getSessionById(id);
    
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    
    if (session.userId !== userId) {
      throw new AuthenticationError('Access denied to update this session');
    }
    
    return await ChatRepository.updateSession(id, data);
  },

  async deleteSession(id: number, userId: number): Promise<SelectedChatSession | null> {
    const session = await ChatRepository.getSessionById(id);
    
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    
    if (session.userId !== userId) {
      throw new AuthenticationError('Access denied to delete this session');
    }
    
    return await ChatRepository.deleteSession(id);
  },

  async createMessage(data: IChatMessageCreateInput, userId: number): Promise<SelectedChatMessage> {
    await this.ensureSessionOwnedByUser(data.sessionId, userId, 'Access denied to this session');
    return await ChatRepository.createMessage(data);
  },

  async getMessagesBySessionId(sessionId: number, userId: number): Promise<SelectedChatMessage[] | []> {
    const session = await ChatRepository.getSessionById(sessionId);
    
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    
    if (session.userId !== userId) {
      throw new AuthenticationError('Access denied to this session');
    }
    
    return await ChatRepository.getMessagesBySessionId(sessionId);
  },

  async ensureSessionOwnedByUser(
    sessionId: number,
    userId: number,
    accessDeniedMessage = 'Access denied to this session',
  ): Promise<ChatSessionWithMessages> {
    const session = await ChatRepository.getSessionById(sessionId);

    if (!session) {
      throw new NotFoundError('Session not found');
    }

    if (session.userId !== userId) {
      throw new AuthenticationError(accessDeniedMessage);
    }

    return session;
  },

  async generateAssistantResponse(input: IChatGenerationServiceInput): Promise<IChatGenerationResult> {
    const prepared = await this.prepareGeneration(input);
    const completion = await prepared.provider.complete(prepared.request);
    const assistantMessage = await ChatRepository.createMessage({
      content: completion.content,
      author: MessageAuthor.ASSISTANT,
      sessionId: input.sessionId,
      metadata: createAssistantMetadata({
        ...prepared.providerMetadata,
        model: completion.model,
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

    return {
      userMessage: prepared.userMessage,
      assistantMessage,
    };
  },

  async *streamAssistantResponse(input: IChatGenerationServiceInput): AsyncIterable<ChatGenerationStreamEvent> {
    const prepared = await this.prepareGeneration(input);
    yield { event: 'user_message', data: prepared.userMessage };

    let content = '';
    let reasoning = '';
    let usage: TokenUsage | undefined;
    let finishReason: string | undefined;

    for await (const chunk of prepared.provider.streamComplete(prepared.request)) {
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

    const assistantMessage = await ChatRepository.createMessage({
      content,
      author: MessageAuthor.ASSISTANT,
      sessionId: input.sessionId,
      metadata: createAssistantMetadata({
        ...prepared.providerMetadata,
        model: prepared.request.model,
        reasoning: reasoning || undefined,
        finishReason,
        incomplete: isIncompleteGeneration({
          content,
          reasoning: reasoning || undefined,
          finishReason,
        }),
        usage,
        latencyMs: Date.now() - prepared.startedAt,
        params: prepared.params,
      }),
    });

    yield { event: 'assistant_message', data: assistantMessage };
    yield { event: 'done', data: { done: true } };
  },

  async prepareGeneration(input: IChatGenerationServiceInput): Promise<PreparedGeneration> {
    const session = await this.ensureSessionOwnedByUser(input.sessionId, input.userId);
    const resolved = await LlmRuntimeService.resolveGenerationProvider({
      providerId: input.providerId,
      model: input.model,
    });

    const userMessage = await ChatRepository.createMessage({
      content: input.content,
      author: MessageAuthor.USER,
      sessionId: input.sessionId,
    });

    const params = applyGenerationDefaults(resolved.generationDefaults, input);

    return {
      provider: resolved.provider,
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
