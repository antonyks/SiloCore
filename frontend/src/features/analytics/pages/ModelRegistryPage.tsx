import axios from "axios";
import { AlertCircle, ArrowRight, CheckCircle2, RefreshCw, ServerCog } from "lucide-react";
import { Link } from "react-router-dom";
import { useModelRegistry } from "../hooks/useModelRegistry";
import { useProviderConfigs } from "../hooks/useProviderConfigs";
import type {
  LlmListedModel,
  LlmModelCapabilities,
  LlmModelListResult,
  LlmProviderModelListResult,
  LlmProviderModelListStatus,
} from "../types";

interface MetricItem {
  label: string;
  value: string;
  detail: string;
}

const statusClass = (status: LlmProviderModelListStatus | "unknown") => {
  if (status === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "error") {
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

const formatProviderType = (value: string) =>
  value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message || error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unable to load the model registry.";
};

const getModelProviderStatus = (
  model: LlmListedModel,
  providers: LlmProviderModelListResult[],
): LlmProviderModelListStatus | "unknown" => {
  return providers.find((provider) => provider.providerId === model.providerId)?.status || "unknown";
};

const isDefaultModel = (model: LlmListedModel, defaultModel?: string): boolean => {
  if (!defaultModel) return false;
  return model.modelId.toLowerCase() === defaultModel.toLowerCase();
};

const buildMetrics = (registry: LlmModelListResult | undefined): MetricItem[] => {
  const providers = registry?.providers;
  const successCount = providers?.filter((provider) => provider.status === "success").length;
  const errorCount = providers?.filter((provider) => provider.status === "error").length;
  const skippedCount = providers?.filter((provider) => provider.status === "skipped").length;

  return [
    {
      label: "Registered Models",
      value: registry ? String(registry.models.length) : "...",
      detail: registry
        ? `${registry.providers.length} provider status${registry.providers.length === 1 ? "" : "es"} reported`
        : "Loading model inventory",
    },
    {
      label: "Successful Providers",
      value: successCount === undefined ? "..." : String(successCount),
      detail: "Returned model inventory",
    },
    {
      label: "Errored Providers",
      value: errorCount === undefined ? "..." : String(errorCount),
      detail: "Need provider review",
    },
    {
      label: "Skipped Providers",
      value: skippedCount === undefined ? "..." : String(skippedCount),
      detail: "Skipped by registry service",
    },
  ];
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

const StatusBadge: React.FC<{ status: LlmProviderModelListStatus | "unknown" }> = ({ status }) => (
  <span
    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass(status)}`}
  >
    {formatStatusLabel(status)}
  </span>
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

const ProviderLink: React.FC<{ label: string }> = ({ label }) => (
  <Link
    to="/admin/llm/providers"
    className="inline-flex h-8 items-center justify-end gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
  >
    <ServerCog className="h-3.5 w-3.5" aria-hidden="true" />
    {label}
    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
  </Link>
);

const ProviderNameLink: React.FC<{ name: string }> = ({ name }) => (
  <Link
    to="/admin/llm/providers"
    className="inline-flex min-h-8 items-center rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500"
  >
    {name}
  </Link>
);

const modelCapabilityLabels: { key: keyof LlmModelCapabilities; label: string }[] = [
  { key: "completion", label: "Completion" },
  { key: "streaming", label: "Streaming" },
  { key: "reasoning", label: "Reasoning" },
  { key: "embeddings", label: "Embeddings" },
  { key: "toolCalling", label: "Tool calling" },
  { key: "structuredOutput", label: "Structured output" },
  { key: "tokenCounting", label: "Token counting" },
];

const capabilityStateClass = (status: LlmModelCapabilities[keyof LlmModelCapabilities]) => {
  if (status === "SUPPORTED") return "text-emerald-700";
  if (status === "UNSUPPORTED") return "text-rose-700";
  return "text-slate-500";
};

const ModelCapabilities: React.FC<{ capabilities: LlmModelCapabilities }> = ({ capabilities }) => {
  const counts = { SUPPORTED: 0, UNSUPPORTED: 0, UNKNOWN: 0 };
  for (const { key } of modelCapabilityLabels) {
    counts[capabilities[key] ?? "UNKNOWN"] += 1;
  }

  const summary = [
    counts.SUPPORTED && `${counts.SUPPORTED} supported`,
    counts.UNSUPPORTED && `${counts.UNSUPPORTED} unsupported`,
    counts.UNKNOWN && `${counts.UNKNOWN} unknown`,
  ].filter(Boolean).join(" · ");

  return (
    <details className="text-xs text-slate-700">
      <summary className="cursor-pointer rounded-sm font-medium hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500">
        {summary}
      </summary>
      <dl className="mt-2 w-60 max-w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-1">
        {modelCapabilityLabels.map(({ key, label }) => {
          const status = capabilities[key] ?? "UNKNOWN";
          return (
            <div key={key} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 border-b border-slate-200 py-1.5 last:border-b-0">
              <dt className="text-slate-600">{label}:</dt>
              <dd className={`font-medium ${capabilityStateClass(status)}`}>
                {formatStatusLabel(status)}
              </dd>
            </div>
          );
        })}
      </dl>
    </details>
  );
};

const ModelRegistryPage: React.FC = () => {
  const modelsQuery = useModelRegistry();
  const providersQuery = useProviderConfigs();
  const modelRegistry = modelsQuery.data;
  const metrics = buildMetrics(modelRegistry);
  const isFetching = modelsQuery.isFetching || providersQuery.isFetching;
  const isRefreshing = isFetching && !modelsQuery.isLoading;
  const defaultModelsByProviderId = new Map(
    providersQuery.isSuccess
      ? providersQuery.data.map((provider) => [String(provider.id), provider.defaultModel] as const)
      : [],
  );

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
            <h2 className="text-sm font-semibold text-slate-950">Provider-Qualified Models</h2>
            <p className="text-xs text-slate-500">
              Aggregate inventory from enabled providers via /llm/models.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void Promise.all([modelsQuery.refetch(), providersQuery.refetch()])}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
            disabled={isFetching}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Model Name</th>
                <th className="px-4 py-2 font-semibold">Type</th>
                <th className="px-4 py-2 font-semibold">Provider Status</th>
                <th className="px-4 py-2 font-semibold">Capabilities</th>
                <th className="px-4 py-2 font-semibold">Provider</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {modelsQuery.isLoading && <LoadingRows rows={5} columns={5} />}
              {modelRegistry?.models.map((model) => {
                const providerStatus = getModelProviderStatus(model, modelRegistry.providers);

                return (
                  <tr key={`${model.providerId}-${model.modelId}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                        <span>{model.modelName}</span>
                        {isDefaultModel(model, defaultModelsByProviderId.get(model.providerId)) && (
                          <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-xs font-medium text-cyan-800">
                            Default
                          </span>
                        )}
                      </div>
                      <div className="mt-1 break-all text-xs text-slate-500">ID: {model.modelId}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {formatProviderType(model.providerType)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={providerStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <ModelCapabilities capabilities={model.capabilities} />
                    </td>
                    <td className="px-4 py-3">
                      <ProviderNameLink name={model.providerName} />
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
        {providersQuery.isError && (
          <div role="status" className="border-t border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Default model status is unavailable. Refresh to try again.
          </div>
        )}
        {!modelsQuery.isLoading && !modelsQuery.isError && modelRegistry?.models.length === 0 && (
          <EmptyState message="No models were returned by enabled providers." />
        )}
      </section>

      <section className="rounded-md border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Provider Status Breakdown</h2>
            <p className="text-xs text-slate-500">
              Runtime status for each provider considered by the model registry.
            </p>
          </div>
          <ProviderLink label="Provider Configs" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Provider Name</th>
                <th className="px-4 py-2 font-semibold">Type</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Models</th>
                <th className="px-4 py-2 font-semibold">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {modelsQuery.isLoading && <LoadingRows rows={4} columns={5} />}
              {modelRegistry?.providers.map((provider) => (
                <tr key={provider.providerId} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <ProviderNameLink name={provider.providerName} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {formatProviderType(provider.providerType)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={provider.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-700">{provider.modelCount}</td>
                  <td className="max-w-md px-4 py-3 text-xs text-slate-600">
                    {provider.errorMessage ? (
                      <span className="line-clamp-2 text-red-700">{provider.errorMessage}</span>
                    ) : (
                      <span className="text-slate-400">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!modelsQuery.isLoading && !modelsQuery.isError && modelRegistry?.providers.length === 0 && (
          <EmptyState message="No provider statuses were returned by the registry." />
        )}
      </section>

      {modelRegistry?.providers.some((provider) => provider.status === "success") && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          Successful providers remain visible even when other providers report errors or are skipped.
        </div>
      )}
    </div>
  );
};

export default ModelRegistryPage;
