import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChatSessions } from '../../src/features/chat/hooks/useChatSessions';
import { chatService } from '../../src/features/chat/services/chatService';

afterEach(() => {
  focusManager.setFocused(undefined);
  vi.restoreAllMocks();
});

describe('useChatSessions', () => {
  it('refreshes the list on focus even when the app default disables it', async () => {
    const getSessions = vi.spyOn(chatService, 'getSessions').mockResolvedValue([]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    focusManager.setFocused(false);
    const { result, unmount } = renderHook(() => useChatSessions(25, { take: 50 }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getSessions).toHaveBeenCalledTimes(1);

    act(() => focusManager.setFocused(true));
    await waitFor(() => expect(getSessions).toHaveBeenCalledTimes(2));

    unmount();
    queryClient.clear();
  });
});
