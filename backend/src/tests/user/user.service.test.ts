import { UserService } from '../../modules/user/user.service';
import { BCRYPT_SALT_ROUNDS } from '../../config/constants';
import bcrypt from 'bcryptjs';
import { DuplicateResourceError, NotFoundError, AuthenticationError } from '../../errors';
import { SelectedUserFields, UserRole, UserStatus } from '../../modules/user/user.model';
import { mockPrisma } from '../setup';

jest.mock('bcryptjs');

describe('UserService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    it('should create a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      };

      const mockExistingUser = null;

      const mockCreatedUser = {
        id: 1,
        email: 'test@example.com',
        passwordHash: 'hashedPassword',
        name: 'Test User',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.user.findUnique
        .mockResolvedValueOnce(mockExistingUser)
        .mockResolvedValueOnce(mockCreatedUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      mockPrisma.user.create.mockResolvedValue(mockCreatedUser);
      mockPrisma.workspace.findFirst.mockResolvedValue(null);
      mockPrisma.workspace.create.mockResolvedValue({
        id: 1,
        name: 'Personal Workspace',
        type: 'PERSONAL',
        status: 'ACTIVE',
        ownerUserId: mockCreatedUser.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockPrisma.workspaceMembership.findFirst.mockResolvedValue(null);
      mockPrisma.workspaceMembership.findUnique.mockResolvedValue(null);
      mockPrisma.workspaceMembership.create.mockResolvedValue({
        id: 1,
        workspaceId: 1,
        userId: mockCreatedUser.id,
        role: 'OWNER',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await UserService.createUser(userData);


      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: userData.email, NOT:{status:UserStatus.DELETED }},
        select: SelectedUserFields,
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(userData.password, BCRYPT_SALT_ROUNDS);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

      const createUserData = {
        email: userData.email,
        name: userData.name,
        passwordHash: 'hashedPassword'
      };

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data:createUserData,
        select: SelectedUserFields,
      });
      expect(mockPrisma.workspace.create).toHaveBeenCalledWith({
        data: {
          name: 'Personal Workspace',
          type: 'PERSONAL',
          status: 'ACTIVE',
          ownerUserId: mockCreatedUser.id,
        },
      });
      expect(mockPrisma.workspaceMembership.create).toHaveBeenCalledWith({
        data: {
          workspaceId: 1,
          userId: mockCreatedUser.id,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });

      expect(result).toEqual(mockCreatedUser);
      
    });

    it('should throw DuplicateResourceError if email already exists', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      };

      const mockExistingUser = {
        id: 1,
        email: 'test@example.com',
        passwordHash: 'hashedPassword',
        name: 'Test User',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockExistingUser);

      await expect(UserService.createUser(userData)).rejects.toThrow(
        new DuplicateResourceError('Email already registered')
      );

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({where: { email:userData.email, NOT:{status:UserStatus.DELETED }}, select: SelectedUserFields});
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('should propagate provisioning failures so the transaction rolls back', async () => {
      const userData = {
        email: 'rollback@example.com',
        password: 'password123',
        name: 'Rollback User',
      };

      const mockCreatedUser = {
        id: 2,
        email: 'rollback@example.com',
        passwordHash: 'hashedPassword',
        name: 'Rollback User',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const provisioningError = new Error('workspace provisioning failed');

      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockCreatedUser);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      mockPrisma.user.create.mockResolvedValue(mockCreatedUser);
      mockPrisma.workspace.findFirst.mockRejectedValue(provisioningError);

      await expect(UserService.createUser(userData)).rejects.toThrow(provisioningError);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(mockPrisma.workspace.findFirst).toHaveBeenCalledWith({
        where: {
          ownerUserId: mockCreatedUser.id,
          type: 'PERSONAL',
        },
      });
    });
  });

  describe('getUserById', () => {
    it('should return user by ID', async () => {
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

      const result = await UserService.getUserById(1);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({where: { id: 1 },
        select: expect.any(Object)});
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundError if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(UserService.getUserById(1)).rejects.toThrow(
        new NotFoundError('User not found')
      );

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({where: { id: 1 },
        select: expect.any(Object)});
    });
  });

  describe('getUsers', () => {
    it('should return users with default filters', async () => {
      const mockUsers = [
        {
          id: 1,
          email: 'test1@example.com',
          name: 'Test User 1',
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          email: 'test2@example.com',
          name: 'Test User 2',
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.user.findMany.mockResolvedValue(mockUsers);

      const result = await UserService.getUsers(undefined,0,10);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: {
          role: UserRole.USER,
          status: { not: UserStatus.DELETED }
        },
        skip: 0,
        take: 10,
        select: SelectedUserFields,
    });
      expect(result).toEqual(mockUsers);
    });

    it('should return users with name filter', async () => {
      const mockUsers = [
        {
          id: 1,
          email: 'test1@example.com',
          name: 'Test User 1',
          role: UserRole.USER,
          status: UserStatus.ACTIVE,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockPrisma.user.findMany.mockResolvedValue(mockUsers);

      const result = await UserService.getUsers('Test',0,10);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where:{
          AND: [
            {
              role: UserRole.USER,
              status: { not: UserStatus.DELETED }
            },
            {
              name: {
                contains: 'Test',
                mode: 'insensitive',
              }
            }
          ]
        },
        skip: 0,
        take: 10,
        select: SelectedUserFields
    });
      expect(result).toEqual(mockUsers);
    });
  });

  describe('updateUserById', () => {
    it('should update user by ID', async () => {
      const mockUser = {
        id: 1,
        email: 'updated@example.com',
        name: 'Updated User',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await UserService.updateUserById(1, { name:'Updated User Name', email: 'updated3@example.com' });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({where: { id: 1 },
        data: { name:'Updated User Name',email: 'updated3@example.com' },
        select: SelectedUserFields});
      expect(result).toEqual(mockUser);
    });
  });

  describe('updateUserPassword', () => {
    it('should update user password successfully', async () => {
      const userData = {
        id: 1,
        oldPassword: 'oldPassword123',
        newPassword: 'newPassword123',
      };

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        passwordHash: 'oldHashedPassword',
        name: 'Test User',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedMockUser = {
        id: 1,
        email: 'test@example.com',
        passwordHash: 'newHashedPassword',
        name: 'Test User',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.user.update.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('newHashedPassword');
      mockPrisma.user.update.mockResolvedValue({
        ...updatedMockUser
      });
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      

      const result = await UserService.updateUserPassword(userData);

      expect(bcrypt.compare).toHaveBeenCalledWith(userData.oldPassword, 'oldHashedPassword');
      expect(bcrypt.hash).toHaveBeenCalledWith(userData.newPassword, BCRYPT_SALT_ROUNDS);
      expect(result).toEqual({
        ...mockUser,
        passwordHash: 'newHashedPassword',
      });
    });

    it('should throw NotFoundError if user not found', async () => {
      const userData = {
        id: 1,
        oldPassword: 'oldPassword123',
        newPassword: 'newPassword123',
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(UserService.updateUserPassword(userData)).rejects.toThrow(
        new NotFoundError("Account not found")
      );
    });

    it('should throw AuthenticationError if old password is incorrect', async () => {
      const userData = {
        id: 1,
        oldPassword: 'oldPassword123',
        newPassword: 'newPassword123',
      };

      const mockUser = {
        id: 1,
        email: 'test@example.com',
        passwordHash: 'oldHashedPassword',
        name: 'Test User',
        role: UserRole.USER,
        status: UserStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(UserService.updateUserPassword(userData)).rejects.toThrow(
        new AuthenticationError("Incorrect old password")
      );
    });
  });

  describe('deleteUserById', () => {
    it('should delete user by ID', async () => {
      const mockUser = {
        id: 1,
        email: 'deleted-test-uuid-123@forevergone.insight',
        name: 'Test User',
        role: UserRole.USER,
        status: UserStatus.DELETED,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await UserService.deleteUserById(1);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where:{id:1}, 
        data:{email:mockUser.email,status:UserStatus.DELETED},
        select:SelectedUserFields
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('banUserById', () => {
    it('should ban user by ID', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        name: 'Test User',
        role: UserRole.USER,
        status: UserStatus.BANNED,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.user.update.mockResolvedValue(mockUser);

      const result = await UserService.banUserById(1);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        data:{status:UserStatus.BANNED},
        select:SelectedUserFields,
        where:{id:1}
      });
      expect(result).toEqual(mockUser);
    });
  });
});
