import axiosClient from "../../../lib/axiosClient";
import type { ApiResponse } from "../../../types/api";
import type {
  LlmProviderConfigInput,
  LlmProviderOperationResult,
  SanitizedLlmProviderConfig,
} from "../types";

export const providerConfigService = {
  async getProviders(): Promise<SanitizedLlmProviderConfig[]> {
    const { data } = await axiosClient.get<ApiResponse<SanitizedLlmProviderConfig[]>>(
      "/admin/llm/providers",
    );

    return data.data;
  },

  async createProvider(input: LlmProviderConfigInput): Promise<SanitizedLlmProviderConfig> {
    const { data } = await axiosClient.post<ApiResponse<SanitizedLlmProviderConfig>>(
      "/admin/llm/providers",
      input,
    );

    return data.data;
  },

  async updateProvider(
    id: number,
    input: LlmProviderConfigInput,
  ): Promise<SanitizedLlmProviderConfig> {
    const { data } = await axiosClient.put<ApiResponse<SanitizedLlmProviderConfig>>(
      `/admin/llm/providers/${id}`,
      input,
    );

    return data.data;
  },

  async deleteProvider(id: number): Promise<SanitizedLlmProviderConfig> {
    const { data } = await axiosClient.delete<ApiResponse<SanitizedLlmProviderConfig>>(
      `/admin/llm/providers/${id}`,
    );

    return data.data;
  },

  async testProvider(id: number): Promise<LlmProviderOperationResult> {
    const { data } = await axiosClient.post<ApiResponse<LlmProviderOperationResult>>(
      `/admin/llm/providers/${id}/test`,
    );

    return data.data;
  },

  async pullProviderModel(id: number, model: string): Promise<LlmProviderOperationResult> {
    const { data } = await axiosClient.post<ApiResponse<LlmProviderOperationResult>>(
      `/admin/llm/providers/${id}/models/pull`,
      { model },
    );

    return data.data;
  },
};
