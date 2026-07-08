import React from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Download,
  KeyRound,
  Plus,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  TestTube2,
} from "lucide-react";
import { useAdminDashboard } from "../hooks/useAdminDashboard";
import type {
  AdminAnalyticsSummary,
  AdminUserPreview,
  LlmListedModel,
  LlmModelListResult,
  LlmProviderModelListResult,
  LlmProviderModelListStatus,
  SanitizedLlmProviderConfig,
} from "../types";

interface MetricItem {
  label: string;
  value: string;
  detail: string;
}

const statusClass = (status: string) => {
  const normalizedStatus = status.toLowerCase();

  if (["active", "ready", "success"].includes(normalizedStatus)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (["disabled", "skipped", "deleted"].includes(normalizedStatus)) {
    return "border-slate-200 bg-slate-100 text-slate-600";
  }

  if (["banned", "error"].includes(normalizedStatus)) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-amber-200 bg-amber-50 text-amber-700";
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
  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to load this section.";
};

const getProviderRuntimeStatus = (
  provider: SanitizedLlmProviderConfig,
  modelProviders?: LlmProviderModelListResult[],
) => {
  if (!provider.enabled) {
    return "disabled";
  }

  const runtimeProvider = modelProviders?.find(
    (modelProvider) => String(provider.id) === modelProvider.providerId,
  );

  return runtimeProvider?.status || "active";
};

const getModelProviderStatus = (
  model: LlmListedModel,
  modelProviders: LlmProviderModelListResult[],
): LlmProviderModelListStatus | "unknown" => {
  return (
    modelProviders.find((provider) => provider.providerId === model.providerId)?.status ||
    "unknown"
  );
};

const LoadingRows: React.FC<{ rows: number; columns: number }> = ({ rows, columns }) => (
  <>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <tr key={rowIndex} className="animate-pulse">
        {Array.from({ length: columns }).map((__, columnIndex) => (
          <td key={columnIndex} className="px-4 py-3">
            <div className="h-3 rounded bg-slate-200" />
          </td>
        ))}
      </tr>
    ))}
  </>
);

const SectionError: React.FC<{
  message: string;
  onRetry: () => void;
}> = ({ message, onRetry }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
    <span className="inline-flex items-center gap-2">
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      {message}
    </span>
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-xs font-medium text-red-700 hover:bg-red-100"
    >
      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
      Retry
    </button>
  </div>
);

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="border-t border-slate-100 px-4 py-8 text-center text-sm text-slate-500">
    {message}
  </div>
);

const buildMetrics = (
  summary: AdminAnalyticsSummary | undefined,
  modelRegistry: LlmModelListResult | undefined,
  users: AdminUserPreview[] | undefined,
): MetricItem[] => {
  const errorProviderCount = modelRegistry?.providers.filter(
    (provider) => provider.status === "error",
  ).length;
  const skippedProviderCount = modelRegistry?.providers.filter(
    (provider) => provider.status === "skipped",
  ).length;
  const reviewUserCount = users?.filter((user) => user.status !== "ACTIVE").length;

  return [
    {
      label: "Active Providers",
      value: summary ? String(summary.providers.active) : "...",
      detail:
        summary === undefined
          ? "Loading provider summary"
          : `${summary.providers.disabled} disabled config${summary.providers.disabled === 1 ? "" : "s"}`,
    },
    {
      label: "Registered Models",
      value: modelRegistry ? String(modelRegistry.models.length) : "...",
      detail:
        errorProviderCount === undefined || skippedProviderCount === undefined
          ? "Loading model registry"
          : `${errorProviderCount} error, ${skippedProviderCount} skipped provider${skippedProviderCount === 1 ? "" : "s"}`,
    },
    {
      label: "Visible Users",
      value: summary ? String(summary.users.total) : "...",
      detail: summary
        ? `${summary.users.review} require review`
        : reviewUserCount === undefined
          ? "Loading user summary"
          : `${reviewUserCount} require review in preview`,
    },
    {
      label: "Inference Status",
      value:
        errorProviderCount === undefined
          ? "..."
          : errorProviderCount > 0
            ? "Review"
            : "Online",
      detail: modelRegistry
        ? `${modelRegistry.providers.length} provider status${modelRegistry.providers.length === 1 ? "" : "es"} reported`
        : "Loading provider statuses",
    },
  ];
};

const Dashboard: React.FC = () => {
  const { providersQuery, modelsQuery, usersQuery, summaryQuery } = useAdminDashboard();

  const providers = providersQuery.data;
  const modelRegistry = modelsQuery.data;
  const users = usersQuery.data;
  const metrics = buildMetrics(summaryQuery.data, modelRegistry, users);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((item) => (
          <div key={item.label} className="rounded-md border border-slate-200 bg-white px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {item.label}
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-950">{item.value}</div>
            <div className="mt-1 text-xs text-slate-500">{item.detail}</div>
          </div>
        ))}
      </section>

      <section className="rounded-md border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Active Provider Configs</h2>
            <p className="text-xs text-slate-500">Read-only data from /admin/llm/providers.</p>
          </div>
          <Link
            to="/admin/llm/providers"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add Provider
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Provider Name</th>
                <th className="px-4 py-2 font-semibold">Type</th>
                <th className="px-4 py-2 font-semibold">Default Model</th>
                <th className="px-4 py-2 font-semibold">Base URL</th>
                <th className="px-4 py-2 font-semibold">Secret</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {providersQuery.isLoading && <LoadingRows rows={3} columns={7} />}
              {providers?.map((provider) => {
                const runtimeStatus = getProviderRuntimeStatus(provider, modelRegistry?.providers);

                return (
                  <tr key={provider.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">{provider.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{provider.type}</td>
                    <td className="px-4 py-3 text-slate-700">{provider.defaultModel || "None"}</td>
                    <td className="max-w-64 truncate px-4 py-3 text-xs text-slate-500">
                      {provider.baseUrl}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                        <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                        {provider.hasApiKey ? "Configured" : "Not set"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(runtimeStatus)}`}
                      >
                        {formatStatusLabel(runtimeStatus)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Link
                          to="/admin/llm/providers"
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-100"
                        >
                          <TestTube2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Manage
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {providersQuery.isError && (
          <SectionError
            message={getErrorMessage(providersQuery.error)}
            onRetry={() => void providersQuery.refetch()}
          />
        )}
        {!providersQuery.isLoading && !providersQuery.isError && providers?.length === 0 && (
          <EmptyState message="No provider configs are available yet." />
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <section className="rounded-md border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">Model Registry & Pull Jobs</h2>
              <p className="text-xs text-slate-500">Read-only provider-qualified model inventory.</p>
            </div>
            <button
              type="button"
              onClick={() => void modelsQuery.refetch()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Refresh
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Model Name</th>
                  <th className="px-4 py-2 font-semibold">Provider</th>
                  <th className="px-4 py-2 font-semibold">Type</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {modelsQuery.isLoading && <LoadingRows rows={3} columns={5} />}
                {modelRegistry?.models.map((model) => {
                  const providerStatus = getModelProviderStatus(model, modelRegistry.providers);

                  return (
                    <tr key={`${model.providerId}-${model.modelId}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{model.modelName}</td>
                      <td className="px-4 py-3 text-slate-700">{model.providerName}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{model.providerType}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(providerStatus)}`}
                        >
                          {formatStatusLabel(providerStatus)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to="/admin/llm/providers"
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-100"
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                          Pull
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {modelsQuery.isError && (
            <SectionError
              message={getErrorMessage(modelsQuery.error)}
              onRetry={() => void modelsQuery.refetch()}
            />
          )}
          {!modelsQuery.isLoading && !modelsQuery.isError && modelRegistry?.models.length === 0 && (
            <EmptyState message="No models were returned by enabled providers." />
          )}
        </section>

        <section className="rounded-md border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">User Governance</h2>
              <p className="text-xs text-slate-500">Read-only user directory preview.</p>
            </div>
            <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          </div>
          <div className="divide-y divide-slate-100">
            {usersQuery.isLoading &&
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="grid animate-pulse grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3">
                  <div className="min-w-0 space-y-2">
                    <div className="h-3 w-36 rounded bg-slate-200" />
                    <div className="h-3 w-56 rounded bg-slate-200" />
                  </div>
                  <div className="h-6 w-16 rounded-full bg-slate-200" />
                </div>
              ))}
            {users?.map((user) => (
              <div key={user.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{user.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="truncate">{user.email}</span>
                    <span>{user.role}</span>
                    <span>Created {formatDate(user.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(user.status)}`}
                  >
                    {formatStatusLabel(user.status)}
                  </span>
                  <Link
                    to="/admin/users/access"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-700 hover:bg-slate-100"
                    aria-label={`Manage access for ${user.name}`}
                  >
                    <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
          {usersQuery.isError && (
            <SectionError
              message={getErrorMessage(usersQuery.error)}
              onRetry={() => void usersQuery.refetch()}
            />
          )}
          {!usersQuery.isLoading && !usersQuery.isError && users?.length === 0 && (
            <EmptyState message="No users were returned for this preview." />
          )}
          <div className="border-t border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              Access policy and ban controls are available in User Governance.
            </div>
          </div>
        </section>
      </div>

      <section className="grid gap-3 lg:grid-cols-3">
        {[
          {
            label: "Provider Configs",
            icon: ServerCog,
            text: "Loaded from existing admin provider APIs; manage provider settings from the provider config page.",
          },
          {
            label: "User Directory",
            icon: ShieldCheck,
            text: "Read-only user preview preserves the privacy rule and does not fetch chat contents.",
          },
          {
            label: "Access & Bans",
            icon: Ban,
            text: "Ban, reactivate, and soft-delete controls are available in the access controls page.",
          },
        ].map((item) => {
          const Icon = item.icon;

          return (
            <div key={item.label} className="rounded-md border border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <Icon className="h-4 w-4 text-cyan-700" aria-hidden="true" />
                {item.label}
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{item.text}</p>
            </div>
          );
        })}
      </section>
    </div>
  );
};

export default Dashboard;
