import { describe, expect, it } from '@jest/globals';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildWebhookSignature,
  PaymentWebhookGuard,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
} from './payment-webhook.guard';

const SECRET = 'top-secret';
const body = { extTransactionId: 'tx-1', status: 'APPROVED', amount: '25.00' };

const buildGuard = (configured: string | undefined): PaymentWebhookGuard =>
  new PaymentWebhookGuard({ get: () => configured } as unknown as ConfigService);

const buildContext = (
  headers: Record<string, string | undefined>,
  reqBody: unknown = body,
): ExecutionContext => {
  const request = {
    header: (name: string): string | undefined => headers[name.toLowerCase()],
    body: reqBody,
  };
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
};

const nowSeconds = (): string => String(Math.floor(Date.now() / 1000));

const sign = (secret: string, timestamp: string, b = body): string =>
  buildWebhookSignature(secret, {
    timestamp,
    extTransactionId: String(b.extTransactionId),
    status: String(b.status),
    amount: String(b.amount),
  });

const signedHeaders = (timestamp = nowSeconds(), secret = SECRET): Record<string, string> => ({
  [WEBHOOK_SIGNATURE_HEADER]: sign(secret, timestamp),
  [WEBHOOK_TIMESTAMP_HEADER]: timestamp,
});

describe('PaymentWebhookGuard', () => {
  it('allows a request with a fresh, valid signature', () => {
    const guard = buildGuard(SECRET);

    expect(guard.canActivate(buildContext(signedHeaders()))).toBe(true);
  });

  it('rejects a request signed with the wrong secret', () => {
    const guard = buildGuard(SECRET);
    const ts = nowSeconds();
    const headers = {
      [WEBHOOK_SIGNATURE_HEADER]: sign('other', ts),
      [WEBHOOK_TIMESTAMP_HEADER]: ts,
    };

    expect(() => guard.canActivate(buildContext(headers))).toThrow(UnauthorizedException);
  });

  it('rejects a tampered body (signature no longer matches the payload)', () => {
    const guard = buildGuard(SECRET);
    const headers = signedHeaders(); // signed for amount 25.00

    expect(() => guard.canActivate(buildContext(headers, { ...body, amount: '30.00' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a missing signature header', () => {
    const guard = buildGuard(SECRET);

    expect(() =>
      guard.canActivate(buildContext({ [WEBHOOK_TIMESTAMP_HEADER]: nowSeconds() })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a missing timestamp header', () => {
    const guard = buildGuard(SECRET);
    const ts = nowSeconds();

    expect(() =>
      guard.canActivate(buildContext({ [WEBHOOK_SIGNATURE_HEADER]: sign(SECRET, ts) })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects a stale timestamp (replay protection)', () => {
    const guard = buildGuard(SECRET);
    const stale = String(Math.floor(Date.now() / 1000) - 1000);

    expect(() => guard.canActivate(buildContext(signedHeaders(stale)))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when the server has no secret configured', () => {
    const guard = buildGuard(undefined);

    expect(() => guard.canActivate(buildContext(signedHeaders()))).toThrow(UnauthorizedException);
  });
});
