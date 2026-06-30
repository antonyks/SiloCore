import { prisma } from '../../config/database';
import { Prisma, User, UserStatus, UserRole } from '@prisma/client';

export {UserStatus, UserRole}

export const UserModel = prisma.user;
export type { User };


const userSelection = { 
    id: true, 
    name: true, 
    email: true, 
    role: true,
    status: true,
    createdAt: true 
} as const;

type SelectedUser = Prisma.UserGetPayload<{ 
  select: typeof userSelection 
}>;

type AuthUser = SelectedUser & Pick<User, 'passwordHash'>;

export type { SelectedUser, AuthUser};
export const SelectedUserFields = userSelection;

type UserUpdateInput = Pick<User, 'name' | 'email'>;

export type { UserUpdateInput };

export type UserWhereInput = Prisma.UserWhereInput;
export type UserCreateInput = Prisma.UserCreateInput;
