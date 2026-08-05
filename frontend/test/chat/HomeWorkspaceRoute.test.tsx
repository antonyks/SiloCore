import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '../../src/features/chat/pages/Home';
import { API_BASE_URL, TOKEN_KEY, USER_KEY } from '../../src/config/constants';
import { renderWithProviders } from '../renderWithProviders';
import { server } from '../msw/server';

const personalWorkspace = {
  id: 25,
  name: 'Personal Workspace',
  type: 'PERSONAL',
  status: 'ACTIVE',
  ownerUserId: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const standardWorkspace = {
  ...personalWorkspace,
  id: 30,
  name: 'Project Workspace',
  type: 'STANDARD',
};

function seedAuthStorage() {
  localStorage.setItem(TOKEN_KEY, 'home-token');
  localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      id: '1',
      email: 'user@example.com',
      name: 'User',
      role: 'USER',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      personalWorkspace,
    }),
  );
}

describe('Home workspace route context', () => {
  it('validates an owned route workspace and scopes chat requests to it', async () => {
    seedAuthStorage();
    window.history.pushState({}, '', '/workspaces/30/chat/home');
    const workspaceHeaders: string[] = [];
    const chatHeaders: string[] = [];
    const modelHeaders: string[] = [];

    server.use(
      http.get(`${API_BASE_URL}/workspaces`, ({ request }) => {
        workspaceHeaders.push(request.headers.get('x-workspace-id') || '');
        return HttpResponse.json({ data: [personalWorkspace, standardWorkspace] });
      }),
      http.get(`${API_BASE_URL}/chat`, ({ request }) => {
        chatHeaders.push(request.headers.get('x-workspace-id') || '');
        return HttpResponse.json({ data: [] });
      }),
      http.get(`${API_BASE_URL}/llm/models`, ({ request }) => {
        modelHeaders.push(request.headers.get('x-workspace-id') || '');
        return HttpResponse.json({ data: { models: [], providers: [] } });
      }),
    );

    renderWithProviders(<Home />, {
      initialEntries: ['/workspaces/30/chat/home'],
      routePath: '/workspaces/:workspaceId/chat/home',
    });

    expect(await screen.findByText('Select a chat')).toBeInTheDocument();
    await waitFor(() => expect(chatHeaders).toContain('30'));
    await waitFor(() => expect(modelHeaders).toContain('30'));
    expect(workspaceHeaders).toContain('25');
    expect(localStorage.getItem('SiloCoreWorkspaceId')).toBeNull();
  });

  it('does not load models for an unowned route workspace before redirecting home', async () => {
    seedAuthStorage();
    window.history.pushState({}, '', '/workspaces/999/chat/home');
    const workspaceHeaders: string[] = [];
    const modelHeaders: string[] = [];

    server.use(
      http.get(`${API_BASE_URL}/workspaces`, ({ request }) => {
        workspaceHeaders.push(request.headers.get('x-workspace-id') || '');
        return HttpResponse.json({ data: [personalWorkspace, standardWorkspace] });
      }),
      http.get(`${API_BASE_URL}/chat`, () => HttpResponse.json({ data: [] })),
      http.get(`${API_BASE_URL}/llm/models`, ({ request }) => {
        modelHeaders.push(request.headers.get('x-workspace-id') || '');
        return HttpResponse.json({ data: { models: [], providers: [] } });
      }),
    );

    renderWithProviders(<Home />, {
      initialEntries: ['/workspaces/999/chat/home'],
      routePath: '/workspaces/:workspaceId/chat/home',
    });

    expect(await screen.findByText('Select a chat')).toBeInTheDocument();
    await waitFor(() => expect(modelHeaders).toContain('25'));
    expect(workspaceHeaders).toContain('25');
    expect(modelHeaders).not.toContain('999');
  });

  it('switches owned workspaces from the sidebar without storing selection', async () => {
    seedAuthStorage();
    window.history.pushState({}, '', '/workspaces/25/chat/home');

    server.use(
      http.get(`${API_BASE_URL}/workspaces`, () =>
        HttpResponse.json({ data: [personalWorkspace, standardWorkspace] }),
      ),
      http.get(`${API_BASE_URL}/chat`, () => HttpResponse.json({ data: [] })),
      http.get(`${API_BASE_URL}/llm/models`, () =>
        HttpResponse.json({ data: { models: [], providers: [] } }),
      ),
    );

    renderWithProviders(<Home />, {
      initialEntries: ['/workspaces/25/chat/home'],
      routePath: '/workspaces/:workspaceId/chat/home',
    });

    await screen.findByRole('button', { name: /Personal Workspace/i });
    await userEvent.click(screen.getByRole('button', { name: /Personal Workspace/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Project Workspace/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Project Workspace/i })).toBeInTheDocument(),
    );
    expect(localStorage.getItem('SiloCoreWorkspaceId')).toBeNull();
  });

  it('creates a standard workspace and navigates to it', async () => {
    seedAuthStorage();
    window.history.pushState({}, '', '/workspaces/25/chat/home');
    const workspaces = [personalWorkspace, standardWorkspace];

    server.use(
      http.get(`${API_BASE_URL}/workspaces`, () => HttpResponse.json({ data: workspaces })),
      http.post(`${API_BASE_URL}/workspaces`, async ({ request }) => {
        expect(await request.json()).toEqual({ name: 'Research' });
        return HttpResponse.json(
          {
            data: {
              ...personalWorkspace,
              id: 31,
              name: 'Research',
              type: 'STANDARD',
            },
          },
          { status: 201 },
        );
      }),
      http.get(`${API_BASE_URL}/chat`, () => HttpResponse.json({ data: [] })),
      http.get(`${API_BASE_URL}/llm/models`, () =>
        HttpResponse.json({ data: { models: [], providers: [] } }),
      ),
    );

    renderWithProviders(<Home />, {
      initialEntries: ['/workspaces/25/chat/home'],
      routePath: '/workspaces/:workspaceId/chat/home',
    });

    await screen.findByRole('button', { name: /Personal Workspace/i });
    await userEvent.click(screen.getByRole('button', { name: /Personal Workspace/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Create New Workspace/i }));
    await userEvent.type(screen.getByLabelText(/Workspace name/i), 'Research');
    await userEvent.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Research/i })).toBeInTheDocument(),
    );
    expect(localStorage.getItem('SiloCoreWorkspaceId')).toBeNull();
  });

  it('renames and deletes standard workspaces while personal workspace stays protected', async () => {
    seedAuthStorage();
    window.history.pushState({}, '', '/workspaces/30/chat/home');
    let workspaces = [personalWorkspace, standardWorkspace];

    server.use(
      http.get(`${API_BASE_URL}/workspaces`, () => HttpResponse.json({ data: workspaces })),
      http.put(`${API_BASE_URL}/workspaces/30`, async ({ request }) => {
        expect(await request.json()).toEqual({ name: 'Renamed Workspace' });
        workspaces = workspaces.map((workspace) =>
          workspace.id === 30 ? { ...workspace, name: 'Renamed Workspace' } : workspace,
        );
        return HttpResponse.json({ data: workspaces.find((workspace) => workspace.id === 30) });
      }),
      http.delete(`${API_BASE_URL}/workspaces/30`, () => {
        workspaces = workspaces.map((workspace) =>
          workspace.id === 30 ? { ...workspace, status: 'DELETED' } : workspace,
        );
        return HttpResponse.json({ data: workspaces.find((workspace) => workspace.id === 30) });
      }),
      http.get(`${API_BASE_URL}/chat`, () => HttpResponse.json({ data: [] })),
      http.get(`${API_BASE_URL}/llm/models`, () =>
        HttpResponse.json({ data: { models: [], providers: [] } }),
      ),
    );

    renderWithProviders(<Home />, {
      initialEntries: ['/workspaces/30/chat/home'],
      routePath: '/workspaces/:workspaceId/chat/home',
    });

    await screen.findByText('Select a chat');
    await userEvent.click(screen.getByRole('button', { name: 'Workspace settings' }));
    const nameInput = screen.getByLabelText(/Workspace name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Renamed Workspace');
    await userEvent.click(screen.getByRole('button', { name: /Save/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Renamed Workspace/i })).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Workspace settings' }));
    await userEvent.click(screen.getByRole('button', { name: /Delete/i }));
    await userEvent.click(screen.getAllByRole('button', { name: /Delete/i }).at(-1)!);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Personal Workspace/i })).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Workspace settings' }));
    expect(screen.getByText(/Personal workspaces cannot be renamed or deleted/i)).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog')).queryByRole('button', { name: /Delete/i }),
    ).not.toBeInTheDocument();
  });

  it('keeps New Chat inside the workspace sidebar instead of the app header', async () => {
    seedAuthStorage();
    window.history.pushState({}, '', '/workspaces/25/chat/home');

    server.use(
      http.get(`${API_BASE_URL}/workspaces`, () =>
        HttpResponse.json({ data: [personalWorkspace, standardWorkspace] }),
      ),
      http.get(`${API_BASE_URL}/chat`, () => HttpResponse.json({ data: [] })),
      http.get(`${API_BASE_URL}/llm/models`, () =>
        HttpResponse.json({ data: { models: [], providers: [] } }),
      ),
    );

    renderWithProviders(<Home />, {
      initialEntries: ['/workspaces/25/chat/home'],
      routePath: '/workspaces/:workspaceId/chat/home',
    });

    await screen.findByText('Select a chat');
    const header = screen.getByRole('banner');
    expect(within(header).queryByRole('button', { name: /New Chat/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /New Chat/i }).length).toBeGreaterThan(0);
  });
});
