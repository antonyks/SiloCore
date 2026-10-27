import { TokenUsage } from '../llm/llm.types';
import { GenerationUsageOperation, GenerationUsageOutcome } from './generationUsage.model';

export interface GenerationUsageCreateInput {
  workspaceId: number;
  providerId: number;
  /** Selected/resolved request model, never a provider response-reported model. */
  model: string;
  operation: GenerationUsageOperation;
  streaming: boolean;
  latencyMs?: number;
  usage?: TokenUsage;
  outcome: GenerationUsageOutcome;
  errorCode?: string;
}
