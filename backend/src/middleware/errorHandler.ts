import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { safeErrorDiagnostic } from '../config/safeErrorDiagnostic';
import { DuplicateResourceError, NotFoundError, InvalidInputError, AuthenticationError } from '../errors';
import { getOrCreateRequestId } from './requestId.middleware';
import { LlmProviderError } from '../modules/llm/llm.types';
import { getPublicLlmErrorCode, getPublicLlmErrorMessage } from '../modules/llm/llm.safeError';
import { logLlmEvent } from '../modules/llm/llm.logging';
import { LlmCapabilityError } from '../modules/llm/llm.capabilities';

const ErrorCode = {
    DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
    NOT_FOUND: 'NOT_FOUND',
    INVALID_INPUT: 'INVALID_INPUT',
    AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
    void next;
    const requestId = getOrCreateRequestId(_req);

    switch (true) {
        case (err instanceof DuplicateResourceError):
            res.status(409).json({
                message: err.message,
                code: ErrorCode.DUPLICATE_RESOURCE,
                requestId,
            });
            return;
        case (err instanceof NotFoundError):
            res.status(404).json({
                message: err.message,
                code: ErrorCode.NOT_FOUND,
                requestId,
            });
            return;
        case (err instanceof LlmCapabilityError):
            res.status(400).json({
                message: getPublicLlmErrorMessage(err),
                code: getPublicLlmErrorCode(err),
                requestId,
            });
            return;
        case (err instanceof InvalidInputError):
            res.status(400).json({
                message: err.message,
                code: err.code ?? ErrorCode.INVALID_INPUT,
                requestId,
            });
            return;
        case (err instanceof AuthenticationError):
            res.status(401).json({
                message: err.message,
                code: ErrorCode.AUTHENTICATION_ERROR,
                requestId,
            });
            return;
        case (err instanceof LlmProviderError):
            logLlmEvent({
                layer: 'runtime',
                operation: 'api.providerError',
                status: 'error',
                requestId,
                errorCode: getPublicLlmErrorCode(err) ?? ErrorCode.INTERNAL_ERROR,
                ...safeErrorDiagnostic(err),
            });
            res.status(500).json({
                message: getPublicLlmErrorMessage(err),
                code: getPublicLlmErrorCode(err) ?? ErrorCode.INTERNAL_ERROR,
                requestId,
            });
            return;
        case (err instanceof Error): {
            logger.error({ requestId, errorCode: ErrorCode.INTERNAL_ERROR, ...safeErrorDiagnostic(err) }, 'Unhandled API error');
            const status = 500;
            res.status(status).json({
                message: 'Internal server error',
                code: ErrorCode.INTERNAL_ERROR,
                requestId,
            });
            return;
        }
        default:
            logger.error({ requestId, errorCode: ErrorCode.INTERNAL_ERROR, ...safeErrorDiagnostic(err) }, 'Unknown, non-Error object thrown in error handler');
            res.status(500).json({
                message: 'An unexpected error occurred.',
                code: ErrorCode.INTERNAL_ERROR,
                requestId,
            });
            return;

    }

}
