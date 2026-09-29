import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { serializeDecimals, toNumber } from '../../common/utils/decimal.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

const cartInclude = {
  items: {
    include: {
      product: {
        include: {
          images: {
            orderBy: {
              sortOrder: 'asc',
            },
            take: 1,
          },
        },
      },
      variant: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  },
} satisfies Prisma.CartInclude;

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getCart(userId: number) {
    const cart = await this.ensureCart(userId);
    return this.formatCart(cart);
  }

  async addItem(userId: number, addCartItemDto: AddCartItemDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: addCartItemDto.productId },
      include: { variants: true },
    });

    if (!product || !product.isActive) {
      throw new NotFoundException(
        `Product with id ${addCartItemDto.productId} not found`,
      );
    }

    const variant = addCartItemDto.variantId
      ? product.variants.find((item) => item.id === addCartItemDto.variantId)
      : undefined;

    if (addCartItemDto.variantId && !variant) {
      throw new NotFoundException(
        `Variant with id ${addCartItemDto.variantId} not found`,
      );
    }

    if (product.variants.length > 0 && !variant) {
      throw new BadRequestException('Select a product variant');
    }

    if (variant && !variant.isActive) {
      throw new BadRequestException('This variant is no longer available');
    }

    const availableStock = variant ? variant.stock : product.stock;

    if (availableStock < addCartItemDto.quantity) {
      throw new BadRequestException('Insufficient stock');
    }

    const cart = await this.ensureCart(userId);
    const existingItem = cart.items.find(
      (item) =>
        item.productId === addCartItemDto.productId &&
        item.variantId === (addCartItemDto.variantId ?? null),
    );

    if (existingItem) {
      const nextQuantity = existingItem.quantity + addCartItemDto.quantity;

      if (availableStock < nextQuantity) {
        throw new BadRequestException('Insufficient stock');
      }

      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: nextQuantity },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: addCartItemDto.productId,
          variantId: addCartItemDto.variantId,
          quantity: addCartItemDto.quantity,
        },
      });
    }

    return this.getCart(userId);
  }

  async updateItem(
    userId: number,
    itemId: number,
    updateCartItemDto: UpdateCartItemDto,
  ) {
    const cart = await this.ensureCart(userId);
    const item = cart.items.find((cartItem) => cartItem.id === itemId);

    if (!item) {
      throw new NotFoundException(`Cart item with id ${itemId} not found`);
    }

    if (!item.product.isActive || (item.variant && !item.variant.isActive)) {
      throw new BadRequestException('This item is no longer available');
    }

    const availableStock = item.variant
      ? item.variant.stock
      : item.product.stock;

    if (availableStock < updateCartItemDto.quantity) {
      throw new BadRequestException('Insufficient stock');
    }

    await this.prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity: updateCartItemDto.quantity },
    });

    return this.getCart(userId);
  }

  async removeItem(userId: number, itemId: number) {
    const cart = await this.ensureCart(userId);
    const item = cart.items.find((cartItem) => cartItem.id === itemId);

    if (!item) {
      throw new NotFoundException(`Cart item with id ${itemId} not found`);
    }

    await this.prisma.cartItem.delete({
      where: { id: itemId },
    });

    return this.getCart(userId);
  }

  async clearCart(userId: number) {
    const cart = await this.ensureCart(userId);

    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    return this.getCart(userId);
  }

  private async ensureCart(userId: number) {
    return this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      include: cartInclude,
    });
  }

  private formatCart(
    cart: Prisma.CartGetPayload<{ include: typeof cartInclude }>,
  ) {
    const items = cart.items.map((item) => {
      const unitPrice = item.variant
        ? toNumber(item.variant.price)
        : toNumber(item.product.price);

      return {
        id: item.id,
        quantity: item.quantity,
        unitPrice,
        lineTotal: unitPrice * item.quantity,
        product: serializeDecimals(item.product),
        variant: item.variant ? serializeDecimals(item.variant) : null,
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

    return {
      id: cart.id,
      items,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal,
    };
  }
}
