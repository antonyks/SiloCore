import { logger } from './logger';

export interface ApiError {
  status: number;
  message: string;
  details?: any;
}

export class ErrorHandler {
  static handleApiError(error: any): ApiError {
    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      logger.error(`API Error ${status}: ${data.message || error.message}`);
      
      return {
        status,
        message: data.message || 'An error occurred',
        details: data.details
      };
    } else if (error.request) {
      // Request was made but no response received
      logger.error('Network error:', error.request);
      return {
        status: 0,
        message: 'Network error. Please check your connection.'
      };
    } else {
      // Something else happened
      logger.error('Error:', error.message);
      return {
        status: 500,
        message: error.message || 'An unexpected error occurred'
      };
    }
  }

  static handleGenericError(error: any): void {
    logger.error('Generic error:', error);
  }
}