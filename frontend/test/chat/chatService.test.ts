import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY, USER_KEY } from '../../src/config/constants';
import { chatService } from '../../src/features/chat/services/chatService';

const createStreamingResponse = (body: string): Response => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
};

describe('chatService.streamGenerateMessage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends bearer auth and parses server-sent events', async () => {
    localStorage.setItem(TOKEN_KEY, 'stream-token');
    const fetchMock = vi.spyOn(window, 'fetch').mockResolvedValue(
      createStreamingResponse(
        [
          'event: user_message',
          'data: {"id":1,"content":"Hello"}',
          '',
          'event: delta',
          'data: {"content":"Hi"}',
          '',
          'event: done',
          'data: {}',
          '',
          '',
        ].join('\n'),
      ),
    );
    const onEvent = vi.fn();

    await chatService.streamGenerateMessage(
      10,
      {
        content: 'Hello',
        model: 'llama3.1',
      },
      { onEvent },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/chat/10/generate/stream'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer stream-token',
        }),
      }),
    );
    expect(onEvent).toHaveBeenCalledWith({ event: 'user_message', data: { id: 1, content: 'Hello' } });
    expect(onEvent).toHaveBeenCalledWith({ event: 'delta', data: { content: 'Hi' } });
    expect(onEvent).toHaveBeenCalledWith({ event: 'done', data: {} });
  });

  it('clears auth storage and dispatches unauthorized event on auth-session failures', async () => {
    localStorage.setItem(TOKEN_KEY, 'expired-token');
    localStorage.setItem(
      USER_KEY,
      JSON.stringify({
        id: '1',
        email: 'user@example.com',
        name: 'User',
        role: 'USER',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    const eventListener = vi.fn();
    window.addEventListener('unauthorized-access', eventListener);
    vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'jwt expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      chatService.streamGenerateMessage(
        10,
        {
          content: 'Hello',
          model: 'llama3.1',
        },
        { onEvent: vi.fn() },
      ),
    ).rejects.toThrow('jwt expired');

    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
    expect(eventListener).toHaveBeenCalledTimes(1);
    window.removeEventListener('unauthorized-access', eventListener);
  });
});
