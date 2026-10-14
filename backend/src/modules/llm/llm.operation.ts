import { randomUUID } from 'node:crypto';
import { safeErrorDiagnostic } from '../../config/safeErrorDiagnostic';
import { ProviderFailure, ProviderFailureOperation, ProviderFailureStage } from './llm.failure';
import { logLlmEvent } from './llm.logging';
import { LlmProviderType } from './llm.types';

/** Internal correlation context. Never take operationId from client input. */
export type LlmOperationContext = {
  operationId: string;
  requestId?: string;
  jobId?: number;
};

export function createLlmOperationContext(correlation: Pick<LlmOperationContext, 'requestId' | 'jobId'> = {}): LlmOperationContext {
  return {
    operationId: randomUUID(),
    requestId: correlation.requestId,
    jobId: correlation.jobId,
  };
}

type Stage = ProviderFailureStage;
type FailureClassifier = (error: unknown, stage: Stage, diagnostics: Record<string, string | number>) => ProviderFailure;
type RunOptions = {
  providerId: string;
  providerType: LlmProviderType;
  /** Selected request model only; never use the upstream response-reported model. */
  model?: string;
  operation: ProviderFailureOperation;
  context?: LlmOperationContext;
  classify: FailureClassifier;
};

type OperationState = { setStage(stage: Stage): void };
type OperationResult<T> = { value: T; providerModelMismatch?: boolean };

function eventBase(options: RunOptions, context: LlmOperationContext) {
  return {
    layer: 'provider' as const,
    operationId: context.operationId,
    requestId: context.requestId,
    jobId: context.jobId,
    providerId: options.providerId,
    providerType: options.providerType,
    model: options.model,
    operation: `provider.${options.operation}` as const,
  };
}

function errorFields(failure: ProviderFailure) {
  return {
    errorCode: failure.publicCode ?? 'UNKNOWN_ERROR',
    ...failure.diagnostics,
    stage: failure.stage,
    failureCategory: failure.failureCategory,
    providerFailureCode: failure.providerFailureCode,
    retryable: failure.retryable,
  };
}

export async function runProviderOperation<T>(
  options: RunOptions,
  execute: (state: OperationState) => Promise<OperationResult<T>>,
): Promise<T> {
  const context = options.context ?? createLlmOperationContext();
  const base = eventBase(options, context);
  const startedAt = Date.now();
  let stage: Stage = 'upstream_request';
  logLlmEvent({ ...base, status: 'started' });
  try {
    const result = await execute({ setStage: (next) => { stage = next; } });
    logLlmEvent({ ...base, status: 'success', latencyMs: Date.now() - startedAt,
      providerModelMismatch: result.providerModelMismatch });
    return result.value;
  } catch (error) {
    const failure = options.classify(error, stage, safeErrorDiagnostic(error));
    logLlmEvent({ ...base, status: 'error', latencyMs: Date.now() - startedAt, ...errorFields(failure) });
    throw failure.error;
  }
}

export async function* runProviderStream<T>(
  options: RunOptions,
  stream: (state: OperationState) => AsyncIterable<T>,
): AsyncIterable<T> {
  // Async generator bodies execute on first consumption, including context creation and logging.
  const context = options.context ?? createLlmOperationContext();
  const base = eventBase(options, context);
  const startedAt = Date.now();
  let stage: Stage = 'upstream_request';
  let terminal = false;
  logLlmEvent({ ...base, status: 'started' });
  try {
    for await (const chunk of stream({ setStage: (next) => { stage = next; } })) {
      yield chunk;
    }
    terminal = true;
    logLlmEvent({ ...base, status: 'success', latencyMs: Date.now() - startedAt });
  } catch (error) {
    terminal = true;
    const failure = options.classify(error, stage, safeErrorDiagnostic(error));
    logLlmEvent({ ...base, status: 'error', latencyMs: Date.now() - startedAt, ...errorFields(failure) });
    throw failure.error;
  } finally {
    if (!terminal) logLlmEvent({ ...base, status: 'aborted', latencyMs: Date.now() - startedAt, stage: 'local_abort' });
  }
}
