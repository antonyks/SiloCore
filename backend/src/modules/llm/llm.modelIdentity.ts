/** Provider-reported model names are untrusted observations, never model identity. */
export function providerModelMismatch(selectedModel: string, reportedModel: unknown): true | undefined {
  if (typeof reportedModel !== 'string' || reportedModel.length === 0 || reportedModel.length > 1024) {
    return undefined;
  }

  return reportedModel.trim().length > 0 && reportedModel !== selectedModel ? true : undefined;
}
