import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import ModelRegistryPage from '../../src/features/analytics/pages/ModelRegistryPage';
import { API_BASE_URL } from '../../src/config/constants';
import { renderWithProviders } from '../renderWithProviders';
import { server } from '../msw/server';

describe('ModelRegistryPage', () => {
  const model = {
    providerId: '1',
    providerName: 'Local Ollama',
    providerType: 'ollama',
    modelId: 'llama3',
    modelName: 'Llama 3',
    capabilities: {
      completion: 'SUPPORTED',
      streaming: 'SUPPORTED',
      reasoning: 'UNSUPPORTED',
      embeddings: 'UNKNOWN',
      toolCalling: 'UNKNOWN',
      structuredOutput: 'UNKNOWN',
      tokenCounting: 'UNKNOWN',
    },
  };
  const provider = {
    providerId: '1',
    providerName: 'Local Ollama',
    providerType: 'ollama',
    status: 'success',
    modelCount: 1,
    capabilities: {},
  };

  it('links provider names from both tables without a Config column', async () => {
    server.use(
      http.get(`${API_BASE_URL}/llm/models`, () =>
        HttpResponse.json({
          data: {
            models: [model],
            providers: [provider],
          },
        }),
      ),
      http.get(`${API_BASE_URL}/admin/llm/providers`, () =>
        HttpResponse.json({ data: [{ id: 1, defaultModel: 'LLAMA3' }] }),
      ),
    );

    renderWithProviders(<ModelRegistryPage />, { initialEntries: ['/admin/llm/models'] });

    const modelsSection = screen.getByRole('heading', { name: 'Provider-Qualified Models' }).closest('section')!;
    const statusSection = screen.getByRole('heading', { name: 'Provider Status Breakdown' }).closest('section')!;
    const modelsTable = within(modelsSection).getByRole('table');
    const statusTable = within(statusSection).getByRole('table');

    expect(within(modelsTable).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Model Name', 'Type', 'Provider Status', 'Capabilities', 'Provider',
    ]);
    expect(within(statusTable).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Provider Name', 'Type', 'Status', 'Models', 'Error',
    ]);

    const modelProviderLink = await within(modelsTable).findByRole('link', { name: 'Local Ollama' });
    const statusProviderLink = within(statusTable).getByRole('link', { name: 'Local Ollama' });
    expect(modelProviderLink).toHaveAttribute('href', '/admin/llm/providers');
    expect(statusProviderLink).toHaveAttribute('href', '/admin/llm/providers');
    expect(within(statusSection).getByRole('link', { name: 'Provider Configs' })).toHaveAttribute('href', '/admin/llm/providers');

    const modelRow = modelProviderLink.closest('tr')!;
    expect(within(modelRow).getByText('ID: llama3')).toBeInTheDocument();
    expect(await within(modelRow).findByText('Default')).toBeInTheDocument();
    await userEvent.click(within(modelRow).getByText('2 supported · 1 unsupported · 4 unknown'));
    for (const [name, status] of [
      ['Completion', 'Supported'],
      ['Streaming', 'Supported'],
      ['Reasoning', 'Unsupported'],
      ['Embeddings', 'Unknown'],
      ['Tool calling', 'Unknown'],
      ['Structured output', 'Unknown'],
      ['Token counting', 'Unknown'],
    ]) {
      const term = within(modelRow).getByText(`${name}:`);
      expect(term.tagName).toBe('DT');
      expect(within(term.parentElement!).getByText(status).tagName).toBe('DD');
    }
  });

  it('matches model IDs without regard to case while keeping tags distinct', async () => {
    server.use(
      http.get(`${API_BASE_URL}/llm/models`, () =>
        HttpResponse.json({
          data: {
            models: [
              { ...model, modelId: 'llama3:latest', modelName: 'Ollama tagged' },
              { ...model, providerId: '2', providerName: 'Cloud', providerType: 'openai-compatible', modelId: 'GPT-4o', modelName: 'Cloud case variant' },
              { ...model, providerId: '2', providerName: 'Cloud', providerType: 'openai-compatible', modelId: 'gpt-4o-mini', modelName: 'Cloud other model' },
            ],
            providers: [provider, { ...provider, providerId: '2', providerName: 'Cloud', providerType: 'openai-compatible', modelCount: 2 }],
          },
        }),
      ),
      http.get(`${API_BASE_URL}/admin/llm/providers`, () =>
        HttpResponse.json({ data: [{ id: 1, defaultModel: 'llama3' }, { id: 2, defaultModel: 'gpt-4o' }] }),
      ),
    );

    renderWithProviders(<ModelRegistryPage />, { initialEntries: ['/admin/llm/models'] });

    const modelsTable = within(screen.getByRole('heading', { name: 'Provider-Qualified Models' }).closest('section')!).getByRole('table');
    const taggedRow = (await within(modelsTable).findByText('Ollama tagged')).closest('tr')!;
    const caseVariantRow = within(modelsTable).getByText('Cloud case variant').closest('tr')!;
    const otherModelRow = within(modelsTable).getByText('Cloud other model').closest('tr')!;

    expect(within(taggedRow).queryByText('Default')).not.toBeInTheDocument();
    expect(await within(caseVariantRow).findByText('Default')).toBeInTheDocument();
    expect(within(otherModelRow).queryByText('Default')).not.toBeInTheDocument();
  });

  it('keeps model details available when provider configs fail', async () => {
    server.use(
      http.get(`${API_BASE_URL}/llm/models`, () =>
        HttpResponse.json({ data: { models: [model], providers: [provider] } }),
      ),
      http.get(`${API_BASE_URL}/admin/llm/providers`, () =>
        HttpResponse.json({ message: 'Provider configs unavailable' }, { status: 500 }),
      ),
    );

    renderWithProviders(<ModelRegistryPage />, { initialEntries: ['/admin/llm/models'] });

    expect(await screen.findByText('ID: llama3')).toBeInTheDocument();
    expect(await screen.findByText('Default model status is unavailable. Refresh to try again.')).toBeInTheDocument();
    expect(screen.queryByText('Default')).not.toBeInTheDocument();
    expect(screen.getByText('2 supported · 1 unsupported · 4 unknown')).toBeInTheDocument();
  });
});
