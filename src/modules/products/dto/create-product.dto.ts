import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateProductImageDto } from './create-product-image.dto';
import { CreateProductOptionDto } from './create-product-option.dto';
import { CreateProductVariantDto } from './create-product-variant.dto';

export { CreateProductImageDto, CreateProductVariantDto };

export class CreateProductDto {
  @ApiProperty({ example: 'Classic Cotton T-Shirt' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: 'classic-cotton-t-shirt' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ example: 'Soft cotton t-shirt for everyday wear' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Soft cotton everyday tee' })
  @IsOptional()
  @IsString()
  shortDescription?: string;

  @ApiPropertyOptional({ example: 'Northwind' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  brand?: string;

  @ApiProperty({ example: 24.99 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ example: 34.99 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  compareAtPrice?: number;

  @ApiProperty({ example: 'TEE-001' })
  @IsString()
  @MinLength(1)
  sku!: string;

  @ApiPropertyOptional({ example: '1234567890123' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  barcode?: string;

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(0)
  stock!: number;

  @ApiPropertyOptional({
    example: 180,
    description: 'Shipping weight in grams',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  weightGrams?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ enum: ProductStatus, example: ProductStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ example: 'Classic Cotton T-Shirt' })
  @IsOptional()
  @IsString()
  metaTitle?: string;

  @ApiPropertyOptional({ example: 'Shop the classic cotton t-shirt.' })
  @IsOptional()
  @IsString()
  metaDescription?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  categoryId?: number;

  @ApiPropertyOptional({ type: [CreateProductImageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductImageDto)
  images?: CreateProductImageDto[];

  @ApiPropertyOptional({ type: [CreateProductOptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductOptionDto)
  options?: CreateProductOptionDto[];

  @ApiPropertyOptional({ type: [CreateProductVariantDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantDto)
  variants?: CreateProductVariantDto[];
}
