import { PrismaClient } from '@prisma/client';
import { jest } from '@jest/globals';
import { SelectedUser } from '../modules/user/user.model';
import { SelectedChatSession, SelectedChatMessage } from '../modules/chat/chat.model';
import { SelectedLlmProviderConfig } from '../modules/llm/llmProviderConfig.model';

process.env.OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? `test-${Date.now()}`;

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
  llmProviderConfig: {
    create: jest.fn<() => Promise<SelectedLlmProviderConfig>>(),
    findUnique: jest.fn<() => Promise<SelectedLlmProviderConfig | null>>(),
    findMany: jest.fn<() => Promise<SelectedLlmProviderConfig[]>>(),
    update: jest.fn<() => Promise<SelectedLlmProviderConfig>>(),
    count: jest.fn<() => Promise<number>>(),
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
  LlmProviderConfigType: {
    OLLAMA: 'OLLAMA',
    OPENAI_COMPATIBLE: 'OPENAI_COMPATIBLE',
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
  verify: jest.fn(),
}));

beforeEach(() => {
    mockPrisma.user.create.mockClear();
    mockPrisma.user.findUnique.mockClear();
    mockPrisma.user.findMany.mockClear();
    mockPrisma.user.update.mockClear();
    mockPrisma.llmProviderConfig.create.mockClear();
    mockPrisma.llmProviderConfig.findUnique.mockClear();
    mockPrisma.llmProviderConfig.findMany.mockClear();
    mockPrisma.llmProviderConfig.update.mockClear();
    mockPrisma.llmProviderConfig.count.mockClear();
});

export { mockPrisma };
