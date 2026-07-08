import axios from "axios";
import {
  AlertCircle,
  Bot,
  Check,
  Edit3,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  SendHorizontal,
  ShieldAlert,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import UserProfileDropdown from "../../../components/ui/UserProfileDropdown";
import { useAuth } from "../../auth/hooks/useAuth";
import {
  useChatSession,
  useChatSessionMessages,
  useChatSessions,
  useCreateChatSession,
  useDeleteChatSession,
  useGenerateChatMessage,
  useUpdateChatSession,
} from "../hooks/useChatSessions";
import type { ChatSession, ChatSessionMessage } from "../types";

const SESSION_LIST_LIMIT = 50;

type SessionGroup = {
  label: string;
  sessions: ChatSession[];
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message || error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
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
        <span key={item} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
          {item}
        </span>
      ))}
      {usage && (usage.prompt !== undefined || usage.completion !== undefined) && (
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
          {usage.prompt ?? 0} in / {usage.completion ?? 0} out
        </span>
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
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [confirmingDeleteSession, setConfirmingDeleteSession] = useState<ChatSession | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [promptValidationError, setPromptValidationError] = useState<string | null>(null);

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
  const createSession = useCreateChatSession();
  const updateSession = useUpdateChatSession();
  const deleteSession = useDeleteChatSession();
  const generateMessage = useGenerateChatMessage();

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
  const selectedMessages = selectedMessagesQuery.data || selectedSession?.messages || [];
  const generationError =
    generateMessage.isError && generateMessage.variables?.id === selectedSessionId
      ? getErrorMessage(generateMessage.error, "Message generation failed.")
      : null;

  const handleCreateSession = async () => {
    try {
      const session = await createSession.mutateAsync({ title: "New Chat" });
      setSelectedSessionId(session.id);
      setEditingSessionId(null);
      setSearchTerm("");
    } catch {
      // React Query exposes the error state rendered near the button.
    }
  };

  const startEditing = (session: ChatSession) => {
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
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

  const submitPrompt = async () => {
    if (!selectedSessionId || generateMessage.isPending) {
      return;
    }

    const content = promptDraft.trim();
    if (!content) {
      setPromptValidationError("Enter a prompt before sending.");
      return;
    }

    setPromptValidationError(null);

    try {
      await generateMessage.mutateAsync({ id: selectedSessionId, input: { content } });
      setPromptDraft("");
    } catch {
      // React Query exposes the error rendered near the composer.
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
    const isUpdating = updateSession.isPending && updateSession.variables?.id === session.id;
    const isDeleting = deleteSession.isPending && deleteSession.variables === session.id;
    const rowError =
      updateSession.isError && updateSession.variables?.id === session.id
        ? getErrorMessage(updateSession.error, "Session rename failed.")
        : null;

    return (
      <div
        key={session.id}
        className={`rounded-md border bg-white p-2 transition ${
          isSelected
            ? "border-cyan-300 shadow-sm ring-1 ring-cyan-100"
            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
        }`}
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
              onClick={() => setSelectedSessionId(session.id)}
              className="block w-full text-left"
            >
              <span className="block truncate text-sm font-medium text-slate-900">
                {session.title}
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                Updated {formatSessionDate(session.updatedAt)}
              </span>
            </button>
            <div className="mt-2 flex justify-end gap-1">
              <button
                type="button"
                onClick={() => startEditing(session)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                aria-label={`Rename ${session.title}`}
              >
                <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => openDeleteConfirmation(session)}
                disabled={isDeleting}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-100 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={`Delete ${session.title}`}
              >
                {isDeleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </div>
          </>
        )}
        {rowError && <div className="mt-2 text-xs text-red-700">{rowError}</div>}
      </div>
    );
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-100 text-slate-950">
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
        <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-800">
          {getErrorMessage(createSession.error, "Could not create a new chat.")}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="flex min-h-[18rem] flex-col border-b border-slate-200 bg-slate-50 lg:min-h-0 lg:border-b-0 lg:border-r">
          <div className="border-b border-slate-200 p-3">
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
            <div className="border-b border-amber-100 bg-amber-50 p-3 text-sm text-amber-900">
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
            <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="truncate text-base font-semibold text-slate-950">
                  {selectedSession.title}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedMessages.length} message
                  {selectedMessages.length === 1 ? "" : "s"}
                </p>
              </div>

              {selectedMessagesQuery.isError && (
                <div className="m-5 rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-800">
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
                  </div>
                </div>
              ) : (
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
                  {selectedMessages.map((message) => (
                    <article
                      key={message.id}
                      className={`rounded-md border p-4 ${getMessageStyles(message.author)}`}
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
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
                        {message.content}
                      </p>
                      {message.author === "ASSISTANT" && <AssistantMetadata message={message} />}
                    </article>
                  ))}
                </div>
              )}

              <form
                onSubmit={(event) => void handlePromptSubmit(event)}
                className="border-t border-slate-200 bg-slate-50 px-5 py-4"
              >
                {(promptValidationError || generationError) && (
                  <div className="mb-3 flex gap-2 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{promptValidationError || generationError}</span>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <label className="sr-only" htmlFor="chat-prompt">
                    Message
                  </label>
                  <textarea
                    id="chat-prompt"
                    value={promptDraft}
                    onChange={(event) => {
                      setPromptDraft(event.target.value);
                      if (promptValidationError) {
                        setPromptValidationError(null);
                      }
                    }}
                    onKeyDown={handlePromptKeyDown}
                    rows={3}
                    disabled={generateMessage.isPending}
                    className="max-h-40 min-h-20 flex-1 resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                    placeholder="Send a message"
                  />
                  <button
                    type="submit"
                    disabled={generateMessage.isPending}
                    className="inline-flex h-10 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {generateMessage.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <SendHorizontal className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span className="hidden sm:inline">
                      {generateMessage.isPending ? "Sending..." : "Send"}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Home;
