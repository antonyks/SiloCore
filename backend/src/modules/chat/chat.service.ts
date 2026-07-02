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

function createAssistantMetadata(data: {
  providerId: string;
  providerName: string;
  providerType: string;
  model: string;
  usage?: TokenUsage;
  latencyMs?: number;
  params: IChatGenerationParams;
}): Prisma.InputJsonObject {
  return removeUndefinedValues({
    providerId: data.providerId,
    providerName: data.providerName,
    providerType: data.providerType,
    model: data.model,
    usage: data.usage,
    latencyMs: data.latencyMs,
    params: removeUndefinedValues(data.params as Record<string, unknown>),
  }) as Prisma.InputJsonObject;
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
    let usage: TokenUsage | undefined;

    for await (const chunk of prepared.provider.streamComplete(prepared.request)) {
      if (chunk.usage) {
        usage = chunk.usage;
      }

      if (!chunk.content) {
        continue;
      }

      content += chunk.content;
      yield { event: 'delta', data: { content: chunk.content } };
    }

    const assistantMessage = await ChatRepository.createMessage({
      content,
      author: MessageAuthor.ASSISTANT,
      sessionId: input.sessionId,
      metadata: createAssistantMetadata({
        ...prepared.providerMetadata,
        model: prepared.request.model,
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

    const params: IChatGenerationParams = {
      temperature: input.temperature,
      topP: input.topP,
      maxTokens: input.maxTokens,
      stopSequences: input.stopSequences,
    };

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
        temperature: input.temperature,
        topP: input.topP,
        maxTokens: input.maxTokens,
        stopSequences: input.stopSequences,
      },
      userMessage,
      startedAt: Date.now(),
      params,
    };
  }
};
