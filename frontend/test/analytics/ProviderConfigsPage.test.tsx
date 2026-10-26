import { http, HttpResponse } from 'msw';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import ProviderConfigsPage from '../../src/features/analytics/pages/ProviderConfigsPage';
import { UNSUPPORTED_PROVIDER_CAPABILITIES } from '../../src/features/analytics/lib/providerCapabilities';
import { API_BASE_URL } from '../../src/config/constants';
import { renderWithProviders } from '../renderWithProviders';
import { server } from '../msw/server';

const pullCapableCapabilities = {
  ...UNSUPPORTED_PROVIDER_CAPABILITIES,
  completion: true,
  streaming: true,
  reasoning: true,
  modelListing: true,
  modelPulling: true,
};

const baseProvider = {
  id: 1,
  name: 'Local Ollama',
  type: 'ollama',
  baseUrl: 'http://localhost:11434',
  enabled: true,
  isDefault: true,
  defaultSource: 'AUTO',
  defaultModel: 'llama3',
  timeoutMs: 5000,
  generationDefaults: {},
  extraHeaders: {},
  hasApiKey: false,
  deletedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

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

const registerProviders = () => {
  server.use(
    http.get(`${API_BASE_URL}/admin/llm/providers`, () =>
      HttpResponse.json({ data: [{ ...baseProvider, capabilities: pullCapableCapabilities }] }),
    ),
  );
};

describe('ProviderConfigsPage capabilities', () => {
  it('suggests draft models and tests the selected model before saving', async () => {
    registerProviders();
    const previewRequest = vi.fn();
    const testRequest = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/admin/llm/providers/preview/models`, async ({ request }) => {
        previewRequest(await request.json());
        return HttpResponse.json({ data: { status: 'success', models: [{ modelId: 'draft-model', modelName: 'Draft Model' }] } });
      }),
      http.post(`${API_BASE_URL}/admin/llm/providers/preview/test`, async ({ request }) => {
        testRequest(await request.json());
        return HttpResponse.json({ data: { status: 'success' } });
      }),
    );
    renderWithProviders(<ProviderConfigsPage />, { initialEntries: ['/admin/llm/providers'] });
    await userEvent.click(screen.getByRole('button', { name: 'Add Provider' }));
    const dialog = screen.getByRole('dialog', { name: 'Add provider' });
    await waitFor(() => expect(previewRequest).toHaveBeenCalled());
    const modelInput = within(dialog).getByRole('combobox', { name: 'Default Model' });
    expect(modelInput).toHaveAttribute('aria-controls', 'provider-model-suggestions');
    await userEvent.click(modelInput);
    const modelList = within(dialog).getByRole('listbox', { name: 'Available models' });
    expect(within(modelList).getByRole('option')).toHaveTextContent('draft-model');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(modelInput).toHaveValue('draft-model');
    expect(modelInput).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Test model' }));
    await waitFor(() => expect(testRequest).toHaveBeenCalledWith(expect.objectContaining({ defaultModel: 'draft-model' })));
    expect(await within(dialog).findByText('Model responded successfully.')).toBeInTheDocument();
  });

  it('lets an admin change the effective default and refreshes the badge', async () => {
    let effectiveId = 1;
    server.use(
      http.get(`${API_BASE_URL}/admin/llm/providers`, () => HttpResponse.json({ data: [1, 2].map((id) => ({
        ...baseProvider, id, name: id === 1 ? 'Primary' : 'Backup',
        isDefault: id === effectiveId, defaultSource: id === effectiveId ? 'ADMIN' : null,
        capabilities: pullCapableCapabilities,
      })) })),
      http.put(`${API_BASE_URL}/admin/llm/providers/2/default`, () => {
        effectiveId = 2;
        return HttpResponse.json({ data: { ...baseProvider, id: 2, name: 'Backup', isDefault: true, defaultSource: 'ADMIN' } });
      }),
    );
    renderWithProviders(<ProviderConfigsPage />, { initialEntries: ['/admin/llm/providers'] });
    const backup = (await screen.findByText('Backup')).closest('tr')!;
    await userEvent.click(within(backup).getByRole('button', { name: 'Set default' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Backup is now the default provider.');
    await waitFor(() => expect(within(backup).getByText('Default · Admin')).toBeInTheDocument());
  });

  it('summarizes provider configurations and updates counts after refresh', async () => {
    let listedProviders = [
      { ...baseProvider, capabilities: pullCapableCapabilities },
      { ...baseProvider, id: 2, name: 'Enabled Compatible', type: 'openai-compatible', capabilities: UNSUPPORTED_PROVIDER_CAPABILITIES },
      { ...baseProvider, id: 3, name: 'Disabled Ollama', enabled: false, capabilities: pullCapableCapabilities },
      { ...baseProvider, id: 4, name: 'Disabled Compatible', enabled: false, type: 'openai-compatible', capabilities: UNSUPPORTED_PROVIDER_CAPABILITIES },
    ];
    server.use(
      http.get(`${API_BASE_URL}/admin/llm/providers`, () =>
        HttpResponse.json({ data: listedProviders }),
      ),
    );
    renderWithProviders(<ProviderConfigsPage />, { initialEntries: ['/admin/llm/providers'] });

    const summary = screen.getByRole('region', { name: 'Provider configuration summary' });
    const metric = (label: string) => within(summary).getByText(label).parentElement!;
    expect(within(summary).getAllByText('...')).toHaveLength(4);
    await waitFor(() => expect(within(metric('Total Providers')).getByText('4')).toBeInTheDocument());
    expect(within(metric('Enabled')).getByText('2')).toBeInTheDocument();
    expect(within(metric('Disabled')).getByText('2')).toBeInTheDocument();
    expect(within(metric('Pull-Capable')).getByText('2')).toBeInTheDocument();
    expect(within(metric('Pull-Capable')).getByText('Includes disabled providers')).toBeInTheDocument();

    listedProviders = [];
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(within(summary).getAllByText('0')).toHaveLength(4));
  });

  it('shows unavailable summary values when the provider list fails', async () => {
    server.use(
      http.get(`${API_BASE_URL}/admin/llm/providers`, () =>
        HttpResponse.json({ message: 'Provider list failed' }, { status: 500 }),
      ),
    );
    renderWithProviders(<ProviderConfigsPage />, { initialEntries: ['/admin/llm/providers'] });

    const summary = screen.getByRole('region', { name: 'Provider configuration summary' });
    await waitFor(() => expect(within(summary).getAllByText('Provider list unavailable')).toHaveLength(4));
    expect(within(summary).getAllByText('—')).toHaveLength(4);
  });

  it('enables model pull only when provider capabilities support modelPulling', async () => {
    server.use(
      http.get(`${API_BASE_URL}/admin/llm/providers`, () =>
        HttpResponse.json({
          data: [
            {
              ...baseProvider,
              capabilities: pullCapableCapabilities,
            },
            {
              ...baseProvider,
              id: 2,
              name: 'Compatible Provider',
              type: 'openai-compatible',
              capabilities: UNSUPPORTED_PROVIDER_CAPABILITIES,
            },
          ],
        }),
      ),
    );

    renderWithProviders(<ProviderConfigsPage />, {
      initialEntries: ['/admin/llm/providers'],
    });

    const ollamaRow = (await screen.findByText('Local Ollama')).closest('tr');
    const compatibleRow = (await screen.findByText('Compatible Provider')).closest('tr');

    expect(ollamaRow).not.toBeNull();
    expect(compatibleRow).not.toBeNull();
    expect(within(ollamaRow!).getByRole('button', { name: /Pull/i })).toBeEnabled();
    expect(within(compatibleRow!).getByRole('button', { name: /Pull/i })).toBeDisabled();
  });

  it('opens add and edit dialogs at the selected provider and restores focus on cancel', async () => {
    registerProviders();
    const updateRequest = vi.fn();
    server.use(
      http.put(`${API_BASE_URL}/admin/llm/providers/1`, ({ request }) => {
        updateRequest(request);
        return HttpResponse.json({ data: baseProvider });
      }),
    );
    renderWithProviders(<ProviderConfigsPage />, { initialEntries: ['/admin/llm/providers'] });

    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await userEvent.click(addButton);
    const addDialog = screen.getByRole('dialog', { name: 'Add provider' });
    expect(within(addDialog).getByRole('textbox', { name: 'Name' })).toHaveValue('');
    expect(within(addDialog).getByRole('textbox', { name: 'Name' })).toHaveFocus();
    const addCancel = within(addDialog).getByRole('button', { name: 'Cancel' });
    const addSave = within(addDialog).getByRole('button', { name: 'Save Provider' });
    expect(addCancel.parentElement).toBe(addSave.parentElement);
    await userEvent.click(within(addDialog).getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(addButton).toHaveFocus();

    const row = (await screen.findByText('Local Ollama')).closest('tr')!;
    const editButton = within(row).getByRole('button', { name: 'Edit' });
    await userEvent.click(editButton);
    const editDialog = screen.getByRole('dialog', { name: 'Edit provider Local Ollama' });
    const nameInput = within(editDialog).getByRole('textbox', { name: 'Name' });
    expect(nameInput).toHaveValue('Local Ollama');
    expect(within(editDialog).getByRole('button', { name: 'Close dialog' })).toBeEnabled();
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Updated Ollama');
    await userEvent.click(within(editDialog).getByRole('button', { name: 'Save Provider' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Updated Ollama was updated.');
    expect(updateRequest).toHaveBeenCalledTimes(1);
    expect(editButton).toHaveFocus();
  });

  it('creates a provider from the dialog and closes an unused dialog with Escape', async () => {
    registerProviders();
    const createRequest = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/admin/llm/providers`, async ({ request }) => {
        createRequest(await request.json());
        return HttpResponse.json({ data: { ...baseProvider, name: 'New Provider' } });
      }),
    );
    renderWithProviders(<ProviderConfigsPage />, { initialEntries: ['/admin/llm/providers'] });

    const addButton = screen.getByRole('button', { name: 'Add Provider' });
    await userEvent.click(addButton);
    const dialog = screen.getByRole('dialog', { name: 'Add provider' });
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(createRequest).not.toHaveBeenCalled();

    await userEvent.click(addButton);
    const form = screen.getByRole('dialog', { name: 'Add provider' });
    await userEvent.type(within(form).getByRole('textbox', { name: 'Name' }), 'New Provider');
    await userEvent.type(within(form).getByRole('combobox', { name: 'Default Model' }), 'new-model');
    await userEvent.click(within(form).getByRole('button', { name: 'Save Provider' }));
    expect(await screen.findByRole('status')).toHaveTextContent('New Provider was created.');
    expect(createRequest).toHaveBeenCalledTimes(1);
  });

  it('keeps a pending pull dialog open and shows a visible result after completion', async () => {
    registerProviders();
    let releasePull: (() => void) | undefined;
    const pullRequest = vi.fn();
    server.use(
      http.post(`${API_BASE_URL}/admin/llm/providers/1/models/pull`, async ({ request }) => {
        pullRequest(await request.json());
        await new Promise<void>((resolve) => { releasePull = resolve; });
        return HttpResponse.json({ data: { providerName: 'Local Ollama', status: 'success' } });
      }),
    );
    renderWithProviders(<ProviderConfigsPage />, { initialEntries: ['/admin/llm/providers'] });

    const row = (await screen.findByText('Local Ollama')).closest('tr')!;
    const pullButton = within(row).getByRole('button', { name: 'Pull' });
    await userEvent.click(pullButton);
    const dialog = screen.getByRole('dialog', { name: 'Pull model for Local Ollama' });
    expect(within(dialog).getByRole('textbox', { name: 'Model name' })).toHaveValue('llama3');
    const closeButton = within(dialog).getByRole('button', { name: 'Close dialog' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pull' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Pulling...' })).toBeDisabled());
    expect(closeButton).toBeDisabled();
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(dialog).toBeInTheDocument();
    releasePull?.();
    expect(await screen.findByRole('status')).toHaveTextContent('model pull completed');
    expect(pullRequest).toHaveBeenCalledWith({ model: 'llama3' });
    expect(pullButton).toHaveFocus();
  });

  it('shows pull validation and operation failures inside the dialog', async () => {
    registerProviders();
    server.use(
      http.post(`${API_BASE_URL}/admin/llm/providers/1/models/pull`, () =>
        HttpResponse.json({ data: {
          providerName: 'Local Ollama',
          status: 'error',
          errorMessage: 'Unable to pull model',
        } }),
      ),
    );
    renderWithProviders(<ProviderConfigsPage />, { initialEntries: ['/admin/llm/providers'] });

    const row = (await screen.findByText('Local Ollama')).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Pull' }));
    const dialog = screen.getByRole('dialog', { name: 'Pull model for Local Ollama' });
    const modelInput = within(dialog).getByRole('textbox', { name: 'Model name' });
    await userEvent.clear(modelInput);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pull' }));
    expect(within(dialog).getByText('Model name is required.')).toBeInTheDocument();
    await userEvent.type(modelInput, 'llama3');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pull' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Unable to pull model');
    expect(dialog).toBeInTheDocument();
  });

  it('keeps delete failures in the dialog and returns focus after successful deletion', async () => {
    registerProviders();
    let deleteAttempts = 0;
    let deleted = false;
    server.use(
      http.get(`${API_BASE_URL}/admin/llm/providers`, () =>
        HttpResponse.json({ data: deleted ? [] : [{ ...baseProvider, capabilities: pullCapableCapabilities }] }),
      ),
      http.delete(`${API_BASE_URL}/admin/llm/providers/1`, () => {
        deleteAttempts += 1;
        if (deleteAttempts === 2) deleted = true;
        return deleteAttempts === 1
          ? HttpResponse.json({ message: 'Delete failed' }, { status: 500 })
          : HttpResponse.json({ data: baseProvider });
      }),
    );
    renderWithProviders(<ProviderConfigsPage />, { initialEntries: ['/admin/llm/providers'] });

    const row = (await screen.findByText('Local Ollama')).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete provider Local Ollama' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(within(dialog).getByRole('button', { name: 'Close dialog' })).toBeEnabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Delete failed');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Local Ollama was deleted.');
    await waitFor(() => expect(screen.queryByText('Local Ollama')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Add Provider' })).toHaveFocus();
    expect(deleteAttempts).toBe(2);
  });
});
