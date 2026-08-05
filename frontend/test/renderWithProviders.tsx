import React, { type ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, type RenderOptions } from '@testing-library/react';

type RenderWithProvidersOptions = Omit<RenderOptions, 'wrapper'> & {
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
    initialEntries = ['/'],
    routePath = '*',
    ...renderOptions
  }: RenderWithProvidersOptions = {},
) {
  const queryClient = createTestQueryClient();

  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path={routePath} element={ui} />
          <Route path="/chat/home" element={<div>Legacy chat route</div>} />
          <Route path="/workspaces/:workspaceId/chat/home" element={<div>Chat home route</div>} />
          <Route path="/analytics/dashboard" element={<div>Admin dashboard route</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
    renderOptions,
  );

  return {
    ...result,
    queryClient,
  };
}
