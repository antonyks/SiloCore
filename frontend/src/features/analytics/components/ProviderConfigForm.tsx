import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Save, X } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type {
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
  const input: LlmProviderConfigInput = {
    name: values.name.trim(),
    type: values.type as LlmProviderType,
    baseUrl: values.baseUrl.trim(),
    enabled: values.enabled,
    defaultModel: values.defaultModel.trim(),
    timeoutMs,
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
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProviderFormValues>({
    resolver: zodResolver(providerFormSchema),
    defaultValues: buildDefaultValues(provider),
  });
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">
            {provider ? "Edit Provider" : "Add Provider"}
          </h2>
          <p className="text-xs text-slate-500">
            Provider secrets are write-only and are never displayed after save.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Cancel
        </button>
      </div>

      {serverError && (
        <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-800">
          {serverError}
        </div>
      )}

      <div className="grid gap-4 px-4 py-4 lg:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-700">Name</span>
          <input className={inputClassName} {...register("name")} disabled={isSubmitting} />
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
          <span className="text-xs font-medium text-slate-700">Default Model</span>
          <input
            className={inputClassName}
            placeholder="llama3.1"
            {...register("defaultModel")}
            disabled={isSubmitting}
          />
          <div className={errorClassName}>{errors.defaultModel?.message}</div>
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
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
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
