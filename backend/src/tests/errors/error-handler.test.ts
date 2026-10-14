jest.mock('../../config/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

import { errorHandler } from '../../middleware/errorHandler'
import { logger } from '../../config/logger';
import { LlmProviderError } from '../../modules/llm/llm.types';
import { LlmCapabilityError } from '../../modules/llm/llm.capabilities';
import { NotFoundError, AuthenticationError, DuplicateResourceError, InvalidInputError } from '../../errors';
import { createMockNext, createMockRequest, createMockResponse } from '../testUtils';

describe('errorHandler', () => {
  it('should handle NotFoundError', () => {
    const error = new NotFoundError('Resource not found');
    const mockRes = createMockResponse();

    errorHandler(error, createMockRequest({ requestId: 'req-123' }), mockRes, createMockNext());


    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Resource not found',
      code: 'NOT_FOUND',
      requestId: 'req-123',
    });
  });

  it('should handle AuthenticationError', () => {
    const error = new AuthenticationError('Invalid credentials');
    const mockRes = createMockResponse();

    errorHandler(error, createMockRequest({ requestId: 'req-123' }), mockRes, createMockNext());

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Invalid credentials',
      code: 'AUTHENTICATION_ERROR',
      requestId: 'req-123',
    });
  });


  it('should handle DuplicateResourceError', () => {
    const error = new DuplicateResourceError('Email already exists');
    const mockRes = createMockResponse();

    errorHandler(error, createMockRequest({ requestId: 'req-123' }), mockRes, createMockNext());

    expect(mockRes.status).toHaveBeenCalledWith(409);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Email already exists',
      code: 'DUPLICATE_RESOURCE',
      requestId: 'req-123',
    });
  });

  it('should handle InvalidInputError', () => {
    const error = new InvalidInputError('Invalid request body');
    const mockRes = createMockResponse();

    errorHandler(error, createMockRequest({ requestId: 'req-123' }), mockRes, createMockNext());

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Invalid request body',
      code: 'INVALID_INPUT',
      requestId: 'req-123',
    });
  });

  it('should preserve custom InvalidInputError codes', () => {
    const error = new InvalidInputError('Unsupported provider operation', 'LLM_PROVIDER_CAPABILITY_UNSUPPORTED');
    const mockRes = createMockResponse();

    errorHandler(error, createMockRequest({ requestId: 'req-123' }), mockRes, createMockNext());

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Unsupported provider operation',
      code: 'LLM_PROVIDER_CAPABILITY_UNSUPPORTED',
      requestId: 'req-123',
    });
  });

  it('returns trusted capability detail without exposing mutated exception text', () => {
    const error = new LlmCapabilityError('openai-compatible', 'modelPulling');
    error.message = 'Bearer private-token';
    const mockRes = createMockResponse();

    errorHandler(error, createMockRequest({ requestId: 'req-123' }), mockRes, createMockNext());

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Provider type openai-compatible does not support model pulling.',
      code: 'LLM_PROVIDER_CAPABILITY_UNSUPPORTED',
      requestId: 'req-123',
    });
    expect(JSON.stringify((logger.error as jest.Mock).mock.calls)).not.toContain('private-token');
  });

  it('should handle generic error', () => {
    const error = Object.assign(new Error('Unexpected upstream failure: Authorization: Bearer private-api-key'), {
      code: 'ECONNREFUSED',
    });
    const mockRes = createMockResponse();

    errorHandler(error, createMockRequest({ requestId: 'req-123' }), mockRes, createMockNext());

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      requestId: 'req-123',
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-123',
        failureCode: 'ECONNREFUSED',
        failureReason: 'Connection refused',
      }),
      'Unhandled API error',
    );
    expect(JSON.stringify((logger.error as jest.Mock).mock.calls)).not.toContain('private-api-key');
  });

  it('returns an actionable provider status without exposing adapter exception text', () => {
    const error = new LlmProviderError('Bearer private-api-key', 'provider-1', 'HTTP_502', 502);
    const mockRes = createMockResponse();

    errorHandler(error, createMockRequest({ requestId: 'req-123' }), mockRes, createMockNext());

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Provider returned HTTP 502',
      code: 'HTTP_502',
      requestId: 'req-123',
    });
    expect(JSON.stringify((logger.error as jest.Mock).mock.calls)).not.toContain('private-api-key');
  });

  it('should handle non-Error thrown values', () => {
    const mockRes = createMockResponse();

    errorHandler('unexpected failure', createMockRequest({ requestId: 'req-123' }), mockRes, createMockNext());

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'An unexpected error occurred.',
      code: 'INTERNAL_ERROR',
      requestId: 'req-123',
    });
  });

  it('should generate a request ID when the request does not have one', () => {
    const error = new Error('Internal server error');
    const mockReq = createMockRequest();
    const mockRes = createMockResponse();

    errorHandler(error, mockReq, mockRes, createMockNext());

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      requestId: expect.any(String),
    });
    expect(mockReq.requestId).toEqual(expect.any(String));
  });
});
