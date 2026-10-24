import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

const users = [
  {
    id: 1,
    name: 'Active User',
    email: 'active@example.com',
    role: 'USER',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: 'Banned User',
    email: 'banned@example.com',
    role: 'USER',
    status: 'BANNED',
    createdAt: '2026-01-02T00:00:00.000Z',
  },
];

function registerUsers() {
  server.use(http.get(`${API_BASE_URL}/users`, () => HttpResponse.json({ data: users })));
}

describe('UserAccessPage confirmations', () => {
  it('requires confirmation before Ban and cancels without a request', async () => {
    registerUsers();
    let banCalls = 0;
    server.use(http.post(`${API_BASE_URL}/users/ban/1`, () => {
      banCalls += 1;
      return HttpResponse.json({ data: users[0] });
    }));
    renderWithProviders(<UserAccessPage />, { initialEntries: ['/admin/users/access'] });

    const banButton = await screen.findByRole('button', { name: 'Ban' });
    await userEvent.click(banButton);
    let dialog = screen.getByRole('dialog', { name: 'Ban user Active User' });
    expect(within(dialog).getByText(/active@example.com/)).toBeInTheDocument();
    expect(within(dialog).getByText('This user will lose access until reactivated.')).toBeInTheDocument();
    expect(banCalls).toBe(0);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(banButton).toHaveFocus();
    expect(banCalls).toBe(0);

    await userEvent.click(banButton);
    dialog = screen.getByRole('dialog', { name: 'Ban user Active User' });
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(banCalls).toBe(0);

    await userEvent.click(banButton);
    dialog = screen.getByRole('dialog', { name: 'Ban user Active User' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(banCalls).toBe(0);
  });

  it('submits Ban once and prevents dismissal while the request is pending', async () => {
    registerUsers();
    let banCalls = 0;
    let finishRequest: (() => void) | undefined;
    server.use(http.post(`${API_BASE_URL}/users/ban/1`, async () => {
      banCalls += 1;
      await new Promise<void>((resolve) => { finishRequest = resolve; });
      return HttpResponse.json({ data: users[0] });
    }));
    renderWithProviders(<UserAccessPage />, { initialEntries: ['/admin/users/access'] });

    const banButton = await screen.findByRole('button', { name: 'Ban' });
    await userEvent.click(banButton);
    const dialog = screen.getByRole('dialog', { name: 'Ban user Active User' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm Ban' }));
    await waitFor(() => expect(banCalls).toBe(1));
    expect(within(dialog).getByRole('button', { name: 'Banning...' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Close dialog' })).toBeDisabled();
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(dialog).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Banning...' }));
    expect(banCalls).toBe(1);

    finishRequest?.();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('User was banned.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveFocus();
  });

  it('requires confirmation to reactivate and keeps failures available for retry', async () => {
    registerUsers();
    let activationCalls = 0;
    server.use(http.post(`${API_BASE_URL}/users/activate/2`, () => {
      activationCalls += 1;
      return activationCalls === 1
        ? HttpResponse.json({ message: 'Activation failed' }, { status: 500 })
        : HttpResponse.json({ data: users[1] });
    }));
    renderWithProviders(<UserAccessPage />, { initialEntries: ['/admin/users/access'] });

    const activateButton = await screen.findByRole('button', { name: 'Activate' });
    await userEvent.click(activateButton);
    const dialog = screen.getByRole('dialog', { name: 'Activate user Banned User' });
    expect(within(dialog).getByText(/banned@example.com/)).toBeInTheDocument();
    expect(within(dialog).getByText('This user will regain access.')).toBeInTheDocument();
    expect(activationCalls).toBe(0);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm Reactivate' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Activation failed');
    expect(activationCalls).toBe(1);
    expect(within(dialog).getByRole('button', { name: 'Confirm Reactivate' })).toBeEnabled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm Reactivate' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(activationCalls).toBe(2);
    expect(screen.getByText('User was reactivated.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveFocus();
  });

  it('requires Delete confirmation and cancels without a request', async () => {
    registerUsers();
    let deleteCalls = 0;
    server.use(http.delete(`${API_BASE_URL}/users/1`, () => {
      deleteCalls += 1;
      return HttpResponse.json({ data: users[0] });
    }));
    renderWithProviders(<UserAccessPage />, { initialEntries: ['/admin/users/access'] });

    const row = (await screen.findByText('Active User')).closest('tr')!;
    const deleteButton = within(row).getByRole('button', { name: 'Delete' });
    await userEvent.click(deleteButton);
    let dialog = screen.getByRole('dialog', { name: 'Delete user Active User' });
    expect(within(dialog).getByText(/active@example.com/)).toBeInTheDocument();
    expect(within(dialog).getByText('The account will be soft-deleted and removed from active user lists.')).toBeInTheDocument();
    expect(deleteCalls).toBe(0);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(deleteButton).toHaveFocus();
    expect(deleteCalls).toBe(0);

    await userEvent.click(deleteButton);
    dialog = screen.getByRole('dialog', { name: 'Delete user Active User' });
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(deleteCalls).toBe(0);

    await userEvent.click(deleteButton);
    dialog = screen.getByRole('dialog', { name: 'Delete user Active User' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(deleteCalls).toBe(0);
  });

  it('keeps Delete failures in the dialog, allows retry, and blocks repeat requests while pending', async () => {
    registerUsers();
    let deleteCalls = 0;
    let finishRequest: (() => void) | undefined;
    server.use(http.delete(`${API_BASE_URL}/users/1`, async () => {
      deleteCalls += 1;
      if (deleteCalls === 1) {
        return HttpResponse.json({ message: 'Delete failed' }, { status: 500 });
      }
      await new Promise<void>((resolve) => { finishRequest = resolve; });
      return HttpResponse.json({ data: users[0] });
    }));
    renderWithProviders(<UserAccessPage />, { initialEntries: ['/admin/users/access'] });

    const row = (await screen.findByText('Active User')).closest('tr')!;
    const deleteButton = within(row).getByRole('button', { name: 'Delete' });
    await userEvent.click(deleteButton);
    const dialog = screen.getByRole('dialog', { name: 'Delete user Active User' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Delete failed');
    expect(deleteCalls).toBe(1);
    expect(within(dialog).getByRole('button', { name: 'Confirm Delete' })).toBeEnabled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm Delete' }));
    await waitFor(() => expect(deleteCalls).toBe(2));
    expect(within(dialog).getByRole('button', { name: 'Deleting...' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Close dialog' })).toBeDisabled();
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(dialog).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deleting...' }));
    expect(deleteCalls).toBe(2);

    finishRequest?.();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('User was deleted.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toHaveFocus();
  });
});
