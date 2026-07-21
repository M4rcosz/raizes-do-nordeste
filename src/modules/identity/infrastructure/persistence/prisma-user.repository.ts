import { User } from '@modules/identity/domain/entities/user.entity';
import {
  CreateUserInput,
  CustomerContact,
  FindUsersInput,
  UpdateProfileInput,
  UserRepository,
} from '@modules/identity/domain/repositories/user.repository';
import { UserAlreadyExistsError } from '@modules/identity/application/errors/user-already-exists.error';
import { InvalidBusinessUnitError } from '@modules/identity/application/errors/invalid-business-unit.error';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { Injectable } from '@nestjs/common';
import { Prisma, type User as PrismaUser } from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { TransactionContext } from '@shared/transaction/transaction-runner.port';

// Always load the unit links so the entity can expose businessUnitIds.
const WITH_UNITS = { businessUnits: { select: { businessUnitId: true } } } as const;

type PrismaUserWithUnits = PrismaUser & { businessUnits: { businessUnitId: string }[] };

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUsername(username: string): Promise<User | null> {
    const raw = await this.prisma.user.findUnique({
      where: { username },
      include: WITH_UNITS,
    });
    return raw ? this.toEntity(raw) : null;
  }

  async findById(id: string): Promise<User | null> {
    const raw = await this.prisma.user.findUnique({ where: { id }, include: WITH_UNITS });
    return raw ? this.toEntity(raw) : null;
  }

  async findByIds(ids: string[]): Promise<User[]> {
    // An empty `in` list matches nothing, so skip the round trip entirely.
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      include: WITH_UNITS,
    });
    return rows.map((raw) => this.toEntity(raw));
  }

  async findActiveCustomerByContact(contact: CustomerContact): Promise<User | null> {
    // Guard before building the term: an empty where would match the first active
    // customer in the table and hand back a stranger's record. The DTO already
    // rejects neither-or-both, so this is defence in depth for non-HTTP callers.
    if (contact.phone === undefined && contact.email === undefined) {
      return null;
    }

    // Exactly one is set by here, so this is a single equality term, never an OR.
    const match: Prisma.UserWhereInput =
      contact.phone !== undefined ? { phone: contact.phone } : { email: contact.email };

    const raw = await this.prisma.user.findFirst({
      where: { ...match, role: UserRole.CUSTOMER, isActive: true },
      include: WITH_UNITS,
    });
    return raw ? this.toEntity(raw) : null;
  }

  async create(input: CreateUserInput): Promise<User> {
    try {
      const created = await this.prisma.user.create({
        data: {
          id: input.id,
          username: input.username,
          name: input.name,
          email: input.email,
          passwordHash: input.passwordHash,
          phone: input.phone,
          role: input.role,
          isActive: input.isActive,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
          businessUnits: {
            create: input.businessUnitIds.map((businessUnitId) => ({ businessUnitId })),
          },
        },
        include: WITH_UNITS,
      });

      return this.toEntity(created);
    } catch (err) {
      // username/email/phone are @unique. Translate the collision to CONFLICT
      // instead of pre-checking with an exists query (which would race).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new UserAlreadyExistsError(
          'A user with the same username, email, or phone already exists.',
          { cause: err },
        );
      }
      // P2003 = FK violation: a businessUnitId in the link set does not exist.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new InvalidBusinessUnitError({ cause: err });
      }
      throw err;
    }
  }

  async deactivateIfRole(
    id: string,
    expectedRole: UserRole,
    updatedById: string | null,
  ): Promise<User | null> {
    // Guard the write on (id, role, isActive) so the role the use case authorized
    // against is the role the row still holds. updateMany returns only a count.
    const { count } = await this.prisma.user.updateMany({
      where: { id, role: expectedRole, isActive: true },
      data: { isActive: false, updatedById },
    });

    if (count === 0) {
      return null;
    }

    // Row was flipped under the guard; re-read to return the persisted snapshot.
    return this.findById(id);
  }

  async reactivateIfRole(
    id: string,
    expectedRole: UserRole,
    updatedById: string | null,
  ): Promise<User | null> {
    // Guard the write on (id, role, isActive=false) — symmetric to deactivateIfRole.
    const { count } = await this.prisma.user.updateMany({
      where: { id, role: expectedRole, isActive: false },
      data: { isActive: true, updatedById },
    });

    if (count === 0) {
      return null;
    }

    return this.findById(id);
  }

  async updateProfile(
    id: string,
    data: UpdateProfileInput,
    updatedById: string,
  ): Promise<User | null> {
    try {
      const updated = await this.prisma.user.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.phone !== undefined && { phone: data.phone }),
          updatedById,
        },
        include: WITH_UNITS,
      });
      return this.toEntity(updated);
    } catch (err) {
      // P2025 = record to update not found (deleted between read and write).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return null;
      }
      // P2002 = unique constraint: phone is @unique.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new UserAlreadyExistsError('A user with the same phone already exists.', {
          cause: err,
        });
      }
      throw err;
    }
  }

  async updatePasswordHash(
    id: string,
    newPasswordHash: string,
    updatedById: string,
    tx?: TransactionContext,
  ): Promise<User | null> {
    const db = this.client(tx);
    try {
      const updated = await db.user.update({
        where: { id },
        data: { passwordHash: newPasswordHash, updatedById },
        include: WITH_UNITS,
      });
      return this.toEntity(updated);
    } catch (err) {
      // P2025 = record to update not found (deleted between read and write).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return null;
      }
      throw err;
    }
  }

  async findMany(input: FindUsersInput): Promise<User[]> {
    const { filters, pagination } = input;
    const rows = await this.prisma.user.findMany({
      where: this.buildWhere(filters),
      include: WITH_UNITS,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pagination.take,
      ...(pagination.cursor && { cursor: { id: pagination.cursor }, skip: 1 }),
    });
    return rows.map((row) => this.toEntity(row));
  }

  async replaceBusinessUnits(
    id: string,
    businessUnitIds: string[],
    updatedById: string,
    tx: TransactionContext,
  ): Promise<User | null> {
    const db = this.client(tx);
    // Existence check inside the tx: if the user vanished, report null so the use
    // case maps it to not-found rather than silently creating orphan links.
    const exists = await db.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      return null;
    }

    try {
      await db.userBusinessUnit.deleteMany({ where: { userId: id } });
      await db.userBusinessUnit.createMany({
        data: businessUnitIds.map((businessUnitId) => ({ userId: id, businessUnitId })),
      });
      const updated = await db.user.update({
        where: { id },
        data: { updatedById },
        include: WITH_UNITS,
      });
      return this.toEntity(updated);
    } catch (err) {
      // P2003 = FK violation: one of the supplied units does not exist.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new InvalidBusinessUnitError({ cause: err });
      }
      throw err;
    }
  }

  private buildWhere(filters?: FindUsersInput['filters']): Prisma.UserWhereInput {
    if (!filters) {
      return {};
    }
    const where: Prisma.UserWhereInput = {};
    // Differentiate "no unit filter" (undefined -> all users) from "an empty
    // scope" ([] -> matches nobody). Ignoring [] here would be fail-open: a
    // caller that forgot to short-circuit an empty scope would leak every user.
    if (filters.businessUnitIds !== undefined) {
      where.businessUnits = { some: { businessUnitId: { in: filters.businessUnitIds } } };
    }
    if (filters.username) {
      where.username = { contains: filters.username, mode: 'insensitive' };
    }
    if (filters.email) {
      where.email = { contains: filters.email, mode: 'insensitive' };
    }
    if (filters.role !== undefined) {
      where.role = filters.role;
    }
    return where;
  }

  // Use the open transaction client when threaded, otherwise the base connection.
  private client(tx?: TransactionContext): Prisma.TransactionClient {
    return (tx as Prisma.TransactionClient | undefined) ?? this.prisma;
  }

  private toEntity(raw: PrismaUserWithUnits): User {
    return new User(
      raw.id,
      raw.businessUnits.map((link) => link.businessUnitId),
      raw.username,
      raw.name,
      raw.email,
      raw.passwordHash,
      raw.phone,
      raw.createdAt,
      raw.updatedAt,
      raw.updatedById,
      raw.role,
      raw.isActive,
    );
  }
}
