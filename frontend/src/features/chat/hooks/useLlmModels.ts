import { useQuery } from "@tanstack/react-query";
import { llmService } from "../services/llmService";

export const llmModelQueryKeys = {
  all: ["llm-models"] as const,
  workspace: (workspaceId: number) => [...llmModelQueryKeys.all, "workspace", workspaceId] as const,
  disabled: () => [...llmModelQueryKeys.all, "workspace", "none"] as const,
};

export const useLlmModels = (workspaceId: number | null, enabled = true) => {
  return useQuery({
    queryKey: workspaceId === null
      ? llmModelQueryKeys.disabled()
      : llmModelQueryKeys.workspace(workspaceId),
    queryFn: () => {
      if (workspaceId === null) {
        throw new Error("Workspace id is required to load LLM models.");
      }

      return llmService.getModels({ workspaceId });
    },
    enabled: workspaceId !== null && enabled,
  });
};
