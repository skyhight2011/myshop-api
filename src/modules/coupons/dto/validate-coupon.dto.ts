import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Min, MinLength } from 'class-validator';

export class ValidateCouponDto {
  @ApiProperty({ example: 'SAVE10' })
  @IsString()
  @MinLength(3)
  code!: string;

  @ApiProperty({ example: 120 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  subtotal!: number;
}
