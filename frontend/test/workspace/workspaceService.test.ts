import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { API_BASE_URL, TOKEN_KEY, USER_KEY } from '../../src/config/constants';
import { workspaceService } from '../../src/features/workspace/services/workspaceService';
import { server } from '../msw/server';

const workspace = {
  id: 25,
  name: 'Personal Workspace',
  type: 'PERSONAL',
  status: 'ACTIVE',
  ownerUserId: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function seedAuthStorage() {
  localStorage.setItem(TOKEN_KEY, 'workspace-token');
  localStorage.setItem(
    USER_KEY,
    JSON.stringify({
      id: '1',
      email: 'user@example.com',
      name: 'User',
      role: 'USER',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      personalWorkspace: workspace,
    }),
  );
}

describe('workspaceService', () => {
  it('lists workspaces with authenticated workspace context headers', async () => {
    seedAuthStorage();

    server.use(
      http.get(`${API_BASE_URL}/workspaces`, ({ request }) => {
        expect(request.headers.get('authorization')).toBe('Bearer workspace-token');
        expect(request.headers.get('x-workspace-id')).toBe('25');

        return HttpResponse.json({ data: [workspace] });
      }),
    );

    await expect(workspaceService.listWorkspaces()).resolves.toEqual([workspace]);
  });

  it('creates, reads current, updates, and deletes workspaces', async () => {
    seedAuthStorage();

    server.use(
      http.post(`${API_BASE_URL}/workspaces`, async ({ request }) => {
        expect(await request.json()).toEqual({ name: 'Project Workspace' });

        return HttpResponse.json(
          { data: { ...workspace, id: 26, name: 'Project Workspace', type: 'STANDARD' } },
          { status: 201 },
        );
      }),
      http.get(`${API_BASE_URL}/workspaces/current`, () =>
        HttpResponse.json({ data: workspace }),
      ),
      http.put(`${API_BASE_URL}/workspaces/26`, async ({ request }) => {
        expect(await request.json()).toEqual({ name: 'Renamed Workspace' });

        return HttpResponse.json({
          data: { ...workspace, id: 26, name: 'Renamed Workspace', type: 'STANDARD' },
        });
      }),
      http.delete(`${API_BASE_URL}/workspaces/26`, () =>
        HttpResponse.json({
          data: { ...workspace, id: 26, type: 'STANDARD', status: 'DELETED' },
        }),
      ),
    );

    await expect(
      workspaceService.createWorkspace({ name: 'Project Workspace' }),
    ).resolves.toMatchObject({ id: 26, name: 'Project Workspace' });
    await expect(workspaceService.getCurrentWorkspace()).resolves.toEqual(workspace);
    await expect(
      workspaceService.updateWorkspace(26, { name: 'Renamed Workspace' }),
    ).resolves.toMatchObject({ id: 26, name: 'Renamed Workspace' });
    await expect(workspaceService.deleteWorkspace(26)).resolves.toMatchObject({
      id: 26,
      status: 'DELETED',
    });
  });
});
