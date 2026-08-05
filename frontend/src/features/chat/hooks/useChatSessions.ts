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
  workspace: (workspaceId: number) => [...chatSessionQueryKeys.all, "workspace", workspaceId] as const,
  lists: (workspaceId: number) => [...chatSessionQueryKeys.workspace(workspaceId), "list"] as const,
  list: (workspaceId: number, params: ChatSessionListParams) =>
    [...chatSessionQueryKeys.lists(workspaceId), params] as const,
  details: (workspaceId: number) =>
    [...chatSessionQueryKeys.workspace(workspaceId), "detail"] as const,
  detail: (workspaceId: number, id: number) =>
    [...chatSessionQueryKeys.details(workspaceId), id] as const,
  messages: (workspaceId: number, id: number) =>
    [...chatSessionQueryKeys.workspace(workspaceId), "messages", id] as const,
};

export const useChatSessions = (
  workspaceId: number | null,
  params: ChatSessionListParams = {},
  enabled = true,
) => {
  return useQuery({
    queryKey: workspaceId
      ? chatSessionQueryKeys.list(workspaceId, params)
      : [...chatSessionQueryKeys.all, "workspace", "none", "list", params],
    queryFn: () => chatService.getSessions(params),
    enabled: workspaceId !== null && enabled,
  });
};

export const useChatSession = (workspaceId: number | null, id: number | null, enabled = true) => {
  return useQuery({
    queryKey: workspaceId && id
      ? chatSessionQueryKeys.detail(workspaceId, id)
      : [...chatSessionQueryKeys.all, "workspace", workspaceId ?? "none", "detail", "none"],
    queryFn: () => chatService.getSession(id as number),
    enabled: workspaceId !== null && id !== null && enabled,
  });
};

export const useChatSessionMessages = (
  workspaceId: number | null,
  id: number | null,
  enabled = true,
) => {
  return useQuery({
    queryKey: workspaceId && id
      ? chatSessionQueryKeys.messages(workspaceId, id)
      : [...chatSessionQueryKeys.all, "workspace", workspaceId ?? "none", "messages", "none"],
    queryFn: () => chatService.getMessages(id as number),
    enabled: workspaceId !== null && id !== null && enabled,
  });
};

export const useCreateChatSession = (workspaceId: number | null) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ChatSessionCreateInput) => chatService.createSession(input),
    onSuccess: () => {
      if (workspaceId !== null) {
        void queryClient.invalidateQueries({ queryKey: chatSessionQueryKeys.lists(workspaceId) });
      }
    },
  });
};

export const useUpdateChatSession = (workspaceId: number | null) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: ChatSessionUpdateInput }) =>
      chatService.updateSession(id, input),
    onSuccess: (session) => {
      if (workspaceId !== null) {
        void queryClient.invalidateQueries({ queryKey: chatSessionQueryKeys.lists(workspaceId) });
        void queryClient.invalidateQueries({
          queryKey: chatSessionQueryKeys.detail(workspaceId, session.id),
        });
      }
    },
  });
};

export const useDeleteChatSession = (workspaceId: number | null) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => chatService.deleteSession(id),
    onSuccess: (session) => {
      if (workspaceId !== null) {
        void queryClient.invalidateQueries({ queryKey: chatSessionQueryKeys.lists(workspaceId) });
        queryClient.removeQueries({ queryKey: chatSessionQueryKeys.detail(workspaceId, session.id) });
      }
    },
  });
};

export const useGenerateChatMessage = (workspaceId: number | null) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: ChatGenerationInput }) =>
      chatService.generateMessage(id, input),
    onSuccess: (result, variables) => {
      queryClient.setQueryData<ChatSessionDetail>(
        workspaceId === null
          ? [...chatSessionQueryKeys.all, "workspace", "none", "detail", variables.id]
          : chatSessionQueryKeys.detail(workspaceId, variables.id),
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
        workspaceId === null
          ? [...chatSessionQueryKeys.all, "workspace", "none", "messages", variables.id]
          : chatSessionQueryKeys.messages(workspaceId, variables.id),
        (current) => [...(current || []), result.userMessage, result.assistantMessage],
      );
      if (workspaceId !== null) {
        void queryClient.invalidateQueries({ queryKey: chatSessionQueryKeys.lists(workspaceId) });
        void queryClient.invalidateQueries({
          queryKey: chatSessionQueryKeys.messages(workspaceId, variables.id),
        });
      }
    },
  });
};
