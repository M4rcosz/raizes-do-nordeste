import { ApiProperty } from '@nestjs/swagger';
import { AuditLog } from '@modules/audit/domain/entities/audit-log.entity';

export class AuditLogResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Acting user; null for system events.',
  })
  readonly userId!: string | null;

  @ApiProperty({ example: 'LOGIN_SUCCESS' })
  readonly action!: string;

  @ApiProperty({ example: 'User' })
  readonly entity!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  readonly entityId!: string | null;

  @ApiProperty({
    type: 'object',
    nullable: true,
    additionalProperties: true,
    description: 'Sanitized contextual data; sensitive keys are redacted on write.',
  })
  readonly metadata!: Record<string, unknown> | null;

  @ApiProperty()
  readonly createdAt!: Date;

  static fromEntity(log: AuditLog): AuditLogResponseDto {
    return Object.assign(new AuditLogResponseDto(), {
      id: log.id,
      userId: log.userId,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      metadata: log.metadata,
      createdAt: log.createdAt,
    });
  }
}
