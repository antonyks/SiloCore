import { body, param, validationResult } from 'express-validator';
import { NextFunction, Request, Response } from 'express';

export const validateChatSessionCreate = [
  body('title')
    .isLength({ min: 1 })
    .withMessage('Title is required')
    .trim()
];

export const validateChatSessionUpdate = [
  body('title')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Title must be at least 1 character long')
    .trim()
];

export const validateChatMessageCreate = [
  body('content')
    .isLength({ min: 1 })
    .withMessage('Content is required')
    .trim(),
  body('sessionId')
    .isInt({ min: 1 })
    .withMessage('Valid session ID is required')
];

export const validateSessionId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid session ID is required')
];

export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};
