import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import axiosClient from '../../src/lib/axiosClient';
import { API_BASE_URL, TOKEN_KEY, USER_KEY } from '../../src/config/constants';
import { server } from '../msw/server';

describe('axiosClient', () => {
  it('sends bearer auth and the personal workspace header for authenticated requests', async () => {
    localStorage.setItem(TOKEN_KEY, 'axios-token');
    localStorage.setItem(
      USER_KEY,
      JSON.stringify({
        id: '1',
        email: 'user@example.com',
        name: 'User',
        role: 'USER',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        personalWorkspace: {
          id: 25,
          name: 'Personal Workspace',
          type: 'PERSONAL',
          status: 'ACTIVE',
        },
      }),
    );

    server.use(
      http.get(`${API_BASE_URL}/llm/models`, ({ request }) =>
        HttpResponse.json({
          authorization: request.headers.get('authorization'),
          workspaceId: request.headers.get('x-workspace-id'),
        }),
      ),
    );

    const { data } = await axiosClient.get('/llm/models');

    expect(data).toEqual({
      authorization: 'Bearer axios-token',
      workspaceId: '25',
    });
    expect(localStorage.getItem('SiloCoreWorkspaceId')).toBeNull();
  });
});
