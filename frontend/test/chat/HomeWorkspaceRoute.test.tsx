import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
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
});
