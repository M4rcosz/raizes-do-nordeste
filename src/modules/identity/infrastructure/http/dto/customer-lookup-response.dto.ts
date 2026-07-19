import { ApiProperty } from '@nestjs/swagger';
import { User } from '@modules/identity/domain/entities/user.entity';

// Minimal view for the attendant counter flow: just enough to confirm the right
// person and bind the order. Deliberately NOT UserResponseDto - that would echo
// back email, phone, role and unit scope. The caller already knows the contact
// value they searched by, so they learn nothing new from a hit.
export class CustomerLookupResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  static fromEntity(user: User): CustomerLookupResponseDto {
    const dto = new CustomerLookupResponseDto();
    dto.id = user.id;
    dto.name = user.name;
    return dto;
  }
}
