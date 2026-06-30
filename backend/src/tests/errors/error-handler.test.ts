import { errorHandler } from '../../middleware/errorHandler'
import { NotFoundError, AuthenticationError , DuplicateResourceError } from '../../errors';
import { createMockNext, createMockRequest, createMockResponse } from '../testUtils';

describe('errorHandler', () => {
  it('should handle NotFoundError', () => {
    const error = new NotFoundError('Resource not found');
    const mockRes = createMockResponse();

    errorHandler(error, createMockRequest(), mockRes, createMockNext());


    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Resource not found',
    });
  });

  it('should handle AuthenticationError', () => {
    const error = new AuthenticationError('Invalid credentials');
    const mockRes = createMockResponse();

    errorHandler(error, createMockRequest(), mockRes, createMockNext());

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Invalid credentials',
    });
  });


  it('should handle DuplicateResourceError', () => {
    const error = new DuplicateResourceError('Email already exists');
    const mockRes = createMockResponse();

    errorHandler(error, createMockRequest(), mockRes, createMockNext());

    expect(mockRes.status).toHaveBeenCalledWith(409);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Email already exists',
    });
  });

  it('should handle generic error', () => {
    const error = new Error('Internal server error');
    const mockRes = createMockResponse();

    errorHandler(error, createMockRequest(), mockRes, createMockNext());

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      message: 'Internal server error',
    });
  });
});
