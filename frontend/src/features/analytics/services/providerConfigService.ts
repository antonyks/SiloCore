import axiosClient from "../../../lib/axiosClient";
import type { ApiResponse } from "../../../types/api";
import type { LlmProviderConfigInput, SanitizedLlmProviderConfig } from "../types";

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
};
