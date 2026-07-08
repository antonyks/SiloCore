import axios from "axios";
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  Eye,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import AdminUserForm from "../components/AdminUserForm";
import {
  useAdminUser,
  useAdminUsers,
  useCreateAdminUser,
  useUpdateAdminUser,
} from "../hooks/useAdminUsers";
import type {
  AdminUser,
  AdminUserCreateInput,
  AdminUserListParams,
  AdminUserUpdateInput,
} from "../types";

const PAGE_SIZE = 10;

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

  return "The user operation failed.";
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

const isCreateInput = (
  input: AdminUserCreateInput | AdminUserUpdateInput,
): input is AdminUserCreateInput => {
  return "password" in input;
};

const UserDirectoryPage: React.FC = () => {
  const [searchInput, setSearchInput] = useState("");
  const [searchName, setSearchName] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const listParams = useMemo<AdminUserListParams>(
    () => ({
      ...(searchName ? { name: searchName } : {}),
      skip: pageIndex * PAGE_SIZE,
      take: PAGE_SIZE + 1,
    }),
    [pageIndex, searchName],
  );

  const usersQuery = useAdminUsers(listParams);
  const selectedUserQuery = useAdminUser(selectedUserId);
  const createUser = useCreateAdminUser();
  const updateUser = useUpdateAdminUser();
  const mutationError = createUser.error || updateUser.error;
  const isSaving = createUser.isPending || updateUser.isPending;
  const fetchedUsers = usersQuery.data || [];
  const visibleUsers = fetchedUsers.slice(0, PAGE_SIZE);
  const hasNextPage = fetchedUsers.length > PAGE_SIZE;
  const hasPreviousPage = pageIndex > 0;

  const openCreateForm = () => {
    setSuccessMessage(null);
    setEditingUser(null);
    setIsFormOpen(true);
  };

  const openEditForm = (user: AdminUser) => {
    setSuccessMessage(null);
    setEditingUser(user);
    setIsFormOpen(true);
    setSelectedUserId(user.id);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingUser(null);
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

  const handleSubmit = async (input: AdminUserCreateInput | AdminUserUpdateInput) => {
    try {
      if (editingUser) {
        const updatedUser = await updateUser.mutateAsync({ id: editingUser.id, input });
        setSuccessMessage(`${updatedUser.name} was updated.`);
        setSelectedUserId(updatedUser.id);
      } else if (isCreateInput(input)) {
        const createdUser = await createUser.mutateAsync(input);
        setSuccessMessage(`${createdUser.name} was created.`);
        setSelectedUserId(createdUser.id);
      }

      closeForm();
    } catch {
      // React Query exposes the error rendered by the form.
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <section className="rounded-md border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">User Directory</h2>
            <p className="text-xs text-slate-500">
              Manage regular user accounts without exposing chat contents.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
            <button
              type="button"
              onClick={openCreateForm}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add User
            </button>
          </div>
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

        {successMessage && (
          <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {successMessage}
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

        {isFormOpen && (
          <div className="border-b border-slate-200 bg-slate-50 p-4">
            <AdminUserForm
              key={editingUser?.id || "create"}
              user={editingUser}
              isSubmitting={isSaving}
              serverError={mutationError ? getErrorMessage(mutationError) : undefined}
              onCancel={closeForm}
              onSubmit={(input) => void handleSubmit(input)}
            />
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="px-4 py-2 font-semibold">Email</th>
                <th className="px-4 py-2 font-semibold">Role</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Created</th>
                <th className="px-4 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usersQuery.isLoading && <LoadingRows />}
              {visibleUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">{user.name}</td>
                  <td className="px-4 py-3 text-slate-700">{user.email}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{user.role}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={user.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-700">{formatDate(user.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedUserId(user.id)}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-100"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditForm(user)}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-100"
                      >
                        <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!usersQuery.isLoading && !usersQuery.isError && visibleUsers.length === 0 && (
          <div className="border-t border-slate-100 px-4 py-8 text-center text-sm text-slate-500">
            No users match the current directory filters.
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

      {selectedUserId && (
        <section className="rounded-md border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">User Detail</h2>
              <p className="text-xs text-slate-500">
                Account fields only. Chat content is intentionally not requested.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedUserId(null)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Close
            </button>
          </div>

          {selectedUserQuery.isLoading && (
            <div className="grid animate-pulse gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-12 rounded bg-slate-100" />
              ))}
            </div>
          )}

          {selectedUserQuery.isError && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
              <span className="inline-flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {getErrorMessage(selectedUserQuery.error)}
              </span>
              <button
                type="button"
                onClick={() => void selectedUserQuery.refetch()}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Retry
              </button>
            </div>
          )}

          {selectedUserQuery.data && (
            <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["Name", selectedUserQuery.data.name],
                ["Email", selectedUserQuery.data.email],
                ["Role", selectedUserQuery.data.role],
                ["Status", formatStatusLabel(selectedUserQuery.data.status)],
                ["Created", formatDate(selectedUserQuery.data.createdAt)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-slate-200 px-3 py-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {label}
                  </div>
                  <div className="mt-1 truncate text-sm font-medium text-slate-900">{value}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default UserDirectoryPage;
