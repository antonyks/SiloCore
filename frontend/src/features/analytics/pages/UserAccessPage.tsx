import axios from "axios";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "../../auth/hooks/useAuth";
import {
  useActivateAdminUser,
  useAdminUsers,
  useBanAdminUser,
  useDeleteAdminUser,
} from "../hooks/useAdminUsers";
import type { AdminUser, AdminUserListParams } from "../types";

const PAGE_SIZE = 10;

interface ActionMessage {
  userId: number;
  userName: string;
  message: string;
  tone: "success" | "error";
}

const statusClass = (status: string) => {
  const normalizedStatus = status.toLowerCase();

  if (normalizedStatus === "active") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (normalizedStatus === "banned") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-600";
};

const formatStatusLabel = (value: string) =>
  value
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const formatDate = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message || error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "The user status operation failed.";
};

const LoadingRows = () => (
  <>
    {Array.from({ length: 5 }).map((_, rowIndex) => (
      <tr key={rowIndex} className="animate-pulse">
        {Array.from({ length: 6 }).map((__, columnIndex) => (
          <td key={columnIndex} className="px-4 py-3">
            <div className="h-3 rounded bg-slate-200" />
          </td>
        ))}
      </tr>
    ))}
  </>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <span
    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(status)}`}
  >
    {formatStatusLabel(status)}
  </span>
);

const UserAccessPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [searchInput, setSearchInput] = useState("");
  const [searchName, setSearchName] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [confirmingDeleteUser, setConfirmingDeleteUser] = useState<AdminUser | null>(null);
  const [actionMessage, setActionMessage] = useState<ActionMessage | null>(null);
  const [activeMutation, setActiveMutation] = useState<{
    userId: number;
    action: "ban" | "activate" | "delete";
  } | null>(null);

  const listParams = useMemo<AdminUserListParams>(
    () => ({
      ...(searchName ? { name: searchName } : {}),
      skip: pageIndex * PAGE_SIZE,
      take: PAGE_SIZE + 1,
    }),
    [pageIndex, searchName],
  );

  const usersQuery = useAdminUsers(listParams);
  const banUser = useBanAdminUser();
  const activateUser = useActivateAdminUser();
  const deleteUser = useDeleteAdminUser();
  const fetchedUsers = usersQuery.data || [];
  const visibleUsers = fetchedUsers.slice(0, PAGE_SIZE);
  const hasNextPage = fetchedUsers.length > PAGE_SIZE;
  const hasPreviousPage = pageIndex > 0;

  const getIsCurrentUser = (targetUser: AdminUser) => {
    if (!currentUser) {
      return false;
    }

    return String(currentUser.id) === String(targetUser.id);
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchName(searchInput.trim());
    setPageIndex(0);
  };

  const resetSearch = () => {
    setSearchInput("");
    setSearchName("");
    setPageIndex(0);
  };

  const handleStatusAction = async (
    targetUser: AdminUser,
    action: "ban" | "activate" | "delete",
  ) => {
    setActionMessage(null);
    setActiveMutation({ userId: targetUser.id, action });

    try {
      if (action === "ban") {
        await banUser.mutateAsync(targetUser.id);
        setActionMessage({
          userId: targetUser.id,
          userName: targetUser.name,
          message: "User was banned.",
          tone: "success",
        });
      }

      if (action === "activate") {
        await activateUser.mutateAsync(targetUser.id);
        setActionMessage({
          userId: targetUser.id,
          userName: targetUser.name,
          message: "User was reactivated.",
          tone: "success",
        });
      }

      if (action === "delete") {
        await deleteUser.mutateAsync(targetUser.id);
        setActionMessage({
          userId: targetUser.id,
          userName: targetUser.name,
          message: "User was deleted.",
          tone: "success",
        });
        setConfirmingDeleteUser(null);
      }
    } catch (error) {
      setActionMessage({
        userId: targetUser.id,
        userName: targetUser.name,
        message: getErrorMessage(error),
        tone: "error",
      });
    } finally {
      setActiveMutation(null);
    }
  };

  const getRowActionInProgress = (
    targetUser: AdminUser,
    action: "ban" | "activate" | "delete",
  ) => activeMutation?.userId === targetUser.id && activeMutation.action === action;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <section className="rounded-md border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Access & Bans</h2>
            <p className="text-xs text-slate-500">
              Ban, reactivate, and soft-delete regular user accounts.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void usersQuery.refetch()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${usersQuery.isFetching ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Refresh
          </button>
        </div>

        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-wrap items-end gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3"
        >
          <label className="min-w-[240px] flex-1">
            <span className="text-xs font-medium text-slate-700">Search Name</span>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              placeholder="Search by name"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            Search
          </button>
          {(searchName || searchInput) && (
            <button
              type="button"
              onClick={resetSearch}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Reset
            </button>
          )}
        </form>

        {actionMessage && (
          <div
            className={`flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm ${
              actionMessage.tone === "success"
                ? "border-emerald-100 bg-emerald-50 text-emerald-800"
                : "border-red-100 bg-red-50 text-red-800"
            }`}
          >
            {actionMessage.tone === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="font-medium">{actionMessage.userName}:</span>
            <span>{actionMessage.message}</span>
          </div>
        )}

        {usersQuery.isError && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span className="inline-flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {getErrorMessage(usersQuery.error)}
            </span>
            <button
              type="button"
              onClick={() => void usersQuery.refetch()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
          </div>
        )}

        {confirmingDeleteUser && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="inline-flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              Delete <span className="font-semibold">{confirmingDeleteUser.name}</span>? The
              account will be soft-deleted and removed from active user lists.
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDeleteUser(null)}
                disabled={getRowActionInProgress(confirmingDeleteUser, "delete")}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-200 bg-white px-2.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleStatusAction(confirmingDeleteUser, "delete")}
                disabled={getRowActionInProgress(confirmingDeleteUser, "delete")}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-red-700 px-2.5 text-xs font-semibold text-white hover:bg-red-800 disabled:bg-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {getRowActionInProgress(confirmingDeleteUser, "delete") ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="px-4 py-2 font-semibold">Email</th>
                <th className="px-4 py-2 font-semibold">Role</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Created</th>
                <th className="px-4 py-2 text-right font-semibold">Access Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usersQuery.isLoading && <LoadingRows />}
              {visibleUsers.map((targetUser) => {
                const isCurrentUser = getIsCurrentUser(targetUser);
                const isRowBusy = activeMutation?.userId === targetUser.id;
                const canBan = targetUser.status === "ACTIVE" && !isCurrentUser;
                const canActivate = targetUser.status === "BANNED" && !isCurrentUser;
                const canDelete = !isCurrentUser;

                return (
                  <tr key={targetUser.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{targetUser.name}</td>
                    <td className="px-4 py-3 text-slate-700">{targetUser.email}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{targetUser.role}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={targetUser.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatDate(targetUser.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {canBan && (
                          <button
                            type="button"
                            onClick={() => void handleStatusAction(targetUser, "ban")}
                            disabled={isRowBusy}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-red-200 px-2 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
                          >
                            <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                            {getRowActionInProgress(targetUser, "ban") ? "Banning..." : "Ban"}
                          </button>
                        )}
                        {canActivate && (
                          <button
                            type="button"
                            onClick={() => void handleStatusAction(targetUser, "activate")}
                            disabled={isRowBusy}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-200 px-2 text-xs text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:text-emerald-300"
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                            {getRowActionInProgress(targetUser, "activate")
                              ? "Activating..."
                              : "Activate"}
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setConfirmingDeleteUser(targetUser)}
                            disabled={isRowBusy}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Delete
                          </button>
                        )}
                        {isCurrentUser && (
                          <span className="inline-flex h-7 items-center rounded-md border border-slate-200 px-2 text-xs text-slate-500">
                            Current admin
                          </span>
                        )}
                        {!canBan && !canActivate && !canDelete && !isCurrentUser && (
                          <span className="inline-flex h-7 items-center rounded-md border border-slate-200 px-2 text-xs text-slate-500">
                            No action
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!usersQuery.isLoading && !usersQuery.isError && visibleUsers.length === 0 && (
          <div className="border-t border-slate-100 px-4 py-8 text-center text-sm text-slate-500">
            No users match the current access-control filters.
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          <span>
            Showing {visibleUsers.length} user{visibleUsers.length === 1 ? "" : "s"} from offset{" "}
            {pageIndex * PAGE_SIZE}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
              disabled={!hasPreviousPage || usersQuery.isFetching}
              className="inline-flex h-8 items-center rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPageIndex((current) => current + 1)}
              disabled={!hasNextPage || usersQuery.isFetching}
              className="inline-flex h-8 items-center rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default UserAccessPage;
