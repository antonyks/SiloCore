import { InvalidInputError } from '../../errors';

const SECRET_KEY_PATTERNS = [
  /api[-_]?key/i,
  /authorization/i,
  /access[-_]?token/i,
  /refresh[-_]?token/i,
  /bearer[-_]?token/i,
  /password/i,
  /secret/i,
  /extra[-_]?headers/i,
];

const PRIVATE_CONTENT_KEY_PATTERNS = [
  /^prompt$/i,
  /prompt[-_]?text/i,
  /assistant[-_]?content/i,
  /document[-_]?content/i,
  /message[-_]?content/i,
  /^content$/i,
];

export function assertJobDataIsSanitized(value: unknown, rootName = 'job payload'): void {
  inspectJobData(value, rootName);
}

function inspectJobData(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectJobData(item, `${path}[${index}]`));
    return;
  }

  if (!isPlainObject(value)) return;

  for (const [key, nestedValue] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;

    if (SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
      throw new InvalidInputError(
        `Job data contains a secret-bearing field at ${nestedPath}.`,
        'JOB_DATA_UNSANITIZED',
      );
    }

    if (PRIVATE_CONTENT_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
      throw new InvalidInputError(
        `Job data contains a private content field at ${nestedPath}.`,
        'JOB_DATA_UNSANITIZED',
      );
    }

    inspectJobData(nestedValue, nestedPath);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
