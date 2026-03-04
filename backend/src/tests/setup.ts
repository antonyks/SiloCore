import { PrismaClient } from '@prisma/client';
import { jest } from '@jest/globals';
import { SelectedUser } from '../modules/user/user.model';
import { SelectedChatSession, SelectedChatMessage } from '../modules/chat/chat.model';

type UserCreateResult = Awaited<ReturnType<PrismaClient['user']['create']>>;
type chatSessionResult = Awaited<ReturnType<PrismaClient['chatSession']['create']>>;
type chatMessageResult = Awaited<ReturnType<PrismaClient['chatMessage']['create']>>;

const mockPrisma = {
  user: {
    create: jest.fn<() => Promise<UserCreateResult>>(),
    findUnique: jest.fn<() => Promise<SelectedUser | null>>(),
    findMany: jest.fn<() => Promise<SelectedUser[]>>(),
    update: jest.fn<() => Promise<SelectedUser>>(),
  },
  chatSession: {
    create: jest.fn<() => Promise<chatSessionResult>>(),
    findUnique: jest.fn<() => Promise<SelectedChatSession | null>>(),
    findMany: jest.fn<() => Promise<SelectedChatSession[]>>(),
    update: jest.fn<() => Promise<SelectedChatSession>>(),
    delete: jest.fn<() => Promise<SelectedChatSession>>(),
  },
  chatMessage: {
    create: jest.fn<() => Promise<chatMessageResult>>(),
    findUnique: jest.fn<() => Promise<SelectedChatMessage | null>>(),
    findMany: jest.fn<() => Promise<SelectedChatMessage[]>>(),
    update: jest.fn<() => Promise<SelectedChatMessage>>(),
    delete: jest.fn<() => Promise<SelectedChatMessage>>(),
  },
};


class MockPrismaClientKnownRequestError extends Error {
  code: string;
  meta?: Record<string, unknown>;
  clientVersion: string;

  constructor(
    message: string,
    { code, clientVersion, meta }: { code: string; clientVersion: string; meta?: Record<string, unknown> }
  ) {
    super(message);
    this.name = 'PrismaClientKnownRequestError';
    this.code = code;
    this.clientVersion = clientVersion;
    this.meta = meta;
  }
}




jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
  UserStatus: {
    ACTIVE: 'ACTIVE',
    BANNED: 'BANNED',
    DELETED: 'DELETED',
  },
  UserRole: {
    USER: 'USER',
    ADMIN: 'ADMIN',
  },
  MessageAuthor: {
    USER: 'USER',
    ASSISTANT: 'ASSISTANT',
    SYSTEM: 'SYSTEM',
  },
  Prisma: {
    PrismaClientKnownRequestError: MockPrismaClientKnownRequestError,
  },
}));


jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));


jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid-123'),
}));


jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('test-jwt-token'),
}));

beforeEach(() => {
    mockPrisma.user.create.mockClear();
    mockPrisma.user.findUnique.mockClear();
    mockPrisma.user.findMany.mockClear();
    mockPrisma.user.update.mockClear();
});

export { mockPrisma };