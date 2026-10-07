import { useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import { getPersonalWorkspaceRoute } from "../../../lib/workspaceRouting";
import type { Workspace } from "../types";
import {
  useCreateWorkspace,
  useDeleteWorkspace,
  useOwnedWorkspaces,
  useUpdateWorkspace,
} from "./useWorkspaces";
type WorkspaceDialogMode = "create" | "rename" | "delete" | null;
const getWorkspaceRoute = (id: number) => `/workspaces/${id}/chat/home`;
export function useWorkspaceController() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { workspaceId: workspaceIdParam } = useParams<{
    workspaceId: string;
  }>();
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const [workspaceDialogMode, setWorkspaceDialogMode] =
    useState<WorkspaceDialogMode>(null);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState("");
  const createWorkspace = useCreateWorkspace();
  const updateWorkspace = useUpdateWorkspace();
  const deleteWorkspace = useDeleteWorkspace();
  const routeWorkspaceId = useMemo(() => {
    if (!workspaceIdParam || !/^\d+$/.test(workspaceIdParam)) {
      return null;
    }

    const workspaceId = Number(workspaceIdParam);

    return Number.isSafeInteger(workspaceId) && workspaceId > 0
      ? workspaceId
      : null;
  }, [workspaceIdParam]);
  const personalWorkspaceId = user?.personalWorkspace?.id ?? null;
  const personalWorkspaceRoute = user ? getPersonalWorkspaceRoute(user) : null;
  const workspacesQuery = useOwnedWorkspaces(personalWorkspaceId);
  const activeWorkspace = useMemo(
    () =>
      routeWorkspaceId === null
        ? undefined
        : workspacesQuery.data?.find(
            (workspace) =>
              workspace.id === routeWorkspaceId &&
              workspace.status === "ACTIVE",
          ),
    [routeWorkspaceId, workspacesQuery.data],
  );
  const ownedWorkspaces = useMemo(
    () =>
      (workspacesQuery.data || []).filter(
        (workspace) => workspace.status === "ACTIVE",
      ),
    [workspacesQuery.data],
  );
  const activeWorkspaceId = activeWorkspace?.id ?? null;
  const isWorkspaceValidated =
    routeWorkspaceId !== null && workspacesQuery.isSuccess && !!activeWorkspace;
  const [previousWorkspaceId, setPreviousWorkspaceId] =
    useState(activeWorkspaceId);
  if (previousWorkspaceId !== activeWorkspaceId) {
    setPreviousWorkspaceId(activeWorkspaceId);
    setIsWorkspaceMenuOpen(false);
    setWorkspaceDialogMode(null);
    setWorkspaceNameDraft("");
  }
  const closeWorkspaceDialog = () => {
    setWorkspaceDialogMode(null);
    setWorkspaceNameDraft("");
  };

  const openCreateWorkspaceDialog = () => {
    setWorkspaceNameDraft("");
    setWorkspaceDialogMode("create");
    setIsWorkspaceMenuOpen(false);
  };

  const openRenameWorkspaceDialog = () => {
    if (!activeWorkspace || activeWorkspace.type !== "STANDARD") {
      setWorkspaceDialogMode("rename");
      setWorkspaceNameDraft(activeWorkspace?.name || "");
      return;
    }

    setWorkspaceNameDraft(activeWorkspace.name);
    setWorkspaceDialogMode("rename");
    setIsWorkspaceMenuOpen(false);
  };

  const openDeleteWorkspaceDialog = () => {
    if (!activeWorkspace) {
      return;
    }

    setWorkspaceDialogMode("delete");
    setIsWorkspaceMenuOpen(false);
  };

  const handleWorkspaceSelect = (workspace: Workspace) => {
    if (workspace.id === activeWorkspaceId) {
      setIsWorkspaceMenuOpen(false);
      return;
    }

    navigate(getWorkspaceRoute(workspace.id));
    setIsWorkspaceMenuOpen(false);
  };

  const handleWorkspaceFormSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const name = workspaceNameDraft.trim();

    if (workspaceDialogMode === "create") {
      try {
        const workspace = await createWorkspace.mutateAsync({ name });
        closeWorkspaceDialog();
        navigate(getWorkspaceRoute(workspace.id));
      } catch {
        // React Query exposes the error state rendered in the modal.
      }
      return;
    }

    if (
      workspaceDialogMode === "rename" &&
      activeWorkspace?.type === "STANDARD"
    ) {
      try {
        await updateWorkspace.mutateAsync({
          id: activeWorkspace.id,
          input: { name },
        });
        closeWorkspaceDialog();
      } catch {
        // React Query exposes the error state rendered in the modal.
      }
    }
  };

  const confirmDeleteWorkspace = async () => {
    if (!activeWorkspace || activeWorkspace.type !== "STANDARD") {
      return;
    }

    try {
      await deleteWorkspace.mutateAsync(activeWorkspace.id);
      closeWorkspaceDialog();

      if (personalWorkspaceRoute) {
        navigate(personalWorkspaceRoute, { replace: true });
      }
    } catch {
      // React Query exposes the error state rendered in the modal.
    }
  };

  return {
    user,
    routeWorkspaceId,
    personalWorkspaceRoute,
    workspacesQuery,
    activeWorkspace,
    ownedWorkspaces,
    activeWorkspaceId,
    isWorkspaceValidated,
    isWorkspaceMenuOpen,
    setIsWorkspaceMenuOpen,
    workspaceDialogMode,
    workspaceNameDraft,
    setWorkspaceNameDraft,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    openCreateWorkspaceDialog,
    openRenameWorkspaceDialog,
    openDeleteWorkspaceDialog,
    closeWorkspaceDialog,
    handleWorkspaceSelect,
    handleWorkspaceFormSubmit,
    confirmDeleteWorkspace,
  };
}
