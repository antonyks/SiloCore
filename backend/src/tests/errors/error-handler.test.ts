jest.mock('../../config/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

import { errorHandler } from '../../middleware/errorHandler'
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

  it('should handle generic error', () => {
    const error = new Error('Internal server error');
    const mockRes = createMockResponse();

    errorHandler(error, createMockRequest({ requestId: 'req-123' }), mockRes, createMockNext());

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      requestId: 'req-123',
    });
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
