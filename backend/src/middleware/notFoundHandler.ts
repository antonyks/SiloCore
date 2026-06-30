import { Request, Response, NextFunction } from 'express';

export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  void next;
  res.status(404).json({
    message: `Route ${req.originalUrl} not found`
  });
  return;
}
