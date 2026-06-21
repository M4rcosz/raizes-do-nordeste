import { ApiProperty } from '@nestjs/swagger';
import { User } from '@modules/identity/domain/entities/user.entity';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';

// Public-safe view of a user. The password hash is never part of this shape.
export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  username!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  email!: string | null;

  @ApiProperty({ nullable: true })
  phone!: string | null;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty({ nullable: true })
  businessUnitId!: string | null;

  @ApiProperty()
  isActive!: boolean;

  static fromEntity(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.username = user.username;
    dto.name = user.name;
    dto.email = user.email;
    dto.phone = user.phone;
    dto.role = user.role;
    dto.businessUnitId = user.businessUnitId;
    dto.isActive = user.isActive;
    return dto;
  }
}
