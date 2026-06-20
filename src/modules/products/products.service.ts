import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { serializeDecimals } from '../../common/utils/decimal.util';
import { slugify } from '../../common/utils/slug.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductImageDto } from './dto/create-product-image.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductImageDto } from './dto/update-product-image.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';

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
  variants: true,
  _count: {
    select: {
      reviews: true,
    },
  },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createProductDto: CreateProductDto) {
    const slug = createProductDto.slug ?? slugify(createProductDto.name);

    if (createProductDto.categoryId) {
      await this.ensureCategoryExists(createProductDto.categoryId);
    }

    try {
      const product = await this.prisma.product.create({
        data: {
          name: createProductDto.name,
          slug,
          description: createProductDto.description,
          price: createProductDto.price,
          compareAtPrice: createProductDto.compareAtPrice,
          sku: createProductDto.sku,
          stock: createProductDto.stock,
          isActive: createProductDto.isActive ?? true,
          categoryId: createProductDto.categoryId,
          images: createProductDto.images
            ? {
                create: createProductDto.images,
              }
            : undefined,
          variants: createProductDto.variants
            ? {
                create: createProductDto.variants,
              }
            : undefined,
        },
        include: productInclude,
      });

      return serializeDecimals(product);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A product with this slug or SKU already exists',
        );
      }

      throw error;
    }
  }

  async findAll(query: QueryProductsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      isActive: true,
      categoryId: query.categoryId,
      price: {
        gte: query.minPrice,
        lte: query.maxPrice,
      },
      OR: query.search
        ? [
            { name: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } },
            { sku: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
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

    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: {
          name: updateProductDto.name,
          slug,
          description: updateProductDto.description,
          price: updateProductDto.price,
          compareAtPrice: updateProductDto.compareAtPrice,
          sku: updateProductDto.sku,
          stock: updateProductDto.stock,
          isActive: updateProductDto.isActive,
          categoryId: updateProductDto.categoryId,
        },
        include: productInclude,
      });

      return serializeDecimals(product);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A product with this slug or SKU already exists',
        );
      }

      throw error;
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
        data: { isActive: false },
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
    await this.findOne(productId);

    try {
      const variant = await this.prisma.productVariant.create({
        data: {
          productId,
          ...createVariantDto,
        },
      });

      return serializeDecimals(variant);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A variant with this SKU already exists');
      }

      throw error;
    }
  }

  async updateVariant(
    productId: number,
    variantId: number,
    updateVariantDto: UpdateProductVariantDto,
  ) {
    await this.ensureProductVariant(productId, variantId);

    try {
      const variant = await this.prisma.productVariant.update({
        where: { id: variantId },
        data: updateVariantDto,
      });

      return serializeDecimals(variant);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A variant with this SKU already exists');
      }

      throw error;
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
