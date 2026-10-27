import { 
  ChatSessionModel, 
  ChatMessageModel,
  SelectedChatSession, 
  ChatSessionWithMessages, 
  ChatSessionWithMessagesFields,
  SelectedChatSessionFields,
  SelectedChatMessage,
  SelectedChatMessageFields
} from './chat.model';
import { 
  IChatSessionRepositoryCreateInput,
  IChatSessionUpdateInput, 
  IChatMessageCreateInput,
  IChatSessionListParams
} from './chat.types';
import { prisma } from '../../config/database';
import { ChatSessionTitleSource, MessageAuthor, Prisma } from '@prisma/client';

interface GeneratedAssistantMessageInput {
  sessionId: number;
  workspaceId: number;
  triggeringUserMessageId: number;
  content: string;
  metadata: Prisma.InputJsonValue;
  titleEligible: boolean;
}

export const ChatRepository = {
  async createSession(data: IChatSessionRepositoryCreateInput): Promise<SelectedChatSession> {
    const { title, userId, workspaceId } = data;
    return ChatSessionModel.create({
      data: {
        title: title === undefined ? 'New Chat' : title,
        titleSource: title === undefined
          ? ChatSessionTitleSource.PLACEHOLDER
          : ChatSessionTitleSource.USER,
        userId,
        workspaceId,
      },
      select: SelectedChatSessionFields
    });
  },

  async getSessionInWorkspace(
    sessionId: number,
    workspaceId: number,
  ): Promise<ChatSessionWithMessages | null> {
    return ChatSessionModel.findFirst({
      where: {
        id: sessionId,
        workspaceId,
      },
      select: ChatSessionWithMessagesFields
    });
  },

  async listSessionsInWorkspace(params: IChatSessionListParams): Promise<SelectedChatSession[]> {
    const { workspaceId, skip, take, orderBy = 'createdAt', orderDirection = 'desc' } = params;
    
    return ChatSessionModel.findMany({
      where: { workspaceId },
      skip,
      take,
      orderBy: [
        { [orderBy]: orderDirection },
        { id: orderDirection },
      ],
      select: SelectedChatSessionFields
    });
  },

  async updateSessionInWorkspace(
    sessionId: number,
    workspaceId: number,
    data: IChatSessionUpdateInput,
  ): Promise<SelectedChatSession | null> {
    if (data.title === undefined) {
      return ChatSessionModel.findFirst({
        where: { id: sessionId, workspaceId },
        select: SelectedChatSessionFields,
      });
    }

    return prisma.$transaction(async (tx) => {
      const updateResult = await tx.chatSession.updateMany({
        where: {
          id: sessionId,
          workspaceId,
        },
        data: { title: data.title, titleSource: ChatSessionTitleSource.USER },
      });

      if (updateResult.count === 0) {
        return null;
      }

      return tx.chatSession.findFirst({
        where: {
          id: sessionId,
          workspaceId,
        },
        select: SelectedChatSessionFields,
      });
    });
  },

  async applyGeneratedTitleInWorkspace(
    sessionId: number,
    workspaceId: number,
    title: string,
  ): Promise<boolean> {
    const result = await prisma.chatSession.updateMany({
      where: {
        id: sessionId,
        workspaceId,
        titleSource: ChatSessionTitleSource.PLACEHOLDER,
      },
      data: { title, titleSource: ChatSessionTitleSource.GENERATED },
    });
    return result.count === 1;
  },

  async deleteSessionInWorkspace(
    sessionId: number,
    workspaceId: number,
  ): Promise<SelectedChatSession | null> {
    return prisma.$transaction(async (tx) => {
      const session = await tx.chatSession.findFirst({
        where: {
          id: sessionId,
          workspaceId,
        },
        select: SelectedChatSessionFields,
      });

      if (!session) {
        return null;
      }

      await tx.chatSession.deleteMany({
        where: {
          id: sessionId,
          workspaceId,
        },
      });

      return session;
    });
  },

  async createMessage(data: IChatMessageCreateInput): Promise<SelectedChatMessage> {
    return prisma.$transaction(async (tx) => {
      const message = await tx.chatMessage.create({
        data,
        select: SelectedChatMessageFields,
      });
      await tx.chatSession.update({
        where: { id: data.sessionId },
        data: { updatedAt: new Date() },
      });
      return message;
    });
  },

  async createGeneratedAssistantMessage(data: GeneratedAssistantMessageInput): Promise<SelectedChatMessage> {
    return prisma.$transaction(async (tx) => {
      const message = await tx.chatMessage.create({
        data: {
          sessionId: data.sessionId,
          author: MessageAuthor.ASSISTANT,
          content: data.content,
          metadata: data.metadata,
          triggeringUserMessageId: data.triggeringUserMessageId,
        },
        select: SelectedChatMessageFields,
      });

      await tx.chatSession.update({
        where: { id: data.sessionId },
        data: { updatedAt: new Date() },
      });

      if (data.titleEligible) {
        await tx.chatSession.updateMany({
          where: {
            id: data.sessionId,
            workspaceId: data.workspaceId,
            titleSource: ChatSessionTitleSource.PLACEHOLDER,
            OR: [
              { latestEligibleAssistantMessageId: null },
              { latestEligibleAssistantMessageId: { lt: message.id } },
            ],
          },
          data: { latestEligibleAssistantMessageId: message.id },
        });
      }

      return message;
    });
  },

  async listMessagesInWorkspace(
    sessionId: number,
    workspaceId: number,
  ): Promise<SelectedChatMessage[] | []> {
    return ChatMessageModel.findMany({
      where: {
        sessionId,
        session: {
          workspaceId,
        },
      },
      orderBy: {
        createdAt: 'asc'
      },
      select:SelectedChatMessageFields
    });
  }
};
