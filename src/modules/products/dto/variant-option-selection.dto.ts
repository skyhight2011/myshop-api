import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class VariantOptionSelectionDto {
  @ApiProperty({ example: 'Size' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'M' })
  @IsString()
  @MinLength(1)
  value!: string;
}
