import { ChatRepository } from './chat.repository';
import { 
  IChatSessionCreateInput, 
  IChatSessionUpdateInput, 
  IChatMessageCreateInput,
  IChatSessionListParams
} from './chat.types';
import { NotFoundError, AuthenticationError } from '../../errors';
import { SelectedChatSession, ChatSessionWithMessages, SelectedChatMessage } from './chat.model';

export const ChatService = {
  async createSession(data: IChatSessionCreateInput): Promise<SelectedChatSession> {
    return await ChatRepository.createSession(data);
  },

  async getSessionById(id: number, userId: number): Promise<ChatSessionWithMessages | null> {
    const session = await ChatRepository.getSessionById(id);
    
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    
    if (session.userId !== userId) {
      throw new AuthenticationError('Access denied to this session');
    }
    
    return session;
  },

  async getUserSessions(params: IChatSessionListParams): Promise<SelectedChatSession[]> {
    return await ChatRepository.getSessionsByUserId(params);
  },

  async updateSession(id: number, userId: number, data: IChatSessionUpdateInput): Promise<SelectedChatSession | null> {
    const session = await ChatRepository.getSessionById(id);
    
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    
    if (session.userId !== userId) {
      throw new AuthenticationError('Access denied to update this session');
    }
    
    return await ChatRepository.updateSession(id, data);
  },

  async deleteSession(id: number, userId: number): Promise<SelectedChatSession | null> {
    const session = await ChatRepository.getSessionById(id);
    
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    
    if (session.userId !== userId) {
      throw new AuthenticationError('Access denied to delete this session');
    }
    
    return await ChatRepository.deleteSession(id);
  },

  async createMessage(data: IChatMessageCreateInput): Promise<SelectedChatMessage | null> {
    return await ChatRepository.createMessage(data);
  },

  async getMessagesBySessionId(sessionId: number, userId: number): Promise<SelectedChatMessage[] | []> {
    const session = await ChatRepository.getSessionById(sessionId);
    
    if (!session) {
      throw new NotFoundError('Session not found');
    }
    
    if (session.userId !== userId) {
      throw new AuthenticationError('Access denied to this session');
    }
    
    return await ChatRepository.getMessagesBySessionId(sessionId);
  }
};