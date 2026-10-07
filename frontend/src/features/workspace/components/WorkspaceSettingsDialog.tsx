import axios from "axios";
import {
  AlertCircle,
  Check,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { useWorkspaceContext } from "../workspaceContext";
import { WorkspaceExtensionSlot } from "../../../extensions/WorkspaceExtensionSlot";
const getErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError<{ message?: string }>(error))
    return error.response?.data?.message || error.message;
  return error instanceof Error ? error.message : fallback;
};
export function WorkspaceSettingsDialog() {
  const {
    workspaceDialogMode,
    activeWorkspace,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    workspaceNameDraft,
    setWorkspaceNameDraft,
    closeWorkspaceDialog,
    confirmDeleteWorkspace,
    handleWorkspaceFormSubmit,
    openDeleteWorkspaceDialog,
  } = useWorkspaceContext();

  if (!workspaceDialogMode || !activeWorkspace) {
    return null;
  }

  const isCreate = workspaceDialogMode === "create";
  const isRename = workspaceDialogMode === "rename";
  const isDelete = workspaceDialogMode === "delete";
  const isPersonal = activeWorkspace.type === "PERSONAL";
  const nameError =
    createWorkspace.isError && isCreate
      ? getErrorMessage(createWorkspace.error, "Workspace creation failed.")
      : updateWorkspace.isError && isRename
        ? getErrorMessage(updateWorkspace.error, "Workspace rename failed.")
        : null;
  const deleteError =
    deleteWorkspace.isError && isDelete
      ? getErrorMessage(deleteWorkspace.error, "Workspace delete failed.")
      : null;
  const isSubmitting =
    createWorkspace.isPending ||
    updateWorkspace.isPending ||
    deleteWorkspace.isPending;
  const canSubmitName = workspaceNameDraft.trim().length > 0 && !isSubmitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-md border border-slate-200 bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">
              {isCreate
                ? "Create workspace"
                : isDelete
                  ? "Delete workspace"
                  : "Workspace settings"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {isCreate
                ? "Create a private standard workspace."
                : activeWorkspace.name}
            </p>
          </div>
          <button
            type="button"
            onClick={closeWorkspaceDialog}
            disabled={isSubmitting}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Close workspace settings"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {isPersonal && !isCreate ? (
          <div className="p-4 text-sm text-slate-700">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              Personal workspaces cannot be renamed or deleted.
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={closeWorkspaceDialog}
                className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        ) : isDelete ? (
          <div className="p-4 text-sm text-slate-700">
            <div className="flex gap-2 rounded-md border border-amber-100 bg-amber-50 p-3 text-amber-900">
              <ShieldAlert
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                Delete{" "}
                <span className="font-semibold">{activeWorkspace.name}</span>?
                This workspace will no longer appear in your switcher.
              </span>
            </div>
            {deleteError && (
              <div className="mt-3 flex gap-2 rounded-md border border-red-100 bg-red-50 p-3 text-red-800">
                <AlertCircle
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                <span>{deleteError}</span>
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeWorkspaceDialog}
                disabled={isSubmitting}
                className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDeleteWorkspace()}
                disabled={isSubmitting}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-red-700 px-3 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300"
              >
                {deleteWorkspace.isPending ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                )}
                Delete
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(event) => void handleWorkspaceFormSubmit(event)}
            className="p-4"
          >
            <label className="block text-sm font-medium text-slate-700">
              Workspace name
              <input
                value={workspaceNameDraft}
                onChange={(event) => setWorkspaceNameDraft(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                autoFocus
              />
            </label>
            {nameError && (
              <div className="mt-3 flex gap-2 rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-800">
                <AlertCircle
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                <span>{nameError}</span>
              </div>
            )}
            <div className="mt-4 flex justify-between gap-2">
              {isRename ? (
                <button
                  type="button"
                  onClick={openDeleteWorkspaceDialog}
                  disabled={isSubmitting}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeWorkspaceDialog}
                  disabled={isSubmitting}
                  className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canSubmitName}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {createWorkspace.isPending || updateWorkspace.isPending ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : isCreate ? (
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  )}
                  {isCreate ? "Create" : "Save"}
                </button>
              </div>
            </div>
          </form>
        )}
        {isRename && <WorkspaceExtensionSlot slot="settings-footer" />}
      </div>
    </div>
  );
}
