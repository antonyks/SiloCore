import { Prisma } from '@prisma/client';
import { UserRepository } from '../../../modules/user/user.repository';
import { UserStatus } from '../../../modules/user/user.model';
import { integrationPrisma, resetIntegrationDatabase } from '../helpers/prisma';

beforeEach(async () => {
  await resetIntegrationDatabase();
});

describe('UserRepository integration', () => {
  it('lowercases email addresses when creating users', async () => {
    const user = await UserRepository.createUser({
      email: 'MixedCase@example.com',
      name: 'Mixed Case',
      password: 'hashed-password',
    });

    expect(user.email).toBe('mixedcase@example.com');
    await expect(
      integrationPrisma.user.findUnique({ where: { email: 'mixedcase@example.com' } }),
    ).resolves.toMatchObject({ id: user.id });
  });

  it('relies on the database unique constraint for duplicate emails', async () => {
    await UserRepository.createUser({
      email: 'duplicate@example.com',
      name: 'First User',
      password: 'hashed-password',
    });

    await expect(
      UserRepository.createUser({
        email: 'DUPLICATE@example.com',
        name: 'Second User',
        password: 'hashed-password',
      }),
    ).rejects.toMatchObject<Partial<Prisma.PrismaClientKnownRequestError>>({
      code: 'P2002',
    });
  });

  it('soft-deletes users by anonymizing email and setting DELETED status', async () => {
    const user = await UserRepository.createUser({
      email: 'delete-me@example.com',
      name: 'Delete Me',
      password: 'hashed-password',
    });

    const deletedUser = await UserRepository.updateUserStatus(user.id, UserStatus.DELETED);

    expect(deletedUser?.status).toBe(UserStatus.DELETED);
    expect(deletedUser?.email).not.toBe('delete-me@example.com');
    expect(deletedUser?.email).toMatch(/^deleted-.+@forevergone\.insight$/);
  });
});
