import { mockPrisma } from '../setup';
import { ChatRepository } from '../../modules/chat/chat.repository';
import { SelectedChatSession, ChatSessionWithMessages, SelectedChatMessage, MessageAuthor, SelectedChatSessionFields, ChatSessionWithMessagesFields, SelectedChatMessageFields } from '../../modules/chat/chat.model';
import { Prisma } from '@prisma/client';
import { IChatMetadata } from '../../modules/chat/chat.types'

describe('ChatRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSession', () => {
    it('should create a new chat session successfully', async () => {
      const sessionData = {
        title: 'Test Conversation',
        userId: 1,
      };

      const mockSession: SelectedChatSession = {
        id: 1,
        title: 'Test Conversation',
        userId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.chatSession.create as jest.Mock).mockResolvedValue(mockSession);

      const result = await ChatRepository.createSession(sessionData);

      expect(mockPrisma.chatSession.create).toHaveBeenCalledWith({
        data: sessionData,
        select: SelectedChatSessionFields,
      });

      expect(result).toEqual(mockSession);
    });
  });

  describe('getSessionById', () => {
    it('should return chat session with messages by id', async () => {
      const mockSession: ChatSessionWithMessages = {
        id: 1,
        title: 'Test Conversation',
        userId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [
          {
            id: 1,
            content: 'Hello',
            author: MessageAuthor.USER,
            createdAt: new Date(),
          },
          {
            id: 2,
            content: 'Hi there!',
            author: MessageAuthor.ASSISTANT,
            createdAt: new Date(),
          },
        ],
      };

      (mockPrisma.chatSession.findUnique as jest.Mock).mockResolvedValue(mockSession);

      const result = await ChatRepository.getSessionById(1);

      expect(mockPrisma.chatSession.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: ChatSessionWithMessagesFields,
      });

      expect(result).toEqual(mockSession);
    });

    it('should return null when session not found', async () => {
      (mockPrisma.chatSession.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await ChatRepository.getSessionById(999);

      expect(result).toBeNull();
      expect(mockPrisma.chatSession.findUnique).toHaveBeenCalledWith({
        where: { id: 999 },
        select: ChatSessionWithMessagesFields,
      });
    });
  });

  describe('getSessionsByUserId', () => {
    it('should return paginated sessions for a user', async () => {
      const mockSessions: SelectedChatSession[] = [
        {
          id: 1,
          title: 'Conversation 1',
          userId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          title: 'Conversation 2',
          userId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (mockPrisma.chatSession.findMany as jest.Mock).mockResolvedValue(mockSessions);

      const result = await ChatRepository.getSessionsByUserId({
        userId: 1,
        skip: 0,
        take: 10,
      });

      expect(mockPrisma.chatSession.findMany).toHaveBeenCalledWith({
        where: { userId: 1 },
        skip: 0,
        take: 10,
        orderBy: {
          createdAt: 'desc',
        },
        select: SelectedChatSessionFields,
      });

      expect(result).toEqual(mockSessions);
    });

    it('should use default order parameters when not provided', async () => {
      const mockSessions: SelectedChatSession[] = [];

      (mockPrisma.chatSession.findMany as jest.Mock).mockResolvedValue(mockSessions);

      await ChatRepository.getSessionsByUserId({ userId: 1 });

      expect(mockPrisma.chatSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('should support custom ordering', async () => {
      const mockSessions: SelectedChatSession[] = [];

      (mockPrisma.chatSession.findMany as jest.Mock).mockResolvedValue(mockSessions);

      await ChatRepository.getSessionsByUserId({
        userId: 1,
        orderBy: 'updatedAt',
        orderDirection: 'asc',
      });

      expect(mockPrisma.chatSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { updatedAt: 'asc' },
        })
      );
    });

    it('should return empty array when no sessions found', async () => {
      (mockPrisma.chatSession.findMany as jest.Mock).mockResolvedValue([]);

      const result = await ChatRepository.getSessionsByUserId({ userId: 999 });

      expect(result).toEqual([]);
    });
  });

  describe('updateSession', () => {
    it('should update chat session successfully', async () => {
      const mockSession: SelectedChatSession = {
        id: 1,
        title: 'Updated Conversation Title',
        userId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.chatSession.update as jest.Mock).mockResolvedValue(mockSession);

      const result = await ChatRepository.updateSession(1, { title: 'Updated Conversation Title' });

      expect(mockPrisma.chatSession.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { title: 'Updated Conversation Title' },
        select: SelectedChatSessionFields,
      });

      expect(result).toEqual(mockSession);
    });

    it('should throw error when updating non-existent session', async () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Record to update not found.',
        {
          code: 'P2025',
          clientVersion: '5.0.0',
        }
      );

      (mockPrisma.chatSession.update as jest.Mock).mockRejectedValue(error);

      await expect(ChatRepository.updateSession(999, { title: 'Test' })).rejects.toThrow(error);
    });
  });

  describe('deleteSession', () => {
    it('should delete chat session successfully', async () => {
      const mockSession: SelectedChatSession = {
        id: 1,
        title: 'Deleted Conversation',
        userId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.chatSession.delete as jest.Mock).mockResolvedValue(mockSession);

      const result = await ChatRepository.deleteSession(1);

      expect(mockPrisma.chatSession.delete).toHaveBeenCalledWith({
        where: { id: 1 },
        select: SelectedChatSessionFields,
      });

      expect(result).toEqual(mockSession);
    });

    it('should throw error when deleting non-existent session', async () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Record to delete not found.',
        {
          code: 'P2025',
          clientVersion: '5.0.0',
        }
      );

      (mockPrisma.chatSession.delete as jest.Mock).mockRejectedValue(error);

      await expect(ChatRepository.deleteSession(999)).rejects.toThrow(error);
    });
  });

  describe('createMessage', () => {
    it('should create a new chat message successfully', async () => {
      const messageData = {
        content: 'Hello, AI!',
        author: MessageAuthor.USER,
        sessionId: 1,
        metadata: { model: 'gpt-4', tokens: { prompt: 10, completion: 5 } },
      };

      const mockMessage: SelectedChatMessage = {
        id: 1,
        content: 'Hello, AI!',
        author: MessageAuthor.USER,
        metadata: { model: 'gpt-4', tokens: { prompt: 10, completion: 5 } },
        sessionId: 1,
        createdAt: new Date(),
      };

      (mockPrisma.chatMessage.create as jest.Mock).mockResolvedValue(mockMessage);

      const result = await ChatRepository.createMessage(messageData);

      expect(mockPrisma.chatMessage.create).toHaveBeenCalledWith({
        data: messageData,
        select: SelectedChatMessageFields,
      });

      expect(result).toEqual(mockMessage);
    });

    it('should create message without metadata', async () => {
      const messageData = {
        content: 'Simple message',
        author: MessageAuthor.ASSISTANT,
        sessionId: 1,
      };

      const mockMessage: SelectedChatMessage = {
        id: 2,
        content: 'Simple message',
        author: MessageAuthor.ASSISTANT,
        metadata: null,
        sessionId: 1,
        createdAt: new Date(),
      };

      (mockPrisma.chatMessage.create as jest.Mock).mockResolvedValue(mockMessage);

      const result = await ChatRepository.createMessage(messageData);

      expect(result).toEqual(mockMessage);
      expect(result?.metadata).toBeNull();
    });

    it('should support SYSTEM author type', async () => {
      const messageData = {
        content: 'System instruction',
        author: MessageAuthor.SYSTEM,
        sessionId: 1,
      };

      const mockMessage: SelectedChatMessage = {
        id: 3,
        content: 'System instruction',
        author: MessageAuthor.SYSTEM,
        metadata: null,
        sessionId: 1,
        createdAt: new Date(),
      };

      (mockPrisma.chatMessage.create as jest.Mock).mockResolvedValue(mockMessage);

      const result = await ChatRepository.createMessage(messageData);

      expect(result?.author).toBe(MessageAuthor.SYSTEM);
    });
  });

  describe('getMessagesBySessionId', () => {
    it('should return messages ordered by creation date ascending', async () => {
      const mockMessages: SelectedChatMessage[] = [
        {
          id: 1,
          content: 'First message',
          author: MessageAuthor.USER,
          metadata: null,
          sessionId: 1,
          createdAt: new Date('2024-01-01T10:00:00Z'),
        },
        {
          id: 2,
          content: 'Second message',
          author: MessageAuthor.ASSISTANT,
          metadata: { latency: 150 },
          sessionId: 1,
          createdAt: new Date('2024-01-01T10:01:00Z'),
        },
        {
          id: 3,
          content: 'Third message',
          author: MessageAuthor.USER,
          metadata: null,
          sessionId: 1,
          createdAt: new Date('2024-01-01T10:02:00Z'),
        },
      ];

      (mockPrisma.chatMessage.findMany as jest.Mock).mockResolvedValue(mockMessages);

      const result = await ChatRepository.getMessagesBySessionId(1);

      expect(mockPrisma.chatMessage.findMany).toHaveBeenCalledWith({
        where: { sessionId: 1 },
        orderBy: {
          createdAt: 'asc',
        },
        select: SelectedChatMessageFields,
      });

      expect(result).toEqual(mockMessages);
      expect(result.length).toBe(3);
    });

    it('should return empty array when no messages found', async () => {
      (mockPrisma.chatMessage.findMany as jest.Mock).mockResolvedValue([]);

      const result = await ChatRepository.getMessagesBySessionId(999);

      expect(result).toEqual([]);
      expect(result.length).toBe(0);
    });

    it('should handle messages with complex metadata', async () => {
      const mockMessages: SelectedChatMessage[] = [
        {
          id: 1,
          content: 'Complex response',
          author: MessageAuthor.ASSISTANT,
          metadata: {
            model: 'gpt-4-turbo',
            latency: 250,
            tokens: {
              prompt: 45,
              completion: 128,
              total: 173,
            },
            isFavorited: true,
          },
          sessionId: 1,
          createdAt: new Date(),
        },
      ];

      (mockPrisma.chatMessage.findMany as jest.Mock).mockResolvedValue(mockMessages);

      const result = await ChatRepository.getMessagesBySessionId(1);

      expect((result[0].metadata as unknown as IChatMetadata)?.tokens?.total).toBe(173);
      expect((result[0].metadata as unknown as IChatMetadata)?.isFavorited).toBe(true);
    });
  });

});
