import { loginUser } from '../../modules/auth/auth.service';
import { mockPrisma } from '../setup';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthenticationError, NotFoundError } from '../../errors';
import { SelectedUserFields, UserRole, UserStatus } from '../../modules/user/user.model';
import { WorkspaceStatus, WorkspaceType } from '@prisma/client';
import { logger } from '../../config/logger';

jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('../../config/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should authenticate user and return JWT token', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        passwordHash: 'hashedPassword',
        name: 'Test User',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const mockPersonalWorkspace = {
        id: 25,
        name: 'Personal Workspace',
        type: WorkspaceType.PERSONAL,
        status: WorkspaceStatus.ACTIVE,
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.workspace.findFirst.mockResolvedValue(mockPersonalWorkspace);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock).mockReturnValue('test-jwt-token');

      const result = await loginUser(loginData);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email:loginData.email, NOT:{status:UserStatus.DELETED}  }, 
        select: {...SelectedUserFields,passwordHash: true}
    });
      expect(bcrypt.compare).toHaveBeenCalledWith(loginData.password, 'hashedPassword');
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: 1, email: mockUser.email, name:mockUser.name, status:mockUser.status, role: mockUser.role    },
        process.env.JWT_SECRET || 'secret',
        { expiresIn: '1d' }
      );
      expect(mockPrisma.workspace.findFirst).toHaveBeenCalledWith({
        where: {
          ownerUserId: mockUser.id,
          type: WorkspaceType.PERSONAL,
          status: WorkspaceStatus.ACTIVE,
        },
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
        },
      });
      expect(result).toEqual({
        user: {
          id: 1,
          email: 'test@example.com',
          name: 'Test User',
          role: mockUser.role,
          status: mockUser.status,
          createdAt:mockUser.createdAt,
          updatedAt:mockUser.updatedAt,
          personalWorkspace: mockPersonalWorkspace,
        },
        token: 'test-jwt-token',
      });
    });

    it('should throw AuthenticationError for invalid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        passwordHash: 'hashedPassword',
        name: 'Test User',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(loginUser(loginData)).rejects.toThrow(
        new AuthenticationError('Invalid credentials')
      );
    });

    it('should throw NotFoundError for non-existent user', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(loginUser(loginData)).rejects.toThrow(
        new NotFoundError('Account not found')
      );
    });

    it('should throw AuthenticationError for banned user', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        passwordHash: 'hashedPassword',
        name: 'Test User',
        role: UserRole.USER,
        status: UserStatus.BANNED,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(loginUser(loginData)).rejects.toThrow(
        new AuthenticationError('Account is banned')
      );
    });

    it('should fail when an authenticated user has no active personal workspace', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        passwordHash: 'hashedPassword',
        name: 'Test User',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.workspace.findFirst.mockResolvedValue(null);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock).mockReturnValue('test-jwt-token');

      await expect(loginUser(loginData)).rejects.toThrow('Unable to establish workspace context.');

      expect(logger.error).toHaveBeenCalledWith(
        { userId: mockUser.id, invariant: 'ACTIVE_PERSONAL_WORKSPACE_REQUIRED' },
        'Active personal workspace missing during login.',
      );
      expect(jwt.sign).not.toHaveBeenCalled();
    });
  });


});
