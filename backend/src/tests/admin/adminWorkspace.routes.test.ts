import { describe, expect, it } from '@jest/globals';
import { AuthenticationError } from '../../errors';
import { authorizeRoles } from '../../middleware';
import { UserRole, UserStatus } from '../../modules/user/user.model';
import {
  createAuthenticatedMockRequest,
  createMockNext,
  createMockResponse,
} from '../testUtils';

describe('Admin workspace route authorization boundary', () => {
  it('blocks USER requests from admin workspace metadata routes', () => {
    const req = createAuthenticatedMockRequest({
      user: {
        id: 1,
        email: 'user@example.com',
        name: 'User',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        createdAt: new Date(),
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    expect(() => authorizeRoles(UserRole.ADMIN)(req, res, next)).toThrow(AuthenticationError);
  });
});
