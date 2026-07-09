import { Response } from 'express';
import { AuthenticatedRequest } from '../../types/authenticatedRequest';
import { ChatService } from './chat.service';
import { InvalidInputError } from '../../errors';
import {
  ChatGenerationStreamEvent,
  IChatGenerationInput,
  IChatSessionCreateInput,
  IChatSessionUpdateInput,
  IChatMessageCreateInput,
  IChatSessionListParams,
} from './chat.types';
import { MessageAuthor } from './chat.model';

const SSE_HEARTBEAT_INTERVAL_MS = 15000;

function parseSessionId(value: string): number {
  const id = parseInt(value, 10);
  if (isNaN(id)) {
    throw new InvalidInputError(`The ID parameter '${value}' is not a valid number.`);
  }
  return id;
}

function writeSseEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function writeSseHeartbeat(res: Response): void {
  res.write(': keep-alive\n\n');
}

async function nextStreamEventWithHeartbeat(
  events: AsyncIterator<ChatGenerationStreamEvent>,
  res: Response,
  shouldStop: () => boolean,
): Promise<IteratorResult<ChatGenerationStreamEvent>> {
  const nextEvent = events.next();

  while (true) {
    if (shouldStop()) {
      await events.return?.();
      return { done: true, value: undefined };
    }

    let timeout: NodeJS.Timeout | undefined;
    const heartbeatDelay = new Promise<'heartbeat'>((resolve) => {
      timeout = setTimeout(() => resolve('heartbeat'), SSE_HEARTBEAT_INTERVAL_MS);
    });
    const result = await Promise.race([nextEvent, heartbeatDelay]);
    if (timeout) {
      clearTimeout(timeout);
    }

    if (result === 'heartbeat') {
      writeSseHeartbeat(res);
      continue;
    }

    return result;
  }
}

function toGenerationInput(body: IChatGenerationInput): IChatGenerationInput {
  return {
    content: body.content,
    providerId: body.providerId === undefined ? undefined : Number(body.providerId),
    model: body.model,
    temperature: body.temperature === undefined ? undefined : Number(body.temperature),
    topP: body.topP === undefined ? undefined : Number(body.topP),
    maxTokens: body.maxTokens === undefined ? undefined : Number(body.maxTokens),
    stopSequences: body.stopSequences,
  };
}

export const ChatController = {
  async createSession(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { title } = req.body;
    const userId = req.user?.id;
    
    if (!userId) {
      throw new InvalidInputError('User ID is required');
    }
    
    const data: IChatSessionCreateInput = { title, userId };
    const session = await ChatService.createSession(data);
    res.status(201).json({ data: session });
  },

  async getSessions(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    
    if (!userId) {
      throw new InvalidInputError('User ID is required');
    }
    
    const { skip, take, orderBy, orderDirection } = req.query;
    
    const paginationSkip: number | undefined = skip ? parseInt(skip as string, 10) : undefined;
    const paginationTake: number | undefined = take ? parseInt(take as string, 10) : undefined;
    
    if (paginationSkip !== undefined && (isNaN(paginationSkip) || paginationSkip < 0)) {
      throw new InvalidInputError("Invalid value for skip parameter");
    }
    if (paginationTake !== undefined && (isNaN(paginationTake) || paginationTake < 0)) {
      throw new InvalidInputError("Invalid value for take parameter");
    }
    
    const params:IChatSessionListParams = {
      userId,
      skip: paginationSkip,
      take: paginationTake,
      orderBy: orderBy as 'createdAt' | 'updatedAt' | undefined,
      orderDirection: orderDirection as 'asc' | 'desc' | undefined
    };
    
    const sessions = await ChatService.getUserSessions(params);
    res.status(200).json({ data: sessions });
  },

  async getSessionById(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    const idString: string = req.params.id;
    const id: number = parseSessionId(idString);
    
    if (!userId) {
      throw new InvalidInputError('User ID is required');
    }
    
    const session = await ChatService.getSessionById(id, userId);
    res.status(200).json({ data: session });
  },

  async updateSession(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    const idString: string = req.params.id;
    const id: number = parseSessionId(idString);
    
    if (!userId) {
      throw new InvalidInputError('User ID is required');
    }
    
    const data: IChatSessionUpdateInput = req.body;
    const session = await ChatService.updateSession(id, userId, data);
    res.status(200).json({ data: session });
  },

  async deleteSession(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    const idString: string = req.params.id;
    const id: number = parseSessionId(idString);
    
    if (!userId) {
      throw new InvalidInputError('User ID is required');
    }
    
    const session = await ChatService.deleteSession(id, userId);
    res.status(200).json({ data: session });
  },

  async createMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    const { content, sessionId, metadata } = req.body;
    const author=MessageAuthor.USER;
    
    if (!userId) {
      throw new InvalidInputError('User ID is required');
    }
    
    const data: IChatMessageCreateInput = { 
      content, 
      author, 
      sessionId, 
      metadata 
    };
    
    const message = await ChatService.createMessage(data, userId);
    res.status(201).json({ data: message });
  },

  async getMessagesBySessionId(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    const idString: string = req.params.id;
    const id: number = parseSessionId(idString);
    
    if (!userId) {
      throw new InvalidInputError('User ID is required');
    }
    
    const messages = await ChatService.getMessagesBySessionId(id, userId);
    res.status(200).json({ data: messages });
  },

  async generateAssistantResponse(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    const sessionId = parseSessionId(req.params.id);

    if (!userId) {
      throw new InvalidInputError('User ID is required');
    }

    const result = await ChatService.generateAssistantResponse({
      ...toGenerationInput(req.body),
      sessionId,
      userId,
    });

    res.status(201).json({ data: result });
  },

  async streamAssistantResponse(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    const sessionId = parseSessionId(req.params.id);

    if (!userId) {
      throw new InvalidInputError('User ID is required');
    }

    const events = ChatService.streamAssistantResponse({
      ...toGenerationInput(req.body),
      sessionId,
      userId,
    })[Symbol.asyncIterator]();
    let clientClosed = false;
    req.on?.('aborted', () => {
      clientClosed = true;
    });
    res.on?.('close', () => {
      clientClosed = true;
    });
    const firstEvent = await events.next();

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    try {
      if (!firstEvent.done) {
        writeSseEvent(res, firstEvent.value.event, firstEvent.value.data);
      }

      while (true) {
        const nextEvent = await nextStreamEventWithHeartbeat(
          events,
          res,
          () => clientClosed || res.writableEnded,
        );
        if (nextEvent.done) break;
        const event: ChatGenerationStreamEvent = nextEvent.value;
        writeSseEvent(res, event.event, event.data);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Streaming failed';
      writeSseEvent(res, 'error', { message });
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  }
};
