import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { serializeDecimals, toNumber } from '../../common/utils/decimal.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CouponsService } from '../coupons/coupons.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

const orderInclude = {
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      variant: true,
    },
  },
  payment: true,
  user: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
} satisfies Prisma.OrderInclude;

const TAX_RATE = 0.1;
const FREE_SHIPPING_THRESHOLD = 100;
const FLAT_SHIPPING_COST = 5;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly couponsService: CouponsService,
  ) {}

  async checkout(userId: number, createOrderDto: CreateOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({
        where: { userId },
        include: {
          items: {
            include: {
              product: true,
              variant: true,
            },
          },
        },
      });

      if (!cart || cart.items.length === 0) {
        throw new BadRequestException('Cart is empty');
      }

      const address = await tx.address.findFirst({
        where: {
          id: createOrderDto.addressId,
          userId,
        },
      });

      if (!address) {
        throw new NotFoundException(
          `Address with id ${createOrderDto.addressId} not found`,
        );
      }

      const lineItems = cart.items.map((item) => {
        const unitPrice = item.variant
          ? toNumber(item.variant.price)
          : toNumber(item.product.price);
        const availableStock = item.variant
          ? item.variant.stock
          : item.product.stock;
        const sku = item.variant ? item.variant.sku : item.product.sku;

        if (!item.product.isActive) {
          throw new BadRequestException(
            `Product ${item.product.name} is no longer available`,
          );
        }

        if (availableStock < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for ${item.product.name}`,
          );
        }

        return {
          productId: item.productId,
          variantId: item.variantId,
          productName: item.product.name,
          sku,
          unitPrice,
          quantity: item.quantity,
          total: unitPrice * item.quantity,
        };
      });

      const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
      let discount = 0;
      let couponCode: string | undefined;

      if (createOrderDto.couponCode) {
        const coupon = await tx.coupon.findUnique({
          where: { code: createOrderDto.couponCode.toUpperCase() },
        });

        if (!coupon) {
          throw new NotFoundException('Coupon not found');
        }

        this.couponsService.ensureCouponUsable(coupon, subtotal);
        discount = this.couponsService.calculateDiscount(coupon, subtotal);
        couponCode = coupon.code;

        await tx.coupon.update({
          where: { id: coupon.id },
          data: {
            usedCount: {
              increment: 1,
            },
          },
        });
      }

      const discountedSubtotal = subtotal - discount;
      const shippingCost =
        discountedSubtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_COST;
      const tax = discountedSubtotal * TAX_RATE;
      const total = discountedSubtotal + shippingCost + tax;
      const orderNumber = this.generateOrderNumber(userId);

      const order = await tx.order.create({
        data: {
          orderNumber,
          userId,
          subtotal,
          shippingCost,
          tax,
          discount,
          total,
          couponCode,
          notes: createOrderDto.notes,
          shippingFullName: address.fullName,
          shippingPhone: address.phone,
          shippingLine1: address.line1,
          shippingLine2: address.line2,
          shippingCity: address.city,
          shippingState: address.state,
          shippingPostalCode: address.postalCode,
          shippingCountry: address.country,
          items: {
            create: lineItems,
          },
          payment: {
            create: {
              method: createOrderDto.paymentMethod,
              status: PaymentStatus.PENDING,
              amount: total,
              transactionId: randomBytes(8).toString('hex'),
            },
          },
        },
        include: orderInclude,
      });

      for (const item of cart.items) {
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: {
              stock: {
                decrement: item.quantity,
              },
            },
          });
        } else {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: {
                decrement: item.quantity,
              },
            },
          });
        }
      }

      await tx.cartItem.deleteMany({
        where: { cartId: cart.id },
      });

      return serializeDecimals(order);
    });
  }

  findAllForUser(userId: number) {
    return this.prisma.order
      .findMany({
        where: { userId },
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
      })
      .then((orders) => serializeDecimals(orders));
  }

  findAll() {
    return this.prisma.order
      .findMany({
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
      })
      .then((orders) => serializeDecimals(orders));
  }

  async findOne(userId: number | null, id: number, isAdmin = false) {
    const order = await this.prisma.order.findFirst({
      where: isAdmin ? { id } : { id, userId: userId ?? undefined },
      include: orderInclude,
    });

    if (!order) {
      throw new NotFoundException(`Order with id ${id} not found`);
    }

    return serializeDecimals(order);
  }

  async updateStatus(id: number, updateOrderStatusDto: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        payment: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with id ${id} not found`);
    }

    const nextStatus = updateOrderStatusDto.status;

    if (
      nextStatus === OrderStatus.CANCELLED &&
      order.status !== OrderStatus.CANCELLED
    ) {
      await this.restoreStock(order.items);
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: {
        status: nextStatus,
        payment: order.payment
          ? {
              update: {
                status:
                  nextStatus === OrderStatus.CANCELLED
                    ? PaymentStatus.FAILED
                    : nextStatus === OrderStatus.DELIVERED
                      ? PaymentStatus.PAID
                      : order.payment.status,
              },
            }
          : undefined,
      },
      include: orderInclude,
    });

    return serializeDecimals(updatedOrder);
  }

  async cancel(userId: number, id: number) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException(`Order with id ${id} not found`);
    }

    if (
      order.status !== OrderStatus.PENDING &&
      order.status !== OrderStatus.CONFIRMED
    ) {
      throw new BadRequestException('Order can no longer be cancelled');
    }

    return this.updateStatus(id, { status: OrderStatus.CANCELLED });
  }

  private async restoreStock(
    items: Array<{
      productId: number;
      variantId: number | null;
      quantity: number;
    }>,
  ) {
    await this.prisma.$transaction(
      items.map((item) =>
        item.variantId
          ? this.prisma.productVariant.update({
              where: { id: item.variantId },
              data: { stock: { increment: item.quantity } },
            })
          : this.prisma.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            }),
      ),
    );
  }

  private generateOrderNumber(userId: number) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const suffix = randomBytes(2).toString('hex').toUpperCase();
    return `ORD-${userId}-${timestamp}-${suffix}`;
  }
}
