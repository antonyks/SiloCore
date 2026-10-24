import axios from "axios";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth/hooks/useAuth";
import AdminActionDialog from "../components/AdminActionDialog";
import AdminUserPager from "../components/AdminUserPager";
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

type AccessAction = "ban" | "activate" | "delete";

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
  const [searchTerm, setSearchTerm] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [confirmingAction, setConfirmingAction] = useState<{
    user: AdminUser;
    action: AccessAction;
  } | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<ActionMessage | null>(null);
  const [activeMutation, setActiveMutation] = useState<{
    userId: number;
    action: AccessAction;
  } | null>(null);
  const actionTriggerRef = useRef<HTMLElement | null>(null);
  const refreshButtonRef = useRef<HTMLButtonElement>(null);
  const actionRequestInFlightRef = useRef(false);
  const focusRefreshAfterActionRef = useRef(false);

  const listParams = useMemo<AdminUserListParams>(
    () => ({
      ...(searchTerm ? { search: searchTerm } : {}),
      skip: pageIndex * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    [pageIndex, searchTerm],
  );

  const usersQuery = useAdminUsers(listParams);
  const banUser = useBanAdminUser();
  const activateUser = useActivateAdminUser();
  const deleteUser = useDeleteAdminUser();
  const visibleUsers = usersQuery.data?.data || [];
  const total = usersQuery.data?.total ?? 0;
  const lastPageIndex = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  if (usersQuery.isSuccess && pageIndex > lastPageIndex) {
    setPageIndex(lastPageIndex);
  }

  useEffect(() => {
    if (focusRefreshAfterActionRef.current && !confirmingAction && !activeMutation) {
      refreshButtonRef.current?.focus();
      focusRefreshAfterActionRef.current = false;
    }
  }, [confirmingAction, activeMutation]);

  const getIsCurrentUser = (targetUser: AdminUser) => {
    if (!currentUser) {
      return false;
    }

    return String(currentUser.id) === String(targetUser.id);
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearchTerm(searchInput.trim());
    setPageIndex(0);
  };

  const resetSearch = () => {
    setSearchInput("");
    setSearchTerm("");
    setPageIndex(0);
  };

  const openConfirmation = (user: AdminUser, action: AccessAction) => {
    if (activeMutation) return;
    actionTriggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setConfirmationError(null);
    setConfirmingAction({ user, action });
  };

  const closeConfirmation = () => {
    setConfirmingAction(null);
    setConfirmationError(null);
  };

  const handleStatusAction = async (
    targetUser: AdminUser,
    action: AccessAction,
  ) => {
    if (actionRequestInFlightRef.current) return;
    actionRequestInFlightRef.current = true;
    setActionMessage(null);
    setConfirmationError(null);
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
      }
      focusRefreshAfterActionRef.current = true;
      closeConfirmation();
    } catch (error) {
      setConfirmationError(getErrorMessage(error));
    } finally {
      actionRequestInFlightRef.current = false;
      setActiveMutation(null);
    }
  };

  const getRowActionInProgress = (
    targetUser: AdminUser,
    action: AccessAction,
  ) => activeMutation?.userId === targetUser.id && activeMutation.action === action;

  const confirmationBusy = confirmingAction
    ? getRowActionInProgress(confirmingAction.user, confirmingAction.action)
    : false;

  const renderAccessActions = (targetUser: AdminUser) => {
    const isCurrentUser = getIsCurrentUser(targetUser);
    const canBan = targetUser.status === "ACTIVE" && !isCurrentUser;
    const canActivate = targetUser.status === "BANNED" && !isCurrentUser;
    const canDelete = !isCurrentUser;

    return (
      <div className="flex flex-wrap gap-1.5">
        {canBan && <button type="button" onClick={() => openConfirmation(targetUser, "ban")} disabled={Boolean(activeMutation)} className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 px-2 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"><Ban className="h-3.5 w-3.5" aria-hidden="true" />{getRowActionInProgress(targetUser, "ban") ? "Banning..." : "Ban"}</button>}
        {canActivate && <button type="button" onClick={() => openConfirmation(targetUser, "activate")} disabled={Boolean(activeMutation)} className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-200 px-2 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"><UserCheck className="h-3.5 w-3.5" aria-hidden="true" />{getRowActionInProgress(targetUser, "activate") ? "Activating..." : "Activate"}</button>}
        {canDelete && <button type="button" onClick={() => openConfirmation(targetUser, "delete")} disabled={Boolean(activeMutation)} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{getRowActionInProgress(targetUser, "delete") ? "Deleting..." : "Delete"}</button>}
        {isCurrentUser && <span className="inline-flex h-8 items-center rounded-md border border-slate-200 px-2 text-xs text-slate-500">Current admin</span>}
        {!canBan && !canActivate && !canDelete && !isCurrentUser && <span className="inline-flex h-8 items-center rounded-md border border-slate-200 px-2 text-xs text-slate-500">No action</span>}
      </div>
    );
  };

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
            ref={refreshButtonRef}
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
            <span className="text-xs font-medium text-slate-700">Search Name or Email</span>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              placeholder="Search by name or email"
            />
          </label>
          <button
            type="submit"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            Search
          </button>
          {(searchTerm || searchInput) && (
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

        {usersQuery.isLoading && <p className="px-4 py-3 text-sm text-slate-500">Loading page {pageIndex + 1}...</p>}

        <div className="hidden overflow-x-auto xl:block">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="px-4 py-2 font-semibold">Email</th>
                <th className="px-4 py-2 font-semibold">Role</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th aria-sort="descending" className="px-4 py-2 font-semibold">Created ↓</th>
                <th className="px-4 py-2 text-right font-semibold">Access Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usersQuery.isLoading && <LoadingRows />}
              {visibleUsers.map((targetUser) => (
                  <tr key={targetUser.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{targetUser.name}</td>
                    <td className="px-4 py-3 text-slate-700">{targetUser.email}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{targetUser.role}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={targetUser.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatDate(targetUser.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">{renderAccessActions(targetUser)}</div>
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!usersQuery.isLoading && !usersQuery.isError && pageIndex <= lastPageIndex && (
          <div className="divide-y divide-slate-100 xl:hidden">
            {visibleUsers.map((targetUser) => (
              <article key={targetUser.id} className="space-y-3 px-4 py-4 text-sm">
                <div className="min-w-0"><h3 className="font-semibold text-slate-900">{targetUser.name}</h3><p className="break-all text-slate-700">{targetUser.email}</p></div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                  <dt className="text-slate-500">Role</dt><dd>{targetUser.role}</dd>
                  <dt className="text-slate-500">Status</dt><dd><StatusBadge status={targetUser.status} /></dd>
                  <dt className="text-slate-500">Created</dt><dd>{formatDate(targetUser.createdAt)}</dd>
                </dl>
                {renderAccessActions(targetUser)}
              </article>
            ))}
          </div>
        )}

        {!usersQuery.isLoading && !usersQuery.isError && total === 0 && (
          <div className="border-t border-slate-100 px-4 py-8 text-center text-sm text-slate-500">
            No users match the current access-control filters.
          </div>
        )}

        {usersQuery.isSuccess && pageIndex <= lastPageIndex && (
          <AdminUserPager pageIndex={pageIndex} pageSize={PAGE_SIZE} total={total} disabled={usersQuery.isFetching} onPageChange={setPageIndex} />
        )}
      </section>

      {confirmingAction && (
        <AdminActionDialog
          label={`${confirmingAction.action === "ban" ? "Ban" : confirmingAction.action === "activate" ? "Activate" : "Delete"} user ${confirmingAction.user.name}`}
          busy={confirmationBusy}
          returnFocusRef={actionTriggerRef}
          fallbackFocusRef={refreshButtonRef}
          onClose={closeConfirmation}
        >
          <div className="border-b border-slate-200 px-4 py-3 pr-12">
            <h2 data-dialog-initial-focus tabIndex={-1} className="text-sm font-semibold text-slate-950">
              {confirmingAction.action === "ban" ? "Ban user" : confirmingAction.action === "activate" ? "Reactivate user" : "Delete user"}
            </h2>
          </div>
          <div className="space-y-3 px-4 py-4 text-sm text-slate-700">
            <p>
              {confirmingAction.action === "ban" ? "Ban" : confirmingAction.action === "activate" ? "Reactivate" : "Delete"}{" "}
              <strong className="font-semibold text-slate-950">{confirmingAction.user.name}</strong>{" "}
              ({confirmingAction.user.email})?
            </p>
            <p>
              {confirmingAction.action === "ban"
                ? "This user will lose access until reactivated."
                : confirmingAction.action === "activate"
                  ? "This user will regain access."
                  : "The account will be soft-deleted and removed from active user lists."}
            </p>
            {confirmationError && (
              <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{confirmationError}</span>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
            <button
              type="button"
              onClick={closeConfirmation}
              disabled={confirmationBusy}
              className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleStatusAction(confirmingAction.user, confirmingAction.action)}
              disabled={confirmationBusy}
              className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${confirmingAction.action === "activate" ? "bg-emerald-700 hover:bg-emerald-800" : "bg-red-700 hover:bg-red-800"}`}
            >
              {confirmingAction.action === "ban" ? (
                <Ban className="h-4 w-4" aria-hidden="true" />
              ) : confirmingAction.action === "activate" ? (
                <UserCheck className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              )}
              {confirmationBusy
                ? confirmingAction.action === "ban" ? "Banning..." : confirmingAction.action === "activate" ? "Activating..." : "Deleting..."
                : confirmingAction.action === "ban" ? "Confirm Ban" : confirmingAction.action === "activate" ? "Confirm Reactivate" : "Confirm Delete"}
            </button>
          </div>
        </AdminActionDialog>
      )}
    </div>
  );
};

export default UserAccessPage;
