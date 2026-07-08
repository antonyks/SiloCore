import axiosClient from "../../../lib/axiosClient";
import type { ApiResponse } from "../../../types/api";
import type { LlmModelListResult } from "../types";

export const llmService = {
  async getModels(): Promise<LlmModelListResult> {
    const { data } = await axiosClient.get<ApiResponse<LlmModelListResult>>("/llm/models");

    return data.data;
  },
};
