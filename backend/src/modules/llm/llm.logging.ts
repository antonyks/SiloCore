import { logger } from '../../config/logger';
import { getPublicLlmErrorCode } from './llm.safeError';

type LlmLogStatus = 'started' | 'success' | 'error' | 'aborted' | 'skipped';

type LlmLogFields = {
  requestId?: string;
  providerId?: string;
  providerType?: string;
  model?: string;
  providerModelMismatch?: boolean;
  operation: string;
  latencyMs?: number;
  status: LlmLogStatus;
  errorCode?: string;
  failureKind?: string;
  failureCode?: string;
  failureReason?: string;
  upstreamStatus?: number;
  failureSite?: string;
};

function allowedLogFields(fields: LlmLogFields): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const strings = [
    'requestId', 'providerId', 'providerType', 'model', 'operation', 'status',
    'errorCode', 'failureKind', 'failureCode', 'failureReason', 'failureSite',
  ] as const;
  for (const key of strings) {
    if (typeof fields[key] === 'string') result[key] = fields[key];
  }
  if (typeof fields.latencyMs === 'number' && Number.isFinite(fields.latencyMs)) {
    result.latencyMs = fields.latencyMs;
  }
  if (typeof fields.upstreamStatus === 'number' && Number.isInteger(fields.upstreamStatus)
    && fields.upstreamStatus >= 100 && fields.upstreamStatus <= 599) {
    result.upstreamStatus = fields.upstreamStatus;
  }
  if (fields.providerModelMismatch === true) result.providerModelMismatch = true;
  return result;
}

export function getLlmErrorCode(error: unknown): string {
  return getPublicLlmErrorCode(error) ?? 'UNKNOWN_ERROR';
}

export function logLlmEvent(fields: LlmLogFields): void {
  const logFields = allowedLogFields(fields);
  const message = `${fields.operation}.${fields.status}`;

  if (fields.status === 'error' || fields.status === 'aborted') {
    logger.error(logFields, message);
    return;
  }

  logger.info(logFields, message);
}
