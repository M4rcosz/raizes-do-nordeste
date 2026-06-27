import { IsString, IsNotEmpty } from 'class-validator';

export class LogoutDto {
  @IsString()
  @IsNotEmpty()
  refresh_token!: string;
}
