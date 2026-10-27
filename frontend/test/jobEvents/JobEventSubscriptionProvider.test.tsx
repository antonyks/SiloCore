import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL, TOKEN_KEY, USER_KEY } from "../../src/config/constants";
import { useJobEventSubscription } from "../../src/features/jobEvents/useJobEventSubscription";
import { JobEventSubscriptionProvider } from "../../src/features/jobEvents/JobEventSubscriptionProvider";
import { useWorkspaceContext } from "../../src/features/workspace/workspaceContext";
import { renderWithProviders } from "../renderWithProviders";
import { server } from "../msw/server";

const personal = {
  id: 25,
  name: "Personal Workspace",
  ownerUserId: 1,
  type: "PERSONAL",
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const standard = { ...personal, id: 30, name: "Project Workspace", type: "STANDARD" };

function seedAuth() {
  localStorage.setItem(TOKEN_KEY, "workspace-token");
  localStorage.setItem(USER_KEY, JSON.stringify({
    id: 1,
    email: "user@example.com",
    name: "User",
    role: "USER",
    personalWorkspace: personal,
  }));
}

function Probe({ onJob, onReady }: { onJob: ReturnType<typeof vi.fn>; onReady: ReturnType<typeof vi.fn> }) {
  const navigate = useNavigate();
  const { activeWorkspaceId } = useWorkspaceContext();
  useJobEventSubscription({
    types: ["validation.fixture"],
    statuses: ["SUCCEEDED"],
    onJob,
    onReady,
  });
  return (
    <div>
      <span>Workspace {activeWorkspaceId ?? "pending"}</span>
      <button onClick={() => navigate("/workspaces/30/chat/home")}>Switch workspace</button>
    </div>
  );
}

describe("workspace job event subscription provider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("waits for validation, switches workspaces, and aborts on unmount", async () => {
    seedAuth();
    let resolveWorkspaces!: (value: HttpResponse) => void;
    server.use(http.get(`${API_BASE_URL}/workspaces`, () =>
      new Promise<HttpResponse>((resolve) => { resolveWorkspaces = resolve; }),
    ));
    const streams: ReadableStream<Uint8Array>[] = [
      new ReadableStream({ start() {} }),
      new ReadableStream({ start() {} }),
    ];
    const fetchMock = vi.spyOn(window, "fetch")
      .mockResolvedValueOnce(new Response(streams[0], { status: 200 }))
      .mockResolvedValueOnce(new Response(streams[1], { status: 200 }));
    const onJob = vi.fn();
    const onReady = vi.fn();
    const view = renderWithProviders(<Probe onJob={onJob} onReady={onReady} />, {
      workspaceLayout: true,
      fallbackRoutes: false,
      routePath: "/workspaces/:workspaceId/chat/home",
      initialEntries: ["/workspaces/25/chat/home"],
    });

    expect(screen.getByText("Workspace pending")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(resolveWorkspaces).toBeTypeOf("function"));
    await act(async () => {
      resolveWorkspaces(HttpResponse.json({ data: [personal, standard] }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer workspace-token", "X-Workspace-Id": "25",
    });
    const firstSignal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal;

    await userEvent.click(screen.getByRole("button", { name: "Switch workspace" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(firstSignal.aborted).toBe(true);
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({ "X-Workspace-Id": "30" });
    const secondSignal = (fetchMock.mock.calls[1][1] as RequestInit).signal as AbortSignal;
    view.unmount();
    expect(secondSignal.aborted).toBe(true);
  });

  it("keeps one connection when a feature callback changes", async () => {
    localStorage.setItem(TOKEN_KEY, "workspace-token");
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { streamController = controller; },
    });
    const fetchMock = vi.spyOn(window, "fetch").mockResolvedValue(new Response(stream));
    const oldCallback = vi.fn();
    const newCallback = vi.fn();

    function Listener({ onJob }: { onJob: ReturnType<typeof vi.fn> }) {
      useJobEventSubscription({
        types: ["validation.fixture"],
        statuses: ["SUCCEEDED"],
        onJob,
      });
      return null;
    }

    const view = render(
      <JobEventSubscriptionProvider workspaceId={25}>
        <Listener onJob={oldCallback} />
      </JobEventSubscriptionProvider>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    view.rerender(
      <JobEventSubscriptionProvider workspaceId={25}>
        <Listener onJob={newCallback} />
      </JobEventSubscriptionProvider>,
    );
    await act(async () => {
      streamController.enqueue(new TextEncoder().encode(
        'event: job\ndata: {"jobId":9,"type":"validation.fixture","status":"SUCCEEDED"}\n\n',
      ));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(oldCallback).not.toHaveBeenCalled();
    expect(newCallback).toHaveBeenCalledWith({ jobId: 9, type: "validation.fixture", status: "SUCCEEDED" });
    view.unmount();
  });
});
