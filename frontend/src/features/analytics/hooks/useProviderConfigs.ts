import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { providerConfigService } from "../services/providerConfigService";
import type { LlmProviderConfigInput } from "../types";

export const providerConfigQueryKeys = {
  providers: ["admin-dashboard", "providers"] as const,
};

export const useProviderConfigs = () => {
  return useQuery({
    queryKey: providerConfigQueryKeys.providers,
    queryFn: providerConfigService.getProviders,
  });
};

export const useCreateProviderConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LlmProviderConfigInput) => providerConfigService.createProvider(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: providerConfigQueryKeys.providers });
    },
  });
};

export const useUpdateProviderConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: LlmProviderConfigInput }) =>
      providerConfigService.updateProvider(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: providerConfigQueryKeys.providers });
    },
  });
};

export const useDeleteProviderConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => providerConfigService.deleteProvider(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: providerConfigQueryKeys.providers });
    },
  });
};
