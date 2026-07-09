import axios from "axios";
import {
  AlertCircle,
  Bot,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Edit3,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  SendHorizontal,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Square,
  Trash2,
  User,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import UserProfileDropdown from "../../../components/ui/UserProfileDropdown";
import { useAuth } from "../../auth/hooks/useAuth";
import {
  chatSessionQueryKeys,
  useChatSession,
  useChatSessionMessages,
  useChatSessions,
  useCreateChatSession,
  useDeleteChatSession,
  useUpdateChatSession,
} from "../hooks/useChatSessions";
import { useLlmModels } from "../hooks/useLlmModels";
import { chatService } from "../services/chatService";
import type {
  ChatGenerationParams,
  ChatSession,
  ChatSessionDetail,
  ChatSessionMessage,
  LlmListedModel,
  LlmProviderModelListResult,
  LlmProviderModelListStatus,
} from "../types";

const SESSION_LIST_LIMIT = 50;
const MODEL_SELECTION_STORAGE_KEY = "InsightBaseChatModelSelection";
const DEFAULT_GENERATION_SETTINGS = {
  temperature: "",
  topP: "",
  maxTokens: "",
  stopSequences: "",
};
const MESSAGE_SCROLL_BOTTOM_THRESHOLD = 96;

type SessionGroup = {
  label: string;
  sessions: ChatSession[];
};

type ModelSelection = {
  providerId: string;
  modelId: string;
};

type GenerationSettings = typeof DEFAULT_GENERATION_SETTINGS;

const getErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message || error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

const getStoredModelSelection = (): ModelSelection | null => {
  try {
    const stored = localStorage.getItem(MODEL_SELECTION_STORAGE_KEY);

    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as Partial<ModelSelection>;

    if (typeof parsed.providerId === "string" && typeof parsed.modelId === "string") {
      return {
        providerId: parsed.providerId,
        modelId: parsed.modelId,
      };
    }
  } catch {
    localStorage.removeItem(MODEL_SELECTION_STORAGE_KEY);
  }

  return null;
};

const storeModelSelection = (selection: ModelSelection | null) => {
  if (!selection) {
    localStorage.removeItem(MODEL_SELECTION_STORAGE_KEY);
    return;
  }

  localStorage.setItem(MODEL_SELECTION_STORAGE_KEY, JSON.stringify(selection));
};

const buildModelSelectionValue = (model: LlmListedModel) =>
  `${model.providerId}::${model.modelId}`;

const parseModelSelectionValue = (value: string): ModelSelection | null => {
  const [providerId, ...modelParts] = value.split("::");
  const modelId = modelParts.join("::");

  if (!providerId || !modelId) {
    return null;
  }

  return { providerId, modelId };
};

const getProviderStatusClasses = (status: LlmProviderModelListStatus) => {
  if (status === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "error") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-600";
};

const formatProviderStatus = (provider: LlmProviderModelListResult) => {
  if (provider.status === "success") {
    return `${provider.providerName}: ${provider.modelCount} model${
      provider.modelCount === 1 ? "" : "s"
    }`;
  }

  if (provider.status === "error") {
    return `${provider.providerName}: ${provider.errorMessage || "Model listing failed"}`;
  }

  return `${provider.providerName}: skipped`;
};

const parseNumberField = (value: string) => {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  return Number(trimmed);
};

const buildStopSequences = (value: string) => {
  const sequences = value
    .split("\n")
    .map((sequence) => sequence.trim())
    .filter(Boolean);

  return sequences.length > 0 ? sequences : undefined;
};

const isSameDate = (first: Date, second: Date) =>
  first.getFullYear() === second.getFullYear() &&
  first.getMonth() === second.getMonth() &&
  first.getDate() === second.getDate();

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const groupSessions = (sessions: ChatSession[]): SessionGroup[] => {
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const previousSevenDays = new Date(today);
  previousSevenDays.setDate(today.getDate() - 7);

  const groups: SessionGroup[] = [
    { label: "Today", sessions: [] },
    { label: "Yesterday", sessions: [] },
    { label: "Previous 7 Days", sessions: [] },
    { label: "Older", sessions: [] },
  ];

  sessions.forEach((session) => {
    const updatedAt = new Date(session.updatedAt);

    if (isSameDate(updatedAt, today)) {
      groups[0].sessions.push(session);
      return;
    }

    if (isSameDate(updatedAt, yesterday)) {
      groups[1].sessions.push(session);
      return;
    }

    if (updatedAt >= previousSevenDays) {
      groups[2].sessions.push(session);
      return;
    }

    groups[3].sessions.push(session);
  });

  return groups.filter((group) => group.sessions.length > 0);
};

const formatSessionDate = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
};

const formatMessageTime = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const formatLatency = (latencyMs: number) => {
  if (latencyMs >= 1000) {
    return `${(latencyMs / 1000).toFixed(1)}s`;
  }

  return `${Math.round(latencyMs)}ms`;
};

const getUsageTotal = (message: ChatSessionMessage) => {
  const usage = message.metadata?.usage;
  return usage?.totalTokens ?? usage?.total;
};

const getUsageParts = (message: ChatSessionMessage) => {
  const usage = message.metadata?.usage;

  if (!usage) {
    return null;
  }

  const prompt = usage.promptTokens ?? usage.prompt;
  const completion = usage.completionTokens ?? usage.completion;
  const total = usage.totalTokens ?? usage.total;

  return { prompt, completion, total };
};

const getMessageStyles = (author: ChatSessionMessage["author"]) => {
  if (author === "USER") {
    return "border-cyan-100 bg-cyan-50/70";
  }

  if (author === "SYSTEM") {
    return "border-amber-100 bg-amber-50/80";
  }

  return "border-slate-200 bg-white";
};

const MessageAuthorIcon: React.FC<{ author: ChatSessionMessage["author"] }> = ({ author }) => {
  if (author === "ASSISTANT") {
    return <Bot className="h-4 w-4" aria-hidden="true" />;
  }

  if (author === "SYSTEM") {
    return <MessageSquare className="h-4 w-4" aria-hidden="true" />;
  }

  return <User className="h-4 w-4" aria-hidden="true" />;
};

const AssistantMetadata: React.FC<{ message: ChatSessionMessage }> = ({ message }) => {
  const metadata = message.metadata;

  if (!metadata) {
    return null;
  }

  const usage = getUsageParts(message);
  const latency = metadata.latencyMs ?? metadata.latency;
  const providerLabel = metadata.providerName
    ? metadata.providerId
      ? `${metadata.providerName} (${metadata.providerId})`
      : metadata.providerName
    : metadata.providerId
      ? `Provider ${metadata.providerId}`
      : null;
  const totalUsage = getUsageTotal(message);
  const items = [
    providerLabel,
    metadata.model ? `Model ${metadata.model}` : null,
    typeof latency === "number" ? `Latency ${formatLatency(latency)}` : null,
    typeof totalUsage === "number" ? `Tokens ${totalUsage}` : null,
  ].filter(Boolean);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
      {items.map((item) => (
        <span
          key={item}
          className="max-w-full break-words rounded-md border border-slate-200 bg-slate-50 px-2 py-1"
        >
          {item}
        </span>
      ))}
      {usage && (usage.prompt !== undefined || usage.completion !== undefined) && (
        <span className="max-w-full break-words rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
          {usage.prompt ?? 0} in / {usage.completion ?? 0} out
        </span>
      )}
    </div>
  );
};

const AssistantReasoning: React.FC<{ message: ChatSessionMessage; isStreaming: boolean }> = ({
  message,
  isStreaming,
}) => {
  const reasoning = message.metadata?.reasoning;
  const hasAnswerContent = message.content.trim().length > 0;
  const shouldAutoExpand = isStreaming && !hasAnswerContent;
  const [manualExpanded, setManualExpanded] = useState<boolean | null>(null);
  const isExpanded = manualExpanded ?? shouldAutoExpand;

  if (!reasoning) {
    return null;
  }

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50">
      <button
        type="button"
        onClick={() => setManualExpanded(!isExpanded)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs font-medium text-slate-600"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Brain className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Reasoning</span>
        </span>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
      </button>
      {isExpanded && (
        <div className="border-t border-slate-200 px-3 py-2 text-sm leading-6 text-slate-700">
          <p className="whitespace-pre-wrap break-words">{reasoning}</p>
        </div>
      )}
    </div>
  );
};

const SessionLoadingRows = () => (
  <div className="space-y-2 px-3 py-3">
    {Array.from({ length: 6 }).map((_, index) => (
      <div key={index} className="animate-pulse rounded-md border border-slate-200 bg-white p-3">
        <div className="h-3 w-3/4 rounded bg-slate-200" />
        <div className="mt-2 h-2 w-1/3 rounded bg-slate-100" />
      </div>
    ))}
  </div>
);

const Home: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingAssistantIdRef = useRef<number | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const promptDraftsBySessionRef = useRef<Record<number, string>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [openSessionMenuId, setOpenSessionMenuId] = useState<number | null>(null);
  const [confirmingDeleteSession, setConfirmingDeleteSession] = useState<ChatSession | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [promptValidationError, setPromptValidationError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelSelection | null>(getStoredModelSelection);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [generationSettings, setGenerationSettings] = useState<GenerationSettings>(
    DEFAULT_GENERATION_SETTINGS,
  );
  const [settingsValidationError, setSettingsValidationError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  const listParams = useMemo(
    () => ({
      take: SESSION_LIST_LIMIT,
      orderBy: "updatedAt" as const,
      orderDirection: "desc" as const,
    }),
    [],
  );

  const sessionsQuery = useChatSessions(listParams);
  const selectedSessionQuery = useChatSession(selectedSessionId);
  const selectedMessagesQuery = useChatSessionMessages(selectedSessionId);
  const modelsQuery = useLlmModels();
  const createSession = useCreateChatSession();
  const updateSession = useUpdateChatSession();
  const deleteSession = useDeleteChatSession();

  const sessions = useMemo(() => sessionsQuery.data || [], [sessionsQuery.data]);
  const filteredSessions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    if (!normalizedSearch) {
      return sessions;
    }

    return sessions.filter((session) => session.title.toLowerCase().includes(normalizedSearch));
  }, [searchTerm, sessions]);

  const groupedSessions = useMemo(() => groupSessions(filteredSessions), [filteredSessions]);
  const selectedSession = selectedSessionQuery.data;
  const selectedMessages = useMemo(
    () => selectedMessagesQuery.data || selectedSession?.messages || [],
    [selectedMessagesQuery.data, selectedSession?.messages],
  );
  const availableModels = modelsQuery.data?.models || [];
  const providerStatuses = modelsQuery.data?.providers || [];
  const selectedModelValue = selectedModel
    ? `${selectedModel.providerId}::${selectedModel.modelId}`
    : "";
  const selectedModelDetails = selectedModel
    ? availableModels.find(
        (model) =>
          model.providerId === selectedModel.providerId && model.modelId === selectedModel.modelId,
      )
    : undefined;
  const messageScrollKey = useMemo(
    () => selectedMessages.map((message) => `${message.id}:${message.content.length}`).join("|"),
    [selectedMessages],
  );

  const scrollMessagesToBottom = (behavior: ScrollBehavior = "smooth") => {
    const element = messageListRef.current;

    if (!element) {
      return;
    }

    element.scrollTo({
      top: element.scrollHeight,
      behavior,
    });
  };

  useEffect(() => {
    if (!selectedSessionId) {
      setPromptDraft("");
      return;
    }

    setPromptDraft(promptDraftsBySessionRef.current[selectedSessionId] || "");
    setPromptValidationError(null);
    setStreamError(null);
    shouldStickToBottomRef.current = true;
  }, [selectedSessionId]);

  useEffect(() => {
    if (!selectedSessionId || selectedMessagesQuery.isLoading) {
      return;
    }

    if (!shouldStickToBottomRef.current) {
      return;
    }

    window.requestAnimationFrame(() => scrollMessagesToBottom("smooth"));
  }, [messageScrollKey, selectedSessionId, selectedMessagesQuery.isLoading]);

  const handleCreateSession = async () => {
    try {
      const session = await createSession.mutateAsync({ title: "New Chat" });
      setSelectedSessionId(session.id);
      setEditingSessionId(null);
      setOpenSessionMenuId(null);
      setSearchTerm("");
    } catch {
      // React Query exposes the error state rendered near the button.
    }
  };

  const startEditing = (session: ChatSession) => {
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
    setOpenSessionMenuId(null);
  };

  const cancelEditing = () => {
    setEditingSessionId(null);
    setEditingTitle("");
  };

  const handleRenameSubmit = async (event: FormEvent<HTMLFormElement>, session: ChatSession) => {
    event.preventDefault();

    const title = editingTitle.trim();
    if (!title || title === session.title) {
      cancelEditing();
      return;
    }

    try {
      await updateSession.mutateAsync({ id: session.id, input: { title } });
      cancelEditing();
    } catch {
      // React Query exposes the mutation error rendered in the row.
    }
  };

  const openDeleteConfirmation = (session: ChatSession) => {
    setConfirmingDeleteSession(session);
    setOpenSessionMenuId(null);
  };

  const closeDeleteConfirmation = () => {
    setConfirmingDeleteSession(null);
  };

  const confirmDeleteSession = async () => {
    if (!confirmingDeleteSession) {
      return;
    }

    const sessionId = confirmingDeleteSession.id;
    try {
      await deleteSession.mutateAsync(sessionId);
      if (selectedSessionId === sessionId) {
        setSelectedSessionId(null);
      }
      if (editingSessionId === sessionId) {
        cancelEditing();
      }
      closeDeleteConfirmation();
    } catch {
      // React Query exposes the mutation error rendered in the confirmation panel.
    }
  };

  const handleModelSelectionChange = (value: string) => {
    const selection = parseModelSelectionValue(value);
    setSelectedModel(selection);
    storeModelSelection(selection);
  };

  const selectSession = (sessionId: number) => {
    setSelectedSessionId(sessionId);
    setOpenSessionMenuId(null);
  };

  const handleMessageScroll = () => {
    const element = messageListRef.current;

    if (!element) {
      return;
    }

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom <= MESSAGE_SCROLL_BOTTOM_THRESHOLD;
  };

  const updatePromptDraft = (value: string) => {
    setPromptDraft(value);

    if (selectedSessionId) {
      promptDraftsBySessionRef.current[selectedSessionId] = value;
    }

    if (promptValidationError) {
      setPromptValidationError(null);
    }

    if (streamError) {
      setStreamError(null);
    }
  };

  const updateGenerationSetting = (key: keyof GenerationSettings, value: string) => {
    setGenerationSettings((current) => ({
      ...current,
      [key]: value,
    }));

    if (settingsValidationError) {
      setSettingsValidationError(null);
    }
  };

  const buildGenerationParams = (): ChatGenerationParams | null => {
    const temperature = parseNumberField(generationSettings.temperature);
    const topP = parseNumberField(generationSettings.topP);
    const maxTokens = parseNumberField(generationSettings.maxTokens);
    const stopSequences = buildStopSequences(generationSettings.stopSequences);

    if (temperature !== undefined && (!Number.isFinite(temperature) || temperature < 0)) {
      setSettingsValidationError("Temperature must be a non-negative number.");
      return null;
    }

    if (topP !== undefined && (!Number.isFinite(topP) || topP < 0 || topP > 1)) {
      setSettingsValidationError("Top P must be between 0 and 1.");
      return null;
    }

    if (
      maxTokens !== undefined &&
      (!Number.isInteger(maxTokens) || maxTokens < 1)
    ) {
      setSettingsValidationError("Max tokens must be a positive whole number.");
      return null;
    }

    setSettingsValidationError(null);

    return {
      providerId: selectedModelDetails ? Number(selectedModelDetails.providerId) : undefined,
      model: selectedModelDetails?.modelId,
      temperature,
      topP,
      maxTokens,
      stopSequences,
    };
  };

  const updateCachedMessages = (
    sessionId: number,
    updater: (messages: ChatSessionMessage[]) => ChatSessionMessage[],
  ) => {
    queryClient.setQueryData<ChatSessionMessage[]>(
      chatSessionQueryKeys.messages(sessionId),
      (current) => updater(current || []),
    );
    queryClient.setQueryData<ChatSessionDetail>(
      chatSessionQueryKeys.detail(sessionId),
      (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          messages: updater(current.messages),
        };
      },
    );
  };

  const appendCachedMessage = (sessionId: number, message: ChatSessionMessage) => {
    updateCachedMessages(sessionId, (messages) => {
      if (messages.some((existing) => existing.id === message.id)) {
        return messages;
      }

      return [...messages, message];
    });
  };

  const removeStreamingAssistant = (sessionId: number) => {
    const streamingAssistantId = streamingAssistantIdRef.current;

    if (streamingAssistantId === null) {
      return;
    }

    updateCachedMessages(sessionId, (messages) =>
      messages.filter((message) => message.id !== streamingAssistantId),
    );
    streamingAssistantIdRef.current = null;
  };

  const appendAssistantDelta = (
    sessionId: number,
    delta: { content?: string; reasoning?: string },
  ) => {
    if (!delta.content && !delta.reasoning) {
      return;
    }

    const streamingAssistantId = streamingAssistantIdRef.current ?? -Date.now();
    streamingAssistantIdRef.current = streamingAssistantId;

    updateCachedMessages(sessionId, (messages) => {
      const existing = messages.find((message) => message.id === streamingAssistantId);

      if (!existing) {
        return [
          ...messages,
          {
            id: streamingAssistantId,
            author: "ASSISTANT",
            content: delta.content || "",
            metadata: delta.reasoning ? { reasoning: delta.reasoning } : undefined,
            sessionId,
            createdAt: new Date().toISOString(),
          },
        ];
      }

      return messages.map((message) =>
        message.id === streamingAssistantId
          ? {
              ...message,
              content: `${message.content}${delta.content || ""}`,
              metadata: {
                ...(message.metadata || {}),
                ...(delta.reasoning
                  ? { reasoning: `${message.metadata?.reasoning || ""}${delta.reasoning}` }
                  : {}),
              },
            }
          : message,
      );
    });
  };

  const reconcileAssistantMessage = (sessionId: number, assistantMessage: ChatSessionMessage) => {
    const streamingAssistantId = streamingAssistantIdRef.current;

    updateCachedMessages(sessionId, (messages) => {
      if (messages.some((message) => message.id === assistantMessage.id)) {
        return messages.filter((message) => message.id !== streamingAssistantId);
      }

      if (streamingAssistantId === null) {
        return [...messages, assistantMessage];
      }

      return messages.map((message) =>
        message.id === streamingAssistantId ? assistantMessage : message,
      );
    });

    streamingAssistantIdRef.current = null;
  };

  const stopStreaming = () => {
    abortControllerRef.current?.abort();
  };

  const submitPrompt = async () => {
    if (!selectedSessionId || isStreaming) {
      return;
    }

    const content = promptDraft.trim();
    if (!content) {
      setPromptValidationError("Enter a prompt before sending.");
      return;
    }

    setPromptValidationError(null);
    const generationParams = buildGenerationParams();

    if (!generationParams) {
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    streamingAssistantIdRef.current = null;
    shouldStickToBottomRef.current = true;
    setIsStreaming(true);
    setStreamError(null);

    try {
      await chatService.streamGenerateMessage(
        selectedSessionId,
        {
          content,
          ...generationParams,
        },
        {
          signal: abortController.signal,
          onEvent: (event) => {
            if (event.event === "user_message") {
              appendCachedMessage(selectedSessionId, event.data);
              setPromptDraft("");
              promptDraftsBySessionRef.current[selectedSessionId] = "";
              void queryClient.invalidateQueries({ queryKey: chatSessionQueryKeys.lists() });
              return;
            }

            if (event.event === "delta") {
              appendAssistantDelta(selectedSessionId, event.data);
              return;
            }

            if (event.event === "assistant_message") {
              reconcileAssistantMessage(selectedSessionId, event.data);
              void queryClient.invalidateQueries({ queryKey: chatSessionQueryKeys.lists() });
              return;
            }

            if (event.event === "error") {
              throw new Error(event.data.message || "Streaming failed.");
            }
          },
        },
      );
    } catch (error) {
      removeStreamingAssistant(selectedSessionId);

      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setStreamError(getErrorMessage(error, "Streaming failed."));
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
      streamingAssistantIdRef.current = null;
      void queryClient.refetchQueries({ queryKey: chatSessionQueryKeys.messages(selectedSessionId) });
      void queryClient.invalidateQueries({ queryKey: chatSessionQueryKeys.lists() });
    }
  };

  const handlePromptSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitPrompt();
  };

  const handlePromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void submitPrompt();
  };

  const renderSessionRow = (session: ChatSession) => {
    const isSelected = selectedSessionId === session.id;
    const isEditing = editingSessionId === session.id;
    const isMenuOpen = openSessionMenuId === session.id;
    const isUpdating = updateSession.isPending && updateSession.variables?.id === session.id;
    const isDeleting = deleteSession.isPending && deleteSession.variables === session.id;
    const rowError =
      updateSession.isError && updateSession.variables?.id === session.id
        ? getErrorMessage(updateSession.error, "Session rename failed.")
        : null;

    return (
      <div
        key={session.id}
        className={`relative rounded-md border bg-white p-2 transition ${
          isSelected
            ? "border-cyan-300 shadow-sm ring-1 ring-cyan-100"
            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
        } ${isEditing ? "" : "cursor-pointer"}`}
      >
        {isEditing ? (
          <form onSubmit={(event) => void handleRenameSubmit(event, session)} className="space-y-2">
            <input
              value={editingTitle}
              onChange={(event) => setEditingTitle(event.target.value)}
              className="h-8 w-full rounded-md border border-slate-300 px-2 text-sm text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              autoFocus
            />
            <div className="flex justify-end gap-1">
              <button
                type="button"
                onClick={cancelEditing}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100"
                aria-label="Cancel rename"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="submit"
                disabled={isUpdating}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-950 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Save session title"
              >
                {isUpdating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          </form>
        ) : (
          <>
            <button
              type="button"
              onClick={() => selectSession(session.id)}
              className="absolute inset-0 cursor-pointer rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-100"
              aria-label={`Open ${session.title}`}
            />
            <div className="pointer-events-none relative z-10 pr-8">
              <span className="block truncate text-sm font-medium text-slate-900">
                {session.title}
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                Updated {formatSessionDate(session.updatedAt)}
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                setOpenSessionMenuId((current) => (current === session.id ? null : session.id))
              }
              className="absolute right-2 top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              aria-label={`Session actions for ${session.title}`}
              aria-expanded={isMenuOpen}
              aria-haspopup="menu"
            >
              <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {isMenuOpen && (
              <div
                role="menu"
                className="absolute right-2 top-10 z-30 w-32 rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => startEditing(session)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
                >
                  <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                  Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openDeleteConfirmation(session)}
                  disabled={isDeleting}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDeleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Delete
                </button>
              </div>
            )}
          </>
        )}
        {rowError && <div className="mt-2 text-xs text-red-700">{rowError}</div>}
      </div>
    );
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-slate-100 text-slate-950">
      <header className="flex h-14 shrink-0 items-center border-b border-slate-200 bg-white px-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-950 text-white">
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
          </div>
          <h1 className="truncate text-lg font-semibold">InsightBase</h1>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleCreateSession()}
            disabled={createSession.isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {createSession.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">New Chat</span>
          </button>
          <UserProfileDropdown user={user} />
        </div>
      </header>

      {createSession.isError && (
        <div className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-800">
          {getErrorMessage(createSession.error, "Could not create a new chat.")}
        </div>
      )}

      <div className="grid min-h-0 flex-1 overflow-hidden grid-rows-[minmax(16rem,34vh)_minmax(0,1fr)] lg:grid-cols-[20rem_minmax(0,1fr)] lg:grid-rows-none">
        <aside className="flex min-h-0 flex-col overflow-hidden border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r">
          <div className="shrink-0 border-b border-slate-200 p-3">
            <label className="relative block">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 text-sm text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                placeholder="Search sessions"
              />
            </label>
          </div>

          {confirmingDeleteSession && (
            <div className="shrink-0 border-b border-amber-100 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="flex gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Delete <span className="font-semibold">{confirmingDeleteSession.title}</span>?
                  This removes the chat session and its messages.
                </span>
              </div>
              {deleteSession.isError && deleteSession.variables === confirmingDeleteSession.id && (
                <div className="mt-2 flex gap-2 text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{getErrorMessage(deleteSession.error, "Session delete failed.")}</span>
                </div>
              )}
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeDeleteConfirmation}
                  disabled={deleteSession.isPending}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-amber-200 bg-white px-2.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDeleteSession()}
                  disabled={deleteSession.isPending}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-red-700 px-2.5 text-xs font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300"
                >
                  {deleteSession.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {deleteSession.isPending ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {sessionsQuery.isLoading && <SessionLoadingRows />}

            {sessionsQuery.isError && (
              <div className="m-3 rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-800">
                <div className="flex gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {getErrorMessage(sessionsQuery.error, "Could not load chat sessions.")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void sessionsQuery.refetch()}
                  className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-xs font-medium text-red-700 hover:bg-red-100"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Retry
                </button>
              </div>
            )}

            {!sessionsQuery.isLoading && !sessionsQuery.isError && sessions.length === 0 && (
              <div className="px-5 py-10 text-center">
                <MessageSquare className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
                <div className="mt-3 text-sm font-medium text-slate-800">No chat sessions</div>
                <div className="mt-1 text-xs text-slate-500">Create a new chat to begin.</div>
                <button
                  type="button"
                  onClick={() => void handleCreateSession()}
                  disabled={createSession.isPending}
                  className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-950 px-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {createSession.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  New Chat
                </button>
              </div>
            )}

            {!sessionsQuery.isLoading &&
              !sessionsQuery.isError &&
              sessions.length > 0 &&
              filteredSessions.length === 0 && (
                <div className="px-5 py-10 text-center text-sm text-slate-500">
                  No sessions match this search.
                </div>
              )}

            {groupedSessions.length > 0 && (
              <div className="space-y-4 p-3">
                {groupedSessions.map((group) => (
                  <section key={group.label}>
                    <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {group.label}
                    </h2>
                    <div className="space-y-2">{group.sessions.map(renderSessionRow)}</div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </aside>

        <main className="min-h-0 overflow-hidden bg-white">
          {!selectedSessionId && (
            <div className="flex min-h-full items-center justify-center px-6 py-12">
              <div className="max-w-md text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                  <MessageSquare className="h-6 w-6" aria-hidden="true" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-slate-950">Select a chat</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Choose a session from the sidebar or start a new one.
                </p>
              </div>
            </div>
          )}

          {selectedSessionId && selectedSessionQuery.isLoading && (
            <div className="space-y-4 p-6">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="animate-pulse rounded-md border border-slate-200 p-4">
                  <div className="h-3 w-24 rounded bg-slate-200" />
                  <div className="mt-3 h-3 w-full rounded bg-slate-100" />
                  <div className="mt-2 h-3 w-2/3 rounded bg-slate-100" />
                </div>
              ))}
            </div>
          )}

          {selectedSessionId && selectedSessionQuery.isError && (
            <div className="m-6 rounded-md border border-red-100 bg-red-50 p-4 text-sm text-red-800">
              <div className="flex gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {getErrorMessage(selectedSessionQuery.error, "Could not load this chat.")}
                </span>
              </div>
              <button
                type="button"
                onClick={() => void selectedSessionQuery.refetch()}
                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Retry
              </button>
            </div>
          )}

          {selectedSession && !selectedSessionQuery.isLoading && !selectedSessionQuery.isError && (
            <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
              <div className="max-h-[45vh] shrink-0 overflow-y-auto border-b border-slate-200 px-4 py-4 sm:px-5 lg:max-h-none lg:overflow-visible">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-slate-950">
                      {selectedSession.title}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedMessages.length} message
                      {selectedMessages.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto lg:justify-end">
                    <label className="sr-only" htmlFor="chat-model">
                      Model
                    </label>
                    <select
                      id="chat-model"
                      value={selectedModelValue}
                      onChange={(event) => handleModelSelectionChange(event.target.value)}
                      disabled={modelsQuery.isLoading || availableModels.length === 0}
                      className="h-9 min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 sm:min-w-64"
                    >
                      <option value="">
                        {modelsQuery.isLoading
                          ? "Loading models..."
                          : availableModels.length > 0
                            ? "Use default model"
                            : "No models available"}
                      </option>
                      {selectedModel && !selectedModelDetails && (
                        <option value={selectedModelValue} disabled>
                          Previous model unavailable
                        </option>
                      )}
                      {availableModels.map((model) => (
                        <option
                          key={buildModelSelectionValue(model)}
                          value={buildModelSelectionValue(model)}
                        >
                          {model.modelName} - {model.providerName}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setIsSettingsOpen((current) => !current)}
                      className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-md border px-2.5 text-sm font-medium ${
                        isSettingsOpen
                          ? "border-cyan-200 bg-cyan-50 text-cyan-800"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                      aria-expanded={isSettingsOpen}
                    >
                      <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                      <span className="hidden sm:inline">Settings</span>
                    </button>
                  </div>
                </div>

                {(modelsQuery.isError ||
                  providerStatuses.length > 0 ||
                  selectedModelDetails ||
                  (!modelsQuery.isLoading && availableModels.length === 0)) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedModelDetails && (
                      <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-cyan-100 bg-cyan-50 px-2 py-1 text-xs text-cyan-800">
                        <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="min-w-0 break-words">
                          {selectedModelDetails.providerName} / {selectedModelDetails.modelName}
                        </span>
                      </span>
                    )}
                    {modelsQuery.isError && (
                      <span className="inline-flex max-w-full items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                        <span className="min-w-0 break-words">
                          {getErrorMessage(modelsQuery.error, "Could not load models.")}
                        </span>
                        <button
                          type="button"
                          onClick={() => void modelsQuery.refetch()}
                          className="shrink-0 font-semibold underline-offset-2 hover:underline"
                        >
                          Retry
                        </button>
                      </span>
                    )}
                    {!modelsQuery.isLoading && availableModels.length === 0 && !modelsQuery.isError && (
                      <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        No available models. The default provider may still respond if configured.
                      </span>
                    )}
                    {providerStatuses.map((provider) => (
                      <span
                        key={provider.providerId}
                        className={`max-w-full break-words rounded-md border px-2 py-1 text-xs ${getProviderStatusClasses(
                          provider.status,
                        )}`}
                        title={provider.errorMessage}
                      >
                        {formatProviderStatus(provider)}
                      </span>
                    ))}
                  </div>
                )}

                {isSettingsOpen && (
                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="block text-xs font-medium text-slate-600">
                        Temperature
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={generationSettings.temperature}
                          onChange={(event) =>
                            updateGenerationSetting("temperature", event.target.value)
                          }
                          className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                          placeholder="Default"
                        />
                      </label>
                      <label className="block text-xs font-medium text-slate-600">
                        Top P
                        <input
                          type="number"
                          min="0"
                          max="1"
                          step="0.05"
                          value={generationSettings.topP}
                          onChange={(event) => updateGenerationSetting("topP", event.target.value)}
                          className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                          placeholder="Default"
                        />
                      </label>
                      <label className="block text-xs font-medium text-slate-600">
                        Max tokens
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={generationSettings.maxTokens}
                          onChange={(event) =>
                            updateGenerationSetting("maxTokens", event.target.value)
                          }
                          className="mt-1 h-9 w-full rounded-md border border-slate-300 px-2 text-sm text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                          placeholder="Default"
                        />
                      </label>
                    </div>
                    <label className="mt-3 block text-xs font-medium text-slate-600">
                      Stop sequences
                      <textarea
                        value={generationSettings.stopSequences}
                        onChange={(event) =>
                          updateGenerationSetting("stopSequences", event.target.value)
                        }
                        rows={2}
                        className="mt-1 max-h-24 min-h-16 w-full resize-y rounded-md border border-slate-300 px-2 py-2 text-sm text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                        placeholder="One sequence per line"
                      />
                    </label>
                  </div>
                )}
              </div>

              {selectedMessagesQuery.isError && (
                <div className="m-5 shrink-0 rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-800">
                  <div className="flex gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      {getErrorMessage(selectedMessagesQuery.error, "Could not load messages.")}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void selectedMessagesQuery.refetch()}
                    className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-white px-2.5 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Retry
                  </button>
                </div>
              )}

              {selectedMessages.length === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-12 text-center">
                  <div>
                    <MessageSquare
                      className="mx-auto h-8 w-8 text-slate-300"
                      aria-hidden="true"
                    />
                    <h3 className="mt-3 text-sm font-medium text-slate-800">
                      This chat has no messages yet
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Send a prompt to start the conversation.
                    </p>
                    {!modelsQuery.isLoading && availableModels.length === 0 && (
                      <p className="mt-2 text-xs text-amber-700">
                        No models are listed right now; sending can still use the backend default.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  ref={messageListRef}
                  onScroll={handleMessageScroll}
                  className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5"
                >
                  {selectedMessages.map((message) => (
                    <article
                      key={message.id}
                      className={`max-w-full rounded-md border p-4 ${getMessageStyles(message.author)}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                            <MessageAuthorIcon author={message.author} />
                          </span>
                          {message.author}
                        </div>
                        <time className="text-xs text-slate-400">
                          {formatMessageTime(message.createdAt)}
                        </time>
                      </div>
                      {message.author === "ASSISTANT" && (
                        <AssistantReasoning
                          message={message}
                          isStreaming={isStreaming && message.id === streamingAssistantIdRef.current}
                        />
                      )}
                      {message.content && (
                        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
                          {message.content}
                        </p>
                      )}
                      {message.author === "ASSISTANT" && <AssistantMetadata message={message} />}
                    </article>
                  ))}
                </div>
              )}

              <form
                onSubmit={(event) => void handlePromptSubmit(event)}
                className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-5"
              >
                {(promptValidationError || settingsValidationError || streamError) && (
                  <div className="mb-3 flex gap-2 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-words">
                      {promptValidationError || settingsValidationError || streamError}
                    </span>
                    {streamError && promptDraft.trim() && !isStreaming && (
                      <button
                        type="button"
                        onClick={() => void submitPrompt()}
                        className="ml-auto shrink-0 text-xs font-semibold underline-offset-2 hover:underline"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <label className="sr-only" htmlFor="chat-prompt">
                    Message
                  </label>
                  <textarea
                    id="chat-prompt"
                    value={promptDraft}
                    onChange={(event) => updatePromptDraft(event.target.value)}
                    onKeyDown={handlePromptKeyDown}
                    rows={3}
                    disabled={isStreaming}
                    className="max-h-40 min-h-20 flex-1 resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                    placeholder="Send a message"
                  />
                  <button
                    type={isStreaming ? "button" : "submit"}
                    onClick={isStreaming ? stopStreaming : undefined}
                    className={`inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-white ${
                      isStreaming ? "bg-red-700 hover:bg-red-800" : "bg-slate-950 hover:bg-slate-800"
                    }`}
                  >
                    {isStreaming ? (
                      <Square className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <SendHorizontal className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span className="hidden sm:inline">
                      {isStreaming ? "Stop" : "Send"}
                    </span>
                  </button>
                </div>
                {isStreaming && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Assistant response is streaming.
                  </div>
                )}
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Home;
