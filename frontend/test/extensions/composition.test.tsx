import { useState } from "react";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import AppRoutes from "../../src/routes/AppRoutes";
import { createFrontendExtensionRegistry } from "../../src/extensions/registry";
import type {
  FrontendExtensionDefinition,
  WorkspacePageProps,
} from "../../src/extensions/types";
import { API_BASE_URL, TOKEN_KEY, USER_KEY } from "../../src/config/constants";
import { renderWithProviders } from "../renderWithProviders";
import { server } from "../msw/server";
import type { Workspace } from "../../src/features/workspace/types";

const personal: Workspace = {
  id: 25,
  name: "Personal Workspace",
  type: "PERSONAL",
  status: "ACTIVE",
  ownerUserId: 1,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};
const standard: Workspace = {
  ...personal,
  id: 30,
  name: "Project Workspace",
  type: "STANDARD",
};
function seed(role: "USER" | "ADMIN" = "USER") {
  localStorage.setItem(TOKEN_KEY, "test-token");
  localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      id: "1",
      email: "user@example.com",
      name: "User",
      role,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      personalWorkspace: personal,
    }),
  );
}
function installApi() {
  server.use(
    http.get(`${API_BASE_URL}/workspaces`, () =>
      HttpResponse.json({ data: [personal, standard] }),
    ),
    http.get(`${API_BASE_URL}/chat`, () => HttpResponse.json({ data: [] })),
    http.get(`${API_BASE_URL}/llm/models`, () =>
      HttpResponse.json({ data: { models: [], providers: [] } }),
    ),
    http.get(`${API_BASE_URL}/admin/system/status`, () =>
      HttpResponse.json({
        data: {
          backend: { status: "online" },
          database: { status: "online" },
          inference: { status: "offline" },
        },
      }),
    ),
    http.get(`${API_BASE_URL}/admin/analytics/summary`, () =>
      HttpResponse.json({ data: {} }),
    ),
    http.get(`${API_BASE_URL}/admin/llm/providers`, () =>
      HttpResponse.json({ data: [] }),
    ),
    http.get(`${API_BASE_URL}/users`, () => HttpResponse.json({ data: [] })),
  );
}
function workspaceDefinition(): FrontendExtensionDefinition {
  return {
    id: "sample",
    capabilities: { visible: true },
    routes: [
      {
        id: "page",
        scope: "workspace",
        path: "overview",
        title: "Sample page",
        requiredCapability: "visible",
        component: ({ user, workspace }) => (
          <div>
            Context {user.id}/{workspace.id}
          </div>
        ),
      },
    ],
    navigation: [{ id: "nav", routeId: "page", label: "Sample navigation" }],
    workspaceSlots: [
      {
        id: "switcher",
        slot: "switcher-footer",
        requiredCapability: "visible",
        component: ({ workspace, ownedWorkspaces }) => (
          <div>
            Switcher {workspace.id}/{ownedWorkspaces.length}
          </div>
        ),
      },
      {
        id: "settings",
        slot: "settings-footer",
        requiredCapability: "visible",
        component: ({ workspace }) => <div>Settings {workspace.id}</div>,
      },
    ],
  };
}
function mount(path: string, definition = workspaceDefinition()) {
  const registry = createFrontendExtensionRegistry();
  registry.register(definition);
  window.history.replaceState({}, "", path);
  renderWithProviders(<AppRoutes />, {
    initialEntries: [path],
    extensions: registry,
    fallbackRoutes: false,
  });
  return registry;
}
describe("frontend extension composition", () => {
  it("requires authentication before mounting a direct extension page", async () => {
    const component = vi.fn(() => <div>Must not mount</div>);
    mount("/workspaces/30/extensions/sample/overview", {
      ...workspaceDefinition(),
      routes: [
        {
          id: "page",
          scope: "workspace",
          path: "overview",
          title: "Sample",
          component,
        },
      ],
    });
    expect(
      await screen.findByRole("button", { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(component).not.toHaveBeenCalled();
  });
  it("preserves USER protection on admin extension pages", async () => {
    seed();
    installApi();
    const component = vi.fn(() => <div>Must not mount</div>);
    mount("/admin/extensions/sample/overview", {
      id: "sample",
      routes: [
        {
          id: "page",
          scope: "admin",
          path: "overview",
          title: "Sample",
          component,
        },
      ],
    });
    expect(await screen.findByText("Select a chat")).toBeInTheDocument();
    expect(component).not.toHaveBeenCalled();
  });
  it("preserves ADMIN protection on workspace extension pages", async () => {
    seed("ADMIN");
    installApi();
    server.use(
      http.get(`${API_BASE_URL}/admin/analytics/summary`, () =>
        HttpResponse.json({ message: "Temporary failure" }, { status: 503 }),
      ),
    );
    const component = vi.fn(() => <div>Must not mount</div>);
    mount("/workspaces/30/extensions/sample/overview", {
      ...workspaceDefinition(),
      routes: [
        {
          id: "page",
          scope: "workspace",
          path: "overview",
          title: "Sample",
          component,
        },
      ],
    });
    expect(
      await screen.findByRole("heading", { name: "Dashboard / Stats" }),
    ).toBeInTheDocument();
    expect(component).not.toHaveBeenCalled();
  });
  it("disables slots independently while retaining unflagged pages and Core controls", async () => {
    seed();
    installApi();
    const definition = workspaceDefinition();
    definition.routes = [
      { ...definition.routes![0], requiredCapability: undefined },
    ];
    const registry = mount(
      "/workspaces/30/extensions/sample/overview",
      definition,
    );
    await screen.findByText("Context 1/30");
    await userEvent.click(
      screen.getByRole("button", { name: /Project Workspace/ }),
    );
    await screen.findByText("Switcher 30/2");
    act(() => registry.update({ ...definition, capabilities: {} }));
    expect(screen.queryByText("Switcher 30/2")).not.toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Create New Workspace" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Context 1/30")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Workspace settings" }),
    );
    expect(screen.queryByText("Settings 30")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
  it("updates route paths and stops rendering the previous direct URL", async () => {
    seed();
    installApi();
    const registry = mount("/workspaces/30/extensions/sample/overview");
    await screen.findByText("Context 1/30");
    const definition = workspaceDefinition();
    act(() =>
      registry.update({
        ...definition,
        routes: [
          {
            ...definition.routes![0],
            path: "replacement",
            title: "Replacement page",
          },
        ],
      }),
    );
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
    act(() => registry.update(definition));
    expect(await screen.findByText("Context 1/30")).toBeInTheDocument();
  });
  it("validates workspace context, bootstraps through PERSONAL and preserves URL request headers", async () => {
    seed();
    installApi();
    let resolve!: () => void;
    const gate = new Promise<void>((done) => {
      resolve = done;
    });
    const headers: string[] = [];
    server.use(
      http.get(`${API_BASE_URL}/workspaces`, async ({ request }) => {
        headers.push(request.headers.get("x-workspace-id") || "");
        await gate;
        return HttpResponse.json({ data: [personal, standard] });
      }),
    );
    const component = vi.fn(({ user, workspace }: WorkspacePageProps) => (
      <div>
        Context {user.id}/{workspace.id}
      </div>
    ));
    const definition = workspaceDefinition();
    mount("/workspaces/30/extensions/sample/overview", {
      ...definition,
      routes: [{ ...definition.routes![0], scope: "workspace", component }],
    });
    expect(await screen.findByText("Loading workspace...")).toBeInTheDocument();
    expect(component).not.toHaveBeenCalled();
    resolve();
    expect(await screen.findByText("Context 1/30")).toBeInTheDocument();
    expect(headers).toEqual(["25"]);
    // axios route parsing also covers extensions; issue an actual request from the page context.
    const { workspaceService } =
      await import("../../src/features/workspace/services/workspaceService");
    server.use(
      http.get(`${API_BASE_URL}/workspaces/current`, ({ request }) => {
        expect(request.headers.get("x-workspace-id")).toBe("30");
        return HttpResponse.json({ data: standard });
      }),
    );
    await workspaceService.getCurrentWorkspace();
    expect(localStorage.getItem("SiloCoreWorkspaceId")).toBeNull();
  });
  it("updates navigation and both slots reactively and removes direct route rendering", async () => {
    seed();
    installApi();
    const registry = mount("/workspaces/30/extensions/sample/overview");
    await screen.findByText("Context 1/30");
    expect(
      screen.getByRole("link", { name: "Sample navigation" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /Project Workspace/ }),
    );
    expect(screen.getByText("Switcher 30/2")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Workspace settings" }),
    );
    expect(screen.getByText("Settings 30")).toBeInTheDocument();
    act(() =>
      registry.update({
        ...workspaceDefinition(),
        capabilities: { visible: false },
      }),
    );
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
    expect(screen.queryByText("Settings 30")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Sample navigation" }),
    ).not.toBeInTheDocument();
    act(() => registry.update(workspaceDefinition()));
    expect(await screen.findByText("Context 1/30")).toBeInTheDocument();
    act(() => registry.unregister("sample"));
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
    expect(screen.queryByText("Context 1/30")).not.toBeInTheDocument();
  });
  it("keeps PERSONAL settings readonly while rendering settings slots only in the normal view", async () => {
    seed();
    installApi();
    mount("/workspaces/25/extensions/sample/overview");
    await screen.findByText("Context 1/25");
    await userEvent.click(
      screen.getByRole("button", { name: "Workspace settings" }),
    );
    expect(
      screen.getByText("Personal workspaces cannot be renamed or deleted."),
    ).toBeInTheDocument();
    expect(screen.getByText("Settings 25")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.click(
      screen.getByRole("button", { name: /Personal Workspace/ }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Create New Workspace" }),
    );
    expect(screen.queryByText("Settings 25")).not.toBeInTheDocument();
  });
  it("never mounts disabled contributions when a required capability is missing", async () => {
    seed();
    installApi();
    const component = vi.fn(() => <div>Must not mount</div>);
    mount("/workspaces/30/extensions/sample/overview", {
      ...workspaceDefinition(),
      capabilities: {},
      routes: [
        {
          id: "page",
          scope: "workspace",
          path: "overview",
          title: "Sample",
          requiredCapability: "visible",
          component,
        },
      ],
    });
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
    expect(component).not.toHaveBeenCalled();
  });
  it.each(["999", "invalid", "0", "9007199254740992"])(
    "redirects invalid or inaccessible workspace %s without mounting",
    async (id) => {
      seed();
      installApi();
      const component = vi.fn(() => <div>Must not mount</div>);
      mount(`/workspaces/${id}/extensions/sample/overview`, {
        ...workspaceDefinition(),
        routes: [
          {
            id: "page",
            scope: "workspace",
            path: "overview",
            title: "Sample",
            component,
          },
        ],
      });
      expect(await screen.findByText("Select a chat")).toBeInTheDocument();
      expect(component).not.toHaveBeenCalled();
    },
  );
  it("resets extension component state when moving between validated workspaces", async () => {
    seed();
    installApi();
    function Page({ workspace }: WorkspacePageProps) {
      const [count, setCount] = useState(0);
      return (
        <>
          <button onClick={() => setCount(count + 1)}>
            Count {workspace.id}/{count}
          </button>
          <Link to="/workspaces/25/extensions/sample/overview">
            Other context
          </Link>
        </>
      );
    }
    mount("/workspaces/30/extensions/sample/overview", {
      ...workspaceDefinition(),
      routes: [
        {
          id: "page",
          scope: "workspace",
          path: "overview",
          title: "Sample",
          component: Page,
        },
      ],
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Count 30/0" }),
    );
    expect(
      screen.getByRole("button", { name: "Count 30/1" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Other context" }));
    expect(
      await screen.findByRole("button", { name: "Count 25/0" }),
    ).toBeInTheDocument();
  });
  it("adds admin navigation in both layouts and uses route titles for breadcrumbs", async () => {
    seed("ADMIN");
    installApi();
    const definition: FrontendExtensionDefinition = {
      id: "sample",
      capabilities: { visible: true },
      routes: [
        {
          id: "page",
          scope: "admin",
          path: "overview",
          title: "Sample title",
          requiredCapability: "visible",
          component: ({ user }) => <div>Admin context {user.role}</div>,
        },
      ],
      navigation: [{ id: "nav", routeId: "page", label: "Sample navigation" }],
    };
    const registry = mount("/admin/extensions/sample/overview", definition);
    expect(await screen.findByText("Admin context ADMIN")).toBeInTheDocument();
    expect(
      within(
        screen.getByRole("navigation", { name: "Admin navigation" }),
      ).getByRole("link", { name: "Sample navigation" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Sample navigation" }),
    ).toHaveLength(2);
    expect(
      screen.getByRole("heading", { name: "Sample title" }),
    ).toBeInTheDocument();
    act(() =>
      registry.update({ ...definition, capabilities: { visible: false } }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Admin context ADMIN")).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("link", { name: "Sample navigation" }),
    ).not.toBeInTheDocument();
    act(() => registry.unregister("sample"));
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
  });
});
