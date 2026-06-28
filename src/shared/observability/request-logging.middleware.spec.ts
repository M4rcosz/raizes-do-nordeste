import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestLoggingMiddleware } from './request-logging.middleware';

// Minimal fake Response that captures the 'finish' listener so the test can
// fire it on demand, the way express would once the response is sent.
function createFakeResponse(statusCode: number): {
  res: Response;
  fireFinish: () => void;
} {
  let finishCb: (() => void) | undefined;
  const on = (event: string, cb: () => void): void => {
    if (event === 'finish') {
      finishCb = cb;
    }
  };
  const res = { statusCode, on } as unknown as Response;

  return {
    res,
    fireFinish: (): void => {
      if (finishCb) {
        finishCb();
      }
    },
  };
}

function createFakeRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    originalUrl: '/api/products',
    url: '/api/products',
    ip: '203.0.113.7',
    headers: { 'user-agent': 'PostmanRuntime/7.39.0' },
    ...overrides,
  } as unknown as Request;
}

describe('RequestLoggingMiddleware', () => {
  let middleware: RequestLoggingMiddleware;
  let logSpy: jest.SpiedFunction<typeof Logger.prototype.log>;
  let warnSpy: jest.SpiedFunction<typeof Logger.prototype.warn>;
  let errorSpy: jest.SpiedFunction<typeof Logger.prototype.error>;

  beforeEach(() => {
    middleware = new RequestLoggingMiddleware();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls next immediately and logs only on finish', () => {
    const req = createFakeRequest();
    const { res, fireFinish } = createFakeResponse(200);
    const next: NextFunction = jest.fn();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();

    fireFinish();
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('logs transport metadata including userId from req.user', () => {
    const req = createFakeRequest({
      user: {
        sub: 'user-123',
        username: 'jane',
        role: 'ADMIN',
        businessUnitId: null,
        iat: 0,
        exp: 0,
      },
    } as Partial<Request>);
    const { res, fireFinish } = createFakeResponse(200);

    middleware.use(req, res, jest.fn());
    fireFinish();

    const entry = logSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(entry).toEqual(
      expect.objectContaining({
        method: 'GET',
        path: '/api/products',
        statusCode: 200,
        ip: '203.0.113.7',
        client: 'postman',
        userAgent: 'PostmanRuntime/7.39.0',
        userId: 'user-123',
      }),
    );
    expect(entry).toHaveProperty('durationMs');
  });

  it('does not log the authorization header', () => {
    const req = createFakeRequest({
      headers: { 'user-agent': 'curl/8.7.1', authorization: 'Bearer secret-token' },
    } as Partial<Request>);
    const { res, fireFinish } = createFakeResponse(200);

    middleware.use(req, res, jest.fn());
    fireFinish();

    const serialized = JSON.stringify(logSpy.mock.calls[0][0]);
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('authorization');
  });

  it('logs only the pathname and never the query string', () => {
    const req = createFakeRequest({
      originalUrl: '/api/x?token=secret123',
      url: '/api/x?token=secret123',
    } as Partial<Request>);
    const { res, fireFinish } = createFakeResponse(200);

    middleware.use(req, res, jest.fn());
    fireFinish();

    const entry = logSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(entry.path).toBe('/api/x');

    const serialized = JSON.stringify(logSpy.mock.calls[0][0]);
    expect(serialized).not.toContain('secret123');
  });

  it('uses warn level for 4xx', () => {
    const req = createFakeRequest();
    const { res, fireFinish } = createFakeResponse(404);

    middleware.use(req, res, jest.fn());
    fireFinish();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('uses error level for 5xx', () => {
    const req = createFakeRequest();
    const { res, fireFinish } = createFakeResponse(500);

    middleware.use(req, res, jest.fn());
    fireFinish();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
