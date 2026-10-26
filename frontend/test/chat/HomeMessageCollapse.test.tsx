import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "../../src/features/chat/pages/Home";
import { chatSessionQueryKeys } from "../../src/features/chat/hooks/useChatSessions";
import { chatService } from "../../src/features/chat/services/chatService";
import type {
  ChatGenerationStreamEvent,
  ChatSessionMessage,
} from "../../src/features/chat/types";
import { API_BASE_URL, TOKEN_KEY, USER_KEY } from "../../src/config/constants";
import { renderWithProviders } from "../renderWithProviders";
import { server } from "../msw/server";

const workspace = {
  id: 25,
  name: "Personal Workspace",
  type: "PERSONAL",
  status: "ACTIVE",
  ownerUserId: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const sessions = [
  {
    id: 10,
    title: "First chat",
    userId: 1,
    workspaceId: 25,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  },
  {
    id: 11,
    title: "Second chat",
    userId: 1,
    workspaceId: 25,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  },
];

const firstMessages: ChatSessionMessage[] = [
  {
    id: 100,
    sessionId: 10,
    author: "USER",
    content: "Question with useful context",
    createdAt: workspace.createdAt,
  },
  {
    id: 101,
    sessionId: 10,
    author: "ASSISTANT",
    content: "A detailed answer",
    metadata: { reasoning: "Reasoning details" },
    createdAt: workspace.createdAt,
  },
];

beforeEach(() => {
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

function renderChat() {
  localStorage.setItem(TOKEN_KEY, "home-token");
  localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      id: "1",
      email: "user@example.com",
      name: "User",
      role: "USER",
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      personalWorkspace: workspace,
    }),
  );
  window.history.pushState({}, "", "/workspaces/25/chat/home");

  server.use(
    http.get(`${API_BASE_URL}/workspaces`, () =>
      HttpResponse.json({ data: [workspace] }),
    ),
    http.get(`${API_BASE_URL}/chat`, () =>
      HttpResponse.json({ data: sessions }),
    ),
    http.get(`${API_BASE_URL}/chat/:id`, ({ params }) =>
      HttpResponse.json({
        data: {
          ...sessions.find((session) => session.id === Number(params.id)),
          messages: Number(params.id) === 10 ? firstMessages : [],
        },
      }),
    ),
    http.get(`${API_BASE_URL}/chat/:id/messages`, ({ params }) =>
      HttpResponse.json({
        data: Number(params.id) === 10 ? firstMessages : [],
      }),
    ),
    http.get(`${API_BASE_URL}/llm/models`, () =>
      HttpResponse.json({ data: { models: [], providers: [] } }),
    ),
  );

  return renderWithProviders(<Home />, {
    workspaceLayout: true,
    initialEntries: ["/workspaces/25/chat/home"],
    routePath: "/workspaces/:workspaceId/chat/home",
  });
}

describe("chat message collapse", () => {
  it("collapses messages independently, preserves reasoning state, and resets when a session is reopened", async () => {
    const user = userEvent.setup();
    renderChat();
    await user.click(
      await screen.findByRole("button", { name: "Open First chat" }),
    );

    const userToggle = await screen.findByRole("button", {
      name: /^Collapse user message:/,
    });
    const assistantToggle = screen.getByRole("button", {
      name: /^Collapse assistant message:/,
    });
    expect(userToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Question with useful context")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Reasoning" }));
    expect(screen.getByText("Reasoning details")).toBeVisible();
    await user.click(userToggle);

    const collapsedUser = screen.getByRole("button", {
      name: /^Expand user message:/,
    });
    expect(collapsedUser).toHaveAttribute("aria-expanded", "false");
    expect(
      within(collapsedUser).getByText("Question with useful context"),
    ).toBeVisible();
    expect(
      document.getElementById(collapsedUser.getAttribute("aria-controls")!),
    ).toHaveAttribute("hidden");
    expect(
      within(collapsedUser.closest("article")!).getByRole("button", {
        name: "Copy message",
        hidden: true,
      }),
    ).not.toBeVisible();
    expect(assistantToggle).toHaveAttribute("aria-expanded", "true");

    await user.click(assistantToggle);
    expect(
      screen.getByRole("button", { name: /^Expand assistant message:/ }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Reasoning details")).not.toBeVisible();
    await user.click(
      screen.getByRole("button", { name: /^Expand assistant message:/ }),
    );
    expect(screen.getByText("Reasoning details")).toBeVisible();

    collapsedUser.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: /^Collapse user message:/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: /^Expand user message:/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await user.click(screen.getByRole("button", { name: "Open Second chat" }));
    await screen.findByText("This chat has no messages yet");
    await user.click(screen.getByRole("button", { name: "Open First chat" }));
    expect(
      await screen.findByRole("button", { name: /^Collapse user message:/ }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps a streaming assistant message collapsed as content and its saved ID arrive", async () => {
    let emit: ((event: ChatGenerationStreamEvent) => void) | undefined;
    let finish: (() => void) | undefined;
    vi.spyOn(chatService, "streamGenerateMessage").mockImplementation(
      (_id, _input, options) => {
        emit = options.onEvent;
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
    );
    const user = userEvent.setup();
    const { queryClient } = renderChat();
    await user.click(
      await screen.findByRole("button", { name: "Open First chat" }),
    );
    await screen.findByRole("button", { name: /^Collapse assistant message:/ });
    await waitFor(() =>
      expect(
        queryClient.getQueryData(chatSessionQueryKeys.messages(25, 10)),
      ).toEqual(firstMessages),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Message" }),
      "Another question",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(emit).toBeDefined());

    act(() => emit!({ event: "provider_switch", data: {
      fromProviderName: "Primary", toProviderName: "Backup", status: "retrying",
    } }));
    expect(screen.getByRole("status")).toHaveTextContent("Switching provider from Primary to Backup");
    act(() => emit!({ event: "provider_switch", data: {
      fromProviderName: "Primary", toProviderName: "Backup", status: "succeeded",
    } }));
    expect(screen.getByRole("status")).toHaveTextContent("Provider switched to Backup.");
    await user.click(screen.getByRole("button", { name: "Dismiss provider switch notice" }));
    expect(screen.queryByText("Provider switched to Backup.")).not.toBeInTheDocument();

    act(() => emit!({ event: "delta", data: { content: "Partial answer" } }));
    const streamingArticle = (
      await screen.findByText("Partial answer")
    ).closest("article")!;
    await user.click(
      within(streamingArticle).getByRole("button", {
        name: /^Collapse assistant message:/,
      }),
    );
    const collapsed = within(streamingArticle).getByRole("button", {
      name: /^Expand assistant message:/,
    });
    expect(collapsed).toHaveAttribute("aria-expanded", "false");

    act(() => emit!({ event: "delta", data: { content: " continues" } }));
    expect(
      await within(collapsed).findByText("Partial answer continues"),
    ).toBeVisible();
    expect(collapsed).toHaveAttribute("aria-expanded", "false");

    act(() =>
      emit!({
        event: "assistant_message",
        data: {
          id: 102,
          sessionId: 10,
          author: "ASSISTANT",
          content: "Final generated answer",
          createdAt: workspace.createdAt,
        },
      }),
    );
    const savedCollapsed = screen
      .getAllByText("Final generated answer")
      .find((element) => element.closest("button"))!
      .closest("button")!;
    expect(
      within(savedCollapsed).getByText("Final generated answer"),
    ).toBeVisible();
    expect(savedCollapsed).toHaveAttribute("aria-expanded", "false");
    await act(async () => finish?.());
  });
});
