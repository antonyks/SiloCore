import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/authenticatedRequest';

export type MockResponse = Response & {
  status: jest.MockedFunction<Response['status']>;
  json: jest.MockedFunction<Response['json']>;
};

export function createMockResponse(): MockResponse {
  const response = {
    status: jest.fn(),
    json: jest.fn()
  } as unknown as MockResponse;
  response.status = jest.fn().mockReturnValue(response);
  response.json = jest.fn().mockReturnValue(response);
  return response;
}

export function createMockRequest(request: Partial<Request> = {}): Request {
  return request as Request;
}

export function createAuthenticatedMockRequest(request: Partial<AuthenticatedRequest> = {}): AuthenticatedRequest {
  return request as AuthenticatedRequest;
}

export function createMockNext(): NextFunction {
  return jest.fn();
}
