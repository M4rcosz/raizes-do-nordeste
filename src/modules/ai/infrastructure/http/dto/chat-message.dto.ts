import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

// A single prior turn the client replays as context. Only user/model text turns are
// accepted: clients may not forge tool turns (those are produced server-side).
export class ChatMessageDto {
  @ApiProperty({ enum: ['user', 'model'] })
  @IsIn(['user', 'model'])
  role!: 'user' | 'model';

  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text!: string;
}
