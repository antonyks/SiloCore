import { safeErrorDiagnostic } from '../../config/safeErrorDiagnostic';

describe('safeErrorDiagnostic', () => {
  it('keeps a known connection code and a bounded source location without logging exception text', () => {
    const error = Object.assign(new Error('Bearer secret-token; prompt: private conversation'), {
      code: 'ECONNREFUSED',
    });
    error.stack = 'Error: Bearer secret-token\n    at connect (/app/backend/src/config/database.ts:12:4)';

    const details = safeErrorDiagnostic(error);

    expect(details).toEqual({
      failureKind: 'Error',
      failureCode: 'ECONNREFUSED',
      failureReason: 'Connection refused',
      failureSite: expect.stringMatching(/^src\/tests\/config\/safeErrorDiagnostic\.test\.ts:\d+$/),
    });
    expect(JSON.stringify(details)).not.toContain('database.ts:12');
    expect(JSON.stringify(details)).not.toContain('secret-token');
    expect(JSON.stringify(details)).not.toContain('private conversation');
  });

  it('rejects an arbitrary code and stack content supplied by an exception', () => {
    const error = Object.assign(new Error('password=private'), { code: 'private-secret' });
    error.stack = 'Error: password=private\n    at fail (/app/backend/src/private-secret.ts:1:1)';

    const details = safeErrorDiagnostic(error);
    expect(details).toEqual({
      failureKind: 'Error',
      failureSite: expect.stringMatching(/^src\/tests\/config\/safeErrorDiagnostic\.test\.ts:\d+$/),
    });
    expect(JSON.stringify(details)).not.toContain('private-secret');
  });

  it('does not mistake multiline exception text for a trusted stack frame', () => {
    const error = new Error('Bearer private\n    at forged (/app/backend/src/private-token.ts:1:1)');

    const details = safeErrorDiagnostic(error);

    expect(details.failureSite).toMatch(/^src\/tests\/config\/safeErrorDiagnostic\.test\.ts:\d+$/);
    expect(JSON.stringify(details)).not.toContain('private-token');
  });

  it('retains a known database code from a wrapped cause', () => {
    const cause = Object.assign(new Error('private database URL'), { code: 'P1001' });
    const error = Object.assign(new Error('private query'), { cause });
    error.stack = 'Error: private query';

    expect(safeErrorDiagnostic(error)).toEqual(expect.objectContaining({
      failureKind: 'Error',
      failureCode: 'P1001',
      failureReason: 'Database server unreachable',
    }));
  });

  it('logs only the category when a non-Error value is thrown', () => {
    expect(safeErrorDiagnostic({ apiKey: 'private' })).toEqual({ failureKind: 'NonErrorThrow' });
  });

  it('retains known library error classes without logging arbitrary error names', () => {
    const known = new Error('private');
    known.name = 'PrismaClientKnownRequestError';
    known.stack = 'PrismaClientKnownRequestError: private';
    const unknown = new Error('private');
    unknown.name = 'Bearer private';
    unknown.stack = 'Bearer private';

    expect(safeErrorDiagnostic(known)).toEqual(expect.objectContaining({ failureKind: 'PrismaClientKnownRequestError' }));
    expect(safeErrorDiagnostic(unknown)).toEqual(expect.objectContaining({ failureKind: 'Error' }));
  });

  it('does not replace the original failure when diagnostic properties cannot be read', () => {
    const error = new Error('Bearer private');
    Object.defineProperty(error, 'code', { get: () => { throw new Error('private'); } });

    expect(safeErrorDiagnostic(error)).toEqual({ failureKind: 'DiagnosticUnavailable' });
  });
});
