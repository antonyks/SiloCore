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

export const validateChatGeneration = [
  body('content')
    .isLength({ min: 1 })
    .withMessage('Content is required')
    .trim(),
  body('providerId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Valid provider ID is required'),
  body('model')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Model must be at least 1 character long')
    .trim(),
  body('temperature')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Temperature must be a non-negative number'),
  body('topP')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Top P must be between 0 and 1'),
  body('maxTokens')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Max tokens must be a positive integer'),
  body('stopSequences')
    .optional()
    .isArray()
    .withMessage('Stop sequences must be an array'),
  body('stopSequences.*')
    .optional()
    .isString()
    .withMessage('Stop sequences must contain strings')
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
