import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

export const WEBHOOK_SIGNATURE_HEADER = 'x-webhook-signature';
export const WEBHOOK_TIMESTAMP_HEADER = 'x-webhook-timestamp';

/** How far the signed timestamp may drift from now, in seconds (anti-replay window). */
const TOLERANCE_SECONDS = 300;

export interface WebhookSignatureParts {
  timestamp: string;
  extTransactionId: string;
  status: string;
  amount: string;
}

/**
 * The signing scheme, shared by the guard and any signer (tests, and later a real PSP
 * adapter): HMAC-SHA256 over a canonical `timestamp.extTransactionId.status.amount`. The
 * timestamp is inside the signed payload so it cannot be swapped to defeat the freshness
 * check. Signing the fields (not the raw body) keeps the guard free of raw-body plumbing.
 */
export function buildWebhookSignature(secret: string, parts: WebhookSignatureParts): string {
  const canonical = `${parts.timestamp}.${parts.extTransactionId}.${parts.status}.${parts.amount}`;
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

/**
 * Verifies a signed gateway webhook. Replaces a static shared secret: the request must
 * carry a fresh timestamp and a valid HMAC over the payload, so a captured request cannot
 * be replayed and the body cannot be tampered. Fails closed when the secret is unset.
 */
@Injectable()
export class PaymentWebhookGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const secret = this.config.get<string>('PAYMENT_WEBHOOK_SECRET');
    const signature = request.header(WEBHOOK_SIGNATURE_HEADER);
    const timestamp = request.header(WEBHOOK_TIMESTAMP_HEADER);

    if (!secret || !signature || !timestamp) {
      throw new UnauthorizedException('Missing webhook signature.');
    }

    if (!this.isFresh(timestamp)) {
      throw new UnauthorizedException('Webhook timestamp is stale or invalid.');
    }

    // Body is still raw here (the guard runs before the validation pipe), so each field is
    // unknown. Coerce only real strings; anything else becomes '' and fails the match, so a
    // malformed body fails closed instead of being stringified to junk.
    const body = (request.body ?? {}) as Record<string, unknown>;
    const expected = buildWebhookSignature(secret, {
      timestamp,
      extTransactionId: this.asString(body.extTransactionId),
      status: this.asString(body.status),
      amount: this.asString(body.amount),
    });

    if (!this.safeEqual(signature, expected)) {
      throw new UnauthorizedException('Invalid webhook signature.');
    }

    return true;
  }

  private isFresh(timestamp: string): boolean {
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) {
      return false;
    }
    return Math.abs(Date.now() / 1000 - ts) <= TOLERANCE_SECONDS;
  }

  private asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
