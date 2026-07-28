import { Request, Response } from 'express';
import { REQUEST_ID_HEADER, REQUEST_ID_MAX_LENGTH } from '../../config/constants';
import { requestIdMiddleware } from '../../middleware';
import { createMockNext } from '../testUtils';

type RequestWithHeader = Request & {
  header: jest.MockedFunction<Request['header']>;
};

type ResponseWithSetHeader = Response & {
  setHeader: jest.MockedFunction<Response['setHeader']>;
};

function createRequestWithHeader(value?: string): RequestWithHeader {
  return {
    header: jest.fn().mockReturnValue(value),
  } as unknown as RequestWithHeader;
}

function createResponseWithSetHeader(): ResponseWithSetHeader {
  return {
    setHeader: jest.fn(),
  } as unknown as ResponseWithSetHeader;
}

describe('requestIdMiddleware', () => {
  it('accepts a valid incoming request ID', () => {
    const req = createRequestWithHeader('request-123');
    const res = createResponseWithSetHeader();
    const next = createMockNext();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe('request-123');
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'request-123');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('trims a valid incoming request ID', () => {
    const req = createRequestWithHeader('  request-123  ');
    const res = createResponseWithSetHeader();
    const next = createMockNext();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe('request-123');
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'request-123');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a request ID when the incoming ID is empty', () => {
    const req = createRequestWithHeader('   ');
    const res = createResponseWithSetHeader();
    const next = createMockNext();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toEqual(expect.any(String));
    expect(req.requestId).not.toBe('');
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.requestId);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a request ID when the incoming ID is too long', () => {
    const req = createRequestWithHeader('a'.repeat(REQUEST_ID_MAX_LENGTH + 1));
    const res = createResponseWithSetHeader();
    const next = createMockNext();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toEqual(expect.any(String));
    expect(req.requestId).toHaveLength(36);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.requestId);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a request ID when the incoming ID contains control characters', () => {
    const req = createRequestWithHeader('request-\n123');
    const res = createResponseWithSetHeader();
    const next = createMockNext();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toEqual(expect.any(String));
    expect(req.requestId).toHaveLength(36);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.requestId);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
