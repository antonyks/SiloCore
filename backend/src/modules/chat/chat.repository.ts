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
  IChatSessionCreateInput, 
  IChatSessionUpdateInput, 
  IChatMessageCreateInput,
  IChatSessionListParams
} from './chat.types';
import { prisma } from '../../config/database';

export const ChatRepository = {
  async createSession(data: IChatSessionCreateInput): Promise<SelectedChatSession> {
    return ChatSessionModel.create({
      data,
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
      orderBy: {
        [orderBy]: orderDirection
      },
      select: SelectedChatSessionFields
    });
  },

  async updateSessionInWorkspace(
    sessionId: number,
    workspaceId: number,
    data: IChatSessionUpdateInput,
  ): Promise<SelectedChatSession | null> {
    return prisma.$transaction(async (tx) => {
      const updateResult = await tx.chatSession.updateMany({
        where: {
          id: sessionId,
          workspaceId,
        },
        data,
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
    return ChatMessageModel.create({
      data:data,
      select:SelectedChatMessageFields
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
