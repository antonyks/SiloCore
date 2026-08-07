import { InvalidInputError } from '../../errors';
import { assertJobDataIsSanitized } from '../../modules/job';

describe('job privacy guards', () => {
  it('accepts sanitized operational payload data', () => {
    expect(() =>
      assertJobDataIsSanitized({
        workspaceId: 1,
        providerId: 2,
        upstreamRequestId: 'req_123',
        options: {
          batchSize: 10,
          retry: true,
        },
        itemIds: [1, 2, 3],
      }),
    ).not.toThrow();
  });

  it.each([
    { apiKey: 'secret' },
    { Authorization: 'Bearer secret' },
    { extraHeaders: { 'X-Secret': 'secret' } },
    { auth: { accessToken: 'secret' } },
    { auth: { refresh_token: 'secret' } },
    { nested: { password: 'secret' } },
    { prompt: 'private prompt' },
    { promptText: 'private prompt' },
    { assistantContent: 'private assistant output' },
    { messageContent: 'private message' },
    { documentContent: 'private document' },
    { content: 'private content' },
  ])('rejects unsanitized job data %#', (payload) => {
    expect(() => assertJobDataIsSanitized(payload)).toThrow(InvalidInputError);
  });
});
