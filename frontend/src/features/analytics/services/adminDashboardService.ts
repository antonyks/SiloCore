import axiosClient from "../../../lib/axiosClient";
import type { ApiResponse } from "../../../types/api";
import type {
  AdminUserPreview,
  LlmModelListResult,
} from "../types";
import { providerConfigService } from "./providerConfigService";

const USER_PREVIEW_LIMIT = 8;

export const adminDashboardService = {
  getProviders: providerConfigService.getProviders,

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
