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
