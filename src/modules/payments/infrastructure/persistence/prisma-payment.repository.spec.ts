import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { PrismaPaymentRepository } from './prisma-payment.repository';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { CorruptPersistedMoneyError } from '@shared/errors/infrastructure/corrupt-persisted-money.error';
import { InvalidMoneyError } from '@shared/errors/domain/invalid-money.error';
import { PaymentMethod } from '@modules/payments/domain/value-objects/payment-method';
import { PaymentStatus } from '@modules/payments/domain/value-objects/payment-status';
import { OrderNotPayableError } from '@modules/payments/application/errors/order-not-payable.error';
import { knownRequestError } from '@shared/infrastructure/prisma/testing/prisma-mock';

// Each delegate method is an async fn; `unknown` args/return keep the cast light while
// letting mockResolvedValue accept the raw Prisma rows.
type DelegateFn = jest.MockedFunction<(args?: unknown) => Promise<unknown>>;

type PaymentDelegate = {
  create: DelegateFn;
  findUnique: DelegateFn;
  findFirst: DelegateFn;
  findMany: DelegateFn;
  update: DelegateFn;
  updateMany: DelegateFn;
};

const delegateFn = (): DelegateFn => jest.fn() as DelegateFn;

const buildPrismaMock = (): { payment: PaymentDelegate } => ({
  payment: {
    create: delegateFn(),
    findUnique: delegateFn(),
    findFirst: delegateFn(),
    findMany: delegateFn(),
    update: delegateFn(),
    updateMany: delegateFn(),
  },
});

const rawPayment = {
  id: 'pay-1',
  orderId: 'order-1',
  amount: new Prisma.Decimal('25.00'),
  method: PaymentMethod.PIX,
  status: PaymentStatus.PROCESSING,
  extTransactionId: 'tx-1',
  gatewayRequest: null,
  gatewayResponse: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PrismaPaymentRepository', () => {
  let prisma: { payment: PaymentDelegate };
  let repo: PrismaPaymentRepository;

  beforeEach(() => {
    prisma = buildPrismaMock();
    repo = new PrismaPaymentRepository(prisma as unknown as PrismaService);
  });

  it('persists a payment and maps it to a domain entity with a Money amount', async () => {
    prisma.payment.create.mockResolvedValue(rawPayment);

    const result = await repo.create({
      orderId: 'order-1',
      amount: '25.00',
      method: PaymentMethod.PIX,
      status: PaymentStatus.PENDING,
      extTransactionId: null,
    });

    expect(prisma.payment.create).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('pay-1');
    expect(result.amount.toDecimalString()).toBe('25.00');
  });

  it('rethrows a corrupt persisted amount as CorruptPersistedMoneyError without leaking the raw value', async () => {
    // A row whose amount big.js cannot parse stands in for corrupt DB data. The token is
    // distinctive so we can assert it never surfaces in the client-facing message.
    prisma.payment.findUnique.mockResolvedValue({
      ...rawPayment,
      amount: { toString: () => 'RAW_LEAK_TOKEN' },
    });

    const error = await repo.findByExtTransactionId('tx-1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CorruptPersistedMoneyError);
    if (error instanceof Error) {
      expect(error.message).not.toContain('RAW_LEAK_TOKEN');
      expect(error.cause).toBeInstanceOf(InvalidMoneyError);
    }
  });

  it('maps a unique-violation (P2002) to OrderNotPayableError', async () => {
    prisma.payment.create.mockRejectedValue(knownRequestError('P2002'));

    await expect(
      repo.create({
        orderId: 'order-1',
        amount: '25.00',
        method: PaymentMethod.PIX,
        status: PaymentStatus.PENDING,
        extTransactionId: null,
      }),
    ).rejects.toBeInstanceOf(OrderNotPayableError);
  });

  it('finds the live attempt for an order (PENDING/PROCESSING/APPROVED)', async () => {
    prisma.payment.findFirst.mockResolvedValue(rawPayment);

    const result = await repo.findActiveByOrderId('order-1');

    expect(prisma.payment.findFirst).toHaveBeenCalledWith({
      where: {
        orderId: 'order-1',
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING, PaymentStatus.APPROVED] },
      },
    });
    expect(result?.orderId).toBe('order-1');
  });

  it('returns null when no live attempt exists for the order', async () => {
    prisma.payment.findFirst.mockResolvedValue(null);

    expect(await repo.findActiveByOrderId('order-x')).toBeNull();
  });

  it('finds the most recent attempt for an order', async () => {
    prisma.payment.findFirst.mockResolvedValue(rawPayment);

    const result = await repo.findCurrentByOrderId('order-1');

    expect(prisma.payment.findFirst).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(result?.id).toBe('pay-1');
  });

  it('finds a payment by ext transaction id via findUnique', async () => {
    prisma.payment.findUnique.mockResolvedValue(rawPayment);

    const result = await repo.findByExtTransactionId('tx-1');

    expect(prisma.payment.findUnique).toHaveBeenCalledWith({
      where: { extTransactionId: 'tx-1' },
    });
    expect(result?.extTransactionId).toBe('tx-1');
  });

  it('attaches the gateway outcome to a reserved attempt (markCharged)', async () => {
    prisma.payment.update.mockResolvedValue({ ...rawPayment, status: PaymentStatus.PROCESSING });

    const result = await repo.markCharged({
      id: 'pay-1',
      status: PaymentStatus.PROCESSING,
      extTransactionId: 'tx-1',
      gatewayRequest: { amount: '25.00', idempotencyKey: 'pay-1' },
      gatewayResponse: { ok: true },
    });

    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'pay-1' },
      data: {
        status: PaymentStatus.PROCESSING,
        extTransactionId: 'tx-1',
        gatewayRequest: { amount: '25.00', idempotencyKey: 'pay-1' },
        gatewayResponse: { ok: true },
      },
    });
    expect(result.status).toBe(PaymentStatus.PROCESSING);
  });

  it('updates a payment status', async () => {
    prisma.payment.update.mockResolvedValue({ ...rawPayment, status: PaymentStatus.APPROVED });

    const result = await repo.updateStatus({ id: 'pay-1', status: PaymentStatus.APPROVED });

    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'pay-1' },
      data: { status: PaymentStatus.APPROVED },
    });
    expect(result.status).toBe(PaymentStatus.APPROVED);
  });

  describe('settle', () => {
    it('settles a still-settleable attempt and returns the re-read payment', async () => {
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });
      prisma.payment.findUnique.mockResolvedValue({
        ...rawPayment,
        status: PaymentStatus.APPROVED,
      });

      const result = await repo.settle({ id: 'pay-1', status: PaymentStatus.APPROVED });

      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay-1', status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] } },
        data: { status: PaymentStatus.APPROVED },
      });
      expect(prisma.payment.findUnique).toHaveBeenCalledWith({ where: { id: 'pay-1' } });
      expect(result?.status).toBe(PaymentStatus.APPROVED);
    });

    it('returns null without re-reading when no settleable row matched (already settled)', async () => {
      prisma.payment.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        repo.settle({ id: 'pay-1', status: PaymentStatus.APPROVED }),
      ).resolves.toBeNull();
      expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('cancelStaleReservations', () => {
    it('cancels only stale, never-charged PENDING reservations and returns the count', async () => {
      prisma.payment.updateMany.mockResolvedValue({ count: 3 });
      const cutoff = new Date('2026-01-01T00:00:00Z');

      const count = await repo.cancelStaleReservations(cutoff);

      // PROCESSING (possibly charged) and already-charged rows are deliberately excluded.
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: {
          status: PaymentStatus.PENDING,
          extTransactionId: null,
          createdAt: { lt: cutoff },
        },
        data: { status: PaymentStatus.CANCELLED },
      });
      expect(count).toBe(3);
    });
  });

  describe('findApprovedOrderIdsForCancelledOrders', () => {
    it('selects APPROVED payments whose order is CANCELLED and returns their order ids', async () => {
      prisma.payment.findMany.mockResolvedValue([{ orderId: 'o-1' }, { orderId: 'o-2' }]);

      const orderIds = await repo.findApprovedOrderIdsForCancelledOrders();

      expect(prisma.payment.findMany).toHaveBeenCalledWith({
        where: { status: PaymentStatus.APPROVED, order: { orderStatus: 'CANCELLED' } },
        select: { orderId: true },
      });
      expect(orderIds).toEqual(['o-1', 'o-2']);
    });
  });
});
