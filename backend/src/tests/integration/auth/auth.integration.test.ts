import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserStatus, WorkspaceStatus, WorkspaceType } from '@prisma/client';
import { loginUser } from '../../../modules/auth/auth.service';
import { WorkspaceProvisioningService } from '../../../modules/workspace/workspaceProvisioning.service';
import { createIntegrationTestUser, resetIntegrationDatabase } from '../helpers/prisma';

beforeEach(async () => {
  await resetIntegrationDatabase();
});

describe('Auth integration', () => {
  it('authenticates a real database user and omits passwordHash from the response user', async () => {
    const password = 'Integration123!';
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createIntegrationTestUser({
      email: 'login-user@example.com',
      passwordHash,
    });
    const { workspace } = await WorkspaceProvisioningService.ensurePersonalWorkspaceForUser(user.id);

    const result = await loginUser({
      email: 'LOGIN-user@example.com',
      password,
    });

    expect(result.user).toMatchObject({
      id: user.id,
      email: 'login-user@example.com',
      status: UserStatus.ACTIVE,
      personalWorkspace: {
        id: workspace.id,
        name: workspace.name,
        type: WorkspaceType.PERSONAL,
        status: WorkspaceStatus.ACTIVE,
      },
    });
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(jwt.verify(result.token, process.env.JWT_SECRET as string)).toMatchObject({
      id: user.id,
      email: 'login-user@example.com',
    });
    expect(jwt.verify(result.token, process.env.JWT_SECRET as string)).not.toHaveProperty(
      'personalWorkspace',
    );
    expect(jwt.verify(result.token, process.env.JWT_SECRET as string)).not.toHaveProperty(
      'workspaceId',
    );
  });

  it('rejects banned users', async () => {
    const password = 'Integration123!';
    const passwordHash = await bcrypt.hash(password, 10);
    await createIntegrationTestUser({
      email: 'banned-user@example.com',
      passwordHash,
      status: UserStatus.BANNED,
    });

    await expect(
      loginUser({ email: 'banned-user@example.com', password }),
    ).rejects.toThrow('Account is banned');
  });

  it('rejects deleted users through email lookup rules', async () => {
    const password = 'Integration123!';
    const passwordHash = await bcrypt.hash(password, 10);
    await createIntegrationTestUser({
      email: 'deleted-user@example.com',
      passwordHash,
      status: UserStatus.DELETED,
    });

    await expect(
      loginUser({ email: 'deleted-user@example.com', password }),
    ).rejects.toThrow('Account not found');
  });
});
