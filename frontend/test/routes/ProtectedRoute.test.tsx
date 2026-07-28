import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../../src/routes/ProtectedRoute';
import { USER_KEY } from '../../src/config/constants';
import { UserRole, type User } from '../../src/types/user';

const createUser = (role: UserRole): User => ({
  id: '1',
  email: `${role.toLowerCase()}@example.com`,
  name: `${role} User`,
  role,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const renderProtectedRoute = (initialPath: string, allowedRoles: UserRole[]) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<ProtectedRoute allowedRoles={allowedRoles} />}>
            <Route path={initialPath} element={<div>Protected route</div>} />
          </Route>
          <Route path="/login" element={<div>Login route</div>} />
          <Route path="/chat/home" element={<div>Chat home route</div>} />
          <Route path="/analytics/dashboard" element={<div>Admin dashboard route</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('ProtectedRoute', () => {
  it('redirects unauthenticated users to login', async () => {
    renderProtectedRoute('/chat/home', [UserRole.USER]);

    expect(await screen.findByText('Login route')).toBeInTheDocument();
  });

  it('redirects authenticated users away from routes for other roles', async () => {
    localStorage.setItem(USER_KEY, JSON.stringify(createUser(UserRole.USER)));

    renderProtectedRoute('/analytics/dashboard', [UserRole.ADMIN]);

    expect(await screen.findByText('Chat home route')).toBeInTheDocument();
  });
});
