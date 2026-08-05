import axiosClient from "../../../lib/axiosClient";
import type { ApiResponse } from "../../../types/api";
import type { LlmModelListResult } from "../types";

export const llmService = {
  async getModels(options: { workspaceId?: number } = {}): Promise<LlmModelListResult> {
    const { data } = await axiosClient.get<ApiResponse<LlmModelListResult>>("/llm/models", {
      headers: options.workspaceId
        ? { "X-Workspace-Id": String(options.workspaceId) }
        : undefined,
    });

    return data.data;
  },
};
