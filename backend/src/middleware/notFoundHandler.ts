import { Request, Response, NextFunction } from 'express';
import { getOrCreateRequestId } from './requestId.middleware';

export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  void next;
  res.status(404).json({
    message: `Route ${req.originalUrl} not found`,
    code: 'NOT_FOUND',
    requestId: getOrCreateRequestId(req),
  });
  return;
}
