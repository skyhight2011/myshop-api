import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsString, Min, MinLength } from 'class-validator';

export class CreateProductVariantDto {
  @ApiProperty({ example: 'Large / Blue' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'SKU-L-BLU' })
  @IsString()
  @MinLength(1)
  sku!: string;

  @ApiProperty({ example: 29.99 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(0)
  stock!: number;
}
