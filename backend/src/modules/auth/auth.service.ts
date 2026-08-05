import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { WorkspaceStatus, WorkspaceType } from '@prisma/client';
import { AuthCredentials, AuthPersonalWorkspace } from "./auth.types";
import { AuthUser, UserStatus } from '../user/user.model';
import { UserRepository } from '../user/user.repository';
import { AuthenticationError, NotFoundError } from '../../errors'
import { prisma } from '../../config/database';
import { logger } from '../../config/logger';

function omitPasswordHash<T extends { passwordHash: string }>(user: T): Omit<T, 'passwordHash'> {
  const { passwordHash, ...safeUser } = user;
  void passwordHash;
  return safeUser;
}

async function getActivePersonalWorkspaceForUser(userId: number): Promise<AuthPersonalWorkspace> {
  const personalWorkspace = await prisma.workspace.findFirst({
    where: {
      ownerUserId: userId,
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

  if (!personalWorkspace) {
    logger.error(
      { userId, invariant: 'ACTIVE_PERSONAL_WORKSPACE_REQUIRED' },
      'Active personal workspace missing during login.',
    );
    throw new Error('Unable to establish workspace context.');
  }

  return personalWorkspace as AuthPersonalWorkspace;
}

export const loginUser = async (data: AuthCredentials) => {
  const user:AuthUser|null = (await UserRepository.findByEmail(data.email,true)) as (AuthUser|null);

  if(!user)
    throw new NotFoundError("Account not found");

  if(user.status==UserStatus.BANNED)
    throw new AuthenticationError("Account is banned");

  const isValid = await bcrypt.compare(data.password, user.passwordHash);
  if (!isValid) throw new AuthenticationError("Invalid credentials");

  const safeUser = omitPasswordHash(user);
  const personalWorkspace = await getActivePersonalWorkspaceForUser(user.id);
  const token = jwt.sign({ id: user.id, email:user.email,name:user.name, role:user.role, status:user.status }, process.env.JWT_SECRET || "secret", { expiresIn: "1d" });

  return { token, user: { ...safeUser, personalWorkspace } };
};
