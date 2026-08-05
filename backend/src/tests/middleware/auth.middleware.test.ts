import { describe, expect, it, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { AuthenticationError, NotFoundError } from '../../errors';
import { authenticate, authorizeRoles } from '../../middleware';
import { UserRole, UserStatus } from '../../modules/user/user.model';
import { WorkspaceStatus, WorkspaceType } from '@prisma/client';
import {
  createAuthenticatedMockRequest,
  createMockNext,
  createMockResponse,
} from '../testUtils';
import { mockPrisma } from '../setup';

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

function createWorkspace(overrides: Record<string, unknown> = {}) {
  return {
    id: 25,
    name: 'Personal Workspace',
    ownerUserId: 1,
    type: WorkspaceType.PERSONAL,
    status: WorkspaceStatus.ACTIVE,
    ...overrides,
  };
}

async function expectAuthenticationFailureForJwtError(message: string) {
  (jwt.verify as jest.Mock).mockImplementation(() => {
    throw new Error(message);
  });
  const req = createAuthenticatedMockRequest({
    headers: { authorization: 'Bearer invalid-token' },
  });
  const res = createMockResponse();
  const next = createMockNext();

  try {
    await authenticate(req, res, next);
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
    it('blocks requests without a bearer token', async () => {
      const req = createAuthenticatedMockRequest({ headers: {} });
      const res = createMockResponse();
      const next = createMockNext();

      await expect(authenticate(req, res, next)).rejects.toThrow(AuthenticationError);
    });

    it('blocks requests with expired JWTs', async () => {
      await expectAuthenticationFailureForJwtError('jwt expired');
    });

    it('blocks requests with malformed JWTs', async () => {
      await expectAuthenticationFailureForJwtError('jwt malformed');
    });

    it('blocks requests with invalid JWT signatures', async () => {
      await expectAuthenticationFailureForJwtError('invalid signature');
    });

    it('adds the decoded user, workspace context, and calls next for valid requests', async () => {
      const decodedUser = createDecodedUser();
      (jwt.verify as jest.Mock).mockReturnValue(decodedUser);
      const workspace = createWorkspace();
      mockPrisma.workspace.findFirst.mockResolvedValue(workspace);
      const req = createAuthenticatedMockRequest({
        headers: { authorization: 'Bearer valid-token', 'x-workspace-id': '25' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await authenticate(req, res, next);

      expect(req.user).toEqual({
        token: 'valid-token',
        ...decodedUser,
      });
      expect(req.workspace).toEqual(workspace);
      expect(req.workspaceActor).toEqual({
        userId: decodedUser.id,
        role: decodedUser.role,
      });
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('returns not found when the workspace header is missing', async () => {
      (jwt.verify as jest.Mock).mockReturnValue(createDecodedUser());
      const req = createAuthenticatedMockRequest({
        headers: { authorization: 'Bearer valid-token' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await expect(authenticate(req, res, next)).rejects.toThrow(
        new NotFoundError('Workspace not found'),
      );
      expect(mockPrisma.workspace.findFirst).not.toHaveBeenCalled();
    });

    it('returns not found when the workspace header is malformed', async () => {
      (jwt.verify as jest.Mock).mockReturnValue(createDecodedUser());
      const req = createAuthenticatedMockRequest({
        headers: { authorization: 'Bearer valid-token', 'x-workspace-id': 'abc' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await expect(authenticate(req, res, next)).rejects.toThrow(
        new NotFoundError('Workspace not found'),
      );
      expect(mockPrisma.workspace.findFirst).not.toHaveBeenCalled();
    });

    it('returns not found when the workspace does not exist or is deleted', async () => {
      (jwt.verify as jest.Mock).mockReturnValue(createDecodedUser());
      mockPrisma.workspace.findFirst.mockResolvedValue(null);
      const req = createAuthenticatedMockRequest({
        headers: { authorization: 'Bearer valid-token', 'x-workspace-id': '25' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await expect(authenticate(req, res, next)).rejects.toThrow(
        new NotFoundError('Workspace not found'),
      );
      expect(mockPrisma.workspace.findFirst).toHaveBeenCalledWith({
        where: {
          id: 25,
          status: WorkspaceStatus.ACTIVE,
        },
        select: {
          id: true,
          name: true,
          ownerUserId: true,
          type: true,
          status: true,
        },
      });
    });

    it('returns not found when the actor does not own the workspace', async () => {
      (jwt.verify as jest.Mock).mockReturnValue(createDecodedUser());
      mockPrisma.workspace.findFirst.mockResolvedValue(createWorkspace({ ownerUserId: 2 }));
      const req = createAuthenticatedMockRequest({
        headers: { authorization: 'Bearer valid-token', 'x-workspace-id': '25' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await expect(authenticate(req, res, next)).rejects.toThrow(
        new NotFoundError('Workspace not found'),
      );
    });

    it('does not let admin role use another user workspace as request context', async () => {
      (jwt.verify as jest.Mock).mockReturnValue(createDecodedUser({ role: UserRole.ADMIN }));
      mockPrisma.workspace.findFirst.mockResolvedValue(createWorkspace({ ownerUserId: 2 }));
      const req = createAuthenticatedMockRequest({
        headers: { authorization: 'Bearer valid-token', 'x-workspace-id': '25' },
      });
      const res = createMockResponse();
      const next = createMockNext();

      await expect(authenticate(req, res, next)).rejects.toThrow(
        new NotFoundError('Workspace not found'),
      );
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
