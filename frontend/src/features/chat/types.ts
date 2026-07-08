export type ChatMessageAuthor = "USER" | "ASSISTANT" | "SYSTEM";
export type ChatSessionOrderBy = "createdAt" | "updatedAt";
export type ChatSessionOrderDirection = "asc" | "desc";
export type LlmProviderType = "ollama" | "openai-compatible";
export type LlmProviderModelListStatus = "success" | "error" | "skipped";

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

export interface ChatGenerationResponse {
  userMessage: ChatSessionMessage;
  assistantMessage: ChatSessionMessage;
}

export interface ChatGenerationParams {
  providerId?: number;
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface ChatGenerationInput extends ChatGenerationParams {
  content: string;
}

export type ChatGenerationStreamEvent =
  | { event: "user_message"; data: ChatSessionMessage }
  | { event: "delta"; data: { content: string } }
  | { event: "assistant_message"; data: ChatSessionMessage }
  | { event: "done"; data: { done: true } }
  | { event: "error"; data: { message?: string } };

export interface LlmListedModel {
  providerId: string;
  providerName: string;
  providerType: LlmProviderType;
  modelId: string;
  modelName: string;
}

export interface LlmProviderModelListResult {
  providerId: string;
  providerName: string;
  providerType: LlmProviderType;
  status: LlmProviderModelListStatus;
  modelCount: number;
  errorMessage?: string;
}

export interface LlmModelListResult {
  models: LlmListedModel[];
  providers: LlmProviderModelListResult[];
}
