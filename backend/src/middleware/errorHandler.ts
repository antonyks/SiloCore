import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { DuplicateResourceError, NotFoundError, InvalidInputError, AuthenticationError } from '../errors';
import { getOrCreateRequestId } from './requestId.middleware';

const ErrorCode = {
    DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
    NOT_FOUND: 'NOT_FOUND',
    INVALID_INPUT: 'INVALID_INPUT',
    AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

function getErrorMessage(err: unknown): string {
    if (typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string') {
        return err.message;
    }

    return 'An unexpected error occurred.';
}

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
        case (err instanceof InvalidInputError):
            res.status(400).json({
                message: err.message,
                code: ErrorCode.INVALID_INPUT,
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
        case (err instanceof Error): {
            logger.error({ err, requestId, errorCode: ErrorCode.INTERNAL_ERROR }, err.message);
            const status = 500;
            res.status(status).json({
                message: err.message || 'Internal server error',
                code: ErrorCode.INTERNAL_ERROR,
                requestId,
            });
            return;
        }
        default:
            logger.error({ err, requestId, errorCode: ErrorCode.INTERNAL_ERROR }, 'Unknown, non-Error object thrown in error handler');
            res.status(500).json({
                message: getErrorMessage(err),
                code: ErrorCode.INTERNAL_ERROR,
                requestId,
            });
            return;

    }

}
