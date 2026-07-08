export type ChatMessageAuthor = "USER" | "ASSISTANT" | "SYSTEM";
export type ChatSessionOrderBy = "createdAt" | "updatedAt";
export type ChatSessionOrderDirection = "asc" | "desc";

export interface ChatSession {
  id: number;
  title: string;
  userId: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionMessage {
  id: number;
  content: string;
  author: ChatMessageAuthor;
  metadata?: ChatMessageMetadata | null;
  sessionId?: number;
  createdAt: string;
}

export interface ChatSessionDetail extends ChatSession {
  messages: ChatSessionMessage[];
}

export interface ChatSessionListParams {
  skip?: number;
  take?: number;
  orderBy?: ChatSessionOrderBy;
  orderDirection?: ChatSessionOrderDirection;
}

export interface ChatSessionCreateInput {
  title: string;
}

export interface ChatSessionUpdateInput {
  title: string;
}

export interface ChatTokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  prompt?: number;
  completion?: number;
  total?: number;
}

export interface ChatMessageMetadata {
  providerId?: string | number;
  providerName?: string;
  providerType?: string;
  model?: string;
  usage?: ChatTokenUsage;
  latencyMs?: number;
  latency?: number;
  params?: Record<string, unknown>;
}

export interface ChatGenerationInput {
  content: string;
}

export interface ChatGenerationResponse {
  userMessage: ChatSessionMessage;
  assistantMessage: ChatSessionMessage;
}
