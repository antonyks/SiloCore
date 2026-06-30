import { Response } from 'express';
import { AuthenticatedRequest } from '../../types/authenticatedRequest';
import { ChatService } from './chat.service';
import { InvalidInputError } from '../../errors';
import { IChatSessionCreateInput, IChatSessionUpdateInput, IChatMessageCreateInput, IChatSessionListParams } from './chat.types';
import { MessageAuthor } from './chat.model';

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
    const id: number = parseInt(idString, 10);
    
    if (isNaN(id)) {
      throw new InvalidInputError(`The ID parameter '${idString}' is not a valid number.`);
    }
    
    if (!userId) {
      throw new InvalidInputError('User ID is required');
    }
    
    const session = await ChatService.getSessionById(id, userId);
    res.status(200).json({ data: session });
  },

  async updateSession(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    const idString: string = req.params.id;
    const id: number = parseInt(idString, 10);
    
    if (isNaN(id)) {
      throw new InvalidInputError(`The ID parameter '${idString}' is not a valid number.`);
    }
    
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
    const id: number = parseInt(idString, 10);
    
    if (isNaN(id)) {
      throw new InvalidInputError(`The ID parameter '${idString}' is not a valid number.`);
    }
    
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
    
    const message = await ChatService.createMessage(data);
    res.status(201).json({ data: message });
  },

  async getMessagesBySessionId(req: AuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.user?.id;
    const idString: string = req.params.id;
    const id: number = parseInt(idString, 10);
    
    if (isNaN(id)) {
      throw new InvalidInputError(`The ID parameter '${idString}' is not a valid number.`);
    }
    
    if (!userId) {
      throw new InvalidInputError('User ID is required');
    }
    
    const messages = await ChatService.getMessagesBySessionId(id, userId);
    res.status(200).json({ data: messages });
  }
};
