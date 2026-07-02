import { describe, expect, it } from '@jest/globals';
import { toDbProviderType } from '../../modules/llm/llmProviderConfig.types';

describe('LLM provider config type mapping', () => {
  it('maps public provider types to persisted enum values', () => {
    expect(toDbProviderType('ollama')).toBe('OLLAMA');
    expect(toDbProviderType('openai-compatible')).toBe('OPENAI_COMPATIBLE');
  });

  it('rejects unsupported runtime provider types', () => {
    expect(() => toDbProviderType('bad-provider' as never)).toThrow(
      'Unsupported LLM provider type: bad-provider',
    );
  });
});
