import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEmpty, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { EMAIL_MAX_LENGTH } from '@modules/identity/domain/value-objects/email-normalization';
import { ExactlyOneOf } from '@shared/validation/exactly-one-of';
import { NormalizeEmail } from './normalize-email';

// Point lookup of a customer by one exact contact value. Exactly one of phone/email
// must be present: with neither there is nothing to match, and with both the query
// would need an OR, turning a point lookup into a two-column probe per request.
// We use @ValidateIf(present) instead of @IsOptional so an explicit null still runs
// the validators (@IsOptional skips undefined AND null), keeping ?phone= a 400.
export class LookupCustomerQueryDto {
  @ApiPropertyOptional({ example: '+5581999999999', maxLength: 20 })
  @ValidateIf((obj: LookupCustomerQueryDto) => obj.phone !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'maria@example.com', maxLength: EMAIL_MAX_LENGTH })
  @ValidateIf((obj: LookupCustomerQueryDto) => obj.email !== undefined)
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email?: string;

  // Carrier for the exactly-one rule, which has to hang off a property that is never
  // skipped: @ValidateIf(present) on phone/email suppresses their validators when
  // absent, which is one of the two cases we reject. Registering a constraint here
  // makes _contactField a KNOWN property, so whitelist does not strip it - @IsEmpty
  // rejects a client that sends it rather than letting it land on the instance.
  @IsEmpty()
  @ExactlyOneOf(['phone', 'email'])
  readonly _contactField?: never;
}
