import { User } from '@modules/identity/domain/entities/user.entity';
import {
  CreateUserInput,
  UpdateProfileInput,
  UserRepository,
} from '@modules/identity/domain/repositories/user.repository';
import { UserAlreadyExistsError } from '@modules/identity/application/errors/user-already-exists.error';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { Injectable } from '@nestjs/common';
import { Prisma, type User as PrismaUser } from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { TransactionContext } from '@shared/transaction/transaction-runner.port';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUsername(username: string): Promise<User | null> {
    const raw = await this.prisma.user.findUnique({ where: { username } });
    return raw ? this.toEntity(raw) : null;
  }

  async findById(id: string): Promise<User | null> {
    const raw = await this.prisma.user.findUnique({ where: { id } });
    return raw ? this.toEntity(raw) : null;
  }

  async create(input: CreateUserInput): Promise<User> {
    try {
      const created = await this.prisma.user.create({
        data: {
          id: input.id,
          businessUnitId: input.businessUnitId,
          username: input.username,
          name: input.name,
          email: input.email,
          passwordHash: input.passwordHash,
          phone: input.phone,
          role: input.role,
          isActive: input.isActive,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        },
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
    const updated = await this.prisma.user.findUnique({ where: { id } });
    return updated ? this.toEntity(updated) : null;
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

    const updated = await this.prisma.user.findUnique({ where: { id } });
    return updated ? this.toEntity(updated) : null;
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

  // Use the open transaction client when threaded, otherwise the base connection.
  private client(tx?: TransactionContext): Prisma.TransactionClient {
    return (tx as Prisma.TransactionClient | undefined) ?? this.prisma;
  }

  private toEntity(raw: PrismaUser): User {
    return new User(
      raw.id,
      raw.businessUnitId,
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
