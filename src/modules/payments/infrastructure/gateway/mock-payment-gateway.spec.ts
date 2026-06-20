import { describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { MockPaymentGateway } from './mock-payment-gateway';
import { PaymentGatewayError } from '../../application/ports/payment-gateway.port';
import { PaymentStatus } from '../../domain/value-objects/payment-status';

describe('MockPaymentGateway', () => {
  const request = { orderId: 'order-1', idempotencyKey: 'pay-1' };

  it('approves a charge and returns a transaction id', async () => {
    const gateway = new MockPaymentGateway();

    const result = await gateway.charge(Money.fromDecimalString('25.00'), request);

    expect(result.status).toBe(PaymentStatus.APPROVED);
    expect(result.extTransactionId).toEqual(expect.any(String));
    expect(result.extTransactionId.length).toBeGreaterThan(0);
  });

  it('refuses the magic test amount 13.13', async () => {
    const gateway = new MockPaymentGateway();

    const result = await gateway.charge(Money.fromDecimalString('13.13'), request);

    expect(result.status).toBe(PaymentStatus.REFUSED);
  });

  it('fails definitively (no money moved) for the magic amount 66.66', async () => {
    const gateway = new MockPaymentGateway();

    await expect(gateway.charge(Money.fromDecimalString('66.66'), request)).rejects.toMatchObject({
      ambiguous: false,
    });
    await expect(gateway.charge(Money.fromDecimalString('66.66'), request)).rejects.toBeInstanceOf(
      PaymentGatewayError,
    );
  });

  it('fails ambiguously (unknown outcome) for the magic amount 77.77', async () => {
    const gateway = new MockPaymentGateway();

    await expect(gateway.charge(Money.fromDecimalString('77.77'), request)).rejects.toMatchObject({
      ambiguous: true,
    });
  });

  it('is idempotent: the same key returns the original result without re-charging', async () => {
    const gateway = new MockPaymentGateway();

    const first = await gateway.charge(Money.fromDecimalString('25.00'), request);
    const second = await gateway.charge(Money.fromDecimalString('25.00'), request);

    expect(second).toEqual(first);
    expect(second.extTransactionId).toBe(first.extTransactionId);
  });

  it('treats different keys as distinct charges', async () => {
    const gateway = new MockPaymentGateway();

    const first = await gateway.charge(Money.fromDecimalString('25.00'), {
      orderId: 'order-1',
      idempotencyKey: 'a',
    });
    const second = await gateway.charge(Money.fromDecimalString('25.00'), {
      orderId: 'order-1',
      idempotencyKey: 'b',
    });

    expect(second.extTransactionId).not.toBe(first.extTransactionId);
  });
});
