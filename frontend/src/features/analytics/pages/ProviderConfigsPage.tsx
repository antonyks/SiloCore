import axios from "axios";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Edit3,
  KeyRound,
  Plus,
  RefreshCw,
  TestTube2,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import ProviderConfigForm from "../components/ProviderConfigForm";
import {
  useCreateProviderConfig,
  useDeleteProviderConfig,
  usePullProviderModel,
  useProviderConfigs,
  useTestProviderConfig,
  useUpdateProviderConfig,
} from "../hooks/useProviderConfigs";
import type {
  LlmProviderConfigInput,
  LlmProviderOperationResult,
  SanitizedLlmProviderConfig,
} from "../types";

interface ActionMessage {
  providerId: number;
  providerName: string;
  message: string;
  tone: "success" | "error";
}

const statusClass = (enabled: boolean) =>
  enabled
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-slate-200 bg-slate-100 text-slate-600";

const formatProviderType = (type: string) =>
  type
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const formatDateTime = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message || error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "The provider operation failed.";
};

const buildOperationMessage = (
  action: "test" | "pull",
  result: LlmProviderOperationResult,
) => {
  if (result.status === "error") {
    return result.errorMessage || `Provider ${action} failed.`;
  }

  if (action === "test") {
    return `${result.providerName} responded successfully.`;
  }

  return `${result.providerName} model pull completed.`;
};

const LoadingRows = () => (
  <>
    {Array.from({ length: 4 }).map((_, rowIndex) => (
      <tr key={rowIndex} className="animate-pulse">
        {Array.from({ length: 8 }).map((__, columnIndex) => (
          <td key={columnIndex} className="px-4 py-3">
            <div className="h-3 rounded bg-slate-200" />
          </td>
        ))}
      </tr>
    ))}
  </>
);

const ProviderConfigsPage: React.FC = () => {
  const providersQuery = useProviderConfigs();
  const createProvider = useCreateProviderConfig();
  const updateProvider = useUpdateProviderConfig();
  const deleteProvider = useDeleteProviderConfig();
  const testProvider = useTestProviderConfig();
  const pullModel = usePullProviderModel();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<SanitizedLlmProviderConfig | null>(null);
  const [deletingProvider, setDeletingProvider] = useState<SanitizedLlmProviderConfig | null>(null);
  const [pullingProvider, setPullingProvider] = useState<SanitizedLlmProviderConfig | null>(null);
  const [pullModelName, setPullModelName] = useState("");
  const [pullValidationError, setPullValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<ActionMessage | null>(null);
  const [testingProviderId, setTestingProviderId] = useState<number | null>(null);
  const [pullingProviderId, setPullingProviderId] = useState<number | null>(null);

  const providerMutationError = createProvider.error || updateProvider.error;
  const providers = providersQuery.data;
  const isSaving = createProvider.isPending || updateProvider.isPending;

  const openCreateForm = () => {
    setSuccessMessage(null);
    setActionMessage(null);
    setDeletingProvider(null);
    setPullingProvider(null);
    setEditingProvider(null);
    setIsFormOpen(true);
  };

  const openEditForm = (provider: SanitizedLlmProviderConfig) => {
    setSuccessMessage(null);
    setActionMessage(null);
    setDeletingProvider(null);
    setPullingProvider(null);
    setEditingProvider(provider);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingProvider(null);
  };

  const handleSubmit = async (input: LlmProviderConfigInput) => {
    try {
      if (editingProvider) {
        await updateProvider.mutateAsync({ id: editingProvider.id, input });
        setSuccessMessage(`${input.name} was updated.`);
      } else {
        await createProvider.mutateAsync(input);
        setSuccessMessage(`${input.name} was created.`);
      }

      closeForm();
    } catch {
      // React Query exposes the error state rendered by the form.
    }
  };

  const confirmDelete = async () => {
    if (!deletingProvider) {
      return;
    }

    try {
      await deleteProvider.mutateAsync(deletingProvider.id);
      setSuccessMessage(`${deletingProvider.name} was deleted.`);
      setDeletingProvider(null);
    } catch {
      // React Query exposes the error state rendered by the delete confirmation.
    }
  };

  const handleTestProvider = async (provider: SanitizedLlmProviderConfig) => {
    setSuccessMessage(null);
    setActionMessage(null);
    setTestingProviderId(provider.id);

    try {
      const result = await testProvider.mutateAsync(provider.id);
      const isError = result.status === "error";

      setActionMessage({
        providerId: provider.id,
        providerName: provider.name,
        message: buildOperationMessage("test", result),
        tone: isError ? "error" : "success",
      });
    } catch (error) {
      setActionMessage({
        providerId: provider.id,
        providerName: provider.name,
        message: getErrorMessage(error),
        tone: "error",
      });
    } finally {
      setTestingProviderId(null);
    }
  };

  const openPullPanel = (provider: SanitizedLlmProviderConfig) => {
    setSuccessMessage(null);
    setActionMessage(null);
    setIsFormOpen(false);
    setDeletingProvider(null);
    setPullingProvider(provider);
    setPullModelName(provider.defaultModel || "");
    setPullValidationError(null);
  };

  const closePullPanel = () => {
    setPullingProvider(null);
    setPullModelName("");
    setPullValidationError(null);
  };

  const handlePullModel = async () => {
    if (!pullingProvider) {
      return;
    }

    const model = pullModelName.trim();

    if (!model) {
      setPullValidationError("Model name is required.");
      return;
    }

    setPullValidationError(null);
    setActionMessage(null);
    setPullingProviderId(pullingProvider.id);

    try {
      const result = await pullModel.mutateAsync({ id: pullingProvider.id, model });
      const isError = result.status === "error";

      setActionMessage({
        providerId: pullingProvider.id,
        providerName: pullingProvider.name,
        message: buildOperationMessage("pull", result),
        tone: isError ? "error" : "success",
      });

      if (!isError) {
        closePullPanel();
      }
    } catch (error) {
      setActionMessage({
        providerId: pullingProvider.id,
        providerName: pullingProvider.name,
        message: getErrorMessage(error),
        tone: "error",
      });
    } finally {
      setPullingProviderId(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <section className="rounded-md border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Provider Configs</h2>
            <p className="text-xs text-slate-500">
              Manage persisted LLM provider settings without exposing stored secrets.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void providersQuery.refetch()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Refresh
            </button>
            <button
              type="button"
              onClick={openCreateForm}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add Provider
            </button>
          </div>
        </div>

        {successMessage && (
          <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {successMessage}
          </div>
        )}

        {actionMessage && (
          <div
            className={`flex items-center gap-2 border-b px-4 py-2 text-sm ${
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
            <span className="font-medium">{actionMessage.providerName}:</span>
            <span>{actionMessage.message}</span>
          </div>
        )}

        {providersQuery.isError && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
            <span className="inline-flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {getErrorMessage(providersQuery.error)}
            </span>
            <button
              type="button"
              onClick={() => void providersQuery.refetch()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
          </div>
        )}

        {deletingProvider && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>
              Delete <span className="font-semibold">{deletingProvider.name}</span>? This removes
              the provider config from active use.
            </span>
            {deleteProvider.error && (
              <span className="inline-flex items-center gap-2 text-red-700">
                <AlertCircle className="h-4 w-4" aria-hidden="true" />
                {getErrorMessage(deleteProvider.error)}
              </span>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeletingProvider(null)}
                disabled={deleteProvider.isPending}
                className="inline-flex h-8 items-center rounded-md border border-amber-200 bg-white px-2.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={deleteProvider.isPending}
                className="inline-flex h-8 items-center rounded-md bg-red-700 px-2.5 text-xs font-semibold text-white hover:bg-red-800 disabled:bg-red-300"
              >
                {deleteProvider.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        )}

        {pullingProvider && (
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-950">
                Pull model for {pullingProvider.name}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                The provider handles pull timing and failure details.
              </div>
            </div>
            <div className="flex min-w-[280px] flex-1 flex-col gap-1 sm:max-w-xl">
              <div className="flex flex-wrap gap-2">
                <input
                  value={pullModelName}
                  onChange={(event) => {
                    setPullModelName(event.target.value);
                    setPullValidationError(null);
                  }}
                  className="h-8 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                  placeholder="model-name"
                  disabled={pullingProviderId === pullingProvider.id}
                />
                <button
                  type="button"
                  onClick={() => void handlePullModel()}
                  disabled={pullingProviderId === pullingProvider.id}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:bg-slate-400"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  {pullingProviderId === pullingProvider.id ? "Pulling..." : "Pull"}
                </button>
                <button
                  type="button"
                  onClick={closePullPanel}
                  disabled={pullingProviderId === pullingProvider.id}
                  className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
              {pullValidationError && (
                <div className="text-xs text-red-700">{pullValidationError}</div>
              )}
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="px-4 py-2 font-semibold">Type</th>
                <th className="px-4 py-2 font-semibold">Base URL</th>
                <th className="px-4 py-2 font-semibold">Default Model</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Secret</th>
                <th className="px-4 py-2 font-semibold">Timeout</th>
                <th className="px-4 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {providersQuery.isLoading && <LoadingRows />}
              {providers?.map((provider) => (
                <tr key={provider.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{provider.name}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      Updated {formatDateTime(provider.updatedAt)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {formatProviderType(provider.type)}
                  </td>
                  <td className="max-w-72 truncate px-4 py-3 text-xs text-slate-600">
                    {provider.baseUrl}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{provider.defaultModel}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(provider.enabled)}`}
                    >
                      {provider.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                      <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                      {provider.hasApiKey ? "Configured" : "Not set"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {provider.timeoutMs ? `${provider.timeoutMs} ms` : "Default"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditForm(provider)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleTestProvider(provider)}
                        disabled={testingProviderId === provider.id}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-wait disabled:text-slate-400"
                      >
                        <TestTube2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {testingProviderId === provider.id ? "Testing..." : "Test"}
                      </button>
                      <button
                        type="button"
                        onClick={() => openPullPanel(provider)}
                        disabled={pullingProviderId === provider.id}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-wait disabled:text-slate-400"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        Pull
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSuccessMessage(null);
                          setActionMessage(null);
                          setIsFormOpen(false);
                          setPullingProvider(null);
                          setDeletingProvider(provider);
                        }}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 px-2 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!providersQuery.isLoading && !providersQuery.isError && providers?.length === 0 && (
          <div className="border-t border-slate-100 px-4 py-8 text-center text-sm text-slate-500">
            No provider configs are available yet.
          </div>
        )}
      </section>

      {isFormOpen && (
        <ProviderConfigForm
          key={editingProvider ? `edit-${editingProvider.id}` : "create"}
          provider={editingProvider}
          isSubmitting={isSaving}
          serverError={providerMutationError ? getErrorMessage(providerMutationError) : undefined}
          onCancel={closeForm}
          onSubmit={(input) => void handleSubmit(input)}
        />
      )}
    </div>
  );
};

export default ProviderConfigsPage;
