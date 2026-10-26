import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, KeyRound, RefreshCw, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { providerConfigService } from "../services/providerConfigService";
import type {
  DraftProviderProbeInput,
  LlmProviderConfigInput,
  LlmProviderType,
  SanitizedLlmProviderConfig,
} from "../types";

const providerTypes = ["ollama", "openai-compatible"] as const;
const secretModes = ["unchanged", "set", "clear"] as const;

const isPositiveIntegerOrBlank = (value: string) => {
  const trimmed = value.trim();

  if (!trimmed) {
    return true;
  }

  const numericValue = Number(trimmed);

  return Number.isInteger(numericValue) && numericValue > 0;
};

const isNonNegativeNumberOrBlank = (value: string) => {
  const trimmed = value.trim();

  if (!trimmed) {
    return true;
  }

  const numericValue = Number(trimmed);

  return Number.isFinite(numericValue) && numericValue >= 0;
};

const isTopPOrBlank = (value: string) => {
  const trimmed = value.trim();

  if (!trimmed) {
    return true;
  }

  const numericValue = Number(trimmed);

  return Number.isFinite(numericValue) && numericValue >= 0 && numericValue <= 1;
};

const parseOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
};

const parseStopSequences = (value: string) => {
  const sequences = value
    .split("\n")
    .map((sequence) => sequence.trim())
    .filter(Boolean);

  return sequences.length > 0 ? sequences : undefined;
};

const parseHeaders = (value: string): Record<string, string> | null => {
  const trimmed = value.trim();

  if (!trimmed) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    if (!Object.values(parsed).every((headerValue) => typeof headerValue === "string")) {
      return null;
    }

    return parsed as Record<string, string>;
  } catch {
    return null;
  }
};

const providerFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    type: z.enum(providerTypes),
    baseUrl: z.string().trim().min(1, "Base URL is required"),
    enabled: z.boolean(),
    defaultModel: z.string().trim().min(1, "Default model is required"),
    timeoutMs: z.string().refine(isPositiveIntegerOrBlank, "Timeout must be a positive integer"),
    defaultTemperature: z
      .string()
      .refine(isNonNegativeNumberOrBlank, "Temperature must be a non-negative number"),
    defaultTopP: z.string().refine(isTopPOrBlank, "Top P must be between 0 and 1"),
    defaultMaxTokens: z
      .string()
      .refine(isPositiveIntegerOrBlank, "Max tokens must be a positive whole number"),
    defaultStopSequences: z.string(),
    extraHeaders: z
      .string()
      .refine(
        (value) => parseHeaders(value) !== null,
        "Extra headers must be a JSON object with string values",
      ),
    apiKeyMode: z.enum(secretModes),
    apiKey: z.string(),
  })
  .superRefine((value, context) => {
    if (value.apiKeyMode === "set" && value.apiKey.trim().length === 0) {
      context.addIssue({
        code: "custom",
        path: ["apiKey"],
        message: "API key is required when replacing the secret",
      });
    }
  });

type ProviderFormValues = z.infer<typeof providerFormSchema>;
type ApiKeyMode = ProviderFormValues["apiKeyMode"];

const toPrettyHeaders = (headers: Record<string, string>) => {
  const keys = Object.keys(headers);

  if (keys.length === 0) {
    return "";
  }

  return JSON.stringify(headers, null, 2);
};

const buildDefaultValues = (
  provider: SanitizedLlmProviderConfig | null,
): ProviderFormValues => ({
  name: provider?.name ?? "",
  type: provider?.type ?? "ollama",
  baseUrl: provider?.baseUrl ?? "http://localhost:11434",
  enabled: provider?.enabled ?? true,
  defaultModel: provider?.defaultModel ?? "",
  timeoutMs: provider?.timeoutMs ? String(provider.timeoutMs) : "",
  defaultTemperature:
    provider?.generationDefaults.temperature !== undefined
      ? String(provider.generationDefaults.temperature)
      : "",
  defaultTopP:
    provider?.generationDefaults.topP !== undefined ? String(provider.generationDefaults.topP) : "",
  defaultMaxTokens:
    provider?.generationDefaults.maxTokens !== undefined
      ? String(provider.generationDefaults.maxTokens)
      : "",
  defaultStopSequences: provider?.generationDefaults.stopSequences?.join("\n") ?? "",
  extraHeaders: provider ? toPrettyHeaders(provider.extraHeaders) : "",
  apiKeyMode: "unchanged",
  apiKey: "",
});

const toProviderConfigInput = (
  values: ProviderFormValues,
  provider: SanitizedLlmProviderConfig | null,
): LlmProviderConfigInput => {
  const headers = parseHeaders(values.extraHeaders) || {};
  const timeoutMs = values.timeoutMs.trim() ? Number(values.timeoutMs.trim()) : null;
  const generationDefaults = {
    temperature: parseOptionalNumber(values.defaultTemperature),
    topP: parseOptionalNumber(values.defaultTopP),
    maxTokens: parseOptionalNumber(values.defaultMaxTokens),
    stopSequences: parseStopSequences(values.defaultStopSequences),
  };
  const input: LlmProviderConfigInput = {
    name: values.name.trim(),
    type: values.type as LlmProviderType,
    baseUrl: values.baseUrl.trim(),
    enabled: values.enabled,
    defaultModel: values.defaultModel.trim(),
    timeoutMs,
    generationDefaults: Object.fromEntries(
      Object.entries(generationDefaults).filter(([, value]) => value !== undefined),
    ),
    extraHeaders: headers,
  };

  if (!provider || values.apiKeyMode === "set") {
    const apiKey = values.apiKey.trim();

    if (apiKey) {
      input.apiKey = apiKey;
    }
  }

  if (provider && values.apiKeyMode === "clear") {
    input.apiKey = null;
  }

  return input;
};

const toDraftProbeInput = (
  values: ProviderFormValues,
  provider: SanitizedLlmProviderConfig | null,
): DraftProviderProbeInput | null => {
  const headers = parseHeaders(values.extraHeaders);
  const timeout = values.timeoutMs.trim();
  if (!headers || !isPositiveIntegerOrBlank(timeout)) return null;
  try {
    const url = new URL(values.baseUrl.trim());
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) return null;
  } catch {
    return null;
  }
  if (values.apiKeyMode === "set" && !values.apiKey.trim()) return null;
  return {
    ...(provider ? { providerId: provider.id } : {}),
    type: values.type,
    baseUrl: values.baseUrl.trim(),
    timeoutMs: timeout ? Number(timeout) : null,
    extraHeaders: headers,
    defaultModel: values.defaultModel.trim(),
    ...((!provider || values.apiKeyMode === "set") && values.apiKey.trim()
      ? { apiKey: values.apiKey.trim() } : {}),
    ...(provider && values.apiKeyMode === "clear" ? { apiKey: null } : {}),
  };
};

interface ProviderConfigFormProps {
  provider: SanitizedLlmProviderConfig | null;
  isSubmitting: boolean;
  serverError?: string;
  onCancel: () => void;
  onSubmit: (input: LlmProviderConfigInput) => void;
}

const inputClassName =
  "h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100";

const errorClassName = "mt-1 min-h-4 text-xs text-red-700";

const ProviderConfigForm: React.FC<ProviderConfigFormProps> = ({
  provider,
  isSubmitting,
  serverError,
  onCancel,
  onSubmit,
}) => {
  const [apiKeyMode, setApiKeyMode] = useState<ApiKeyMode>(
    buildDefaultValues(provider).apiKeyMode,
  );
  const [models, setModels] = useState<Array<{ modelId: string; modelName: string }>>([]);
  const [modelStatus, setModelStatus] = useState("Enter valid connection details to load models.");
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isTestingModel, setIsTestingModel] = useState(false);
  const [isModelListOpen, setIsModelListOpen] = useState(false);
  const [showAllModels, setShowAllModels] = useState(false);
  const [activeModelIndex, setActiveModelIndex] = useState(0);
  const [testResult, setTestResult] = useState<{ status: "success" | "error"; message: string } | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const testController = useRef<AbortController | null>(null);
  const modelListRef = useRef<HTMLUListElement | null>(null);
  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    trigger,
    formState: { errors },
  } = useForm<ProviderFormValues>({
    resolver: zodResolver(providerFormSchema),
    defaultValues: buildDefaultValues(provider),
  });
  const [type, baseUrl, timeoutMs, extraHeaders, apiKey, apiKeyModeValue, defaultModel] = useWatch({
    control,
    name: ["type", "baseUrl", "timeoutMs", "extraHeaders", "apiKey", "apiKeyMode", "defaultModel"],
  });
  const matchingModels = (showAllModels ? models : models.filter((model) =>
    `${model.modelId} ${model.modelName}`.toLowerCase().includes((defaultModel ?? "").toLowerCase())
  )).slice(0, 100);
  const visibleActiveIndex = Math.min(activeModelIndex, matchingModels.length - 1);
  const modelField = register("defaultModel", {
    onChange: () => {
      setShowAllModels(false);
      setActiveModelIndex(0);
      setIsModelListOpen(true);
    },
  });

  const selectModel = (modelId: string) => {
    setValue("defaultModel", modelId, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
    setIsModelListOpen(false);
  };

  useEffect(() => {
    if (isModelListOpen && matchingModels.length > 0) {
      modelListRef.current?.children[visibleActiveIndex]?.scrollIntoView?.({ block: "nearest" });
    }
  }, [activeModelIndex, isModelListOpen, matchingModels.length, visibleActiveIndex]);

  useEffect(() => {
    const input = toDraftProbeInput(getValues(), provider);
    if (!input) {
      setModels([]);
      setModelStatus("Enter valid connection details to load models.");
      setIsLoadingModels(false);
      return;
    }
    const controller = new AbortController();
    setModels([]);
    setModelStatus("Loading models…");
    setIsLoadingModels(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await providerConfigService.previewModels(input, controller.signal);
        if (controller.signal.aborted) return;
        setModels(result.models);
        if (document.activeElement?.id === "provider-default-model" && result.models.length > 0) {
          setIsModelListOpen(true);
        }
        setModelStatus(result.status === "success"
          ? result.models.length ? `${result.models.length} models available. You can also enter a model ID.` : "No models were listed. You can enter a model ID manually."
          : `${result.errorMessage ?? "Could not load models"}. You can enter a model ID manually.`);
      } catch {
        if (!controller.signal.aborted) setModelStatus("Could not load models. You can enter a model ID manually.");
      } finally {
        if (!controller.signal.aborted) setIsLoadingModels(false);
      }
    }, 700);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [type, baseUrl, timeoutMs, extraHeaders, apiKey, apiKeyModeValue, refreshCount, getValues, provider]);

  useEffect(() => {
    testController.current?.abort();
    setIsTestingModel(false);
    setTestResult(null);
  }, [type, baseUrl, timeoutMs, extraHeaders, apiKey, apiKeyModeValue, defaultModel]);

  useEffect(() => () => { testController.current?.abort(); }, []);

  const testModel = async () => {
    if (!await trigger(["type", "baseUrl", "timeoutMs", "extraHeaders", "apiKey", "defaultModel"])) return;
    const input = toDraftProbeInput(getValues(), provider);
    if (!input || !input.defaultModel) {
      setTestResult({ status: "error", message: "Enter valid connection details and a model ID first." });
      return;
    }
    testController.current?.abort();
    const controller = new AbortController();
    testController.current = controller;
    setIsTestingModel(true);
    setTestResult(null);
    try {
      const result = await providerConfigService.previewTest(input, controller.signal);
      if (!controller.signal.aborted) setTestResult({
        status: result.status,
        message: result.status === "success" ? "Model responded successfully." : result.errorMessage ?? "Model test failed.",
      });
    } catch {
      if (!controller.signal.aborted) setTestResult({ status: "error", message: "Model test failed. Check the connection and try again." });
    } finally {
      if (!controller.signal.aborted) setIsTestingModel(false);
    }
  };
  const apiKeyModeField = register("apiKeyMode", {
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      setApiKeyMode(event.target.value as ApiKeyMode);
    },
  });

  return (
    <form
      className="rounded-md border border-slate-200 bg-white"
      onSubmit={handleSubmit((values) => onSubmit(toProviderConfigInput(values, provider)))}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 py-3 pl-4 pr-14">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">
            {provider ? "Edit Provider" : "Add Provider"}
          </h2>
          <p className="text-xs text-slate-500">
            API keys are write-only. Custom header values are visible to all admins.
          </p>
        </div>
      </div>

      {serverError && (
        <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-800">
          {serverError}
        </div>
      )}

      <div className="grid gap-4 px-4 py-4 lg:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-700">Name</span>
          <input data-dialog-initial-focus className={inputClassName} {...register("name")} disabled={isSubmitting} />
          <div className={errorClassName}>{errors.name?.message}</div>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-700">Provider Type</span>
          <select className={inputClassName} {...register("type")} disabled={isSubmitting}>
            <option value="ollama">Ollama</option>
            <option value="openai-compatible">OpenAI Compatible</option>
          </select>
          <div className={errorClassName}>{errors.type?.message}</div>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-700">Base URL</span>
          <input
            className={inputClassName}
            placeholder="http://localhost:11434"
            {...register("baseUrl")}
            disabled={isSubmitting}
          />
          <div className={errorClassName}>{errors.baseUrl?.message}</div>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-700">Timeout Ms</span>
          <input
            className={inputClassName}
            inputMode="numeric"
            placeholder="30000"
            {...register("timeoutMs")}
            disabled={isSubmitting}
          />
          <div className={errorClassName}>{errors.timeoutMs?.message}</div>
        </label>

        <div className="flex items-center gap-3 pt-5">
          <input
            id="provider-enabled"
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-cyan-700 focus:ring-cyan-600"
            {...register("enabled")}
            disabled={isSubmitting}
          />
          <label htmlFor="provider-enabled" className="text-sm font-medium text-slate-800">
            Enabled
          </label>
        </div>

        <div className="lg:col-span-2">
          <div className="mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Generation Defaults
            </h3>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-700">Temperature</span>
              <input
                className={inputClassName}
                inputMode="decimal"
                placeholder="0.7"
                {...register("defaultTemperature")}
                disabled={isSubmitting}
              />
              <div className={errorClassName}>{errors.defaultTemperature?.message}</div>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-700">Top P</span>
              <input
                className={inputClassName}
                inputMode="decimal"
                placeholder="0.9"
                {...register("defaultTopP")}
                disabled={isSubmitting}
              />
              <div className={errorClassName}>{errors.defaultTopP?.message}</div>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-700">Max Tokens</span>
              <input
                className={inputClassName}
                inputMode="numeric"
                placeholder="4096"
                {...register("defaultMaxTokens")}
                disabled={isSubmitting}
              />
              <div className={errorClassName}>{errors.defaultMaxTokens?.message}</div>
            </label>

            <label className="block lg:col-span-3">
              <span className="text-xs font-medium text-slate-700">Stop Sequences</span>
              <textarea
                className="min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100"
                placeholder={"One sequence per line"}
                {...register("defaultStopSequences")}
                disabled={isSubmitting}
              />
              <div className={errorClassName}>{errors.defaultStopSequences?.message}</div>
            </label>
          </div>
        </div>

        <label className="block lg:col-span-2">
          <span className="text-xs font-medium text-slate-700">Extra Headers JSON</span>
          <textarea
            className="min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100"
            placeholder={'{\n  "X-Provider": "local"\n}'}
            {...register("extraHeaders")}
            disabled={isSubmitting}
          />
          <div className={errorClassName}>{errors.extraHeaders?.message}</div>
        </label>

        <div className="lg:col-span-2">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
            API Key
          </div>
          {provider && (
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  type="radio"
                  value="unchanged"
                  {...apiKeyModeField}
                  disabled={isSubmitting}
                />
                Leave unchanged
              </label>
              <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  type="radio"
                  value="set"
                  {...apiKeyModeField}
                  disabled={isSubmitting}
                />
                Replace
              </label>
              <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  type="radio"
                  value="clear"
                  {...apiKeyModeField}
                  disabled={isSubmitting}
                />
                Clear
              </label>
            </div>
          )}
          {(!provider || apiKeyMode === "set") && (
            <input
              className={`mt-2 ${inputClassName}`}
              type="password"
              autoComplete="off"
              placeholder={provider ? "New API key" : "Optional API key"}
              {...register("apiKey")}
              disabled={isSubmitting}
            />
          )}
          {provider?.hasApiKey && apiKeyMode === "unchanged" && (
            <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              A secret is configured for this provider.
            </div>
          )}
          {provider && apiKeyMode === "clear" && (
            <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Saving will remove the configured secret.
            </div>
          )}
          <div className={errorClassName}>{errors.apiKey?.message}</div>
        </div>

        <div className="lg:col-span-2 border-t border-slate-200 pt-4">
          <label htmlFor="provider-default-model" className="text-xs font-medium text-slate-700">Default Model</label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <div className="min-w-52 flex-1" onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsModelListOpen(false);
            }}>
              <div className="relative">
                <input
                  id="provider-default-model"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={isModelListOpen && models.length > 0}
                  aria-controls="provider-model-suggestions"
                  aria-activedescendant={isModelListOpen && matchingModels.length > 0
                    ? `provider-model-option-${visibleActiveIndex}` : undefined}
                  className={`${inputClassName} pr-9`}
                  placeholder="Select or enter a model ID"
                  autoComplete="off"
                  {...modelField}
                  onFocus={() => {
                    setShowAllModels(models.some((model) => model.modelId === getValues("defaultModel")));
                    setActiveModelIndex(0);
                    setIsModelListOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && isModelListOpen) {
                      event.preventDefault();
                      event.stopPropagation();
                      setIsModelListOpen(false);
                    } else if (event.key === "ArrowDown" && models.length > 0) {
                      event.preventDefault();
                      setIsModelListOpen(true);
                      setActiveModelIndex((index) => isModelListOpen
                        ? Math.min(index + 1, Math.max(matchingModels.length - 1, 0)) : 0);
                    } else if (event.key === "ArrowUp" && isModelListOpen && matchingModels.length > 0) {
                      event.preventDefault();
                      setActiveModelIndex((index) => Math.max(index - 1, 0));
                    } else if (event.key === "Enter" && isModelListOpen && matchingModels.length > 0) {
                      event.preventDefault();
                      selectModel(matchingModels[visibleActiveIndex].modelId);
                    }
                  }}
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  aria-label="Show available models"
                  aria-expanded={isModelListOpen && models.length > 0}
                  disabled={isSubmitting || models.length === 0}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    const nextOpen = !isModelListOpen;
                    document.getElementById("provider-default-model")?.focus();
                    setShowAllModels(true);
                    setActiveModelIndex(0);
                    setIsModelListOpen(nextOpen);
                  }}
                  className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-500 hover:text-cyan-800 disabled:opacity-40"
                >
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              {isModelListOpen && models.length > 0 && (
                <div className="mt-1 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
                  <ul ref={modelListRef} id="provider-model-suggestions" role="listbox" aria-label="Available models" className="max-h-52 overflow-y-auto py-1">
                    {matchingModels.length > 0 ? matchingModels.map((model, index) => (
                      <li
                        key={model.modelId}
                        id={`provider-model-option-${index}`}
                        role="option"
                        aria-label={model.modelName === model.modelId ? model.modelId : `${model.modelId}, ${model.modelName}`}
                        aria-selected={model.modelId === defaultModel}
                        title={model.modelName === model.modelId ? model.modelId : `${model.modelId} — ${model.modelName}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectModel(model.modelId)}
                        className={`cursor-pointer px-3 py-2 text-sm ${index === visibleActiveIndex ? "bg-cyan-50 text-cyan-950" : "text-slate-800 hover:bg-slate-50"}`}
                      >
                        <span className="block truncate font-medium">{model.modelId}</span>
                        {model.modelName !== model.modelId && <span className="block truncate text-xs text-slate-500">{model.modelName}</span>}
                      </li>
                    )) : <li className="px-3 py-2 text-xs text-slate-500">No matching models. You can use the typed ID.</li>}
                  </ul>
                  {matchingModels.length === 100 && <div className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-500">Showing the first 100 matches. Type to narrow the list.</div>}
                </div>
              )}
            </div>
            <button type="button" onClick={() => setRefreshCount((count) => count + 1)} disabled={isSubmitting || isLoadingModels}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60">
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh models
            </button>
            <button type="button" onClick={testModel} disabled={isSubmitting || isTestingModel}
              className="h-9 rounded-md border border-cyan-700 px-3 text-sm font-medium text-cyan-800 hover:bg-cyan-50 disabled:opacity-60">
              {isTestingModel ? "Testing…" : "Test model"}
            </button>
          </div>
          <div className={errorClassName}>{errors.defaultModel?.message}</div>
          <p role="status" className="text-xs text-slate-600">{modelStatus}</p>
          {testResult && <p role={testResult.status === "error" ? "alert" : "status"}
            className={`mt-2 text-sm ${testResult.status === "error" ? "text-red-700" : "text-emerald-700"}`}>
            {testResult.message}
          </p>}
          <p className="mt-1 text-xs text-slate-500">Testing sends a short prompt to this model. Saving does not require a successful test.</p>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {isSubmitting ? "Saving..." : "Save Provider"}
        </button>
      </div>
    </form>
  );
};

export default ProviderConfigForm;
