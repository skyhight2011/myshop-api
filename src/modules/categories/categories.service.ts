import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { slugify } from '../../common/utils/slug.util';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { QueryProductsDto } from '../products/dto/query-products.dto';

const categoryInclude = {
  parent: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  children: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  _count: {
    select: {
      products: true,
    },
  },
} satisfies Prisma.CategoryInclude;

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
  ) {}

  async create(createCategoryDto: CreateCategoryDto) {
    const slug = createCategoryDto.slug ?? slugify(createCategoryDto.name);

    if (createCategoryDto.parentId) {
      await this.ensureCategoryExists(createCategoryDto.parentId);
    }

    try {
      return await this.prisma.category.create({
        data: {
          name: createCategoryDto.name,
          slug,
          description: createCategoryDto.description,
          parentId: createCategoryDto.parentId,
        },
        include: categoryInclude,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A category with this slug already exists');
      }

      throw error;
    }
  }

  findAll() {
    return this.prisma.category.findMany({
      include: categoryInclude,
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: number) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: categoryInclude,
    });

    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }

    return category;
  }

  async findBySlug(slug: string) {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: categoryInclude,
    });

    if (!category) {
      throw new NotFoundException(`Category with slug ${slug} not found`);
    }

    return category;
  }

  async update(id: number, updateCategoryDto: UpdateCategoryDto) {
    await this.findOne(id);

    if (updateCategoryDto.parentId) {
      await this.ensureCategoryExists(updateCategoryDto.parentId);
    }

    const slug =
      updateCategoryDto.slug ??
      (updateCategoryDto.name ? slugify(updateCategoryDto.name) : undefined);

    try {
      return await this.prisma.category.update({
        where: { id },
        data: {
          ...updateCategoryDto,
          slug,
        },
        include: categoryInclude,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A category with this slug already exists');
      }

      throw error;
    }
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.category.delete({
      where: { id },
    });
  }

  async findProducts(id: number, query: QueryProductsDto) {
    await this.findOne(id);
    return this.productsService.findByCategory(id, query);
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
