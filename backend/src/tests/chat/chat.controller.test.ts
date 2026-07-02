import { ChatController } from '../../modules/chat/chat.controller';
import { ChatService } from '../../modules/chat/chat.service';
import { ChatGenerationStreamEvent } from '../../modules/chat/chat.types';
import { UserRole, UserStatus } from '../../modules/user/user.model';
import { createAuthenticatedMockRequest } from '../testUtils';

jest.mock('node-fetch', () => jest.fn());

function createSseResponse() {
  const response = {
    status: jest.fn(),
    setHeader: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    flushHeaders: jest.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}

describe('ChatController', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  describe('streamAssistantResponse', () => {
    it('writes named SSE events for streamed generation', async () => {
      async function* events(): AsyncIterable<ChatGenerationStreamEvent> {
        yield {
          event: 'user_message' as const,
          data: {
            id: 1,
            content: 'Hello',
            author: 'USER' as const,
            sessionId: 1,
            metadata: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        };
        yield { event: 'delta' as const, data: { content: 'Hi' } };
        yield {
          event: 'assistant_message' as const,
          data: {
            id: 2,
            content: 'Hi',
            author: 'ASSISTANT' as const,
            sessionId: 1,
            metadata: null,
            createdAt: new Date('2026-01-01T00:00:01.000Z'),
          },
        };
        yield { event: 'done' as const, data: { done: true as const } };
      }

      jest.spyOn(ChatService, 'streamAssistantResponse').mockReturnValue(events());
      const req = createAuthenticatedMockRequest({
        params: { id: '1' },
        body: { content: 'Hello' },
        user: {
          id: 7,
          email: 'user@example.com',
          name: 'User',
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
          createdAt: new Date(),
        },
      });
      const res = createSseResponse();

      await ChatController.streamAssistantResponse(req, res as never);

      expect(ChatService.streamAssistantResponse).toHaveBeenCalledWith({
        sessionId: 1,
        userId: 7,
        content: 'Hello',
        providerId: undefined,
        model: undefined,
        temperature: undefined,
        topP: undefined,
        maxTokens: undefined,
        stopSequences: undefined,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.write.mock.calls.map(([chunk]) => chunk)).toContain('event: delta\n');
      expect(res.write.mock.calls.map(([chunk]) => chunk)).toContain('data: {"done":true}\n\n');
      expect(res.end).toHaveBeenCalledTimes(1);
    });

    it('writes an SSE error event when streaming fails after the first event', async () => {
      async function* events(): AsyncIterable<ChatGenerationStreamEvent> {
        yield {
          event: 'user_message' as const,
          data: {
            id: 1,
            content: 'Hello',
            author: 'USER' as const,
            sessionId: 1,
            metadata: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        };
        throw new Error('provider offline');
      }

      jest.spyOn(ChatService, 'streamAssistantResponse').mockReturnValue(events());
      const req = createAuthenticatedMockRequest({
        params: { id: '1' },
        body: { content: 'Hello' },
        user: {
          id: 7,
          email: 'user@example.com',
          name: 'User',
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
          createdAt: new Date(),
        },
      });
      const res = createSseResponse();

      await ChatController.streamAssistantResponse(req, res as never);

      expect(res.write.mock.calls.map(([chunk]) => chunk)).toContain('event: error\n');
      expect(res.write.mock.calls.map(([chunk]) => chunk)).toContain('data: {"message":"provider offline"}\n\n');
      expect(res.end).toHaveBeenCalledTimes(1);
    });
  });
});
