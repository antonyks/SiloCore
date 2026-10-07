import { FrontendExtensionProvider } from "../src/extensions/FrontendExtensionProvider";
import { createFrontendExtensionRegistry } from "../src/extensions/registry";
import type { FrontendExtensionRegistry } from "../src/extensions/types";
import { WorkspaceRouteProvider } from "../src/features/workspace/components/WorkspaceRouteProvider";
import React, { type ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, type RenderOptions } from "@testing-library/react";

type RenderWithProvidersOptions = Omit<RenderOptions, "wrapper"> & {
  extensions?: FrontendExtensionRegistry;
  workspaceLayout?: boolean;
  fallbackRoutes?: boolean;
  initialEntries?: string[];
  routePath?: string;
};

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  {
    extensions = createFrontendExtensionRegistry(),
    workspaceLayout = false,
    fallbackRoutes = true,
    initialEntries = ["/"],
    routePath = "*",
    ...renderOptions
  }: RenderWithProvidersOptions = {},
) {
  const queryClient = createTestQueryClient();

  const result = render(
    <QueryClientProvider client={queryClient}>
      <FrontendExtensionProvider registry={extensions}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            {workspaceLayout ? (
              <Route path={routePath} element={<WorkspaceRouteProvider />}>
                <Route index element={ui} />
              </Route>
            ) : (
              <Route path={routePath} element={ui} />
            )}
            {fallbackRoutes && (
              <>
                <Route
                  path="/chat/home"
                  element={<div>Legacy chat route</div>}
                />
                <Route
                  path="/workspaces/:workspaceId/chat/home"
                  element={<div>Chat home route</div>}
                />
                <Route
                  path="/analytics/dashboard"
                  element={<div>Admin dashboard route</div>}
                />
              </>
            )}
          </Routes>
        </MemoryRouter>
      </FrontendExtensionProvider>
    </QueryClientProvider>,
    renderOptions,
  );

  return {
    ...result,
    queryClient,
  };
}
