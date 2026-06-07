import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    example: 'john.doe@example.com',
  })
  email!: string;

  @ApiPropertyOptional({
    example: 'John Doe',
  })
  name?: string;
}
