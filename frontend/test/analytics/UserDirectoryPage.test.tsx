import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import UserDirectoryPage from '../../src/features/analytics/pages/UserDirectoryPage';
import UserAccessPage from '../../src/features/analytics/pages/UserAccessPage';
import { API_BASE_URL } from '../../src/config/constants';
import { renderWithProviders } from '../renderWithProviders';
import { server } from '../msw/server';

const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});

afterAll(() => {
  HTMLDialogElement.prototype.showModal = originalShowModal;
  HTMLDialogElement.prototype.close = originalClose;
});

const existingUser = {
  id: 1,
  name: 'Existing User',
  email: 'existing@example.com',
  role: 'USER',
  status: 'ACTIVE',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function registerUserReads(users = [existingUser]) {
  server.use(
    http.get(`${API_BASE_URL}/users`, () => HttpResponse.json({ data: users })),
    http.get(`${API_BASE_URL}/users/:id`, ({ params }) => {
      const user = users.find((entry) => entry.id === Number(params.id));
      return user
        ? HttpResponse.json({ data: user })
        : HttpResponse.json({ message: 'Not found' }, { status: 404 });
    }),
  );
}

describe('UserDirectoryPage dialogs', () => {
  it('validates creation, places Cancel beside Save, and opens View after saving', async () => {
    const createdUser = { ...existingUser, id: 2, name: 'New User', email: 'new@example.com' };
    registerUserReads([existingUser, createdUser]);
    server.use(
      http.post(`${API_BASE_URL}/users`, () => HttpResponse.json({ data: createdUser })),
    );
    renderWithProviders(<UserDirectoryPage />, { initialEntries: ['/admin/users'] });

    const addButton = screen.getByRole('button', { name: 'Add User' });
    await userEvent.click(addButton);
    const dialog = screen.getByRole('dialog', { name: 'Add user' });
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: 'Close dialog' })).toBeInTheDocument();
    const cancelButton = within(dialog).getByRole('button', { name: 'Cancel' });
    const saveButton = within(dialog).getByRole('button', { name: 'Save User' });
    expect(cancelButton.parentElement).toBe(saveButton.parentElement);
    await userEvent.click(saveButton);
    expect(within(dialog).getByText('Name is required')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByRole('textbox', { name: /^Name/ }), 'New User');
    await userEvent.type(within(dialog).getByRole('textbox', { name: /^Email/ }), 'new@example.com');
    await userEvent.type(within(dialog).getByLabelText(/^Initial Password/), 'secure-password');
    await userEvent.click(saveButton);

    const viewDialog = await screen.findByRole('dialog', { name: 'User detail' });
    expect(within(viewDialog).getByRole('heading', { name: 'User Detail' })).toHaveFocus();
    expect(await within(viewDialog).findByText('New User')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('New User was created.');
    await userEvent.click(within(viewDialog).getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(addButton).toHaveFocus();
  });

  it('keeps edit errors in the dialog and restores focus on Cancel and Close', async () => {
    registerUserReads();
    server.use(
      http.put(`${API_BASE_URL}/users/1`, () =>
        HttpResponse.json({ message: 'Update failed' }, { status: 500 }),
      ),
    );
    renderWithProviders(<UserDirectoryPage />, { initialEntries: ['/admin/users'] });

    const editButton = await screen.findByRole('button', { name: 'Edit' });
    await userEvent.click(editButton);
    let dialog = screen.getByRole('dialog', { name: 'Edit user Existing User' });
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('Existing User');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(editButton).toHaveFocus();

    await userEvent.click(editButton);
    dialog = screen.getByRole('dialog', { name: 'Edit user Existing User' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save User' }));
    expect(await within(dialog).findByText('Update failed')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(editButton).toHaveFocus();
  });

  it('closes Edit and shows a success message without opening View', async () => {
    registerUserReads();
    server.use(
      http.put(`${API_BASE_URL}/users/1`, () =>
        HttpResponse.json({ data: { ...existingUser, email: 'updated@example.com' } }),
      ),
    );
    renderWithProviders(<UserDirectoryPage />, { initialEntries: ['/admin/users'] });

    const editButton = await screen.findByRole('button', { name: 'Edit' });
    await userEvent.click(editButton);
    const dialog = screen.getByRole('dialog', { name: 'Edit user Existing User' });
    const emailInput = within(dialog).getByRole('textbox', { name: 'Email' });
    await userEvent.clear(emailInput);
    await userEvent.type(emailInput, 'updated@example.com');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save User' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Existing User was updated.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(editButton).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notice' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows user details and retains retry behavior in View', async () => {
    registerUserReads();
    let failDetailRequest = true;
    server.use(
      http.get(`${API_BASE_URL}/users/1`, () =>
        failDetailRequest
          ? HttpResponse.json({ message: 'Detail unavailable' }, { status: 500 })
          : HttpResponse.json({ data: existingUser }),
      ),
    );
    renderWithProviders(<UserDirectoryPage />, { initialEntries: ['/admin/users'] });

    const viewButton = await screen.findByRole('button', { name: 'View' });
    await userEvent.click(viewButton);
    const dialog = screen.getByRole('dialog', { name: 'User detail' });
    expect(await within(dialog).findByText('Detail unavailable')).toBeInTheDocument();
    failDetailRequest = false;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));
    expect(await within(dialog).findByText('existing@example.com')).toBeInTheDocument();
    expect(within(dialog).getByText('Active')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close dialog' }));
    expect(viewButton).toHaveFocus();
  });
});

describe.each([
  ['User Directory', <UserDirectoryPage />],
  ['Access & Bans', <UserAccessPage />],
])('%s search', (_pageName, page) => {
  it('sends one name or email term and clears it on Reset', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(`${API_BASE_URL}/users`, ({ request }) => {
        requests.push(new URL(request.url));
        return HttpResponse.json({ data: [] });
      }),
    );
    renderWithProviders(page, { initialEntries: ['/admin/users'] });

    const searchInput = screen.getByRole('textbox', { name: 'Search Name or Email' });
    expect(searchInput).toHaveAttribute('placeholder', 'Search by name or email');
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].searchParams.get('skip')).toBe('0');
    expect(requests[0].searchParams.get('take')).toBe('11');

    await userEvent.type(searchInput, '  Alice@Example.com  ');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1].searchParams.get('search')).toBe('Alice@Example.com');
    expect(requests[1].searchParams.has('name')).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2].searchParams.has('search')).toBe(false);
    expect(searchInput).toHaveValue('');
  });
});
