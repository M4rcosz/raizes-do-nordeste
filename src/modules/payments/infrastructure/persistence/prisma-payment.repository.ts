import { Injectable } from '@nestjs/common';
import { Prisma, type Payment as PaymentModel } from '@prisma/client';
import Big from 'big.js';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { Payment } from '@modules/payments/domain/entities/payment.entity';
import {
  CreatePaymentInput,
  MarkChargedInput,
  PaymentRepository,
  SettlePaymentInput,
  UpdatePaymentStatusInput,
} from '@modules/payments/domain/repositories/payment.repository';
import {
  LIVE_PAYMENT_STATUSES,
  PaymentStatus,
  SETTLEABLE_PAYMENT_STATUSES,
} from '@modules/payments/domain/value-objects/payment-status';
import { OrderNotPayableError } from '@modules/payments/application/errors/order-not-payable.error';

@Injectable()
export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreatePaymentInput, tx?: TransactionContext): Promise<Payment> {
    const db = (tx as Prisma.TransactionClient) ?? this.prisma;

    try {
      const raw = await db.payment.create({
        data: {
          orderId: input.orderId,
          amount: input.amount,
          method: input.method,
          status: input.status,
          extTransactionId: input.extTransactionId,
          gatewayResponse: (input.gatewayResponse as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        },
      });
      return this.toEntity(raw);
    } catch (err) {
      // The partial unique index (one live attempt per order) rejects a concurrent
      // second reserve before the gateway is charged.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new OrderNotPayableError(
          `Order ${input.orderId} already has a payment in progress or settled.`,
          { cause: err },
        );
      }
      throw err;
    }
  }

  async findActiveByOrderId(orderId: string): Promise<Payment | null> {
    const raw = await this.prisma.payment.findFirst({
      where: { orderId, status: { in: [...LIVE_PAYMENT_STATUSES] } },
    });
    return raw ? this.toEntity(raw) : null;
  }

  async findCurrentByOrderId(orderId: string): Promise<Payment | null> {
    const raw = await this.prisma.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
    return raw ? this.toEntity(raw) : null;
  }

  async findByExtTransactionId(extTransactionId: string): Promise<Payment | null> {
    const raw = await this.prisma.payment.findUnique({ where: { extTransactionId } });
    return raw ? this.toEntity(raw) : null;
  }

  async markCharged(input: MarkChargedInput, tx?: TransactionContext): Promise<Payment> {
    const db = (tx as Prisma.TransactionClient) ?? this.prisma;

    const raw = await db.payment.update({
      where: { id: input.id },
      data: {
        status: input.status,
        extTransactionId: input.extTransactionId,
        gatewayRequest: (input.gatewayRequest as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        gatewayResponse: (input.gatewayResponse as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });
    return this.toEntity(raw);
  }

  async updateStatus(input: UpdatePaymentStatusInput, tx?: TransactionContext): Promise<Payment> {
    const db = (tx as Prisma.TransactionClient) ?? this.prisma;

    const raw = await db.payment.update({
      where: { id: input.id },
      data: { status: input.status },
    });
    return this.toEntity(raw);
  }

  async settle(input: SettlePaymentInput, tx?: TransactionContext): Promise<Payment | null> {
    const db = (tx as Prisma.TransactionClient) ?? this.prisma;

    // Optimistic guard: only a still-settleable row flips. count===0 means another
    // webhook delivery already settled it, so the caller treats this as a no-op.
    const { count } = await db.payment.updateMany({
      where: { id: input.id, status: { in: [...SETTLEABLE_PAYMENT_STATUSES] } },
      data: { status: input.status },
    });

    if (count === 0) {
      return null;
    }

    const raw = await db.payment.findUnique({ where: { id: input.id } });
    return raw ? this.toEntity(raw) : null;
  }

  async cancelStaleReservations(olderThan: Date): Promise<number> {
    // Only abandoned reservations: still PENDING and never charged (null extTransactionId).
    // PROCESSING is excluded on purpose - a charge there may have moved money.
    const { count } = await this.prisma.payment.updateMany({
      where: {
        status: PaymentStatus.PENDING,
        extTransactionId: null,
        createdAt: { lt: olderThan },
      },
      data: { status: PaymentStatus.CANCELLED },
    });
    return count;
  }

  private toEntity(raw: PaymentModel): Payment {
    return new Payment(
      raw.id,
      raw.orderId,
      new Big(raw.amount.toString()),
      raw.method,
      raw.status,
      raw.extTransactionId,
      raw.createdAt,
      raw.updatedAt,
    );
  }
}
