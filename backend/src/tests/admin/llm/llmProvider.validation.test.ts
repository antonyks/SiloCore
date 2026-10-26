import { Request } from 'express';
import { describe, expect, it, jest } from '@jest/globals';
import {
  handleDraftValidationErrors,
  validateDraftProviderProbe,
  validateDraftProviderTest,
} from '../../../modules/admin/llm/llmProvider.validation';
import { createMockResponse } from '../../testUtils';

describe('draft provider probe validation', () => {
  it('rejects string provider IDs and omits submitted values from validation errors', async () => {
    const secret = 'Bearer private-token';
    const request = { body: {
      providerId: '1',
      type: 'ollama',
      baseUrl: 'http://localhost:11434',
      apiKey: { secret },
      extraHeaders: { Authorization: { secret } },
    } } as Request;
    for (const validator of validateDraftProviderProbe) await validator.run(request);
    const response = createMockResponse();

    handleDraftValidationErrors(request, response, jest.fn());

    expect(response.status).toHaveBeenCalledWith(400);
    const body = response.json.mock.calls[0][0];
    expect(body.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'providerId' }),
      expect.objectContaining({ path: 'apiKey' }),
      expect.objectContaining({ path: 'extraHeaders' }),
    ]));
    expect(JSON.stringify(body)).not.toContain(secret);
  });

  it('requires a model ID for a draft generation test', async () => {
    const request = { body: {
      type: 'openai-compatible', baseUrl: 'https://example.com/v1', defaultModel: ' ',
    } } as Request;
    for (const validator of validateDraftProviderTest) await validator.run(request);
    const response = createMockResponse();

    handleDraftValidationErrors(request, response, jest.fn());

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json.mock.calls[0][0].errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'defaultModel' }),
    ]));
  });
});
