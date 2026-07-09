import { describe, it, expect } from '@jest/globals';
import { ChatService } from '../../modules/chat/chat.service';
import { mockPrisma } from '../setup';
import { NotFoundError, AuthenticationError } from '../../errors';
import { SelectedChatSession, ChatSessionWithMessages, SelectedChatMessage, SelectedChatSessionFields, ChatSessionWithMessagesFields, SelectedChatMessageFields } from '../../modules/chat/chat.model';
import { SelectedLlmProviderConfig } from '../../modules/llm/llmProviderConfig.model';
import { OllamaProvider } from '../../modules/llm/providers/ollama.provider';

jest.mock('node-fetch', () => jest.fn());

const TEST_MODEL_ID = process.env.OLLAMA_MODEL as string;
const EXPLICIT_TEST_MODEL_ID = `${TEST_MODEL_ID}-explicit`;

function createSession(overrides: Partial<ChatSessionWithMessages> = {}): ChatSessionWithMessages {
  return {
    id: 1,
    title: 'Test Session',
    userId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    messages: [],
    ...overrides,
  };
}

function createProvider(overrides: Partial<SelectedLlmProviderConfig> = {}): SelectedLlmProviderConfig {
  return {
    id: 1,
    name: 'Local Ollama',
    type: 'OLLAMA',
    baseUrl: 'http://localhost:11434',
    enabled: true,
    defaultModel: TEST_MODEL_ID,
    timeoutMs: 5000,
    generationDefaults: {},
    extraHeaders: {},
    apiKey: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ChatService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('createSession', () => {
    it('should create a new chat session successfully', async () => {
      const inputData = {
        title: 'Test Session',
        userId: 1,
      };

      const mockResult: SelectedChatSession = {
        id: 1,
        title: 'Test Session',
        userId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.chatSession.create.mockResolvedValue(mockResult);

      const result = await ChatService.createSession(inputData);

      expect(result).toEqual(mockResult);
      expect(mockPrisma.chatSession.create).toHaveBeenCalledWith({
        data: inputData,
        select: SelectedChatSessionFields,
      });
    });
  });

  describe('getSessionById', () => {
    it('should return session with messages when user has access', async () => {
      const sessionId = 1;
      const userId = 1;

      const mockSession: ChatSessionWithMessages = {
        id: 1,
        title: 'Test Session',
        userId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [
          {
            id: 1,
            content: 'Hello',
            author: 'USER',
            createdAt: new Date(),
          },
        ],
      };

      mockPrisma.chatSession.findUnique.mockResolvedValue(mockSession);

      const result = await ChatService.getSessionById(sessionId, userId);

      expect(result).toEqual(mockSession);
      expect(mockPrisma.chatSession.findUnique).toHaveBeenCalledWith({
        where: { id: sessionId },
        select: ChatSessionWithMessagesFields,
      });
    });

    it('should throw NotFoundError when session does not exist', async () => {
      const sessionId = 999;
      const userId = 1;

      mockPrisma.chatSession.findUnique.mockResolvedValue(null);

      await expect(ChatService.getSessionById(sessionId, userId)).rejects.toThrow(
        new NotFoundError('Session not found')
      );
    });

    it('should throw AuthenticationError when user does not own the session', async () => {
      const sessionId = 1;
      const userId = 2;

      const mockSession: ChatSessionWithMessages = {
        id: 1,
        title: 'Test Session',
        userId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [],
      };

      mockPrisma.chatSession.findUnique.mockResolvedValue(mockSession);

      await expect(ChatService.getSessionById(sessionId, userId)).rejects.toThrow(
        new AuthenticationError('Access denied to this session')
      );
    });
  });

  describe('getUserSessions', () => {
    it('should return paginated sessions for user', async () => {
      const params = {
        userId: 1,
        skip: 0,
        take: 10,
        orderBy: 'createdAt' as const,
        orderDirection: 'desc' as const,
      };

      const mockSessions: SelectedChatSession[] = [
        {
          id: 1,
          title: 'Session 1',
          userId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          title: 'Session 2',
          userId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.chatSession.findMany.mockResolvedValue(mockSessions);

      const result = await ChatService.getUserSessions(params);

      expect(result).toEqual(mockSessions);
      expect(mockPrisma.chatSession.findMany).toHaveBeenCalledWith({
        where: { userId: params.userId },
        skip: params.skip,
        take: params.take,
        orderBy: { [params.orderBy]: params.orderDirection },
        select: SelectedChatSessionFields,
      });
    });

    it('should return empty array when user has no sessions', async () => {
      const params = {
        userId: 999,
        skip: 0,
        take: 10,
      };

      mockPrisma.chatSession.findMany.mockResolvedValue([]);

      const result = await ChatService.getUserSessions(params);

      expect(result).toEqual([]);
    });
  });

  describe('updateSession', () => {
    it('should update session successfully when user owns it', async () => {
      const sessionId = 1;
      const userId = 1;
      const updateData = { title: 'Updated Title' };

      const mockExistingSession: ChatSessionWithMessages = {
        id: 1,
        title: 'Old Title',
        userId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [],
      };

      const mockUpdatedSession: SelectedChatSession = {
        id: 1,
        title: 'Updated Title',
        userId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.chatSession.findUnique.mockResolvedValue(mockExistingSession);
      mockPrisma.chatSession.update.mockResolvedValue(mockUpdatedSession);

      const result = await ChatService.updateSession(sessionId, userId, updateData);

      expect(result).toEqual(mockUpdatedSession);
      expect(mockPrisma.chatSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: updateData,
        select: SelectedChatSessionFields,
      });
    });

    it('should throw NotFoundError when session does not exist', async () => {
      const sessionId = 999;
      const userId = 1;
      const updateData = { title: 'Updated Title' };

      mockPrisma.chatSession.findUnique.mockResolvedValue(null);

      await expect(ChatService.updateSession(sessionId, userId, updateData)).rejects.toThrow(
        new NotFoundError('Session not found')
      );
    });

    it('should throw AuthenticationError when user does not own the session', async () => {
      const sessionId = 1;
      const userId = 2;
      const updateData = { title: 'Updated Title' };

      const mockExistingSession: ChatSessionWithMessages = {
        id: 1,
        title: 'Old Title',
        userId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [],
      };

      mockPrisma.chatSession.findUnique.mockResolvedValue(mockExistingSession);

      await expect(ChatService.updateSession(sessionId, userId, updateData)).rejects.toThrow(
        new AuthenticationError('Access denied to update this session')
      );
    });
  });

  describe('deleteSession', () => {
    it('should delete session successfully when user owns it', async () => {
      const sessionId = 1;
      const userId = 1;

      const mockExistingSession: ChatSessionWithMessages = {
        id: 1,
        title: 'Test Session',
        userId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [],
      };

      const mockDeletedSession: SelectedChatSession = {
        id: 1,
        title: 'Test Session',
        userId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.chatSession.findUnique.mockResolvedValue(mockExistingSession);
      mockPrisma.chatSession.delete.mockResolvedValue(mockDeletedSession);

      const result = await ChatService.deleteSession(sessionId, userId);

      expect(result).toEqual(mockDeletedSession);
      expect(mockPrisma.chatSession.delete).toHaveBeenCalledWith({
        where: { id: sessionId },
        select: SelectedChatSessionFields,
      });
    });

    it('should throw NotFoundError when session does not exist', async () => {
      const sessionId = 999;
      const userId = 1;

      mockPrisma.chatSession.findUnique.mockResolvedValue(null);

      await expect(ChatService.deleteSession(sessionId, userId)).rejects.toThrow(
        new NotFoundError('Session not found')
      );
    });

    it('should throw AuthenticationError when user does not own the session', async () => {
      const sessionId = 1;
      const userId = 2;

      const mockExistingSession: ChatSessionWithMessages = {
        id: 1,
        title: 'Test Session',
        userId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [],
      };

      mockPrisma.chatSession.findUnique.mockResolvedValue(mockExistingSession);

      await expect(ChatService.deleteSession(sessionId, userId)).rejects.toThrow(
        new AuthenticationError('Access denied to delete this session')
      );
    });
  });

  describe('createMessage', () => {
    it('should create a new chat message successfully', async () => {
      const inputData = {
        content: 'Hello, AI!',
        author: 'USER' as const,
        sessionId: 1,
        metadata: { model: TEST_MODEL_ID, tokens: { prompt: 10, completion: 20, total: 30 } },
      };

      const mockResult: SelectedChatMessage = {
        id: 1,
        content: 'Hello, AI!',
        author: 'USER',
        sessionId: 1,
        metadata: inputData.metadata,
        createdAt: new Date(),
      };

      mockPrisma.chatSession.findUnique.mockResolvedValue(createSession());
      mockPrisma.chatMessage.create.mockResolvedValue(mockResult);

      const result = await ChatService.createMessage(inputData, 1);

      expect(result).toEqual(mockResult);
      expect(mockPrisma.chatSession.findUnique).toHaveBeenCalledWith({
        where: { id: inputData.sessionId },
        select: ChatSessionWithMessagesFields,
      });
      expect(mockPrisma.chatMessage.create).toHaveBeenCalledWith({
        data: inputData,
        select: SelectedChatMessageFields,
      });
    });

    it('should create message without metadata when not provided', async () => {
      const inputData = {
        content: 'Hello!',
        author: 'ASSISTANT' as const,
        sessionId: 1,
      };

      const mockResult: SelectedChatMessage = {
        id: 2,
        content: 'Hello!',
        author: 'ASSISTANT',
        sessionId: 1,
        metadata: null,
        createdAt: new Date(),
      };

      mockPrisma.chatSession.findUnique.mockResolvedValue(createSession());
      mockPrisma.chatMessage.create.mockResolvedValue(mockResult);

      const result = await ChatService.createMessage(inputData, 1);

      expect(result).toEqual(mockResult);
    });

    it('should not create a message when the session does not exist', async () => {
      mockPrisma.chatSession.findUnique.mockResolvedValue(null);

      await expect(ChatService.createMessage({
        content: 'Hello',
        author: 'USER',
        sessionId: 999,
      }, 1)).rejects.toThrow(new NotFoundError('Session not found'));

      expect(mockPrisma.chatMessage.create).not.toHaveBeenCalled();
    });

    it('should not create a message when the user does not own the session', async () => {
      mockPrisma.chatSession.findUnique.mockResolvedValue(createSession({ userId: 2 }));

      await expect(ChatService.createMessage({
        content: 'Hello',
        author: 'USER',
        sessionId: 1,
      }, 1)).rejects.toThrow(new AuthenticationError('Access denied to this session'));

      expect(mockPrisma.chatMessage.create).not.toHaveBeenCalled();
    });
  });

  describe('generateAssistantResponse', () => {
    it('should persist user and assistant messages with provider metadata', async () => {
      const userMessage: SelectedChatMessage = {
        id: 1,
        content: 'Hello',
        author: 'USER',
        sessionId: 1,
        metadata: null,
        createdAt: new Date(),
      };
      const assistantMessage: SelectedChatMessage = {
        id: 2,
        content: 'Hi there',
        author: 'ASSISTANT',
        sessionId: 1,
        metadata: {
          providerId: '1',
          providerName: 'Local Ollama',
          providerType: 'ollama',
          model: TEST_MODEL_ID,
          usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
          latencyMs: 12,
          params: { temperature: 0.2 },
        },
        createdAt: new Date(),
      };

      mockPrisma.chatSession.findUnique.mockResolvedValue(createSession({
        messages: [
          {
            id: 10,
            content: 'Previous',
            author: 'USER',
            createdAt: new Date(),
          },
        ],
      }));
      mockPrisma.llmProviderConfig.findMany.mockResolvedValue([createProvider()]);
      mockPrisma.chatMessage.create
        .mockResolvedValueOnce(userMessage)
        .mockResolvedValueOnce(assistantMessage);
      const complete = jest.spyOn(OllamaProvider.prototype, 'complete').mockResolvedValue({
        content: 'Hi there',
        reasoning: 'I should greet the user.',
        model: TEST_MODEL_ID,
        finishReason: 'stop',
        usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
        latencyMs: 12,
      });

      const result = await ChatService.generateAssistantResponse({
        sessionId: 1,
        userId: 1,
        content: 'Hello',
        temperature: 0.2,
      });

      expect(result).toEqual({ userMessage, assistantMessage });
      expect(complete).toHaveBeenCalledWith(expect.objectContaining({
        model: TEST_MODEL_ID,
        temperature: 0.2,
        messages: [
          { role: 'user', content: 'Previous' },
          { role: 'user', content: 'Hello' },
        ],
      }));
      expect(mockPrisma.chatMessage.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          content: 'Hi there',
          author: 'ASSISTANT',
          sessionId: 1,
          metadata: expect.objectContaining({
            providerId: '1',
            providerName: 'Local Ollama',
            providerType: 'ollama',
            model: TEST_MODEL_ID,
            reasoning: 'I should greet the user.',
            finishReason: 'stop',
          }),
        }),
        select: SelectedChatMessageFields,
      });
    });

    it('should resolve an explicit provider and model', async () => {
      mockPrisma.chatSession.findUnique.mockResolvedValue(createSession());
      mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(createProvider({ id: 2, defaultModel: TEST_MODEL_ID }));
      mockPrisma.chatMessage.create
        .mockResolvedValueOnce({
          id: 1,
          content: 'Hello',
          author: 'USER',
          sessionId: 1,
          metadata: null,
          createdAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 2,
          content: 'Done',
          author: 'ASSISTANT',
          sessionId: 1,
          metadata: null,
          createdAt: new Date(),
        });
      const complete = jest.spyOn(OllamaProvider.prototype, 'complete').mockResolvedValue({
        content: 'Done',
        model: EXPLICIT_TEST_MODEL_ID,
      });

      await ChatService.generateAssistantResponse({
        sessionId: 1,
        userId: 1,
        content: 'Hello',
        providerId: 2,
        model: EXPLICIT_TEST_MODEL_ID,
      });

      expect(mockPrisma.llmProviderConfig.findUnique).toHaveBeenCalledWith({
        where: { id: 2 },
        select: expect.any(Object),
      });
      expect(complete).toHaveBeenCalledWith(expect.objectContaining({ model: EXPLICIT_TEST_MODEL_ID }));
    });

    it('should apply provider generation defaults before user overrides', async () => {
      const provider = createProvider({
        generationDefaults: {
          temperature: 0.4,
          topP: 0.9,
          maxTokens: 4096,
          stopSequences: ['END'],
        },
      });
      mockPrisma.chatSession.findUnique.mockResolvedValue(createSession());
      mockPrisma.llmProviderConfig.findMany.mockResolvedValue([provider]);
      mockPrisma.chatMessage.create
        .mockResolvedValueOnce({
          id: 1,
          content: 'Hello',
          author: 'USER',
          sessionId: 1,
          metadata: null,
          createdAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 2,
          content: 'Done',
          author: 'ASSISTANT',
          sessionId: 1,
          metadata: null,
          createdAt: new Date(),
        });
      const complete = jest.spyOn(OllamaProvider.prototype, 'complete').mockResolvedValue({
        content: 'Done',
        model: TEST_MODEL_ID,
      });

      await ChatService.generateAssistantResponse({
        sessionId: 1,
        userId: 1,
        content: 'Hello',
        temperature: 0.2,
      });

      expect(complete).toHaveBeenCalledWith(expect.objectContaining({
        temperature: 0.2,
        topP: 0.9,
        maxTokens: 4096,
        stopSequences: ['END'],
      }));
      expect(mockPrisma.chatMessage.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            params: {
              temperature: 0.2,
              topP: 0.9,
              maxTokens: 4096,
              stopSequences: ['END'],
            },
          }),
        }),
        select: SelectedChatMessageFields,
      });
    });

    it('should not persist the user message when provider resolution fails', async () => {
      mockPrisma.chatSession.findUnique.mockResolvedValue(createSession());
      mockPrisma.llmProviderConfig.findMany.mockResolvedValue([]);

      await expect(ChatService.generateAssistantResponse({
        sessionId: 1,
        userId: 1,
        content: 'Hello',
      })).rejects.toThrow('LLM provider config not found');

      expect(mockPrisma.chatMessage.create).not.toHaveBeenCalled();
    });

    it('should reject disabled explicit providers before persisting the user message', async () => {
      mockPrisma.chatSession.findUnique.mockResolvedValue(createSession());
      mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(createProvider({ enabled: false }));

      await expect(ChatService.generateAssistantResponse({
        sessionId: 1,
        userId: 1,
        content: 'Hello',
        providerId: 1,
      })).rejects.toThrow('LLM provider is disabled');

      expect(mockPrisma.chatMessage.create).not.toHaveBeenCalled();
    });

    it('should reject deleted explicit providers before persisting the user message', async () => {
      mockPrisma.chatSession.findUnique.mockResolvedValue(createSession());
      mockPrisma.llmProviderConfig.findUnique.mockResolvedValue(createProvider({ deletedAt: new Date() }));

      await expect(ChatService.generateAssistantResponse({
        sessionId: 1,
        userId: 1,
        content: 'Hello',
        providerId: 1,
      })).rejects.toThrow('LLM provider config not found');

      expect(mockPrisma.chatMessage.create).not.toHaveBeenCalled();
    });

    it('should not persist an assistant message when the provider fails', async () => {
      mockPrisma.chatSession.findUnique.mockResolvedValue(createSession());
      mockPrisma.llmProviderConfig.findMany.mockResolvedValue([createProvider()]);
      mockPrisma.chatMessage.create.mockResolvedValueOnce({
        id: 1,
        content: 'Hello',
        author: 'USER',
        sessionId: 1,
        metadata: null,
        createdAt: new Date(),
      });
      jest.spyOn(OllamaProvider.prototype, 'complete').mockRejectedValue(new Error('provider offline'));

      await expect(ChatService.generateAssistantResponse({
        sessionId: 1,
        userId: 1,
        content: 'Hello',
      })).rejects.toThrow('provider offline');

      expect(mockPrisma.chatMessage.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('streamAssistantResponse', () => {
    async function* streamChunks() {
      yield { reasoning: 'Think first. ' };
      yield { content: 'Hi' };
      yield { content: ' there', usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 } };
      yield { reasoning: 'Then finish.' };
      yield { done: true, finishReason: 'stop' };
    }

    it('should emit streaming events and persist the final assistant message', async () => {
      const userMessage: SelectedChatMessage = {
        id: 1,
        content: 'Hello',
        author: 'USER',
        sessionId: 1,
        metadata: null,
        createdAt: new Date(),
      };
      const assistantMessage: SelectedChatMessage = {
        id: 2,
        content: 'Hi there',
        author: 'ASSISTANT',
        sessionId: 1,
        metadata: null,
        createdAt: new Date(),
      };

      mockPrisma.chatSession.findUnique.mockResolvedValue(createSession());
      mockPrisma.llmProviderConfig.findMany.mockResolvedValue([createProvider()]);
      mockPrisma.chatMessage.create
        .mockResolvedValueOnce(userMessage)
        .mockResolvedValueOnce(assistantMessage);
      jest.spyOn(OllamaProvider.prototype, 'streamComplete').mockReturnValue(streamChunks());

      const events = [];
      for await (const event of ChatService.streamAssistantResponse({
        sessionId: 1,
        userId: 1,
        content: 'Hello',
      })) {
        events.push(event);
      }

      expect(events).toEqual([
        { event: 'user_message', data: userMessage },
        { event: 'delta', data: { reasoning: 'Think first. ' } },
        { event: 'delta', data: { content: 'Hi' } },
        { event: 'delta', data: { content: ' there' } },
        { event: 'delta', data: { reasoning: 'Then finish.' } },
        { event: 'assistant_message', data: assistantMessage },
        { event: 'done', data: { done: true } },
      ]);
      expect(mockPrisma.chatMessage.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          content: 'Hi there',
          author: 'ASSISTANT',
          metadata: expect.objectContaining({
            reasoning: 'Think first. Then finish.',
            finishReason: 'stop',
            usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
          }),
        }),
        select: SelectedChatMessageFields,
      });
    });

    it('should persist partial assistant output when streaming fails after deltas', async () => {
      async function* failingChunks() {
        yield { content: 'Partial answer ' };
        yield { reasoning: 'Partial reasoning.' };
        throw new Error('provider timeout');
      }
      const userMessage: SelectedChatMessage = {
        id: 1,
        content: 'Hello',
        author: 'USER',
        sessionId: 1,
        metadata: null,
        createdAt: new Date(),
      };
      const assistantMessage: SelectedChatMessage = {
        id: 2,
        content: 'Partial answer ',
        author: 'ASSISTANT',
        sessionId: 1,
        metadata: null,
        createdAt: new Date(),
      };

      mockPrisma.chatSession.findUnique.mockResolvedValue(createSession());
      mockPrisma.llmProviderConfig.findMany.mockResolvedValue([createProvider()]);
      mockPrisma.chatMessage.create
        .mockResolvedValueOnce(userMessage)
        .mockResolvedValueOnce(assistantMessage);
      jest.spyOn(OllamaProvider.prototype, 'streamComplete').mockReturnValue(failingChunks());

      const events = [];
      let caughtError: unknown;
      try {
        for await (const event of ChatService.streamAssistantResponse({
          sessionId: 1,
          userId: 1,
          content: 'Hello',
        })) {
          events.push(event);
        }
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toEqual(new Error('provider timeout'));
      expect(events).toEqual([
        { event: 'user_message', data: userMessage },
        { event: 'delta', data: { content: 'Partial answer ' } },
        { event: 'delta', data: { reasoning: 'Partial reasoning.' } },
        { event: 'assistant_message', data: assistantMessage },
      ]);
      expect(mockPrisma.chatMessage.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          content: 'Partial answer ',
          author: 'ASSISTANT',
          metadata: expect.objectContaining({
            reasoning: 'Partial reasoning.',
            finishReason: 'error',
            incomplete: true,
            errorMessage: 'provider timeout',
          }),
        }),
        select: SelectedChatMessageFields,
      });
    });

    it('should mark reasoning-only length finishes as incomplete', async () => {
      async function* reasoningOnlyChunks() {
        yield { reasoning: 'Long reasoning. ' };
        yield {
          done: true,
          finishReason: 'length',
          usage: { promptTokens: 1, completionTokens: 2048, totalTokens: 2049 },
        };
      }
      const userMessage: SelectedChatMessage = {
        id: 1,
        content: 'Hello',
        author: 'USER',
        sessionId: 1,
        metadata: null,
        createdAt: new Date(),
      };
      const assistantMessage: SelectedChatMessage = {
        id: 2,
        content: '',
        author: 'ASSISTANT',
        sessionId: 1,
        metadata: null,
        createdAt: new Date(),
      };

      mockPrisma.chatSession.findUnique.mockResolvedValue(createSession());
      mockPrisma.llmProviderConfig.findMany.mockResolvedValue([createProvider()]);
      mockPrisma.chatMessage.create
        .mockResolvedValueOnce(userMessage)
        .mockResolvedValueOnce(assistantMessage);
      jest.spyOn(OllamaProvider.prototype, 'streamComplete').mockReturnValue(reasoningOnlyChunks());

      const stream = ChatService.streamAssistantResponse({
        sessionId: 1,
        userId: 1,
        content: 'Hello',
      });
      while (!(await stream[Symbol.asyncIterator]().next()).done) {
        // Drain stream
      }

      expect(mockPrisma.chatMessage.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          content: '',
          author: 'ASSISTANT',
          metadata: expect.objectContaining({
            reasoning: 'Long reasoning. ',
            finishReason: 'length',
            incomplete: true,
            usage: { promptTokens: 1, completionTokens: 2048, totalTokens: 2049 },
          }),
        }),
        select: SelectedChatMessageFields,
      });
    });
  });

  describe('getMessagesBySessionId', () => {
    it('should return messages when user has access to session', async () => {
      const sessionId = 1;
      const userId = 1;

      const mockSession: ChatSessionWithMessages = {
        id: 1,
        title: 'Test Session',
        userId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [],
      };

      const mockMessages: SelectedChatMessage[] = [
        {
          id: 1,
          content: 'Hello!',
          author: 'USER',
          sessionId: 1,
          metadata: null,
          createdAt: new Date(),
        },
        {
          id: 2,
          content: 'Hi there!',
          author: 'ASSISTANT',
          sessionId: 1,
          metadata: null,
          createdAt: new Date(),
        },
      ];

      mockPrisma.chatSession.findUnique.mockResolvedValue(mockSession);
      mockPrisma.chatMessage.findMany.mockResolvedValue(mockMessages);

      const result = await ChatService.getMessagesBySessionId(sessionId, userId);

      expect(result).toEqual(mockMessages);
      expect(mockPrisma.chatSession.findUnique).toHaveBeenCalledWith({
        where: { id: sessionId },
        select: ChatSessionWithMessagesFields,
      });
    });

    it('should throw NotFoundError when session does not exist', async () => {
      const sessionId = 999;
      const userId = 1;

      mockPrisma.chatSession.findUnique.mockResolvedValue(null);

      await expect(ChatService.getMessagesBySessionId(sessionId, userId)).rejects.toThrow(
        new NotFoundError('Session not found')
      );
    });

    it('should throw AuthenticationError when user does not own the session', async () => {
      const sessionId = 1;
      const userId = 2;

      const mockSession: ChatSessionWithMessages = {
        id: 1,
        title: 'Test Session',
        userId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [],
      };

      mockPrisma.chatSession.findUnique.mockResolvedValue(mockSession);

      await expect(ChatService.getMessagesBySessionId(sessionId, userId)).rejects.toThrow(
        new AuthenticationError('Access denied to this session')
      );
    });
  });


  describe('error handling', () => {
    it('should handle Prisma errors gracefully', async () => {
      const inputData = {
        title: 'Test Session',
        userId: 1,
      };

      mockPrisma.chatSession.create.mockRejectedValue(new Error('Database connection error'));

      await expect(ChatService.createSession(inputData)).rejects.toThrow(
        new Error('Database connection error')
      );
    });
  });
});
