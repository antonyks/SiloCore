/** Log only bounded, structural failure details. Exception messages and stacks may contain request data or secrets. */
const KNOWN_CODES: Record<string, string> = {
  ECONNREFUSED: 'Connection refused',
  ECONNRESET: 'Connection reset',
  ETIMEDOUT: 'Connection timed out',
  ENOTFOUND: 'Host not found',
  EAI_AGAIN: 'Temporary name resolution failure',
  EPIPE: 'Connection closed',
  EHOSTUNREACH: 'Host unreachable',
  ENETUNREACH: 'Network unreachable',
  CERT_HAS_EXPIRED: 'TLS certificate expired',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'TLS certificate verification failed',
  P1000: 'Database authentication failed',
  P1001: 'Database server unreachable',
  P1002: 'Database connection timed out',
  P1003: 'Database does not exist',
  P2002: 'Database unique constraint failed',
  P2003: 'Database foreign key constraint failed',
  P2010: 'Database raw query failed',
  P2021: 'Database table does not exist',
  P2022: 'Database column does not exist',
  P2024: 'Database connection pool timed out',
  P2028: 'Database transaction failed',
  P2034: 'Database transaction conflict',
  '28P01': 'Database password authentication failed',
  '3D000': 'Database does not exist',
  '42P01': 'Database table does not exist',
  '42703': 'Database column does not exist',
  '23505': 'Database unique constraint failed',
  '23503': 'Database foreign key constraint failed',
  '53300': 'Database connection limit reached',
  '57P03': 'Database temporarily unavailable',
};

const KNOWN_ERROR_NAMES = new Set([
  'AbortError',
  'FetchError',
  'LlmProviderError',
  'PrismaClientInitializationError',
  'PrismaClientKnownRequestError',
  'PrismaClientRustPanicError',
  'PrismaClientValidationError',
]);

function safeCode(value: unknown): string | undefined {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(KNOWN_CODES, value) ? value : undefined;
}

function failureSite(): string | undefined {
  // Capture a new stack at the logging call. A thrown Error's stack starts with its
  // message, which may contain newlines that impersonate stack frames.
  const stack = new Error('safe diagnostic').stack;
  if (typeof stack !== 'string') return undefined;
  for (const line of stack.slice(0, 8192).split('\n').slice(1, 12)) {
    const match = line.match(/(?:^|\/)backend\/(src|dist)\/([A-Za-z0-9_./-]+\.(?:ts|js)):(\d+):(\d+)\)?$/);
    if (match && !match[2].split('/').includes('..')
      && !match[2].endsWith('config/safeErrorDiagnostic.ts')
      && !match[2].endsWith('config/safeErrorDiagnostic.js')) {
      return `${match[1]}/${match[2]}:${match[3]}`;
    }
  }
  return undefined;
}

export function safeErrorDiagnostic(error: unknown): Record<string, string | number> {
  try {
    if (!(error instanceof Error)) return { failureKind: 'NonErrorThrow' };

    const code = safeCode((error as Error & { code?: unknown }).code);
    const cause = (error as Error & { cause?: unknown }).cause;
    const causeCode = cause instanceof Error ? safeCode((cause as Error & { code?: unknown }).code) : undefined;
    const diagnosticCode = code ?? causeCode;
    const kind = error instanceof TypeError ? 'TypeError'
      : error instanceof RangeError ? 'RangeError'
      : error instanceof SyntaxError ? 'SyntaxError'
      : error instanceof ReferenceError ? 'ReferenceError'
      : error instanceof URIError ? 'URIError'
      : KNOWN_ERROR_NAMES.has(error.name) ? error.name
      : 'Error';
    const site = failureSite();
    const statusCode = (error as Error & { statusCode?: unknown }).statusCode;
    return {
      failureKind: kind,
      ...(diagnosticCode ? { failureCode: diagnosticCode, failureReason: KNOWN_CODES[diagnosticCode] } : {}),
      ...(typeof statusCode === 'number' && Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599
        ? { upstreamStatus: statusCode } : {}),
      ...(site ? { failureSite: site } : {}),
    };
  } catch {
    return { failureKind: 'DiagnosticUnavailable' };
  }
}
