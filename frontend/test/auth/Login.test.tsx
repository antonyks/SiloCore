import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../../src/features/auth/pages/Login';
import { API_BASE_URL, TOKEN_KEY, USER_KEY } from '../../src/config/constants';
import { UserRole } from '../../src/types/user';
import { renderWithProviders } from '../renderWithProviders';
import { server } from '../msw/server';

const user = {
  id: '7',
  email: 'user@example.com',
  name: 'Test User',
  role: UserRole.USER,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('Login', () => {
  it('stores auth data and navigates by role after a mocked API login', async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/login`, async ({ request }) => {
        const body = await request.json();

        expect(body).toEqual({
          email: 'user@example.com',
          password: 'User123!',
        });

        return HttpResponse.json({
          message: 'Login successful',
          data: {
            token: 'test-token',
            user,
          },
        });
      }),
    );

    renderWithProviders(<Login />, {
      initialEntries: ['/login'],
      routePath: '/login',
    });

    await userEvent.type(screen.getByPlaceholderText('Email address'), 'user@example.com');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'User123!');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Chat home route')).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_KEY)).toBe('test-token');
    expect(JSON.parse(localStorage.getItem(USER_KEY) ?? '{}')).toEqual(user);
  });

  it('shows the server error and does not store auth data when login fails', async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/login`, () =>
        HttpResponse.json({ message: 'Invalid credentials' }, { status: 401 }),
      ),
    );

    renderWithProviders(<Login />, {
      initialEntries: ['/login'],
      routePath: '/login',
    });

    await userEvent.type(screen.getByPlaceholderText('Email address'), 'user@example.com');
    await userEvent.type(screen.getByPlaceholderText('Password'), 'Wrong123!');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USER_KEY)).toBeNull();
  });
});
