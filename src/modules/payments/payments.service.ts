import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { serializeDecimals } from '../../common/utils/decimal.util';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';

const paymentInclude = {
  order: {
    select: {
      id: true,
      orderNumber: true,
      userId: true,
      status: true,
      total: true,
    },
  },
} satisfies Prisma.PaymentInclude;

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.payment
      .findMany({
        include: paymentInclude,
        orderBy: { createdAt: 'desc' },
      })
      .then((payments) => serializeDecimals(payments));
  }

  async findOne(userId: number, id: number, isAdmin = false) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: paymentInclude,
    });

    if (!payment) {
      throw new NotFoundException(`Payment with id ${id} not found`);
    }

    if (!isAdmin && payment.order.userId !== userId) {
      throw new NotFoundException(`Payment with id ${id} not found`);
    }

    return serializeDecimals(payment);
  }

  async findByOrderId(userId: number, orderId: number, isAdmin = false) {
    const order = await this.prisma.order.findFirst({
      where: isAdmin ? { id: orderId } : { id: orderId, userId },
      select: { id: true },
    });

    if (!order) {
      throw new NotFoundException(`Order with id ${orderId} not found`);
    }

    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
      include: paymentInclude,
    });

    if (!payment) {
      throw new NotFoundException(`Payment for order ${orderId} not found`);
    }

    return serializeDecimals(payment);
  }

  async updateStatus(
    id: number,
    updatePaymentStatusDto: UpdatePaymentStatusDto,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { order: true },
    });

    if (!payment) {
      throw new NotFoundException(`Payment with id ${id} not found`);
    }

    const updatedPayment = await this.prisma.payment.update({
      where: { id },
      data: {
        status: updatePaymentStatusDto.status,
        transactionId: updatePaymentStatusDto.transactionId,
        order:
          updatePaymentStatusDto.status === PaymentStatus.PAID &&
          payment.order.status === OrderStatus.PENDING
            ? {
                update: {
                  status: OrderStatus.CONFIRMED,
                },
              }
            : undefined,
      },
      include: paymentInclude,
    });

    return serializeDecimals(updatedPayment);
  }
}
