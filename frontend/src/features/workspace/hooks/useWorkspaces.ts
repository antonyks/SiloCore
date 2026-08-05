import { useQuery } from "@tanstack/react-query";
import { workspaceService } from "../services/workspaceService";

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
