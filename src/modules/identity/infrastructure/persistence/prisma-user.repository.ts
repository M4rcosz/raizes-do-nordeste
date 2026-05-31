import { User } from '@modules/identity/domain/entities/user.entity';
import { UserRepository } from '@modules/identity/domain/repositories/user.repository';
import { Injectable } from '@nestjs/common';
import type { User as PrismaUser } from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUsername(username: string): Promise<User | null> {
    const raw = await this.prisma.user.findUnique({ where: { username } });
    return raw ? this.toEntity(raw) : null;
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
