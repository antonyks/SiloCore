import { ChatSession, ChatMessage } from './chat.model';

export interface IChatSession {
  id: number;
  title: string;
  userId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IChatSessionWithMessages extends IChatSession {
  messages: IChatMessage[];
}

export interface IChatMetadata {
  model: string;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  latency: number;
  isFavorited: boolean;
}

export interface IChatMessage {
  id: number;
  content: string;
  author: 'USER' | 'ASSISTANT' | 'SYSTEM';
  metadata?: Record<string, any>;//IChatMetadata
  sessionId: number;
  createdAt: Date;
}

export interface IChatSessionCreateInput {
  title: string;
  userId: number;
}

export interface IChatSessionUpdateInput {
  title: string;
}

export interface IChatMessageCreateInput {
  content: string;
  author: 'USER' | 'ASSISTANT' | 'SYSTEM';
  sessionId: number;
  metadata?: Record<string, any>;
}

export interface IChatSessionListParams {
  userId: number;
  skip?: number;
  take?: number;
  orderBy?: 'createdAt' | 'updatedAt';
  orderDirection?: 'asc' | 'desc';
}