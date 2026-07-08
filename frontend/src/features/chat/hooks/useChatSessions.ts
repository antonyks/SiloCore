import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chatService } from "../services/chatService";
import type {
  ChatSessionCreateInput,
  ChatSessionListParams,
  ChatSessionUpdateInput,
} from "../types";

export const chatSessionQueryKeys = {
  all: ["chat-sessions"] as const,
  lists: () => [...chatSessionQueryKeys.all, "list"] as const,
  list: (params: ChatSessionListParams) => [...chatSessionQueryKeys.lists(), params] as const,
  details: () => [...chatSessionQueryKeys.all, "detail"] as const,
  detail: (id: number) => [...chatSessionQueryKeys.details(), id] as const,
};

export const useChatSessions = (params: ChatSessionListParams = {}) => {
  return useQuery({
    queryKey: chatSessionQueryKeys.list(params),
    queryFn: () => chatService.getSessions(params),
  });
};

export const useChatSession = (id: number | null) => {
  return useQuery({
    queryKey: id ? chatSessionQueryKeys.detail(id) : [...chatSessionQueryKeys.details(), "none"],
    queryFn: () => chatService.getSession(id as number),
    enabled: id !== null,
  });
};

export const useCreateChatSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ChatSessionCreateInput) => chatService.createSession(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatSessionQueryKeys.lists() });
    },
  });
};

export const useUpdateChatSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: ChatSessionUpdateInput }) =>
      chatService.updateSession(id, input),
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: chatSessionQueryKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: chatSessionQueryKeys.detail(session.id) });
    },
  });
};

export const useDeleteChatSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => chatService.deleteSession(id),
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: chatSessionQueryKeys.lists() });
      queryClient.removeQueries({ queryKey: chatSessionQueryKeys.detail(session.id) });
    },
  });
};
