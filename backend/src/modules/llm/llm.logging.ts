import { logger } from '../../config/logger';
import { getPublicLlmErrorCode } from './llm.safeError';

type LlmLogStatus = 'started' | 'success' | 'error' | 'aborted' | 'skipped';

type LlmLogFields = {
  requestId?: string;
  providerId?: string;
  providerType?: string;
  model?: string;
  operation: string;
  latencyMs?: number;
  status: LlmLogStatus;
  errorCode?: string;
};

function removeUndefinedValues<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
  return Object.entries(data).reduce<Record<string, unknown>>((result, [key, value]) => {
    if (value !== undefined) {
      result[key] = value;
    }
    return result;
  }, {});
}

export function getLlmErrorCode(error: unknown): string {
  return getPublicLlmErrorCode(error) ?? 'UNKNOWN_ERROR';
}

export function logLlmEvent(fields: LlmLogFields): void {
  const logFields = removeUndefinedValues(fields);
  const message = `${fields.operation}.${fields.status}`;

  if (fields.status === 'error' || fields.status === 'aborted') {
    logger.error(logFields, message);
    return;
  }

  logger.info(logFields, message);
}
