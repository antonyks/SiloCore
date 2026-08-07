import { http, HttpResponse } from 'msw';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
  defaultModel: 'llama3',
  timeoutMs: 5000,
  generationDefaults: {},
  extraHeaders: {},
  hasApiKey: false,
  deletedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ProviderConfigsPage capabilities', () => {
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
});
