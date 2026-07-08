import { useQuery } from "@tanstack/react-query";
import { llmService } from "../services/llmService";

export const llmModelQueryKeys = {
  all: ["llm-models"] as const,
};

export const useLlmModels = () => {
  return useQuery({
    queryKey: llmModelQueryKeys.all,
    queryFn: llmService.getModels,
  });
};
