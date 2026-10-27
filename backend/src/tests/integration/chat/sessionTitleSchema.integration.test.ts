import {
  ChatSessionTitleSource,
  GenerationUsageOperation,
  GenerationUsageOutcome,
  LlmProviderConfigType,
  MessageAuthor,
  WorkspaceType,
} from '@prisma/client';
import { createIntegrationTestUser, integrationPrisma, resetIntegrationDatabase } from '../helpers/prisma';

beforeEach(resetIntegrationDatabase);

describe('Session title and usage schema', () => {
  it('preserves explicit session titles and stores nullable title watermarks and message links', async () => {
    const owner = await createIntegrationTestUser();
    const workspace = await integrationPrisma.workspace.create({
      data: {
        name: 'Title Schema Workspace',
        type: WorkspaceType.PERSONAL,
        ownerUserId: owner.id,
      },
    });
    const session = await integrationPrisma.chatSession.create({
      data: { title: 'New Chat', userId: owner.id, workspaceId: workspace.id },
    });

    expect(session).toMatchObject({
      title: 'New Chat',
      titleSource: ChatSessionTitleSource.USER,
      latestEligibleAssistantMessageId: null,
      latestAttemptedAssistantMessageId: null,
    });

    const userMessage = await integrationPrisma.chatMessage.create({
      data: { sessionId: session.id, author: MessageAuthor.USER, content: 'What is SiloCore?' },
    });
    const assistantMessage = await integrationPrisma.chatMessage.create({
      data: {
        sessionId: session.id,
        author: MessageAuthor.ASSISTANT,
        content: 'A private AI chat platform.',
        triggeringUserMessageId: userMessage.id,
      },
    });
    await integrationPrisma.chatSession.update({
      where: { id: session.id },
      data: {
        titleSource: ChatSessionTitleSource.PLACEHOLDER,
        latestEligibleAssistantMessageId: assistantMessage.id,
        latestAttemptedAssistantMessageId: assistantMessage.id,
      },
    });

    await expect(integrationPrisma.chatSession.findUniqueOrThrow({ where: { id: session.id } }))
      .resolves.toMatchObject({
        titleSource: ChatSessionTitleSource.PLACEHOLDER,
        latestEligibleAssistantMessageId: assistantMessage.id,
        latestAttemptedAssistantMessageId: assistantMessage.id,
      });
    await expect(integrationPrisma.chatMessage.findUniqueOrThrow({ where: { id: assistantMessage.id } }))
      .resolves.toMatchObject({ triggeringUserMessageId: userMessage.id });
  });

  it('defaults usage to chat replies and allows separate title-call classification', async () => {
    const owner = await createIntegrationTestUser();
    const workspace = await integrationPrisma.workspace.create({
      data: {
        name: 'Usage Schema Workspace',
        type: WorkspaceType.PERSONAL,
        ownerUserId: owner.id,
      },
    });
    const provider = await integrationPrisma.llmProviderConfig.create({
      data: {
        name: 'Usage Schema Provider',
        type: LlmProviderConfigType.OPENAI_COMPATIBLE,
        baseUrl: 'https://provider.example.com',
        defaultModel: 'test-model',
      },
    });
    const common = {
      workspaceId: workspace.id,
      providerId: provider.id,
      model: 'test-model',
      streaming: false,
      outcome: GenerationUsageOutcome.SUCCEEDED,
    };

    const chatUsage = await integrationPrisma.generationUsage.create({ data: common });
    const titleUsage = await integrationPrisma.generationUsage.create({
      data: { ...common, operation: GenerationUsageOperation.SESSION_TITLE },
    });

    expect(chatUsage.operation).toBe(GenerationUsageOperation.CHAT_REPLY);
    expect(titleUsage.operation).toBe(GenerationUsageOperation.SESSION_TITLE);
  });
});
