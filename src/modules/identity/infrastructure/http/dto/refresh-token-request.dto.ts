import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  // Optional: the refresh token may arrive via the httpOnly cookie instead of
  // the body. The controller enforces that at least one source is present.
  @IsOptional()
  @IsString()
  refresh_token?: string;
}
