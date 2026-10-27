import { ChatSessionTitleSource, MessageAuthor, WorkspaceStatus } from '@prisma/client';
import { prisma } from '../../config/database';

export const SESSION_TITLE_ASSISTANT_PAGE_SIZE = 25;

/** Internal title-worker reads; never return these records through an API or job result. */
export const SessionTitleRepository = {
  findEligibleSession(sessionId: number, assistantMessageId: number, workspaceId: number) {
    return prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        workspaceId,
        titleSource: ChatSessionTitleSource.PLACEHOLDER,
        latestEligibleAssistantMessageId: assistantMessageId,
        workspace: { status: WorkspaceStatus.ACTIVE },
      },
      select: { id: true },
    });
  },

  findLinkedAssistants(sessionId: number, assistantMessageId: number, beforeId?: number) {
    return prisma.chatMessage.findMany({
      where: {
        sessionId,
        id: { lte: assistantMessageId, ...(beforeId === undefined ? {} : { lt: beforeId }) },
        author: MessageAuthor.ASSISTANT,
        triggeringUserMessageId: { not: null },
      },
      orderBy: { id: 'desc' },
      take: SESSION_TITLE_ASSISTANT_PAGE_SIZE,
      select: { id: true, content: true, metadata: true, triggeringUserMessageId: true },
    });
  },

  findTriggeringUsers(sessionId: number, ids: number[]) {
    return prisma.chatMessage.findMany({
      where: { sessionId, id: { in: ids }, author: MessageAuthor.USER },
      select: { id: true, content: true },
    });
  },
};
