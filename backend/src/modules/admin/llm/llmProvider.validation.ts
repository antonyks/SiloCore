import { NextFunction, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { SUPPORTED_LLM_PROVIDER_TYPES } from '../../llm/llm.types';

function isStringRecord(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((headerValue) => typeof headerValue === 'string');
}

function isGenerationDefaults(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const allowedKeys = new Set(['temperature', 'topP', 'maxTokens', 'stopSequences']);
  return Object.entries(value).every(([key, fieldValue]) => {
    if (!allowedKeys.has(key)) return false;

    if (key === 'temperature') {
      return typeof fieldValue === 'number' && Number.isFinite(fieldValue) && fieldValue >= 0;
    }

    if (key === 'topP') {
      return typeof fieldValue === 'number' && Number.isFinite(fieldValue) && fieldValue >= 0 && fieldValue <= 1;
    }

    if (key === 'maxTokens') {
      return Number.isInteger(fieldValue) && Number(fieldValue) > 0;
    }

    return Array.isArray(fieldValue) && fieldValue.every((sequence) => typeof sequence === 'string');
  });
}

export const validateProviderId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('Valid provider ID is required'),
];

export const validateProviderCreate = [
  body('name')
    .isLength({ min: 1 })
    .withMessage('Name is required')
    .trim(),
  body('type')
    .isIn(SUPPORTED_LLM_PROVIDER_TYPES)
    .withMessage('Unsupported provider type'),
  body('baseUrl')
    .isLength({ min: 1 })
    .withMessage('Base URL is required')
    .trim(),
  body('enabled')
    .optional()
    .isBoolean()
    .withMessage('Enabled must be a boolean'),
  body('defaultModel')
    .isLength({ min: 1 })
    .withMessage('Default model is required')
    .trim(),
  body('timeoutMs')
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage('Timeout must be a positive integer'),
  body('generationDefaults')
    .optional({ nullable: true })
    .custom(isGenerationDefaults)
    .withMessage('Generation defaults must include only valid temperature, topP, maxTokens, and stopSequences values'),
  body('extraHeaders')
    .optional()
    .custom(isStringRecord)
    .withMessage('Extra headers must be an object with string values'),
  body('apiKey')
    .optional({ nullable: true })
    .isString()
    .withMessage('API key must be a string or null'),
];

export const validateProviderUpdate = [
  body('name')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Name must be at least 1 character long')
    .trim(),
  body('type')
    .optional()
    .isIn(SUPPORTED_LLM_PROVIDER_TYPES)
    .withMessage('Unsupported provider type'),
  body('baseUrl')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Base URL must be at least 1 character long')
    .trim(),
  body('enabled')
    .optional()
    .isBoolean()
    .withMessage('Enabled must be a boolean'),
  body('defaultModel')
    .optional()
    .isLength({ min: 1 })
    .withMessage('Default model must be at least 1 character long')
    .trim(),
  body('timeoutMs')
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage('Timeout must be a positive integer'),
  body('generationDefaults')
    .optional({ nullable: true })
    .custom(isGenerationDefaults)
    .withMessage('Generation defaults must include only valid temperature, topP, maxTokens, and stopSequences values'),
  body('extraHeaders')
    .optional()
    .custom(isStringRecord)
    .withMessage('Extra headers must be an object with string values'),
  body('apiKey')
    .optional({ nullable: true })
    .isString()
    .withMessage('API key must be a string or null'),
];

export const validateModelPull = [
  body('model')
    .isLength({ min: 1 })
    .withMessage('Model is required')
    .trim(),
];

export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
    });
  }
  next();
};
