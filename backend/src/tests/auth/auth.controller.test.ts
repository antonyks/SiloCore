import { login } from '../../modules/auth/auth.controller';
import { mockPrisma } from '../setup';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserRole, UserStatus } from '../../modules/user/user.model';
import { NotFoundError } from '../../errors';
import { createMockRequest, createMockResponse } from '../testUtils';

describe('AuthController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should login user and return token', async () => {

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

      const req = createMockRequest({
        body: loginData,
      });

      const mockRes = createMockResponse();

      const mockAuthResult = {
        message: "Login successful",
        data: {
          user: {
            id: mockUser.id,
            email: mockUser.email,
            name: mockUser.name,
            role: mockUser.role,
            status: mockUser.status,
            createdAt: mockUser.createdAt,
            updatedAt: mockUser.updatedAt
          },
          token: 'test-jwt-token',
        }
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock).mockReturnValue('test-jwt-token');

      await login(req, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(mockAuthResult);
    });

    it('should handle authentication error during login', async () => {
      const req = createMockRequest({
        body: {
          email: 'test@example.com',
          password: 'wrongpassword',
        },
      });

      const mockRes = createMockResponse();

      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      (jwt.sign as jest.Mock).mockReturnValue('test-jwt-token');

      await expect(login(req, mockRes)).rejects.toThrow(
        new NotFoundError("Account not found")
      );;

    });
  });

});
