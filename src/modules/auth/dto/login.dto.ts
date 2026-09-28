import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'dangtruyen2011@gmail.com',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'secretPassword123',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password!: string;
}
