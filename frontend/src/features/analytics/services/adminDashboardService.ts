import axiosClient from "../../../lib/axiosClient";
import type { ApiResponse } from "../../../types/api";
import type {
  AdminUserPreview,
  LlmModelListResult,
  SanitizedLlmProviderConfig,
} from "../types";

const USER_PREVIEW_LIMIT = 8;

export const adminDashboardService = {
  async getProviders(): Promise<SanitizedLlmProviderConfig[]> {
    const { data } = await axiosClient.get<ApiResponse<SanitizedLlmProviderConfig[]>>(
      "/admin/llm/providers",
    );

    return data.data;
  },

  async getModelRegistry(): Promise<LlmModelListResult> {
    const { data } = await axiosClient.get<ApiResponse<LlmModelListResult>>("/llm/models");

    return data.data;
  },

  async getUserPreview(): Promise<AdminUserPreview[]> {
    const { data } = await axiosClient.get<ApiResponse<AdminUserPreview[]>>("/users", {
      params: { take: USER_PREVIEW_LIMIT },
    });

    return data.data;
  },
};
