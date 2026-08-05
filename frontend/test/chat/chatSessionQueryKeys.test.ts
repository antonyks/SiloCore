import { describe, expect, it } from 'vitest';
import { chatSessionQueryKeys } from '../../src/features/chat/hooks/useChatSessions';

describe('chatSessionQueryKeys', () => {
  it('scopes lists, details, and messages by workspace id', () => {
    expect(chatSessionQueryKeys.list(25, { take: 10 })).toEqual([
      'chat-sessions',
      'workspace',
      25,
      'list',
      { take: 10 },
    ]);
    expect(chatSessionQueryKeys.detail(25, 7)).toEqual([
      'chat-sessions',
      'workspace',
      25,
      'detail',
      7,
    ]);
    expect(chatSessionQueryKeys.messages(30, 7)).toEqual([
      'chat-sessions',
      'workspace',
      30,
      'messages',
      7,
    ]);
  });
});

