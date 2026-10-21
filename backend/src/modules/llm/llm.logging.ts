import { logger } from '../../config/logger';
import { getPublicLlmErrorCode, isPublicLlmErrorCode } from './llm.safeError';
import { ProviderHealthSampleOperation, ProviderHealthSampleStatus } from '@prisma/client';
import {
  PROVIDER_FAILURE_CATEGORIES, PROVIDER_FAILURE_CODES, PROVIDER_FAILURE_STAGES,
  ProviderFailureCategory, ProviderFailureCode, ProviderFailureStage,
} from './llm.failure';

type LlmLogStatus = 'started' | 'success' | 'error' | 'aborted' | 'skipped';

type LlmLogFields = {
  layer?: 'provider' | 'chat' | 'runtime';
  operationId?: string;
  jobId?: number;
  requestId?: string;
  providerId?: string;
  providerType?: string;
  model?: string;
  providerModelMismatch?: boolean;
  operation: string;
  latencyMs?: number;
  status: LlmLogStatus;
  errorCode?: string;
  sampleOperation?: ProviderHealthSampleOperation;
  sampleStatus?: ProviderHealthSampleStatus;
  sampleErrorCode?: string;
  failureKind?: string;
  failureCode?: string;
  failureReason?: string;
  upstreamStatus?: number;
  failureSite?: string;
  stage?: ProviderFailureStage;
  failureCategory?: ProviderFailureCategory;
  providerFailureCode?: ProviderFailureCode;
  retryable?: boolean;
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
  if (fields.layer === 'provider' || fields.layer === 'chat' || fields.layer === 'runtime') {
    result.layer = fields.layer;
  }
  if (typeof fields.operationId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fields.operationId)) {
    result.operationId = fields.operationId;
  }
  if (typeof fields.jobId === 'number' && Number.isSafeInteger(fields.jobId) && fields.jobId > 0) {
    result.jobId = fields.jobId;
  }
  if (typeof fields.latencyMs === 'number' && Number.isFinite(fields.latencyMs)) {
    result.latencyMs = fields.latencyMs;
  }
  if (typeof fields.upstreamStatus === 'number' && Number.isInteger(fields.upstreamStatus)
    && fields.upstreamStatus >= 100 && fields.upstreamStatus <= 599) {
    result.upstreamStatus = fields.upstreamStatus;
  }
  if (fields.providerModelMismatch === true) result.providerModelMismatch = true;
  if (fields.sampleOperation === ProviderHealthSampleOperation.MODEL_REGISTRY
    || fields.sampleOperation === ProviderHealthSampleOperation.PROVIDER_TEST) {
    result.sampleOperation = fields.sampleOperation;
  }
  if (fields.sampleStatus === ProviderHealthSampleStatus.SUCCESS
    || fields.sampleStatus === ProviderHealthSampleStatus.ERROR
    || fields.sampleStatus === ProviderHealthSampleStatus.SKIPPED) {
    result.sampleStatus = fields.sampleStatus;
  }
  if (isPublicLlmErrorCode(fields.sampleErrorCode)) result.sampleErrorCode = fields.sampleErrorCode;
  if (typeof fields.stage === 'string' && (PROVIDER_FAILURE_STAGES as readonly string[]).includes(fields.stage)) {
    result.stage = fields.stage;
  }
  if (typeof fields.failureCategory === 'string'
    && (PROVIDER_FAILURE_CATEGORIES as readonly string[]).includes(fields.failureCategory)) {
    result.failureCategory = fields.failureCategory;
  }
  if (typeof fields.providerFailureCode === 'string'
    && (PROVIDER_FAILURE_CODES as readonly string[]).includes(fields.providerFailureCode)) {
    result.providerFailureCode = fields.providerFailureCode;
  }
  if (typeof fields.retryable === 'boolean') result.retryable = fields.retryable;
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
