import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { workspaceService } from "../services/workspaceService";
import type { Workspace, WorkspaceCreateInput, WorkspaceUpdateInput } from "../types";

export const workspaceQueryKeys = {
  all: ["workspaces"] as const,
  lists: () => [...workspaceQueryKeys.all, "list"] as const,
  list: (requestWorkspaceId: number | null) =>
    [...workspaceQueryKeys.lists(), { requestWorkspaceId }] as const,
};

export const useOwnedWorkspaces = (requestWorkspaceId: number | null) => {
  return useQuery({
    queryKey: workspaceQueryKeys.list(requestWorkspaceId),
    queryFn: () =>
      workspaceService.listWorkspaces(
        requestWorkspaceId === null ? {} : { workspaceId: requestWorkspaceId },
      ),
    enabled: requestWorkspaceId !== null,
  });
};

export const useCreateWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: WorkspaceCreateInput) => workspaceService.createWorkspace(input),
    onSuccess: (workspace) => {
      queryClient.setQueriesData<Workspace[]>(
        { queryKey: workspaceQueryKeys.lists() },
        (current) => {
          if (!current) {
            return current;
          }

          const next = current.filter((existing) => existing.id !== workspace.id);
          return [...next, workspace];
        },
      );
      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.lists(),
        refetchType: "inactive",
      });
    },
  });
};

export const useUpdateWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: WorkspaceUpdateInput }) =>
      workspaceService.updateWorkspace(id, input),
    onSuccess: (workspace) => {
      queryClient.setQueriesData<Workspace[]>(
        { queryKey: workspaceQueryKeys.lists() },
        (current) =>
          current?.map((existing) =>
            existing.id === workspace.id ? { ...existing, ...workspace } : existing,
          ),
      );
      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.lists(),
        refetchType: "inactive",
      });
    },
  });
};

export const useDeleteWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => workspaceService.deleteWorkspace(id),
    onSuccess: (workspace) => {
      queryClient.setQueriesData<Workspace[]>(
        { queryKey: workspaceQueryKeys.lists() },
        (current) => current?.filter((existing) => existing.id !== workspace.id),
      );
      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.lists(),
        refetchType: "inactive",
      });
    },
  });
};
