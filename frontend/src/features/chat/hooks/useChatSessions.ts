import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { chatService } from "../services/chatService";
import type {
  ChatGenerationInput,
  ChatSessionCreateInput,
  ChatSessionDetail,
  ChatSessionListParams,
  ChatSessionMessage,
  ChatSessionUpdateInput,
} from "../types";

export const chatSessionQueryKeys = {
  all: ["chat-sessions"] as const,
  lists: () => [...chatSessionQueryKeys.all, "list"] as const,
  list: (params: ChatSessionListParams) => [...chatSessionQueryKeys.lists(), params] as const,
  details: () => [...chatSessionQueryKeys.all, "detail"] as const,
  detail: (id: number) => [...chatSessionQueryKeys.details(), id] as const,
  messages: (id: number) => [...chatSessionQueryKeys.all, "messages", id] as const,
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

export const useChatSessionMessages = (id: number | null) => {
  return useQuery({
    queryKey: id
      ? chatSessionQueryKeys.messages(id)
      : [...chatSessionQueryKeys.all, "messages", "none"],
    queryFn: () => chatService.getMessages(id as number),
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

export const useGenerateChatMessage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: ChatGenerationInput }) =>
      chatService.generateMessage(id, input),
    onSuccess: (result, variables) => {
      queryClient.setQueryData<ChatSessionDetail>(
        chatSessionQueryKeys.detail(variables.id),
        (current) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            messages: [...current.messages, result.userMessage, result.assistantMessage],
          };
        },
      );
      queryClient.setQueryData<ChatSessionMessage[]>(
        chatSessionQueryKeys.messages(variables.id),
        (current) => [...(current || []), result.userMessage, result.assistantMessage],
      );
      void queryClient.invalidateQueries({ queryKey: chatSessionQueryKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: chatSessionQueryKeys.messages(variables.id) });
    },
  });
};
