import { prisma } from '../../config/database';
import { Prisma, ChatSession, ChatMessage, MessageAuthor } from '@prisma/client';

export { ChatSession, ChatMessage, MessageAuthor };

const chatSessionSelection = { 
  id: true, 
  title: true, 
  userId: true,
  createdAt: true,
  updatedAt: true 
} as const;

type SelectedChatSession = Prisma.ChatSessionGetPayload<{ 
  select: typeof chatSessionSelection 
}>;

const chatSessionWithMessagesSelection = { 
  ...chatSessionSelection,
  messages: {
    select: {
      id: true,
      content: true,
      author: true,
      createdAt: true
    },
    orderBy: {
      createdAt: 'asc'
    }
  }
} as const;

type ChatSessionWithMessages = Prisma.ChatSessionGetPayload<{ 
  select: typeof chatSessionWithMessagesSelection 
}>;

const chatMessageSelection = { 
  id: true, 
  content: true, 
  author: true,
  metadata: true,
  sessionId: true,
  createdAt: true
} as const;

type SelectedChatMessage = Prisma.ChatMessageGetPayload<{ 
  select: typeof chatMessageSelection 
}>;

export type { SelectedChatSession, ChatSessionWithMessages, SelectedChatMessage };
export const SelectedChatMessageFields = chatMessageSelection;
export const SelectedChatSessionFields = chatSessionSelection;
export const ChatSessionWithMessagesFields = chatSessionWithMessagesSelection;

export const ChatSessionModel = prisma.chatSession;
export const ChatMessageModel = prisma.chatMessage;