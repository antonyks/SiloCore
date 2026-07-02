import { Prisma } from '@prisma/client';

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
  metadata?: Prisma.InputJsonObject;//IChatMetadata
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
  metadata?: Prisma.InputJsonObject;
}

export interface IChatGenerationParams {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface IChatGenerationInput extends IChatGenerationParams {
  content: string;
  providerId?: number;
  model?: string;
}

export interface IChatGenerationServiceInput extends IChatGenerationInput {
  sessionId: number;
  userId: number;
}

export interface IChatGenerationResult {
  userMessage: import('./chat.model').SelectedChatMessage;
  assistantMessage: import('./chat.model').SelectedChatMessage;
}

export type ChatGenerationStreamEvent =
  | { event: 'user_message'; data: import('./chat.model').SelectedChatMessage }
  | { event: 'delta'; data: { content: string } }
  | { event: 'assistant_message'; data: import('./chat.model').SelectedChatMessage }
  | { event: 'done'; data: { done: true } };

export interface IChatSessionListParams {
  userId: number;
  skip?: number;
  take?: number;
  orderBy?: 'createdAt' | 'updatedAt';
  orderDirection?: 'asc' | 'desc';
}
