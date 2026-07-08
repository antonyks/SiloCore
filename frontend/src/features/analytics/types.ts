import type { UserRole } from "../../types/user";

export type LlmProviderType = "ollama" | "openai-compatible";
export type UserStatus = "ACTIVE" | "BANNED" | "DELETED";
export type LlmProviderModelListStatus = "success" | "error" | "skipped";

export interface SanitizedLlmProviderConfig {
  id: number;
  name: string;
  type: LlmProviderType;
  baseUrl: string;
  enabled: boolean;
  defaultModel: string;
  timeoutMs: number | null;
  extraHeaders: Record<string, string>;
  hasApiKey: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LlmProviderConfigInput {
  name: string;
  type: LlmProviderType;
  baseUrl: string;
  enabled?: boolean;
  defaultModel: string;
  timeoutMs?: number | null;
  extraHeaders?: Record<string, string>;
  apiKey?: string | null;
}

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

export interface LlmProviderOperationResult {
  providerId: string;
  providerName: string;
  providerType: LlmProviderType;
  status: LlmProviderModelListStatus;
  errorMessage?: string;
}

export interface LlmModelListResult {
  models: LlmListedModel[];
  providers: LlmProviderModelListResult[];
}

export interface AdminUserPreview {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

export type AdminUser = AdminUserPreview;

export interface AdminUserListParams {
  name?: string;
  skip?: number;
  take?: number;
}

export interface AdminUserCreateInput {
  name: string;
  email: string;
  password: string;
}

export interface AdminUserUpdateInput {
  name: string;
  email: string;
}
