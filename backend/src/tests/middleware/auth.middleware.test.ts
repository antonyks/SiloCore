import { describe, expect, it, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { AuthenticationError } from '../../errors';
import { authenticate, authorizeRoles } from '../../middleware';
import { UserRole, UserStatus } from '../../modules/user/user.model';
import {
  createAuthenticatedMockRequest,
  createMockNext,
  createMockResponse,
} from '../testUtils';

function createDecodedUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    email: 'user@example.com',
    name: 'User',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
    ...overrides,
  };
}

function expectAuthenticationFailureForJwtError(message: string) {
  (jwt.verify as jest.Mock).mockImplementation(() => {
    throw new Error(message);
  });
  const req = createAuthenticatedMockRequest({
    headers: { authorization: 'Bearer invalid-token' },
  });
  const res = createMockResponse();
  const next = createMockNext();

  try {
    authenticate(req, res, next);
    throw new Error('Expected authenticate to throw');
  } catch (error) {
    expect(error).toBeInstanceOf(AuthenticationError);
    expect((error as Error).message).toBe('Unauthorized: Invalid or expired JWT token');
  }
}

describe('auth middleware', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('authenticate', () => {
    it('blocks requests without a bearer token', () => {
      const req = createAuthenticatedMockRequest({ headers: {} });
      const res = createMockResponse();
      const next = createMockNext();

      expect(() => authenticate(req, res, next)).toThrow(AuthenticationError);
    });

    it('blocks requests with expired JWTs', () => {
      expectAuthenticationFailureForJwtError('jwt expired');
    });

    it('blocks requests with malformed JWTs', () => {
      expectAuthenticationFailureForJwtError('jwt malformed');
    });

    it('blocks requests with invalid JWT signatures', () => {
      expectAuthenticationFailureForJwtError('invalid signature');
    });

    it('adds the decoded user and calls next for valid JWTs', () => {
      const decodedUser = createDecodedUser();
      (jwt.verify as jest.Mock).mockReturnValue(decodedUser);
      const req = createAuthenticatedMockRequest({
        headers: { authorization: 'Bearer valid-token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      authenticate(req, res, next);

      expect(req.user).toEqual({
        token: 'valid-token',
        ...decodedUser,
      });
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('authorizeRoles', () => {
    it('allows permitted roles', () => {
      const req = createAuthenticatedMockRequest({
        user: createDecodedUser({ role: UserRole.ADMIN }),
      });
      const res = createMockResponse();
      const next = createMockNext();

      authorizeRoles(UserRole.ADMIN)(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('blocks disallowed roles', () => {
      const req = createAuthenticatedMockRequest({
        user: createDecodedUser({ role: UserRole.USER }),
      });
      const res = createMockResponse();
      const next = createMockNext();

      expect(() => authorizeRoles(UserRole.ADMIN)(req, res, next)).toThrow(AuthenticationError);
    });
  });
});
