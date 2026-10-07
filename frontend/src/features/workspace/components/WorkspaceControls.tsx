import axios from "axios";
import { Building2, Check, ChevronDown, Plus, Settings2 } from "lucide-react";
import { useWorkspaceContext } from "../workspaceContext";
import { WorkspaceExtensionSlot } from "../../../extensions/WorkspaceExtensionSlot";
import type { Workspace } from "../types";
const formatWorkspaceType = (workspace: Workspace) =>
  workspace.type === "PERSONAL" ? "Personal" : "Standard";
const getErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError<{ message?: string }>(error))
    return error.response?.data?.message || error.message;
  return error instanceof Error ? error.message : fallback;
};
export function WorkspaceControls() {
  const {
    isWorkspaceMenuOpen,
    setIsWorkspaceMenuOpen,
    isWorkspaceValidated,
    activeWorkspace,
    workspacesQuery,
    ownedWorkspaces,
    activeWorkspaceId,
    handleWorkspaceSelect,
    openCreateWorkspaceDialog,
    openRenameWorkspaceDialog,
  } = useWorkspaceContext();
  return (
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        <button
          type="button"
          onClick={() => setIsWorkspaceMenuOpen((current) => !current)}
          disabled={!isWorkspaceValidated}
          className="flex h-11 w-full min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-left text-slate-900 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          aria-haspopup="menu"
          aria-expanded={isWorkspaceMenuOpen}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
            <Building2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {activeWorkspace?.name || "Loading workspace"}
            </span>
            {activeWorkspace && (
              <span className="block text-xs text-slate-500">
                {formatWorkspaceType(activeWorkspace)} workspace
              </span>
            )}
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-slate-400"
            aria-hidden="true"
          />
        </button>

        {isWorkspaceMenuOpen && (
          <div
            role="menu"
            className="absolute top-12 right-0 left-0 z-40 rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
          >
            {workspacesQuery.isLoading && (
              <div className="px-3 py-2 text-slate-500">
                Loading workspaces...
              </div>
            )}
            {workspacesQuery.isError && (
              <div className="px-3 py-2 text-red-700">
                {getErrorMessage(
                  workspacesQuery.error,
                  "Could not load workspaces.",
                )}
              </div>
            )}
            {ownedWorkspaces.map((workspace) => {
              const isActive = workspace.id === activeWorkspaceId;

              return (
                <button
                  key={workspace.id}
                  type="button"
                  role="menuitem"
                  onClick={() => handleWorkspaceSelect(workspace)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 ${
                    isActive ? "text-cyan-800" : "text-slate-700"
                  }`}
                >
                  <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {workspace.name}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {formatWorkspaceType(workspace)}
                    </span>
                  </span>
                  {isActive && (
                    <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                </button>
              );
            })}
            <div className="mt-1 border-t border-slate-100 pt-1">
              <button
                type="button"
                role="menuitem"
                onClick={openCreateWorkspaceDialog}
                className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-slate-800 hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create New Workspace
              </button>
            </div>
            <WorkspaceExtensionSlot slot="switcher-footer" />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={openRenameWorkspaceDialog}
        disabled={!activeWorkspace}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
        aria-label="Workspace settings"
      >
        <Settings2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
