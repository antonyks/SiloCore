import { describe, expect, it } from 'vitest';
import { llmModelQueryKeys } from '../../src/features/chat/hooks/useLlmModels';

describe('llmModelQueryKeys', () => {
  it('scopes model lists by workspace id', () => {
    expect(llmModelQueryKeys.workspace(30)).toEqual([
      'llm-models',
      'workspace',
      30,
    ]);
  });

  it('uses a stable disabled key when no workspace is active', () => {
    expect(llmModelQueryKeys.disabled()).toEqual([
      'llm-models',
      'workspace',
      'none',
    ]);
  });
});
