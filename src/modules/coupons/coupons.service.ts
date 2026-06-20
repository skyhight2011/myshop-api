import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CouponType, Prisma } from '@prisma/client';
import { serializeDecimals, toNumber } from '../../common/utils/decimal.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCouponDto: CreateCouponDto) {
    try {
      const coupon = await this.prisma.coupon.create({
        data: {
          code: createCouponDto.code.toUpperCase(),
          type: createCouponDto.type,
          value: createCouponDto.value,
          minOrderAmount: createCouponDto.minOrderAmount,
          maxUses: createCouponDto.maxUses,
          expiresAt: createCouponDto.expiresAt
            ? new Date(createCouponDto.expiresAt)
            : undefined,
          isActive: createCouponDto.isActive ?? true,
        },
      });

      return serializeDecimals(coupon);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A coupon with this code already exists');
      }

      throw error;
    }
  }

  findAll() {
    return this.prisma.coupon
      .findMany({
        orderBy: { createdAt: 'desc' },
      })
      .then((coupons) => serializeDecimals(coupons));
  }

  async findOne(id: number) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
    });

    if (!coupon) {
      throw new NotFoundException(`Coupon with id ${id} not found`);
    }

    return serializeDecimals(coupon);
  }

  async update(id: number, updateCouponDto: UpdateCouponDto) {
    await this.findOne(id);

    try {
      const coupon = await this.prisma.coupon.update({
        where: { id },
        data: {
          code: updateCouponDto.code?.toUpperCase(),
          type: updateCouponDto.type,
          value: updateCouponDto.value,
          minOrderAmount: updateCouponDto.minOrderAmount,
          maxUses: updateCouponDto.maxUses,
          expiresAt: updateCouponDto.expiresAt
            ? new Date(updateCouponDto.expiresAt)
            : undefined,
          isActive: updateCouponDto.isActive,
        },
      });

      return serializeDecimals(coupon);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A coupon with this code already exists');
      }

      throw error;
    }
  }

  async remove(id: number) {
    await this.findOne(id);

    return this.prisma.coupon.delete({
      where: { id },
    });
  }

  async validateCoupon(code: string, subtotal: number) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }

    this.ensureCouponUsable(coupon, subtotal);

    const discount = this.calculateDiscount(coupon, subtotal);

    return {
      code: coupon.code,
      type: coupon.type,
      value: toNumber(coupon.value),
      discount,
    };
  }

  calculateDiscount(
    coupon: { type: CouponType; value: Prisma.Decimal },
    subtotal: number,
  ) {
    const value = toNumber(coupon.value);

    if (coupon.type === CouponType.PERCENTAGE) {
      return Math.min(subtotal, (subtotal * value) / 100);
    }

    return Math.min(subtotal, value);
  }

  ensureCouponUsable(
    coupon: {
      isActive: boolean;
      expiresAt: Date | null;
      maxUses: number | null;
      usedCount: number;
      minOrderAmount: Prisma.Decimal | null;
    },
    subtotal: number,
  ) {
    if (!coupon.isActive) {
      throw new BadRequestException('Coupon is inactive');
    }

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new BadRequestException('Coupon has expired');
    }

    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      throw new BadRequestException('Coupon usage limit reached');
    }

    if (
      coupon.minOrderAmount !== null &&
      subtotal < toNumber(coupon.minOrderAmount)
    ) {
      throw new BadRequestException(
        'Order subtotal does not meet minimum amount',
      );
    }
  }
}
