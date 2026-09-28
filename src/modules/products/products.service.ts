import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { serializeDecimals } from '../../common/utils/decimal.util';
import { slugify } from '../../common/utils/slug.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { CreateProductOptionDto } from './dto/create-product-option.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductImageDto } from './dto/update-product-image.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { VariantOptionSelectionDto } from './dto/variant-option-selection.dto';

const productInclude = {
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  images: {
    orderBy: {
      sortOrder: 'asc',
    },
  },
  options: {
    orderBy: {
      position: 'asc',
    },
    include: {
      values: {
        orderBy: {
          position: 'asc',
        },
      },
    },
  },
  variants: {
    orderBy: {
      id: 'asc',
    },
    include: {
      optionValues: {
        include: {
          optionValue: {
            include: {
              option: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  },
  _count: {
    select: {
      reviews: true,
    },
  },
} satisfies Prisma.ProductInclude;

type ProductOptionWithValues = {
  name: string;
  values: { id: number; value: string }[];
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createProductDto: CreateProductDto) {
    const slug = createProductDto.slug ?? slugify(createProductDto.name);
    const listing = resolveListingState(createProductDto) ?? {
      isActive: true,
      status: ProductStatus.ACTIVE,
    };

    if (createProductDto.categoryId) {
      await this.ensureCategoryExists(createProductDto.categoryId);
    }

    assertUniqueOptions(createProductDto.options);

    try {
      const product = await this.prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            name: createProductDto.name,
            slug,
            description: createProductDto.description,
            shortDescription: createProductDto.shortDescription,
            brand: createProductDto.brand,
            price: createProductDto.price,
            compareAtPrice: createProductDto.compareAtPrice,
            sku: createProductDto.sku,
            barcode: createProductDto.barcode,
            stock: createProductDto.stock,
            weightGrams: createProductDto.weightGrams,
            isActive: listing.isActive,
            isFeatured: createProductDto.isFeatured ?? false,
            status: listing.status,
            metaTitle: createProductDto.metaTitle,
            metaDescription: createProductDto.metaDescription,
            categoryId: createProductDto.categoryId,
            images: createProductDto.images
              ? { create: createProductDto.images }
              : undefined,
            options: createProductDto.options
              ? {
                  create: createProductDto.options.map((option, index) => ({
                    name: option.name.trim(),
                    position: option.position ?? index,
                    values: {
                      create: option.values.map((value, valueIndex) => ({
                        value: value.trim(),
                        position: valueIndex,
                      })),
                    },
                  })),
                }
              : undefined,
          },
          include: {
            options: {
              include: {
                values: true,
              },
            },
          },
        });

        for (const variant of createProductDto.variants ?? []) {
          const optionValueIds = resolveOptionValueIds(
            created.options,
            variant.options,
          );

          await tx.productVariant.create({
            data: {
              productId: created.id,
              ...variantFields(variant),
              optionValues: optionValueIds.length
                ? {
                    create: optionValueIds.map((optionValueId) => ({
                      optionValueId,
                    })),
                  }
                : undefined,
            },
          });
        }

        return tx.product.findUniqueOrThrow({
          where: { id: created.id },
          include: productInclude,
        });
      });

      return serializeDecimals(product);
    } catch (error) {
      throw mapUniqueConstraint(error);
    }
  }

  async findAll(query: QueryProductsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;
    const filters: Prisma.ProductWhereInput[] = [];

    if (query.search) {
      filters.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          { shortDescription: { contains: query.search, mode: 'insensitive' } },
          { sku: { contains: query.search, mode: 'insensitive' } },
          { brand: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    if (query.inStock) {
      filters.push({
        OR: [
          { variants: { none: {} }, stock: { gt: 0 } },
          {
            variants: {
              some: { stock: { gt: 0 }, isActive: true },
            },
          },
        ],
      });
    }

    const where: Prisma.ProductWhereInput = {
      isActive: true,
      status: ProductStatus.ACTIVE,
      categoryId: query.categoryId,
      isFeatured: query.isFeatured,
      brand: query.brand
        ? { equals: query.brand, mode: 'insensitive' }
        : undefined,
      price: {
        gte: query.minPrice,
        lte: query.maxPrice,
      },
      AND: filters.length ? filters : undefined,
    };

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: productInclude,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: serializeDecimals(items),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });

    if (!product) {
      throw new NotFoundException(`Product with id ${id} not found`);
    }

    return serializeDecimals(product);
  }

  async findBySlug(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: productInclude,
    });

    if (!product) {
      throw new NotFoundException(`Product with slug ${slug} not found`);
    }

    return serializeDecimals(product);
  }

  async update(id: number, updateProductDto: UpdateProductDto) {
    await this.findOne(id);

    if (updateProductDto.categoryId) {
      await this.ensureCategoryExists(updateProductDto.categoryId);
    }

    const slug =
      updateProductDto.slug ??
      (updateProductDto.name ? slugify(updateProductDto.name) : undefined);
    const listing = resolveListingState(updateProductDto);

    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: {
          name: updateProductDto.name,
          slug,
          description: updateProductDto.description,
          shortDescription: updateProductDto.shortDescription,
          brand: updateProductDto.brand,
          price: updateProductDto.price,
          compareAtPrice: updateProductDto.compareAtPrice,
          sku: updateProductDto.sku,
          barcode: updateProductDto.barcode,
          stock: updateProductDto.stock,
          weightGrams: updateProductDto.weightGrams,
          isFeatured: updateProductDto.isFeatured,
          metaTitle: updateProductDto.metaTitle,
          metaDescription: updateProductDto.metaDescription,
          categoryId: updateProductDto.categoryId,
          ...(listing ?? {}),
        },
        include: productInclude,
      });

      return serializeDecimals(product);
    } catch (error) {
      throw mapUniqueConstraint(error);
    }
  }

  async remove(id: number) {
    await this.findOne(id);

    const orderItemCount = await this.prisma.orderItem.count({
      where: { productId: id },
    });

    if (orderItemCount > 0) {
      const product = await this.prisma.product.update({
        where: { id },
        data: {
          isActive: false,
          status: ProductStatus.ARCHIVED,
        },
        include: productInclude,
      });

      return serializeDecimals(product);
    }

    return this.prisma.product.delete({
      where: { id },
    });
  }

  async addImage(productId: number, createImageDto: CreateProductImageDto) {
    await this.findOne(productId);

    return this.prisma.productImage.create({
      data: {
        productId,
        url: createImageDto.url,
        alt: createImageDto.alt,
        sortOrder: createImageDto.sortOrder ?? 0,
      },
    });
  }

  async updateImage(
    productId: number,
    imageId: number,
    updateImageDto: UpdateProductImageDto,
  ) {
    await this.ensureProductImage(productId, imageId);

    return this.prisma.productImage.update({
      where: { id: imageId },
      data: updateImageDto,
    });
  }

  async removeImage(productId: number, imageId: number) {
    await this.ensureProductImage(productId, imageId);

    return this.prisma.productImage.delete({
      where: { id: imageId },
    });
  }

  async addVariant(
    productId: number,
    createVariantDto: CreateProductVariantDto,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        options: {
          include: { values: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with id ${productId} not found`);
    }

    const optionValueIds = resolveOptionValueIds(
      product.options,
      createVariantDto.options,
    );

    try {
      const variant = await this.prisma.productVariant.create({
        data: {
          productId,
          ...variantFields(createVariantDto),
          optionValues: optionValueIds.length
            ? {
                create: optionValueIds.map((optionValueId) => ({
                  optionValueId,
                })),
              }
            : undefined,
        },
        include: productInclude.variants.include,
      });

      return serializeDecimals(variant);
    } catch (error) {
      throw mapUniqueConstraint(
        error,
        'A variant with this SKU already exists',
      );
    }
  }

  async updateVariant(
    productId: number,
    variantId: number,
    updateVariantDto: UpdateProductVariantDto,
  ) {
    await this.ensureProductVariant(productId, variantId);

    let optionValueIds: number[] | undefined;

    if (updateVariantDto.options) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        include: {
          options: {
            include: { values: true },
          },
        },
      });

      if (!product) {
        throw new NotFoundException(`Product with id ${productId} not found`);
      }

      optionValueIds = resolveOptionValueIds(
        product.options,
        updateVariantDto.options,
      );
    }

    try {
      const variant = await this.prisma.productVariant.update({
        where: { id: variantId },
        data: {
          name: updateVariantDto.name,
          sku: updateVariantDto.sku,
          barcode: updateVariantDto.barcode,
          price: updateVariantDto.price,
          compareAtPrice: updateVariantDto.compareAtPrice,
          stock: updateVariantDto.stock,
          isActive: updateVariantDto.isActive,
          optionValues: optionValueIds
            ? {
                deleteMany: {},
                create: optionValueIds.map((optionValueId) => ({
                  optionValueId,
                })),
              }
            : undefined,
        },
        include: productInclude.variants.include,
      });

      return serializeDecimals(variant);
    } catch (error) {
      throw mapUniqueConstraint(
        error,
        'A variant with this SKU already exists',
      );
    }
  }

  async removeVariant(productId: number, variantId: number) {
    await this.ensureProductVariant(productId, variantId);

    return this.prisma.productVariant.delete({
      where: { id: variantId },
    });
  }

  async findByCategory(categoryId: number, query: QueryProductsDto) {
    return this.findAll({
      ...query,
      categoryId,
    });
  }

  private async ensureProductImage(productId: number, imageId: number) {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
    });

    if (!image) {
      throw new NotFoundException(
        `Product image with id ${imageId} not found for product ${productId}`,
      );
    }
  }

  private async ensureProductVariant(productId: number, variantId: number) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId },
    });

    if (!variant) {
      throw new NotFoundException(
        `Product variant with id ${variantId} not found for product ${productId}`,
      );
    }
  }

  private async ensureCategoryExists(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }
  }
}

function variantFields(dto: CreateProductVariantDto) {
  return {
    name: dto.name,
    sku: dto.sku,
    barcode: dto.barcode,
    price: dto.price,
    compareAtPrice: dto.compareAtPrice,
    stock: dto.stock,
    isActive: dto.isActive ?? true,
  };
}

function resolveListingState(input: {
  isActive?: boolean;
  status?: ProductStatus;
}): { isActive: boolean; status: ProductStatus } | undefined {
  if (input.status !== undefined) {
    return {
      status: input.status,
      isActive: input.status === ProductStatus.ACTIVE,
    };
  }

  if (input.isActive !== undefined) {
    return {
      isActive: input.isActive,
      status: input.isActive ? ProductStatus.ACTIVE : ProductStatus.ARCHIVED,
    };
  }

  return undefined;
}

function assertUniqueOptions(options?: CreateProductOptionDto[]) {
  if (!options?.length) {
    return;
  }

  const names = new Set<string>();

  for (const option of options) {
    const name = option.name.trim().toLowerCase();

    if (names.has(name)) {
      throw new BadRequestException(`Duplicate option "${option.name}"`);
    }

    names.add(name);
    const values = new Set<string>();

    for (const value of option.values) {
      const normalized = value.trim().toLowerCase();

      if (!normalized) {
        throw new BadRequestException(
          `Option "${option.name}" has an empty value`,
        );
      }

      if (values.has(normalized)) {
        throw new BadRequestException(
          `Duplicate value "${value}" for option "${option.name}"`,
        );
      }

      values.add(normalized);
    }
  }
}

function resolveOptionValueIds(
  options: ProductOptionWithValues[],
  selections?: VariantOptionSelectionDto[],
): number[] {
  if (!options.length) {
    if (selections?.length) {
      throw new BadRequestException('This product has no options');
    }

    return [];
  }

  if (!selections?.length || selections.length !== options.length) {
    throw new BadRequestException(
      'Each variant must select one value for every product option',
    );
  }

  const optionsByName = new Map(
    options.map((option) => [option.name.trim().toLowerCase(), option]),
  );
  const seen = new Set<string>();
  const ids: number[] = [];

  for (const selection of selections) {
    const option = optionsByName.get(selection.name.trim().toLowerCase());

    if (!option) {
      throw new BadRequestException(`Unknown option "${selection.name}"`);
    }

    if (seen.has(option.name)) {
      throw new BadRequestException(`Duplicate option "${selection.name}"`);
    }

    seen.add(option.name);
    const match = option.values.find(
      (optionValue) =>
        optionValue.value.trim().toLowerCase() ===
        selection.value.trim().toLowerCase(),
    );

    if (!match) {
      throw new BadRequestException(
        `Unknown value "${selection.value}" for option "${selection.name}"`,
      );
    }

    ids.push(match.id);
  }

  return ids;
}

function mapUniqueConstraint(error: unknown, message?: string): Error {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return new ConflictException(
      message ?? 'A product with this slug, SKU, or barcode already exists',
    );
  }

  return error instanceof Error ? error : new Error('Unexpected error');
}
