import { describe, it, expect, beforeEach } from '@jest/globals';
import { ChatService } from '../../modules/chat/chat.service';
import { mockPrisma } from '../setup';
import { NotFoundError, AuthenticationError } from '../../errors';
import { SelectedChatSession, ChatSessionWithMessages, SelectedChatMessage, SelectedChatSessionFields, ChatSessionWithMessagesFields, SelectedChatMessageFields } from '../../modules/chat/chat.model';

describe('ChatService', () => {
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
        metadata: { model: 'gpt-4', tokens: { prompt: 10, completion: 20, total: 30 } },
      };

      const mockResult: SelectedChatMessage = {
        id: 1,
        content: 'Hello, AI!',
        author: 'USER',
        sessionId: 1,
        metadata: inputData.metadata,
        createdAt: new Date(),
      };

      mockPrisma.chatMessage.create.mockResolvedValue(mockResult);

      const result = await ChatService.createMessage(inputData);

      expect(result).toEqual(mockResult);
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

      mockPrisma.chatMessage.create.mockResolvedValue(mockResult);

      const result = await ChatService.createMessage(inputData);

      expect(result).toEqual(mockResult);
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