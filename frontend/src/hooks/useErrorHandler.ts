import { useCallback } from 'react';
import { ErrorHandler } from '../lib/errorHandler';
import { logger } from '../lib/logger';

export const useErrorHandler = () => {
  const handleApiError = useCallback((error: unknown) => {
    const apiError = ErrorHandler.handleApiError(error);
    logger.error('API Error handled by hook:', apiError);
    return apiError;
  }, []);

  const handleGenericError = useCallback((error: unknown) => {
    ErrorHandler.handleGenericError(error);
    logger.error('Generic error handled by hook:', error);
  }, []);

  return {
    handleApiError,
    handleGenericError,
  };
};
