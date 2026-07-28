import { notFoundHandler } from '../../middleware';
import { createMockNext, createMockRequest, createMockResponse } from '../testUtils';

describe('notFoundHandler', () => {
  it('returns a machine-readable not found response with the request ID', () => {
    const req = createMockRequest({
      originalUrl: '/missing-route',
      requestId: 'req-123',
    });
    const res = createMockResponse();

    notFoundHandler(req, res, createMockNext());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Route /missing-route not found',
      code: 'NOT_FOUND',
      requestId: 'req-123',
    });
  });
});
