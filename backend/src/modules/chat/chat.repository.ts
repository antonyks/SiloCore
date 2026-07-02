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

export const ChatRepository = {
  async createSession(data: IChatSessionCreateInput): Promise<SelectedChatSession> {
    return ChatSessionModel.create({
      data,
      select: SelectedChatSessionFields
    });
  },

  async getSessionById(id: number): Promise<ChatSessionWithMessages | null> {
    return ChatSessionModel.findUnique({
      where: { id },
      select: ChatSessionWithMessagesFields
    });
  },

  async getSessionsByUserId(params: IChatSessionListParams): Promise<SelectedChatSession[]> {
    const { userId, skip, take, orderBy = 'createdAt', orderDirection = 'desc' } = params;
    
    return ChatSessionModel.findMany({
      where: { userId },
      skip,
      take,
      orderBy: {
        [orderBy]: orderDirection
      },
      select: SelectedChatSessionFields
    });
  },

  async updateSession(id: number, data: IChatSessionUpdateInput): Promise<SelectedChatSession | null> {
    return ChatSessionModel.update({
      where: { id },
      data,
      select: SelectedChatSessionFields
    });
  },

  async deleteSession(id: number): Promise<SelectedChatSession | null> {
    return ChatSessionModel.delete({
      where: { id },
      select: SelectedChatSessionFields
    });
  },

  async createMessage(data: IChatMessageCreateInput): Promise<SelectedChatMessage> {
    return ChatMessageModel.create({
      data:data,
      select:SelectedChatMessageFields
    });
  },

  async getMessagesBySessionId(sessionId: number): Promise<SelectedChatMessage[] | []> {
    return ChatMessageModel.findMany({
      where: { sessionId },
      orderBy: {
        createdAt: 'asc'
      },
      select:SelectedChatMessageFields
    });
  }
};
