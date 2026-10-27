import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "../../src/features/chat/pages/Home";
import { API_BASE_URL, TOKEN_KEY, USER_KEY } from "../../src/config/constants";
import { renderWithProviders } from "../renderWithProviders";
import { server } from "../msw/server";

const workspace = {
  id: 25, name: "Personal Workspace", type: "PERSONAL", status: "ACTIVE", ownerUserId: 1,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};

function setup(title = "New Chat") {
  localStorage.setItem(TOKEN_KEY, "home-token");
  localStorage.setItem(USER_KEY, JSON.stringify({
    id: 1, email: "user@example.com", name: "User", role: "USER", personalWorkspace: workspace,
  }));
  window.history.pushState({}, "", "/workspaces/25/chat/home");
  let storedTitle = title;
  const listRequests: string[] = [];
  const detailRequests: string[] = [];
  const session = () => ({
    id: 10, title: storedTitle, userId: 1, workspaceId: 25,
    createdAt: workspace.createdAt, updatedAt: workspace.updatedAt,
  });
  server.use(
    http.get(`${API_BASE_URL}/workspaces`, () => HttpResponse.json({ data: [workspace] })),
    http.get(`${API_BASE_URL}/chat`, ({ request }) => {
      listRequests.push(request.headers.get("x-workspace-id") || "");
      return HttpResponse.json({ data: [session()] });
    }),
    http.get(`${API_BASE_URL}/chat/10`, ({ request }) => {
      detailRequests.push(request.headers.get("x-workspace-id") || "");
      return HttpResponse.json({ data: { ...session(), messages: [] } });
    }),
    http.get(`${API_BASE_URL}/chat/10/messages`, () => HttpResponse.json({ data: [] })),
    http.get(`${API_BASE_URL}/llm/models`, () =>
      HttpResponse.json({ data: { models: [], providers: [] } }),
    ),
  );
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(value) { controller = value; },
  });
  const fetchMock = vi.spyOn(window, "fetch").mockResolvedValue(new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  }));
  const view = renderWithProviders(<Home />, {
    workspaceLayout: true, initialEntries: ["/workspaces/25/chat/home"],
    routePath: "/workspaces/:workspaceId/chat/home",
  });
  const emit = async (frame: string) => {
    await act(async () => { controller.enqueue(new TextEncoder().encode(frame)); });
  };
  return {
    view, fetchMock, emit, listRequests, detailRequests,
    setTitle(value: string) { storedTitle = value; },
  };
}

const titleJob = (status: string, type = "chat.session_title") =>
  `event: job\ndata: ${JSON.stringify({ jobId: 9, type, status })}\n\n`;

describe("chat title subscription", () => {
  beforeEach(() => { HTMLElement.prototype.scrollTo = vi.fn(); });
  afterEach(() => vi.restoreAllMocks());

  it("refreshes the sidebar and selected heading from chat APIs on terminal title status", async () => {
    const f = setup();
    await screen.findByRole("button", { name: "Open New Chat" });
    await userEvent.click(screen.getByRole("button", { name: "Open New Chat" }));
    await screen.findByRole("heading", { name: "New Chat" });
    await waitFor(() => expect(f.fetchMock).toHaveBeenCalledTimes(1));
    expect(f.fetchMock.mock.calls[0][0]).toContain("/jobs/events?");
    expect(f.fetchMock.mock.calls[0][0]).toContain("types=chat.session_title");
    f.setTitle("Synthetic Chat Topic");
    await f.emit("event: ready\ndata: {}\n\n");
    await f.emit(titleJob("SUCCEEDED"));
    await screen.findByRole("button", { name: "Open Synthetic Chat Topic" });
    await screen.findByRole("heading", { name: "Synthetic Chat Topic" });
    expect(f.listRequests.every((id) => id === "25")).toBe(true);
    expect(f.detailRequests.every((id) => id === "25")).toBe(true);
    expect(f.fetchMock).toHaveBeenCalledTimes(1);
    f.view.unmount();
    expect((f.fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });

  it("resyncs on ready when a title completed before subscription, without selecting a chat", async () => {
    const f = setup();
    await screen.findByRole("button", { name: "Open New Chat" });
    f.setTitle("Already Finished Topic");
    await f.emit("event: ready\ndata: {}\n\n");
    await screen.findByRole("button", { name: "Open Already Finished Topic" });
    expect(screen.getByRole("heading", { name: "Select a chat" })).toBeInTheDocument();
    expect(f.detailRequests).toHaveLength(0);
    f.setTitle("Reconnected Topic");
    await f.emit("event: ready\ndata: {}\n\n");
    await screen.findByRole("button", { name: "Open Reconnected Topic" });
  });

  it("keeps the authoritative manual title and ignores unrelated or nonterminal jobs", async () => {
    const f = setup("User title");
    await screen.findByRole("button", { name: "Open User title" });
    await userEvent.click(screen.getByRole("button", { name: "Open User title" }));
    await screen.findByRole("heading", { name: "User title" });
    await f.emit("event: ready\ndata: {}\n\n");
    const before = f.listRequests.length;
    await f.emit(titleJob("RUNNING"));
    await f.emit(titleJob("SUCCEEDED", "validation.fixture"));
    expect(f.listRequests).toHaveLength(before);
    await f.emit(titleJob("FAILED"));
    await waitFor(() => expect(f.listRequests.length).toBeGreaterThan(before));
    expect(screen.getByRole("heading", { name: "User title" })).toBeInTheDocument();
  });
});
