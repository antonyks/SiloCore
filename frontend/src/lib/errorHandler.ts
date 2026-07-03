import { logger } from './logger';

export interface ApiError {
  status: number;
  message: string;
  details?: unknown;
}

interface ErrorResponse {
  status: number;
  data?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const getMessage = (value: unknown): string | undefined => {
  if (value instanceof Error) {
    return value.message;
  }

  if (isRecord(value) && typeof value.message === 'string') {
    return value.message;
  }

  return undefined;
};

const getResponse = (error: unknown): ErrorResponse | undefined => {
  if (!isRecord(error) || !isRecord(error.response)) {
    return undefined;
  }

  const { status, data } = error.response;

  if (typeof status !== 'number') {
    return undefined;
  }

  return { status, data };
};

const getDetails = (data: unknown): unknown => {
  return isRecord(data) ? data.details : undefined;
};

export class ErrorHandler {
  static handleApiError(error: unknown): ApiError {
    const response = getResponse(error);
    const errorMessage = getMessage(error);

    if (response) {
      // Server responded with error status
      const dataMessage = getMessage(response.data);
      logger.error(`API Error ${response.status}: ${dataMessage || errorMessage}`);
      
      return {
        status: response.status,
        message: dataMessage || 'An error occurred',
        details: getDetails(response.data)
      };
    } else if (isRecord(error) && error.request) {
      // Request was made but no response received
      logger.error('Network error:', error.request);
      return {
        status: 0,
        message: 'Network error. Please check your connection.'
      };
    } else {
      // Something else happened
      logger.error('Error:', errorMessage);
      return {
        status: 500,
        message: errorMessage || 'An unexpected error occurred'
      };
    }
  }

  static handleGenericError(error: unknown): void {
    logger.error('Generic error:', error);
  }
}
