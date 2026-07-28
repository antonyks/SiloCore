import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_HEADER, REQUEST_ID_MAX_LENGTH } from '../config/constants';

const PRINTABLE_ASCII_PATTERN = /^[\x20-\x7E]+$/;

function sanitizeIncomingRequestId(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue || trimmedValue.length > REQUEST_ID_MAX_LENGTH) {
    return null;
  }

  if (!PRINTABLE_ASCII_PATTERN.test(trimmedValue)) {
    return null;
  }

  return trimmedValue;
}

export function getOrCreateRequestId(req: Request): string {
  const existingRequestId = sanitizeIncomingRequestId(req.requestId);
  if (existingRequestId) {
    req.requestId = existingRequestId;
    return existingRequestId;
  }

  const requestId = randomUUID();
  req.requestId = requestId;
  return requestId;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingRequestId = req.header(REQUEST_ID_HEADER);
  const requestId = sanitizeIncomingRequestId(incomingRequestId) ?? randomUUID();

  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  next();
}
