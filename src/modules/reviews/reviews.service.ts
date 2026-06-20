import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';

const reviewInclude = {
  user: {
    select: {
      id: true,
      name: true,
    },
  },
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
} satisfies Prisma.ReviewInclude;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, createReviewDto: CreateReviewDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: createReviewDto.productId },
      select: { id: true, isActive: true },
    });

    if (!product || !product.isActive) {
      throw new NotFoundException(
        `Product with id ${createReviewDto.productId} not found`,
      );
    }

    try {
      return await this.prisma.review.create({
        data: {
          userId,
          productId: createReviewDto.productId,
          rating: createReviewDto.rating,
          title: createReviewDto.title,
          comment: createReviewDto.comment,
        },
        include: reviewInclude,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('You have already reviewed this product');
      }

      throw error;
    }
  }

  findByProduct(productId: number) {
    return this.prisma.review.findMany({
      where: { productId },
      include: reviewInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProductSummary(productId: number) {
    const aggregate = await this.prisma.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    return {
      productId,
      averageRating: aggregate._avg.rating ?? 0,
      reviewCount: aggregate._count.rating,
    };
  }

  async update(userId: number, id: number, updateReviewDto: UpdateReviewDto) {
    const review = await this.prisma.review.findFirst({
      where: { id, userId },
    });

    if (!review) {
      throw new NotFoundException(`Review with id ${id} not found`);
    }

    return this.prisma.review.update({
      where: { id },
      data: updateReviewDto,
      include: reviewInclude,
    });
  }

  async remove(userId: number, id: number) {
    const review = await this.prisma.review.findFirst({
      where: { id, userId },
    });

    if (!review) {
      throw new NotFoundException(`Review with id ${id} not found`);
    }

    return this.prisma.review.delete({
      where: { id },
    });
  }
}
