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
    on: jest.fn(),
    writableEnded: false,
  };
  response.status.mockReturnValue(response);
  response.on.mockReturnValue(response);
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
      expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
      expect(res.write.mock.calls.map(([chunk]) => chunk)).toContain('event: delta\n');
      expect(res.write.mock.calls.map(([chunk]) => chunk)).toContain('data: {"done":true}\n\n');
      expect(res.end).toHaveBeenCalledTimes(1);
    });

    it('writes heartbeat comments while waiting for slow stream events', async () => {
      jest.useFakeTimers();
      let resolveDelay: (() => void) | undefined;
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
        await new Promise<void>((resolve) => {
          resolveDelay = resolve;
        });
        yield { event: 'delta' as const, data: { content: 'Hi' } };
        yield { event: 'done' as const, data: { done: true as const } };
      }

      jest.spyOn(ChatService, 'streamAssistantResponse').mockReturnValue(events());
      const req = createAuthenticatedMockRequest({
        params: { id: '1' },
        body: { content: 'Hello' },
        on: jest.fn(),
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

      const streamPromise = ChatController.streamAssistantResponse(req, res as never);
      await Promise.resolve();
      await Promise.resolve();

      await jest.advanceTimersByTimeAsync(15000);
      expect(res.write.mock.calls.map(([chunk]) => chunk)).toContain(': keep-alive\n\n');

      resolveDelay?.();
      await streamPromise;
      expect(res.write.mock.calls.map(([chunk]) => chunk)).toContain('event: delta\n');
      expect(res.end).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
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
